import { useState } from 'react'
import { supabase } from '../../supabaseClient'
const defaults={summary:true,decisions:true,openPoints:true,requests:true,nextMeeting:false}
const EMAIL_PATTERN=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
export default function FollowupEmail({workshop,session,stakeholders=[],onClose}){
 const [language,setLanguage]=useState(workshop.client_language||'en')
 const [tone,setTone]=useState('formal')
 const [include,setInclude]=useState(defaults)
 const [nextMeeting,setNextMeeting]=useState('')
 const [subject,setSubject]=useState('')
 const [body,setBody]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [saved,setSaved]=useState(false)
 const [recipients,setRecipients]=useState([...new Set(stakeholders.filter(s=>s.organisation==='client').flatMap(s=>(String(s.contact||'').match(EMAIL_PATTERN)||[]).map(x=>x.toLowerCase())))].join('; '))
 const generate=async()=>{
  setBusy(true);setError('');setSaved(false)
  try{
   const res=await fetch('/api/discovery-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({
    workshopId:workshop.id,action:'followup_email',payload:{language,tone,include,nextMeeting:include.nextMeeting?nextMeeting:'',audience:'client'}
   })})
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Email generation failed')
   setSubject(data.subject||'');setBody(data.body||'')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function translateGerman(){
  if(!subject.trim()&&!body.trim())return
  setBusy(true);setError('')
  try{
   const response=await fetch('/api/discovery-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'translate_de',workshopId:workshop.id,payload:{format:'email',subject,body}})})
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Translation failed')
   setSubject(data.subject||subject);setBody(data.body||body);setLanguage('de');setSaved(false)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const save=async()=>{
  if(!subject.trim()&&!body.trim())return
  try{const r=await supabase.from('discovery_email_drafts').insert({workshop_id:workshop.id,language,subject,body,model:'Claude Sonnet'});if(r.error)throw r.error;setSaved(true);setError('')}catch(e){setError(e.message)}
 }
 const copy=async()=>{try{await navigator.clipboard.writeText('Subject: '+subject+'\n\n'+body)}catch(e){setError('Clipboard unavailable: '+e.message)}}
 const openMail=()=>{
  const to=recipients.split(/[;,\s]+/).map(x=>x.trim()).filter(x=>x&&x.match(EMAIL_PATTERN)?.[0]===x).join(',')
  const url='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)
  if(url.length>1800){setError('Email is too long for a mailto link. Please copy the draft instead.');return}
  window.location.assign(url)
 }
 return <div className="dw-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="dw-modal" role="dialog" aria-modal="true" aria-label="Draft follow-up email"><div className="dw-object-heading"><h2>Draft follow-up email</h2><button className="dw-button" onClick={onClose}>Close</button></div>
 <p className="dw-caption">Client-safe context only. Contact emails are used solely to open your mail client. Nothing is sent by Wani.</p>
 <div className="dw-form-grid"><label>Language<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="de">German</option></select></label><label>Tone<select value={tone} onChange={e=>setTone(e.target.value)}><option value="formal">Formal</option><option value="friendly">Friendly</option></select></label></div>
 <div className="dw-choice">{[['summary','Summary'],['decisions','Decisions'],['openPoints','Open points'],['requests','Requests with due dates'],['nextMeeting','Next meeting proposal']].map(([key,label])=><button key={key} className={include[key]?'selected':''} onClick={()=>setInclude(x=>({...x,[key]:!x[key]}))}>{include[key]?'✓ ':''}{label}</button>)}</div>
 {include.nextMeeting&&<label className="dw-mini-field">Proposed meeting details<input value={nextMeeting} onChange={e=>setNextMeeting(e.target.value)} placeholder="Date/time or 'to be agreed'"/></label>}
 <button className="dw-button dw-primary" disabled={busy} onClick={generate}>{busy?'Drafting…':'Generate draft'}</button>{error&&<p className="dw-alert" role="alert">{error}</p>}
 <label className="dw-mini-field">Client recipients (edit before opening mail app)<input value={recipients} onChange={e=>setRecipients(e.target.value)} placeholder="email@example.com"/></label>
 <label className="dw-mini-field">Subject<input value={subject} onChange={e=>{setSubject(e.target.value);setSaved(false)}}/></label>
 <label className="dw-mini-field">Email body<textarea rows="15" value={body} onChange={e=>{setBody(e.target.value);setSaved(false)}}/></label>
 <div className="dw-export-actions"><button className="dw-button" onClick={translateGerman} disabled={busy||!subject&&!body}>Translate to German</button><button className="dw-button" onClick={copy} disabled={!subject&&!body}>Copy</button><button className="dw-button" onClick={save} disabled={!subject&&!body}>Save draft</button><button className="dw-button dw-primary" onClick={openMail} disabled={!subject&&!body}>Open in mail client</button>{saved&&<span className="dw-caption">Draft saved</span>}</div>
 </div></div>
}
