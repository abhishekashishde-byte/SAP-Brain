import { useState } from 'react'
import { discoveryCatalog } from './catalog.js'
import { uploadTranscript,deleteTranscript,updateTranscriptSuggestion } from './transcriptData.js'
const consentText='All participants agreed to recording/transcription'
const pretty=s=>String(s||'').replaceAll('_',' ')
const humanLabel=Object.fromEntries(discoveryCatalog.objects.flatMap(o=>[[o.id,o.title],...o.fields.map(f=>[f.id,f.label]),...o.questions.map(q=>[q.id,q.text]),...o.decisions.map(d=>[d.id,d.text])]))
export default function Transcripts({workshop,session,transcripts,suggestions,onRefresh,onAccept,onExisting,presenter}){
 const [consent,setConsent]=useState(false)
 const [file,setFile]=useState(null)
 const [pastedText,setPastedText]=useState('')
 const [retention,setRetention]=useState('30')
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const [editId,setEditId]=useState(null)
 const [editJSON,setEditJSON]=useState('')
 const [processing,setProcessing]=useState(null)
 if(presenter)return <p className="dw-caption">Transcript controls are hidden in presenter mode.</p>
 async function upload(){
  if(!consent||(!file&&!pastedText.trim()))return
  setBusy(true);setNotice('')
  try{const input=pastedText.trim()?new File([pastedText],`meeting-${Date.now()}.txt`,{type:'text/plain'}):file;await uploadTranscript(workshop,session.user,input,Number(retention)||null,consentText);await onRefresh();setConsent(false);setFile(null);setPastedText('');setNotice('Private transcript saved. Select Analyse to create review-only suggestions.')}
  catch(e){setNotice('Upload failed: '+e.message)}finally{setBusy(false)}
 }
 async function analyse(t){
  setBusy(true);setNotice('Analysing transcript on request…')
  try{
   const response=await fetch('/api/discovery-transcript',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({workshopId:workshop.id,transcriptId:t.id})})
   const data=await response.json();if(!response.ok)throw Error(data.error||'Transcript analysis failed')
   await onRefresh();setNotice(data.count+' suggestions from '+(data.segmentsAnalysed||'?')+' transcript segments await review. '+(data.warnings||[]).join(' '))
  }catch(e){setNotice('Analysis failed: '+e.message);await onRefresh()}finally{setBusy(false)}
 }
 async function remove(t){
  if(!window.confirm('Delete this transcript, its audio/file, full text and all associated suggestions permanently?'))return
  setBusy(true)
  try{await deleteTranscript(t);await onRefresh();setNotice('Transcript and suggestions deleted.')}catch(e){setNotice('Deletion failed: '+e.message)}finally{setBusy(false)}
 }
 async function review(s,status,payload){
  setProcessing(s.id)
  try{const updated=await updateTranscriptSuggestion(s.id,{status,...(payload?{payload}:{})});await onRefresh();return updated}
  catch(e){setNotice('Suggestion update failed: '+e.message);throw e}finally{setProcessing(null)}
 }
 function conflict(s){
  const saved=onExisting(s),proposed=s.payload||{}
  if(!saved)return false
  if(s.kind==='field_mark')return !!saved.mark&&saved.mark!==proposed.mark
  if(s.kind==='answer'){
   const current=saved.answer
   if(current==null||current===''||(Array.isArray(current)&&!current.length))return false
   return JSON.stringify(current)!==JSON.stringify(proposed.answer)
  }
  if(s.kind==='decision')return !!saved.choice&&saved.choice!==proposed.choice
  if(s.kind==='process')return !!saved.status&&saved.status!==proposed.status
  return false
 }
 async function accept(s,{batch=false}={}){
  if(batch&&conflict(s))return false
  if(!batch&&conflict(s)&&!window.confirm('The existing user answer will be preserved. Add this transcript finding to the notes for review?'))return false
  setProcessing(s.id)
  try{await onAccept(s);await review(s,'accepted');return true}
  catch(e){setNotice('Could not accept suggestion: '+e.message);return false}finally{setProcessing(null)}
 }
 async function acceptHighConfidence(){
  let n=0,skipped=0
  for(const s of suggestions.filter(x=>x.status==='pending'||x.status==='edited').filter(x=>x.confidence==='high')){
   if(await accept(s,{batch:true}))n++;else skipped++
  }
  setNotice(n+' high-confidence suggestions accepted; '+skipped+' conflicts/errors left for individual review.')
 }
 async function saveEdit(s){
  try{
   const data=JSON.parse(editJSON)
   if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Payload must be an object')
   await review(s,'edited',data);setEditId(null)
  }catch(e){setNotice('Edit could not be saved: '+e.message)}
 }
 const pending=suggestions.filter(s=>s.status==='pending'||s.status==='edited')
 const groups=pending.reduce((acc,s)=>{const name=s.payload?.object_id||s.payload?.process_id||s.target_ref||'General';(acc[name]??=[]).push(s);return acc},{})
 return <div className="dw-card dw-transcripts"><div className="dw-kicker">Optional · Consent-gated</div><h2>Transcript → suggestions</h2>
 <p className="dw-caption">Paste long meeting text in any language or mix of English, German and Hindi. Upload TXT, VTT, DOCX or audio if preferred. Analysis is only on request; existing answers and field statuses are protected.</p>
  <details className="dw-transcript-import" open><summary>Paste meeting transcript · long-form editor</summary><p className="dw-caption">Suitable for a two-hour workshop. Include speaker labels and timestamps if available. The complete text is stored privately before analysis.</p>
   <textarea className="dw-transcript-paste" aria-label="Paste full meeting transcript" rows="16" spellCheck={false} placeholder="Paste meeting transcript here (English / German / Hindi / mixed languages)…" value={pastedText} onChange={e=>{setPastedText(e.target.value);if(e.target.value.trim())setFile(null)}}/>
   <small className="dw-caption">{pastedText.length.toLocaleString()} characters · {pastedText.trim()?pastedText.trim().split(/\s+/).length.toLocaleString():0} words. Analysis supports up to 240,000 characters per transcript.</small>
  </details>
 <label className="dw-mini-checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{consentText}</label>
 <div className="dw-inline"><input type="file" accept=".txt,.vtt,.docx,.mp3,.m4a,.wav" onChange={e=>{setFile(e.target.files?.[0]||null);if(e.target.files?.[0])setPastedText('')}}/><label>Delete after <select value={retention} onChange={e=>setRetention(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="0">Manual deletion</option></select></label><button className="dw-button dw-primary" onClick={upload} disabled={!consent||(!file&&!pastedText.trim())||busy}>{pastedText.trim()?'Save pasted transcript':'Upload privately'}</button></div>
 {notice&&<p role="status" className="dw-caption">{notice}</p>}
 {transcripts.map(t=><div className="dw-hint-row" key={t.id}><div><strong>{t.file_path?.split('/').at(-1)||t.audio_path?.split('/').at(-1)||'Transcript'}</strong><p>Status: {t.status} · Consent: {new Date(t.consent_given_at).toLocaleDateString()} · Delete: {t.delete_after||'Manually'}</p></div><div className="dw-actions"><button className="dw-button dw-primary" disabled={busy||t.status==='analysed'} onClick={()=>analyse(t)}>Analyse transcript</button><button className="dw-button" disabled={busy} onClick={()=>remove(t)}>Delete transcript & audio</button></div></div>)}
 <div className="dw-object-heading"><h3>Review suggestions ({pending.length} pending)</h3><button className="dw-button" onClick={acceptHighConfidence} disabled={busy||!pending.some(s=>s.confidence==='high')}>Accept all high-confidence (no conflicts)</button></div>
 {Object.entries(groups).map(([group,items])=><details className="dw-transcript-group" key={group}>
  <summary className="dw-transcript-group-heading">{humanLabel[group]||group} <span>{items.length} findings</span></summary>
  {items.map(s=><details className="dw-transcript-suggestion" key={s.id}>
   <summary className="dw-transcript-finding-summary"><strong>{humanLabel[s.target_ref]||pretty(s.kind)}</strong><small>{s.quote||'Transcript finding'}</small><span className={`dw-transcript-pill ${conflict(s)?'dw-transcript-pill-conflict':''}`}>{conflict(s)?'Review conflict':s.confidence+' confidence'}</span></summary>
   <div className="dw-transcript-finding-detail">
    <p className="dw-transcript-review-note">Existing user answer and status are protected. Accepting adds the transcript finding and source as notes.</p>
    <blockquote>“{s.quote||'No quotation captured'}”</blockquote><small>Timestamp: {s.ts||'not available in source'}</small>
    <details className="dw-transcript-values"><summary>Compare existing answer and transcript proposal</summary><div className="dw-form-grid"><div><strong>Transcript finding</strong><pre>{JSON.stringify(s.payload,null,2)}</pre></div>{onExisting(s)&&<div><strong>Existing user answer (protected)</strong><pre>{JSON.stringify(onExisting(s),null,2)}</pre></div>}</div></details>
    {editId===s.id?<><textarea rows="6" value={editJSON} onChange={e=>setEditJSON(e.target.value)}/><div className="dw-actions"><button className="dw-button" onClick={()=>saveEdit(s)}>Save edits</button><button className="dw-button" onClick={()=>setEditId(null)}>Cancel</button></div></>:<div className="dw-actions"><button className="dw-button dw-primary" disabled={processing===s.id} onClick={()=>accept(s)}>Accept finding</button><button className="dw-button" onClick={()=>{setEditId(s.id);setEditJSON(JSON.stringify(s.payload,null,2))}}>Edit</button><button className="dw-button" onClick={()=>review(s,'rejected')}>Reject</button></div>}
   </div>
  </details>)}
 </details>)}
 {!pending.length&&<p className="dw-caption">No pending suggestions.</p>}
 </div>
}
