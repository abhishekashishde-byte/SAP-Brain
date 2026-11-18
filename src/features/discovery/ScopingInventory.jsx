import { useState } from 'react'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'
const related=[...discoveryCatalog.objects.map(o=>[o.id,o.title]),...processCatalog.processes.map(o=>[o.id,o.title])]
const frequencies=[['daily','Daily'],['weekly','Weekly'],['fortnightly','Fortnightly'],['monthly','Monthly'],['period_end','Period-end'],['yearly','Yearly'],['on_demand','On demand'],['event_driven','Event-driven']]
const schemas={
 interfaces:{title:'Interfaces inventory',item:'name',defaults:{status:'open',technology:'unknown',direction:'both'},fields:[
  ['name','Interface name'],['partner_system','Partner system'],['direction','Direction',['in','out','both']],
  ['related_id','Related object / process',related],['data_text','Data / object'],['frequency','Frequency',frequencies],
  ['volume','Volume'],['technology','Technology / format',['api','idoc','file','database','manual','unknown']],
  ['exists_today','Today exists?',['yes','no','planned']],['owner_stakeholder','Owner','stakeholder'],
  ['status','Status',['open','agreed','out_of_scope']],['note','Notes']]},
 forms_reports:{title:'Forms & reports inventory',item:'name',defaults:{kind:'form'},fields:[
  ['name','Name'],['kind','Kind',['form','report','label','dashboard']],
  ['related_id','Related SAP object',related],['used_by','Used by'],['frequency','Frequency',frequencies],
  ['today_in','Today in'],['sample_received','Sample received?','checkbox'],['request_id','Linked sample request','request'],
  ['decision','Decision',['standard','adapt','custom','not_needed','clarify']],['note','Notes']]},
 raid:{title:'Risks & assumptions',item:'text',defaults:{kind:'risk',status:'open'},fields:[
  ['kind','Kind',['risk','assumption','dependency']],['text','Description'],['related_id','Related object / process',related],
  ['probability','Probability',['low','medium','high']],['impact','Impact',['low','medium','high']],
  ['mitigation','Mitigation / validation'],['owner_stakeholder','Owner','stakeholder'],
  ['status','Status',['open','mitigated','closed','confirmed','rejected']],['note','Notes'],['is_internal','Internal only','checkbox']]}
}
const clean=s=>String(s||'').replaceAll('_',' ')
export default function ScopingInventory({kind,rows=[],stakeholders=[],requests=[],onAdd,onEdit,onDelete,onGap,presenter=false}){
 const schema=schemas[kind],[draft,setDraft]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all')
 if(!schema)return null
 function add(){if(!draft.trim())return;onAdd(kind,{[schema.item]:draft.trim(),...schema.defaults});setDraft('')}
 const choices=(def,key)=>def==='stakeholder'?stakeholders.map(s=>[s.id,s.name]):def==='request'?requests.map(r=>[r.id,r.item]):Array.isArray(def)?def:null
 const visible=rows.filter(row=>(filter==='all'||row.status===filter||row.kind===filter)&&(!search||[row.name,row.text,row.partner_system,row.data_text,row.today_in].join(' ').toLowerCase().includes(search.toLowerCase())))
 return <div className="dw-card dw-scoping"><div className="dw-kicker">After the call · Scoping</div><h2>{schema.title}</h2><div className="dw-stats"><span>{rows.length} records</span><span>{rows.filter(x=>x.status==='open').length} open</span></div>
 {!presenter&&<div className="dw-inline"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add()}} placeholder={'New '+schema.title.toLowerCase()+'…'}/><button className="dw-button dw-primary" onClick={add} disabled={!draft.trim()}>+ Add</button></div>}
 <div className="dw-scope-filters"><input placeholder="Search records" value={search} onChange={e=>setSearch(e.target.value)}/><label>Filter<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option>{[...new Set(rows.flatMap(r=>[r.status,r.kind]).filter(Boolean))].map(v=><option key={v} value={v}>{clean(v)}</option>)}</select></label></div>
 {visible.map(row=><article className="dw-first-row" key={row.id}><div className="dw-object-heading"><strong>{row.name||row.text}</strong><span className="dw-status">{clean(row.status||row.decision||row.kind)}</span></div>
 <div className="dw-form-grid">
 {schema.fields.filter(([id])=>!(kind==='raid'&&!['risk'].includes(row.kind)&&['probability','impact'].includes(id))&&(!presenter||id!=='note'||!row.is_internal)&&(!presenter||id!=='is_internal')).map(([key,label,def])=>{
  const options=choices(def,key),value=row[key]??''
  return <label className="dw-scope-field" key={key}>{label}{def==='checkbox'?<input type="checkbox" checked={!!value} onChange={e=>onEdit(kind,row,{[key]:e.target.checked})}/>:options?<select value={value} onChange={e=>onEdit(kind,row,{[key]:e.target.value||null})}><option value="">Choose…</option>{options.map(opt=>Array.isArray(opt)?<option key={opt[0]} value={opt[0]}>{opt[1]}</option>:<option key={opt} value={opt}>{clean(opt)}</option>)}</select>:['note','text','mitigation','data_text'].includes(key)?<textarea rows="2" value={value} onChange={e=>onEdit(kind,row,{[key]:e.target.value})}/>:<input value={value} onChange={e=>onEdit(kind,row,{[key]:e.target.value})}/>}</label>
 })}
 </div>
 {!presenter&&<div className="dw-actions">{(kind==='interfaces'||kind==='forms_reports'&&row.decision==='custom')&&<button className="dw-button" onClick={()=>onGap(kind,row)}>Create development / {kind==='interfaces'?'interface':row.kind==='form'?'form':'report'} gap</button>}<button className="dw-inline-button" onClick={()=>onDelete(kind,row.id)}>Delete</button></div>}
 </article>)}
 {!visible.length&&<p className="dw-caption">No records match the current filters.</p>}
 </div>
}
