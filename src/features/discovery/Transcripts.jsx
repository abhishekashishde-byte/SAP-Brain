import { useState } from 'react'
import { uploadTranscript,deleteTranscript,updateTranscriptSuggestion } from './transcriptData.js'
const consentText='All participants agreed to recording/transcription'
const pretty=s=>String(s||'').replaceAll('_',' ')
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
 const [analysingId,setAnalysingId]=useState(null)
 const [analysisResult,setAnalysisResult]=useState(null)
 if(presenter)return <p className="dw-caption">Transcript controls are hidden in presenter mode.</p>
 async function upload(analyseAfter=false){
  if(!consent||(!file&&!pastedText.trim()))return
  setBusy(true);setNotice('')
  try{const source=pastedText.trim()?new File([pastedText],'workshop-transcript-'+Date.now()+'.txt',{type:'text/plain'}):file;const saved=await uploadTranscript(workshop,session.user,source,Number(retention)||null,consentText);await onRefresh();setConsent(false);setFile(null);setPastedText('');if(analyseAfter){await analyse(saved)}else{setNotice('Private transcript saved. Select Analyse transcript below to request AI suggestions.')}}
  catch(e){setNotice('Upload failed: '+e.message)}finally{setBusy(false)}
 }
 async function analyse(t){
  setBusy(true);setAnalysingId(t.id);setAnalysisResult(null);setNotice('Analysing transcript on request…')
  try{
   const response=await fetch('/api/discovery-transcript',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({workshopId:workshop.id,transcriptId:t.id})})
   const data=await response.json();if(!response.ok)throw Error(data.error||'Transcript analysis failed')
   await onRefresh();setAnalysisResult({id:t.id,ok:true,count:data.count||0});setNotice((data.count||0)+' suggestions generated. Review and accept suggestions to update workshop fields. '+(data.warnings||[]).join(' '))
  }catch(e){setAnalysisResult({id:t.id,ok:false,error:e.message});setNotice('Analysis failed: '+e.message);await onRefresh()}finally{setBusy(false);setAnalysingId(null)}
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
 function conflict(s){const existing=onExisting(s);return existing!==undefined&&existing!==null&&existing!==''&&JSON.stringify(existing)!==JSON.stringify(s.payload)}
 async function accept(s,{batch=false}={}){
  if(batch&&conflict(s))return false
  if(!batch&&conflict(s)&&!window.confirm('This suggestion conflicts with a saved value. Apply it anyway? You can review and edit the saved value afterwards.'))return false
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
 const accepted=suggestions.filter(s=>s.status==='accepted').length
 const rejected=suggestions.filter(s=>s.status==='rejected').length
 const pending=suggestions.filter(s=>s.status==='pending'||s.status==='edited')
 const groups=pending.reduce((acc,s)=>{const name=s.payload?.object_id||s.payload?.process_id||s.target_ref||'General';(acc[name]??=[]).push(s);return acc},{})
 return <div className="dw-card dw-transcripts"><div className="dw-kicker">Optional · Consent-gated</div><h2>Paste & Analyse Workshop Transcript <small style={{fontSize:11,opacity:.65}}>v2026.11.19</small></h2>
 <p className="dw-caption">Paste your full workshop conversation below, including long multilingual SAP PM discussions. Original text is retained; review AI interpretations before accepting.</p>
 <details open className="dw-section"><summary>Paste meeting transcript</summary><div className="dw-section-body"><textarea aria-label="Paste workshop transcript" rows="14" style={{width:'100%',minHeight:260,resize:'vertical'}} placeholder="Paste the complete workshop transcript here (English, German, Hinglish, SAP terminology, transaction codes such as VA01, IW31, IL01…)" value={pastedText} onChange={e=>setPastedText(e.target.value)}/><p className="dw-caption">{pastedText.length.toLocaleString()} characters · No browser-side truncation. Large uploads depend on storage and analysis service limits.</p></div></details>
 <p className="dw-caption">Participant consent is mandatory. Upload TXT, VTT, DOCX or audio (MP3/M4A/WAV, if a speech-to-text API is configured). Nothing is analysed automatically. Suggestions require explicit acceptance.</p>
 <label className="dw-mini-checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{consentText}</label>
 <details className="dw-section"><summary>Or upload a transcript file</summary><div className="dw-section-body"><div className="dw-inline"><input type="file" accept=".txt,.vtt,.docx,.mp3,.m4a,.wav" onChange={e=>setFile(e.target.files?.[0]||null)}/><label>Delete after <select value={retention} onChange={e=>setRetention(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="0">Manual deletion</option></select></label></div></div></details><div className="dw-actions"><button className="dw-button dw-primary" onClick={()=>upload(true)} disabled={!consent||(!file&&!pastedText.trim())||busy}>{busy?'Working…':'Save & Analyse with AI'}</button><button type="button" className="dw-button" onClick={()=>upload(false)} disabled={!consent||(!file&&!pastedText.trim())||busy}>Save only</button></div>
 <div role="status" aria-live="polite" className="dw-section-body" style={{border:'1px solid #68608c',borderRadius:10,marginTop:12,padding:12}}><strong>AI analysis and field update status</strong><p>{analysingId?'Analysing transcript now…':analysisResult?.ok?'Analysis finished — '+analysisResult.count+' suggestions returned.':analysisResult&&!analysisResult.ok?'Analysis failed — '+analysisResult.error:transcripts.some(t=>t.status==='analysed')?'Previously analysed transcript found.':'No completed analysis confirmed yet.'}</p><p>{pending.length} awaiting review · {accepted} accepted/applied · {rejected} rejected</p><p className="dw-caption">Workshop fields change only when you accept a suggestion. Accepted means the field update was saved before the suggestion was marked accepted.</p></div>
 {notice&&<p role="status" className="dw-caption">{notice}</p>}
 <details className="dw-section" open><summary>Saved transcripts and analysis ({transcripts.length})</summary><div className="dw-section-body">{transcripts.map(t=><div className="dw-hint-row" key={t.id}><div><strong>{t.file_path?.split('/').at(-1)||t.audio_path?.split('/').at(-1)||'Transcript'}</strong><p>Analysis: {analysingId===t.id?'Processing…':analysisResult?.id===t.id&&!analysisResult.ok?'Failed — retry available':t.status==='analysed'?'Completed — review suggestions':t.status==='uploaded'?'Not yet completed':pretty(t.status)} · {suggestions.filter(s=>s.transcript_id===t.id).length} suggestions · {suggestions.filter(s=>s.transcript_id===t.id&&s.status==='accepted').length} applied</p><p>Consent: {new Date(t.consent_given_at).toLocaleDateString()} · Delete: {t.delete_after||'Manually'}</p></div><div className="dw-actions"><button className="dw-button dw-primary" disabled={busy} onClick={()=>analyse(t)}>Analyse transcript</button><button className="dw-button" disabled={busy} onClick={()=>remove(t)}>Delete transcript & audio</button></div></div>)}
 </div></details><details className="dw-section"><summary>Review AI suggestions ({pending.length})</summary><div className="dw-section-body"><div className="dw-object-heading"><h3>Review suggestions ({pending.length} pending)</h3><button className="dw-button" onClick={acceptHighConfidence} disabled={busy||!pending.some(s=>s.confidence==='high')}>Accept all high-confidence (no conflicts)</button></div>
 {Object.entries(groups).map(([group,items])=><section className="dw-transcript-group" key={group}><h4>{group}</h4>{items.map(s=><div className="dw-transcript-suggestion" key={s.id}><div className="dw-inline"><strong>{pretty(s.kind)}</strong><span className="dw-status">{s.confidence} confidence</span>{conflict(s)&&<span className="dw-status">Conflict</span>}</div>
 <blockquote>“{s.quote||'No quotation captured'}”</blockquote><small>Timestamp: {s.ts||'not available in source'}</small>
 <div className="dw-form-grid"><div><strong>Proposed value</strong><pre>{JSON.stringify(s.payload,null,2)}</pre></div>{conflict(s)&&<div><strong>Current saved value</strong><pre>{JSON.stringify(onExisting(s),null,2)}</pre></div>}</div>
 {editId===s.id?<><textarea rows="6" value={editJSON} onChange={e=>setEditJSON(e.target.value)}/><div className="dw-actions"><button className="dw-button" onClick={()=>saveEdit(s)}>Save edits</button><button className="dw-button" onClick={()=>setEditId(null)}>Cancel</button></div></>:<div className="dw-actions"><button className="dw-button dw-primary" disabled={processing===s.id} onClick={()=>accept(s)}>Accept</button><button className="dw-button" onClick={()=>{setEditId(s.id);setEditJSON(JSON.stringify(s.payload,null,2))}}>Edit</button><button className="dw-button" onClick={()=>review(s,'rejected')}>Reject</button></div>}</div>)}</section>)}
 {!pending.length&&<p className="dw-caption">No pending suggestions.</p>}</div></details>
 </div>
}
