import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { discoveryCatalog } from './catalog.js'

const TYPES={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain'}
export function LegacyImportPanel({workshop,session,onImported}){
 const [file,setFile]=useState(null)
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const [warnings,setWarnings]=useState([])
 async function analyze(){
  if(!file||busy)return
  const extension=file.name.split('.').pop()?.toLowerCase()
  if(!TYPES[extension]){setNotice('Only PDF, DOCX and TXT manuals are supported.');return}
  if(file.size>8*1024*1024){setNotice('Maximum manual size is 8 MB.');return}
  setBusy(true);setNotice('Uploading to private workshop storage…');setWarnings([])
  try{
   const path=session.user.id+'/'+workshop.id+'/'+crypto.randomUUID()+'.'+extension
   const {error:uploadError}=await supabase.storage.from('discovery-legacy').upload(path,file,{upsert:false,contentType:TYPES[extension]})
   if(uploadError)throw uploadError
   setNotice('Extracting features and mapping to SAP objects…')
   const response=await fetch('/api/discovery-import',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({
    workshopId:workshop.id,path,originalName:file.name,catalog:discoveryCatalog.objects.map(o=>({id:o.id,title:o.title,plain:o.plain}))
   })})
   const data=await response.json()
   if(!response.ok)throw new Error(data.error||'Legacy analysis failed')
   setNotice(data.saved+' legacy hints imported for review. Nothing has been accepted automatically.')
   setWarnings(data.warnings||[])
   await onImported?.()
  }catch(e){setNotice('Import failed: '+(e.message||String(e)))}finally{setBusy(false)}
 }
 return <section className="dw-legacy-import"><h3>Legacy manual import</h3><p className="dw-caption">Optional. Upload a customer manual (PDF, DOCX or TXT, max 8 MB). It stays in private workshop storage. Document text is sent to the AI provider <strong>only when you click Analyse manual</strong>. Results are suggestions for review, never accepted automatically. Text-based PDFs only.</p>
 <div className="dw-inline"><input type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Choose legacy manual" onChange={e=>setFile(e.target.files?.[0]||null)} disabled={busy}/><button type="button" className="dw-button dw-primary" onClick={analyze} disabled={busy||!file}>{busy?'Analysing…':'Analyse manual'}</button></div>
 {notice&&<p role="status" className="dw-caption">{notice}</p>}{warnings.map((w,i)=><p role="status" className="dw-caption" key={i}>{w}</p>)}
 </section>
}
export function LegacyHintsPanel({objectId,hints,onReview,presenter}){
 if(presenter)return null
 const relevant=hints.filter(h=>h.object_id===objectId)
 if(!relevant.length)return null
 return <section className="dw-legacy-import"><h3>Legacy manual hints <span className="dw-count">{relevant.length}</span></h3><p className="dw-caption">AI-generated mapping suggestions. Accept only after checking against the customer's real process.</p>
 {relevant.map(h=><div key={h.id} className="dw-hint-row"><div><strong>{h.legacy_feature}</strong><p>{h.hint}</p><small>{h.gap_type} · {h.source_ref||'Manual'}</small></div><div className="dw-actions">{h.accepted===null||h.accepted===undefined?<><button className="dw-button dw-primary" onClick={()=>onReview(h.id,true)}>Accept</button><button className="dw-button" onClick={()=>onReview(h.id,false)}>Reject</button></>:<><span className="dw-caption">{h.accepted?'Accepted':'Rejected'}</span><button className="dw-inline-button" onClick={()=>onReview(h.id,null)}>Review again</button></>}</div></div>)}
 </section>
}
