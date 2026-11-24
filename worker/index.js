import { routeApi } from './api-routes.js';
import { createClient } from '@supabase/supabase-js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function runDiscoveryRetention(env) {
 const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
 const key=env.SUPABASE_SERVICE_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Retention Supabase configuration missing');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const today=new Date().toISOString().slice(0,10);
 const {data:rows,error}=await db.from('discovery_transcripts')
  .select('id,workshop_id,file_path,audio_path').lte('delete_after',today).order('delete_after').limit(200);
 if(error)throw Error('Retention lookup failed: '+error.message);
 let deleted=0,skipped=0;
 for(const t of rows||[]){
  try{
   const {data:w,error:ownerError}=await db.from('discovery_workshops').select('owner_id').eq('id',t.workshop_id).single();
   if(ownerError||!w?.owner_id){skipped++;continue}
   const prefix=w.owner_id+'/'+t.workshop_id+'/';
   const paths=[...new Set([t.file_path,t.audio_path].filter(Boolean))];
   if(paths.some(p=>!p.startsWith(prefix))){skipped++;continue}
   if(paths.length){
    const {error:storageError}=await db.storage.from('discovery-transcripts').remove(paths);
    if(storageError){skipped++;continue}
   }
   const {error:deleteError}=await db.from('discovery_transcripts').delete().eq('id',t.id).eq('workshop_id',t.workshop_id);
   if(deleteError){skipped++;continue}
   deleted++;
  }catch(e){console.error('Retention item failed',t.id,e?.message);skipped++}
 }
 console.log('Discovery retention finished',{deleted,skipped});
 return {deleted,skipped};
}


