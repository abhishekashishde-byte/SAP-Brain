import { useState } from 'react'

const HANDLING=[['','Unmapped'],['standard_field','Standard SAP field'],['classification','Classification characteristic'],['long_text','Long text'],['custom_field','Custom field (Z)'],['separate_object','Separate object'],['archive_only','Archive only'],['not_needed','Not needed'],['clarify','Clarify']]
const USED=[['','Choose…'],['yes','Yes'],['partly','Partly'],['no','No']]
const initial=()=>({source_system_id:null,source_field:'',meaning:'',used_today:null,sap_handling:null,sap_target:'',sap_catalog_field_id:null,note:'',origin:'manual'})
export default function LegacyFieldsGrid({workshopId,object,systems,fields,onAdd,onEdit,onDelete,onPaste,presenter}) {
 const [draft,setDraft]=useState(initial())
 const [showClient,setShowClient]=useState(false)
 if(presenter&&!showClient)return <div className="dw-object-source"><p className="dw-caption">Extra fields are hidden in presenter mode.</p><button className="dw-button" onClick={()=>setShowClient(true)}>Show extra fields to client</button></div>
 const current=fields.filter(x=>x.object_id===object.id)
 const open=current.filter(x=>!x.sap_handling||x.sap_handling==='clarify').length
 const add=()=>{if(!draft.source_field.trim())return;onAdd({...draft,workshop_id:workshopId,object_id:object.id,sort_order:current.length});setDraft(initial())}
 const cell=(field,value,id,opts)=> opts?<select aria-label={field} value={value||''} onChange={e=>onEdit(id,{[field]:e.target.value||null})}>{opts.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:<input aria-label={field} key={id+'-'+field} defaultValue={value||''} onBlur={e=>{if(e.target.value!==(value||''))onEdit(id,{[field]:e.target.value})}}/>
 const sourceOpts=[['','No source selected'],...systems.map(s=>[s.id,s.name])]
 function handlePaste(e){
  const text=e.clipboardData?.getData('text/plain')||''
  if(!text.includes('\t')&&!text.includes('\n'))return
  e.preventDefault()
  const rows=text.trim().split(/\r?\n/).filter(Boolean).map(line=>{
   const x=line.split('\t')
   return {source_system_id:systems.find(s=>s.id===x[0]||s.name===x[0])?.id||null,source_field:(x[1]||'').trim(),meaning:x[2]||'',used_today:USED.some(([k])=>k===String(x[3]).toLowerCase())?String(x[3]).toLowerCase():null,sap_handling:HANDLING.some(([k])=>k===String(x[4]).toLowerCase())?String(x[4]).toLowerCase():null,sap_target:x[5]||'',note:x[6]||'',origin:'paste'}
  }).filter(x=>x.source_field)
  if(rows.length)onPaste(rows)
 }
 return <section className="dw-legacy-fields"><div className="dw-inline dw-extra-heading"><h3>Extra fields in source</h3><span className="dw-count">{current.length} extra fields · {open} open</span>{presenter&&<button className="dw-button" onClick={()=>setShowClient(false)}>Hide from client</button>}</div>
 <p className="dw-caption">Record source fields missing from the SAP catalog. Paste a seven-column Excel range into the Field name cell: Source system, Field name, Meaning, Used today, SAP handling, SAP target, Note.</p>
 <div className="dw-extra-scroll"><table className="dw-extra-table"><thead><tr><th>Source</th><th>Source field name</th><th>Meaning / example</th><th>Used today</th><th>SAP handling</th><th>SAP target</th><th>Note</th><th>Actions</th></tr></thead><tbody>
 {current.map(row=><tr key={row.id}><td>{cell('source_system_id',row.source_system_id,row.id,sourceOpts)}</td>
 <td>{cell('source_field',row.source_field,row.id)}</td><td>{cell('meaning',row.meaning,row.id)}</td><td>{cell('used_today',row.used_today,row.id,USED)}</td><td>{cell('sap_handling',row.sap_handling,row.id,HANDLING)}</td>
 <td><input aria-label="SAP target" key={row.id+'target'} defaultValue={row.sap_target||''} onBlur={e=>{if(e.target.value!==(row.sap_target||''))onEdit(row.id,{sap_target:e.target.value})}}/>{row.sap_handling==='standard_field'&&<select aria-label="SAP catalog field" value={row.sap_catalog_field_id||''} onChange={e=>onEdit(row.id,{sap_catalog_field_id:e.target.value||null})}><option value="">Select catalog field</option>{object.fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select>}</td>
 <td><textarea aria-label="Extra field note" key={row.id+'note'} defaultValue={row.note||''} onBlur={e=>{if(e.target.value!==(row.note||''))onEdit(row.id,{note:e.target.value})}}/></td>
 <td><button className="dw-inline-button" onClick={()=>onAdd({...row,id:undefined,origin:'manual',sort_order:current.length})}>Duplicate</button><button className="dw-inline-button" onClick={()=>{if(window.confirm('Delete this extra field?'))onDelete(row.id)}}>Delete</button></td></tr>)}
 <tr className="dw-extra-draft"><td><select value={draft.source_system_id||''} onChange={e=>setDraft(x=>({...x,source_system_id:e.target.value||null}))}>{sourceOpts.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
 <td><input value={draft.source_field} onPaste={handlePaste} placeholder="Enter or paste Excel rows" onChange={e=>setDraft(x=>({...x,source_field:e.target.value}))}/></td>
 <td><input value={draft.meaning} onChange={e=>setDraft(x=>({...x,meaning:e.target.value}))}/></td>
 <td><select value={draft.used_today||''} onChange={e=>setDraft(x=>({...x,used_today:e.target.value||null}))}>{USED.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
 <td><select value={draft.sap_handling||''} onChange={e=>setDraft(x=>({...x,sap_handling:e.target.value||null}))}>{HANDLING.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
 <td><input value={draft.sap_target} onChange={e=>setDraft(x=>({...x,sap_target:e.target.value}))}/>{draft.sap_handling==='standard_field'&&<select value={draft.sap_catalog_field_id||''} onChange={e=>setDraft(x=>({...x,sap_catalog_field_id:e.target.value||null}))}><option value="">Catalog field</option>{object.fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select>}</td>
 <td><input value={draft.note} onChange={e=>setDraft(x=>({...x,note:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add()}}}/></td><td><button className="dw-button dw-primary" disabled={!draft.source_field.trim()} onClick={add}>+ Add row</button></td></tr>
 </tbody></table></div></section>
}
