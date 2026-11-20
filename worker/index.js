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
 if(request.method==='GET'){
  const action=url.searchParams.get('action'),email=url.searchParams.get('email'),token=url.searchParams.get('token');
  if(!['approve','reject'].includes(action)||!email||!token)return json({error:'Invalid link'},400);
  const {data:applicant,error}=await db.from('waitlist').select('token,full_name,status').eq('email',email).single();
  if(error||!applicant)return json({error:'Application not found'},404);
  if(applicant.token!==token)return json({error:'Invalid link'},401);
  if(applicant.status!=='pending')return json({status:applicant.status});
  if(action==='approve'){
   const {error:approveError}=await db.from('approved_emails').insert({email,full_name:applicant.full_name,approved_at:new Date().toISOString()});
   if(approveError&&approveError.code!=='23505')throw approveError;
  }
  const {error:updateError}=await db.from('waitlist').update({status:action==='approve'?'approved':'rejected'}).eq('email',email).eq('status','pending');
  if(updateError)throw updateError;
  if(action==='approve')await notifyEmail(env,email,'Your Wani access is approved','<p>Your Wani access is approved.</p><p><a href="https://ask-wani.com">Open Wani</a></p>');
  return json({status:action==='approve'?'approved':'rejected'});
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 // Never accept anonymous service-role database writes or unverified auth webhook payloads.
 if(!env.SUPABASE_WEBHOOK_SECRET)return json({error:'Webhook secret not configured'},503);
 if(request.headers.get('x-webhook-secret')!==env.SUPABASE_WEBHOOK_SECRET)return json({error:'Unauthorized'},401);
 const body=await request.json();
 const record=body?.record||{};
 const email=String(record.email||'').trim().toLowerCase();
 if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return json({error:'Valid email required'},400);
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
 if(url.pathname==='/api/Notify'||url.pathname==='/api/notify')return handleNotify(request,env).catch(e=>{console.error('Notify error',e.message);return json({error:'Notification failed'},500)});
 if(url.pathname.startsWith('/api/')){
  try{
   const response=await routeApi(request,env,ctx);
   if(response)return response;
  }catch(e){console.error('API route error',url.pathname,e?.stack||e?.message);return json({error:'Internal server error'},500)}
  // Never fall through to the SPA for unknown API paths.
  return json({error:'Not found'},404);
 }
 return env.ASSETS.fetch(request);
}};
