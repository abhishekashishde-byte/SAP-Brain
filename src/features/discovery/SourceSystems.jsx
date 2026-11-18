import { useState } from 'react'
const TYPES=[['sap_ecc','SAP ECC'],['sap_s4','SAP S/4HANA'],['non_sap_cmms','Non-SAP CMMS/EAM'],['non_sap_erp','Non-SAP ERP'],['excel_access','Excel / Access'],['paper','Paper'],['other','Other']]
const names=Object.fromEntries(TYPES)
export function SourceSystemList({workshop,systems,onAdd,onUpdate,onDelete}) {
 const [draft,setDraft]=useState({name:'',system_type:'non_sap_cmms',version:'',owner:'',notes:''})
 const [show,setShow]=useState(false)
 function add(){if(!draft.name.trim())return;onAdd(draft);setDraft({name:'',system_type:'non_sap_cmms',version:'',owner:'',notes:''});setShow(false)}
 return <section className="dw-sources">
 <div className="dw-inline dw-source-heading"><h3>Source systems</h3><button className="dw-button" type="button" onClick={()=>setShow(v=>!v)}>+ Add source</button>
 {workshop.legacy_system&&!systems.some(s=>s.name===workshop.legacy_system)&&<button className="dw-inline-button" type="button" onClick={()=>onAdd({name:workshop.legacy_system,system_type:'other',version:'',owner:'',notes:''})}>Use legacy system: {workshop.legacy_system}</button>}</div>
 {show&&<div className="dw-source-editor"><label>System name<input autoFocus value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))} placeholder="CWorks Plus"/></label><label>System type<select value={draft.system_type} onChange={e=>setDraft(v=>({...v,system_type:e.target.value}))}>{TYPES.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Version<input value={draft.version} onChange={e=>setDraft(v=>({...v,version:e.target.value}))}/></label><label>Owner / contact<input value={draft.owner} onChange={e=>setDraft(v=>({...v,owner:e.target.value}))}/></label><label>Notes<input value={draft.notes} onChange={e=>setDraft(v=>({...v,notes:e.target.value}))}/></label><button className="dw-button dw-primary" onClick={add} disabled={!draft.name.trim()}>Save source</button></div>}
 {!systems.length&&<p className="dw-caption">No source systems added yet. Add SAP, CMMS, Excel or paper sources used by this customer.</p>}
 {systems.map(s=><div className="dw-source-record" key={s.id}>
 <label>Name<input aria-label="Source system name" defaultValue={s.name} key={s.id+'name'} onBlur={e=>{if(e.target.value.trim()&&e.target.value!==s.name)onUpdate(s.id,{name:e.target.value.trim()})}}/></label>
 <label>Type<select aria-label="Source system type" value={s.system_type} onChange={e=>onUpdate(s.id,{system_type:e.target.value})}>{TYPES.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>Version<input defaultValue={s.version||''} key={s.id+'version'} onBlur={e=>{if(e.target.value!==(s.version||''))onUpdate(s.id,{version:e.target.value})}}/></label>
 <label>Contact<input defaultValue={s.owner||''} key={s.id+'owner'} onBlur={e=>{if(e.target.value!==(s.owner||''))onUpdate(s.id,{owner:e.target.value})}}/></label>
 <label>Notes<input defaultValue={s.notes||''} key={s.id+'notes'} onBlur={e=>{if(e.target.value!==(s.notes||''))onUpdate(s.id,{notes:e.target.value})}}/></label>
 <button className="dw-button" title={'Delete '+s.name} onClick={()=>{if(window.confirm('Delete this source system?'))onDelete(s.id)}}>Remove</button></div>)}
 </section>
}
export function ObjectSourcePicker({workshopId,objectId,systems,value,onSave,presenter=false}) {
 const row=value||{workshop_id:workshopId,object_id:objectId,source_system_ids:[],not_maintained:false,note:''}
 const selected=(row.source_system_ids||[]).filter(id=>systems.some(s=>s.id===id))
 const toggle=id=>onSave({...row,source_system_ids:selected.includes(id)?selected.filter(x=>x!==id):[...selected,id],not_maintained:false})
 const labels=Object.fromEntries(systems.map(s=>[s.id,names[s.system_type]]))
 return <section className="dw-object-source"><h3>Source today</h3><p className="dw-caption">Where is this object's information maintained today? Select multiple systems where applicable.</p><div className="dw-choice">
 {systems.map(s=><button key={s.id} className={selected.includes(s.id)?'selected':''} title={labels[s.id]} onClick={()=>toggle(s.id)}>{s.name}<small> {labels[s.id]}</small></button>)}
 <button className={row.not_maintained?'selected':''} onClick={()=>onSave({...row,source_system_ids:[],not_maintained:!row.not_maintained})}>Not maintained today</button></div>
 <label className="dw-note">Source notes<textarea key={objectId+':'+(row.updated_at||'')} rows="2" placeholder="Data owner, availability, quality or exceptions" defaultValue={row.note||''} onBlur={e=>{if(e.target.value!==(row.note||''))onSave({...row,note:e.target.value})}}/></label>
 </section>
}
export const SOURCE_SYSTEM_TYPES=TYPES
