import { useMemo,useState } from 'react'
import { pickTemplateContent,templateItems } from './templateData.js'
const defaultInclude={custom:true,answers:false,processes:true,requests:true,gaps:true,raid:true}
const choices=[['custom','Custom fields & questions'],['answers','Typical answers (suggestions only)'],['processes','Process selections'],['requests','Sample request lists'],['gaps','Gap catalogue'],['raid','Risks / assumptions / dependencies']]
export function SaveTemplate({workshop,session,source,onSave,onClose}){
 const [name,setName]=useState(workshop.project_name?workshop.project_name+' template':'My SAP PM template')
 const [tags,setTags]=useState('')
 const [include,setInclude]=useState(defaultInclude)
 const [draft,setDraft]=useState(null)
 const [replacements,setReplacements]=useState([])
 const [reviewed,setReviewed]=useState(false)
 const [anonymisationRun,setAnonymisationRun]=useState(false)
 const [confirmed,setConfirmed]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 function prepare(){setDraft(pickTemplateContent(source,include));setAnonymisationRun(false);setReviewed(false);setReplacements([]);setConfirmed(false)}
 async function anonymise(){
  setBusy(true);setError('')
  const content=draft||pickTemplateContent(source,include);setDraft(content);setAnonymisationRun(false)
  try{
   const response=await fetch('/api/discovery-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'template_anonymise',workshopId:workshop.id,payload:{content}})})
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Anonymisation failed')
   setReplacements((data.replacements||[]).map(x=>({...x,id:crypto.randomUUID()})));setAnonymisationRun(true);setReviewed(false)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function decision(id,apply){
  const r=replacements.find(x=>x.id===id)
  if(apply&&r?.from){
   const text=JSON.stringify(draft).split(r.from).join(r.to)
   try{setDraft(JSON.parse(text))}catch{setError('Replacement could not be applied to this content')}
  }
  setReplacements(old=>old.filter(x=>x.id!==id))
 }
 async function save(){
  if(!draft||!anonymisationRun||!reviewed||!confirmed||!name.trim())return
  setBusy(true);setError('')
  try{await onSave({name:name.trim(),tags:tags.split(',').map(x=>x.trim()).filter(Boolean),content:draft,source_workshop_id:workshop.id});onClose()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <div className="dw-modal-backdrop" role="presentation"><div className="dw-modal" role="dialog" aria-modal="true" aria-label="Save personal template"><div className="dw-object-heading"><h2>Save as personal template</h2><button className="dw-button" onClick={onClose}>Close</button></div>
 <p className="dw-caption">Only selected non-contact content is staged. Stakeholders, contact details, sizing values and attachments are excluded. You must review client-specific wording before saving.</p>
 <label className="dw-mini-field">Template name<input value={name} onChange={e=>setName(e.target.value)}/></label><label className="dw-mini-field">Tags (comma-separated)<input value={tags} onChange={e=>setTags(e.target.value)}/></label>
 <div className="dw-choice">{choices.map(([id,label])=><button className={include[id]?'selected':''} key={id} onClick={()=>{setInclude(v=>({...v,[id]:!v[id]}));setDraft(null);setReviewed(false)}}>{include[id]?'✓ ':''}{label}</button>)}</div>
 <div className="dw-export-actions"><button className="dw-button" onClick={prepare}>Prepare selected content</button><button className="dw-button" onClick={anonymise} disabled={busy}>{busy?'Analysing…':'Anonymise (AI suggestions)'}</button></div>
 {draft&&<p className="dw-caption">{templateItems(draft).length} template suggestions prepared. No decision has been copied to another workshop.</p>}
 {replacements.map(r=><div className="dw-hint-row" key={r.id}><div><strong>{r.from} → {r.to}</strong><p>{r.reason}</p></div><div className="dw-actions"><button className="dw-button dw-primary" onClick={()=>decision(r.id,true)}>Apply</button><button className="dw-button" onClick={()=>decision(r.id,false)}>Skip</button></div></div>)}
 {draft&&anonymisationRun&&replacements.length===0&&<label className="dw-mini-checkbox"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed all suggested replacements and the remaining text.</label>}
 {draft&&<label className="dw-mini-checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm the template contains no client-specific confidential information.</label>}
 {error&&<p role="alert" className="dw-alert">{error}</p>}
 <button className="dw-button dw-primary" onClick={save} disabled={!draft||!anonymisationRun||!reviewed||!confirmed||busy||!name.trim()}>Save private template</button>
 </div></div>
}
export function TemplateLibrary({templates,onRename,onDelete,onUse}){
 const [query,setQuery]=useState('')
 const rows=templates.filter(t=>[t.name,...(t.tags||[])].join(' ').toLowerCase().includes(query.toLowerCase()))
 return <section className="dw-card dw-template-library"><h2>My templates</h2><p className="dw-caption">Your private templates. Starting from a template stages suggestions only.</p><input placeholder="Search template or tag" value={query} onChange={e=>setQuery(e.target.value)}/>
 {rows.map(t=><div className="dw-hint-row" key={t.id}><div><strong>{t.name}</strong><p>{(t.tags||[]).join(' · ')} · {templateItems(t.content||{}).length} suggestions</p></div><div className="dw-actions"><button className="dw-button dw-primary" onClick={()=>onUse(t)}>Start workshop</button><button className="dw-button" onClick={()=>{const n=window.prompt('Template name',t.name);if(n?.trim())onRename(t.id,{name:n.trim()})}}>Rename</button><button className="dw-button" onClick={()=>{const n=window.prompt('Tags (comma separated)',(t.tags||[]).join(', '));if(n!==null)onRename(t.id,{tags:n.split(',').map(x=>x.trim()).filter(Boolean)})}}>Edit tags</button><button className="dw-inline-button" onClick={()=>{if(window.confirm('Delete this template?'))onDelete(t.id)}}>Delete</button></div></div>)}
 {!rows.length&&<p className="dw-caption">No matching templates.</p>}
 </section>
}
export function TemplateSuggestions({template,items,accepted=[],onAccept,onAcceptAll,onDismiss}){
 const groups=useMemo(()=>items.filter(x=>!accepted.includes(x.key)).reduce((acc,x)=>{const group=x.kind==='entry'?x.data.object_id:'Other';(acc[group]??=[]).push(x);return acc},{}),[items,accepted])
 return <section className="dw-series"><div className="dw-object-heading"><h3>Suggestions from {template||'personal template'}</h3><button className="dw-button" onClick={onDismiss}>Dismiss remaining suggestions</button></div>
 <p className="dw-caption">Greyed items are NOT customer facts. Accept a suggestion individually or accept all suggestions for one SAP object.</p>
 {Object.entries(groups).map(([object,items])=><div key={object}><div className="dw-object-heading"><h4>{object}</h4><button className="dw-button" onClick={()=>onAcceptAll(items)}>Accept all for this object</button></div>{items.map(item=><div className="dw-series-item" key={item.key}><span>{item.kind}: {item.label}</span><button className="dw-button dw-primary" onClick={()=>onAccept(item)}>Accept</button></div>)}</div>)}
 </section>
}