const LINK_TTL_MS=14*24*60*60*1000; // e-mailed approval links expire after 14 days
function safeEqual(a,b){const x=new TextEncoder().encode(String(a||'')),y=new TextEncoder().encode(String(b||''));let d=x.length^y.length;for(let i=0;i<y.length;i++)d|=(x[i]??0)^y[i];return d===0&&y.length>0}
function page(title,body,status=200,isForm=false){
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' · Wani</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#000;color:#e4e4e7;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:440px;padding:32px;border:1px solid #27272a;border-radius:16px;background:#0d0d0f}h1{font-size:22px;margin:0 0 12px}button{font:600 15px system-ui;padding:10px 18px;border-radius:10px;border:0;background:#ececef;color:#0a0a0b;cursor:pointer}</style></head><body><main><h1>'+title+'</h1>'+(isForm?body:'<p>'+body+'</p>')+'</main></body></html>';
 return new Response(html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'x-frame-options':'DENY','referrer-policy':'no-referrer'}});
}
// Security headers for every API response.
function withSecurityHeaders(response){
 const r=new Response(response.body,response);
 r.headers.set('X-Content-Type-Options','nosniff');
 r.headers.set('X-Frame-Options','DENY');
 r.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 r.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
 if(!r.headers.has('Cache-Control'))r.headers.set('Cache-Control','no-store');
 return r;
}
const escapeNotify=(s)=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function notifyEmail(env,to,subject,html){
 if(!env.RESEND_API_KEY||!env.WANI_EMAIL_FROM)throw Error('Resend API key or verified sender missing');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.WANI_EMAIL_FROM,to:[to],subject,html})});
 if(!response.ok)throw Error('Resend failed with HTTP '+response.status);
}
async function handleNotify(request,env){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)return json({error:'Notification database unavailable'},503);
 const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const url=new URL(request.url);
 const isForm=request.method==='POST'&&(request.headers.get('content-type')||'').includes('application/x-www-form-urlencoded');
 if(request.method==='GET'||isForm){
  // Opening the e-mailed link only shows a confirmation page; the decision happens on the
  // button press (POST). Link scanners that open URLs automatically cannot approve anyone.
  const src=isForm?new URLSearchParams(await request.text()):url.searchParams;
  const action=src.get('action'),email=String(src.get('email')||'').trim().toLowerCase(),token=String(src.get('token')||'');
  if(!['approve','reject'].includes(action)||!email||!/^[0-9a-f]{64}$/.test(token))return page('Invalid link','This approval link is not valid.',400);
  const {data:applicant,error}=await db.from('waitlist').select('token,full_name,status,created_at').eq('email',email).single();
  if(error||!applicant||!safeEqual(applicant.token,token)){console.warn(JSON.stringify({security:'approval_link_rejected',email}));return page('Invalid link','This approval link is not valid.',401)}
  if(applicant.status!=='pending')return page('Already decided','This request was already '+escapeNotify(applicant.status)+'.');
  if(Date.now()-new Date(applicant.created_at||0).getTime()>LINK_TTL_MS)return page('Link expired','This approval link has expired. Approve the user from the Wani admin dashboard instead.',410);
  if(!isForm){
   const label=action==='approve'?'Approve':'Reject';
   return page(label+' access?','<p><strong>'+escapeNotify(applicant.full_name||'')+'</strong> ('+escapeNotify(email)+') asked for access to Wani.</p><form method="post" action="/api/Notify"><input type="hidden" name="action" value="'+action+'"><input type="hidden" name="email" value="'+escapeNotify(email)+'"><input type="hidden" name="token" value="'+token+'"><button type="submit">'+label+'</button></form>',200,true);
  }
  if(action==='approve'){
   const {error:approveError}=await db.from('approved_emails').insert({email,full_name:applicant.full_name,approved_at:new Date().toISOString()});
   if(approveError&&approveError.code!=='23505')throw approveError;
  }
  const {error:updateError}=await db.from('waitlist').update({status:action==='approve'?'approved':'rejected'}).eq('email',email).eq('status','pending');
  if(updateError)throw updateError;
  if(action==='approve')await notifyEmail(env,email,'Your Wani access is approved','<p>Your Wani access is approved.</p><p><a href="https://ask-wani.com">Open Wani</a></p>').catch(e=>console.error('Approval mail failed',e.message));
  console.log(JSON.stringify({security:'access_'+(action==='approve'?'approved':'rejected')+'_by_link',email}));
  return page(action==='approve'?'Approved':'Rejected',escapeNotify(email)+' was '+(action==='approve'?'approved. They can sign in now.':'rejected.'));
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 // Never accept anonymous service-role database writes or unverified auth webhook payloads.
 if(!env.SUPABASE_WEBHOOK_SECRET)return json({error:'Webhook secret not configured'},503);
 if(!safeEqual(request.headers.get('x-webhook-secret')||'',env.SUPABASE_WEBHOOK_SECRET)){console.warn(JSON.stringify({security:'webhook_secret_mismatch',ip:request.headers.get('cf-connecting-ip')}));return json({error:'Unauthorized'},401)}
 const body=await request.json();
 const record=body?.record||{};
 const email=String(record.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Valid email required'},400);
 const name=String(record.full_name||record.raw_user_meta_data?.full_name||record.raw_user_meta_data?.name||'Not provided').slice(0,150);
 const admin=env.NOTIFY_TO||env.ADMIN_EMAIL_1;
 if(!admin)return json({error:'Notification recipient missing'},503);
 const signup=body.type==='INSERT'||body.type==='WAITLIST';
 if(!signup){
  const age=Date.now()-new Date(record.last_sign_in_at||0).getTime();
  if(!Number.isFinite(age)||age>10000)return json({ok:true,skipped:true});
 }else{
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const {error:insertError}=await db.from('waitlist').insert({full_name:name,email,sap_experience:record.sap_experience||'unknown',sap_module:record.sap_module||'unknown',status:'pending',token,created_at:new Date().toISOString()});
  if(insertError&&insertError.code!=='23505')throw insertError;
  const {data:entry}=await db.from('waitlist').select('token,status').eq('email',email).single();
  if(entry?.status!=='pending')return json({ok:true,skipped:true});
  const base='https://ask-wani.com/api/Notify?email='+encodeURIComponent(email)+'&token='+encodeURIComponent(entry.token);
  await notifyEmail(env,admin,'Wani signup awaiting approval: '+email,'<p><strong>'+escapeNotify(name)+'</strong> ('+escapeNotify(email)+') requested access.</p><p><a href="'+base+'&action=approve">Approve</a> | <a href="'+base+'&action=reject">Reject</a></p>');
  return json({ok:true});
 }
 await notifyEmail(env,admin,'Wani user login: '+email,'<p>'+escapeNotify(name)+' ('+escapeNotify(email)+') logged in.</p>');
 return json({ok:true});
}

export default {async scheduled(event,env,ctx){ctx.waitUntil(runDiscoveryRetention(env).catch(e=>console.error('Discovery retention failed',e.message)))},async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname==='/api/Notify'||url.pathname==='/api/notify'){
  if(env.RL_API){const {success}=await env.RL_API.limit({key:'notify:'+(request.headers.get('cf-connecting-ip')||'unknown')});if(!success)return json({error:'Too many requests'},429)}
  return withSecurityHeaders(await handleNotify(request,env).catch(e=>{console.error('Notify error',e.message);return json({error:'Notification failed'},500)}));
 }
 if(url.pathname.startsWith('/api/')){
  try{
   const response=await routeApi(request,env,ctx);
   if(response)return withSecurityHeaders(response);
  }catch(e){console.error('API route error',url.pathname,e?.stack||e?.message);return withSecurityHeaders(json({error:'Internal server error'},500))}
  // Never fall through to the SPA for unknown API paths.
  return withSecurityHeaders(json({error:'Not found'},404));
 }
 return env.ASSETS.fetch(request);
}};
