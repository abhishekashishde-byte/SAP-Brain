import { useState } from 'react'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'
import { SIZING_METRICS,REQUEST_TEMPLATES } from './firstCallData.js'

export const FIRST_CALL_SECTIONS=[
 ['stakeholders','Stakeholders'],['drivers','Pain points & goals'],['sizing','Sizing & volumes'],['requests','Requests'],['parking','Parking lot']
]
const roles=['sponsor','decision_maker','process_owner','key_user','end_user','it','finance','purchasing','other']
const types={organisation:['client','consultant','partner','vendor'],project_role:roles,priority:['must','should','could'],kind:['pain','goal'],source:['client','export','estimate'],format:['excel','csv','pdf','screenshot','sample_print','access_db','other'],status:['open','received','not_available']}
const allObjects=[...discoveryCatalog.objects.map(x=>[x.id,x.title]),...processCatalog.processes.map(x=>[x.id,x.title])]
const human=s=>String(s||'').replaceAll('_',' ')
const NONE=''

function Field({row,keyName,label,update,options,textarea=false,type='text',internal=false}){
 const [local,setLocal]=useState(row[keyName]??'')
 const val=row[keyName]??''
 // Component's keyed parent recreates when switching to another record.
 const changed=v=>{setLocal(v);update(keyName,v)}
 if(options)return <label className="dw-mini-field">{label}<select value={val} onChange={e=>changed(e.target.value||null)}><option value="">Choose…</option>{options.map(x=><option value={Array.isArray(x)?x[0]:x} key={Array.isArray(x)?x[0]:x}>{Array.isArray(x)?x[1]:human(x)}</option>)}</select></label>
 if(type==='checkbox')return <label className="dw-mini-checkbox"><input type="checkbox" checked={!!val} onChange={e=>changed(e.target.checked)}/>{label}</label>
 return <label className="dw-mini-field">{label}{textarea?<textarea rows="2" value={val} onChange={e=>changed(e.target.value)}/>:<input type={type} value={val} onChange={e=>changed(type==='number'?e.target.value===''?null:Number(e.target.value):e.target.value)}/>}</label>
}
function PickMany({value=[],onChange,label}){
 const selected=Array.isArray(value)?value:[]
 return <label className="dw-mini-field">{label}<select value="" onChange={e=>{if(e.target.value&&!selected.includes(e.target.value))onChange([...selected,e.target.value])}}><option value="">+ Link SAP object / process</option>{allObjects.filter(([id])=>!selected.includes(id)).map(([id,title])=><option value={id} key={id}>{title}</option>)}</select><span className="dw-mini-chips">{selected.map(id=><button key={id} onClick={()=>onChange(selected.filter(x=>x!==id))}>{allObjects.find(x=>x[0]===id)?.[1]||id} ×</button>)}</span></label>
}
export default function FirstCall({section,rows,workshopId,add,edit,remove,onTodo,objectId,presenter}){
 const [text,setText]=useState('')
 const [paste,setPaste]=useState('')
 const [showPaste,setShowPaste]=useState(false)
 const [custom,setCustom]=useState({label:'',unit:'count'})
 const stakeholders=rows.stakeholders||[]
 const list=rows[section]||[]
 const stakeholderOpts=stakeholders.map(s=>[s.id,s.name])
 function updateRow(kind,row,field,value){edit(kind,row,{[field]:value})}
 const input=(kind,row,name,label,opts)=> <Field key={row.id||row.metric_id+name} row={row} keyName={name} label={label} options={opts} update={(k,v)=>updateRow(kind,row,k,v)}/>
 function quickAdd(kind,overrides={}){
  if(!text.trim())return
  const key=kind==='requests'?'item':'text'
  add(kind,{[key]:text.trim(),...overrides});setText('')
 }
 function addStakeholderPaste(){
  const lines=paste.trim().split(/\r?\n/).filter(Boolean)
  for(const line of lines){
   const cols=line.split('\t')
   if(!cols[0]?.trim())continue
   add('stakeholders',{name:cols[0].trim(),organisation:['client','consultant','partner','vendor'].includes(cols[1])?cols[1]:'client',
    function_role:cols[2]||'',project_role:roles.includes(cols[3])?cols[3]:'other',responsible_for:cols[4]?.split(',').map(x=>x.trim()).filter(Boolean)||[],present:cols[5]?.toLowerCase()==='true',contact:cols[6]||'',note:cols[7]||''})
  }setPaste('');setShowPaste(false)
 }
 const title=FIRST_CALL_SECTIONS.find(x=>x[0]===section)?.[1]
 return <div className="dw-card dw-firstcall"><h2>{title}</h2><p className="dw-caption">Captured during the customer workshop. Edits are saved to your private workshop.</p>
 {section==='stakeholders'&&<>
  <div className="dw-inline"><input value={text} onChange={e=>setText(e.target.value)} placeholder="Stakeholder name" onKeyDown={e=>{if(e.key==='Enter'){quickAdd('stakeholders',{name:text.trim(),organisation:'client'})}}}/><button className="dw-button dw-primary" onClick={()=>{if(text.trim()){add('stakeholders',{name:text.trim(),organisation:'client'});setText('')}}}>+ Add person</button><button className="dw-button" onClick={()=>setShowPaste(x=>!x)}>Paste from Excel</button></div>
  {showPaste&&<div className="dw-note"><label>Paste tab-separated stakeholder rows</label><textarea rows="5" value={paste} onChange={e=>setPaste(e.target.value)} placeholder="Name [tab] Organisation [tab] Role…"/><button className="dw-button" onClick={addStakeholderPaste}>Import rows</button></div>}
  {stakeholders.map(row=><section className="dw-first-row" key={row.id}><div className="dw-form-grid">{input('stakeholders',row,'name','Name')}{input('stakeholders',row,'organisation','Organisation',types.organisation)}{input('stakeholders',row,'function_role','Function / role')}{input('stakeholders',row,'project_role','Project role',roles)}</div>
   <PickMany value={row.responsible_for} label="Responsible for" onChange={v=>updateRow('stakeholders',row,'responsible_for',v)}/>
   <div className="dw-form-grid"><Field row={row} keyName="present" label="Present in this call" type="checkbox" update={(k,v)=>updateRow('stakeholders',row,k,v)}/>{!presenter&&input('stakeholders',row,'contact','Contact')}{!presenter&&<Field row={row} keyName="is_internal" label="Internal note" type="checkbox" update={(k,v)=>updateRow('stakeholders',row,k,v)}/>}</div>
   {(!presenter||!row.is_internal)&&<Field row={row} keyName="note" label="Stakeholder notes" textarea update={(k,v)=>updateRow('stakeholders',row,k,v)}/>}
   {!presenter&&<button className="dw-inline-button" onClick={()=>remove('stakeholders',row.id)}>Delete stakeholder</button>}</section>)}
 </>}
 {section==='drivers'&&<>{['pain','goal'].map(kind=><section key={kind}><h3>{kind==='pain'?'Pain points':'Goals'}</h3><div className="dw-inline"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')quickAdd('drivers',{kind,priority:'should'})}} placeholder={'Add '+kind+'…'}/><button className="dw-button" onClick={()=>quickAdd('drivers',{kind,priority:'should'})}>+ Add {kind}</button></div>
  {list.filter(x=>x.kind===kind).map(row=><div className="dw-first-row" key={row.id}><Field row={row} keyName="text" label="Description" textarea update={(k,v)=>updateRow('drivers',row,k,v)}/><div className="dw-form-grid">{input('drivers',row,'priority','Priority',['must','should','could'])}{input('drivers',row,'raised_by','Raised by',stakeholderOpts)}</div><PickMany value={row.affected} label="Affected objects and processes" onChange={v=>updateRow('drivers',row,'affected',v)}/>{kind==='goal'&&<div className="dw-form-grid">{input('drivers',row,'kpi','Measure / KPI')}{input('drivers',row,'baseline','Baseline today')}</div>}{input('drivers',row,'note','Notes')}<button className="dw-inline-button" onClick={()=>remove('drivers',row.id)}>Delete</button></div>)}</section>)}</>}
 {section==='sizing'&&<>
  {SIZING_METRICS.map(([id,label,unit])=>{const row=list.find(x=>x.metric_id===id)||{metric_id:id,value:null,approx:false,source:null,note:''};return <div className="dw-sizing-row" key={id}><strong>{label}<small> {unit}</small></strong><Field row={row} keyName="value" label="Value" type="number" update={(k,v)=>edit('sizing',row,{[k]:v})}/><Field row={row} keyName="approx" label="Approx." type="checkbox" update={(k,v)=>edit('sizing',row,{[k]:v})}/><Field row={row} keyName="source" label="Source" options={types.source} update={(k,v)=>edit('sizing',row,{[k]:v})}/><Field row={row} keyName="note" label="Notes" update={(k,v)=>edit('sizing',row,{[k]:v})}/></div>})}
  {list.filter(x=>x.metric_id.startsWith('custom:')).map(row=><div key={row.metric_id} className="dw-sizing-row"><strong>{row.custom_label}<small> {row.custom_unit}</small></strong><Field row={row} keyName="value" label="Value" type="number" update={(k,v)=>edit('sizing',row,{[k]:v})}/><Field row={row} keyName="approx" label="Approx." type="checkbox" update={(k,v)=>edit('sizing',row,{[k]:v})}/><Field row={row} keyName="source" label="Source" options={types.source} update={(k,v)=>edit('sizing',row,{[k]:v})}/><button className="dw-inline-button" onClick={()=>remove('sizing',row.metric_id)}>Remove</button></div>)}
  <div className="dw-inline"><input placeholder="Custom metric name" value={custom.label} onChange={e=>setCustom(x=>({...x,label:e.target.value}))}/><input placeholder="Unit" value={custom.unit} onChange={e=>setCustom(x=>({...x,unit:e.target.value}))}/><button className="dw-button" onClick={()=>{if(custom.label.trim())add('sizing',{metric_id:'custom:'+crypto.randomUUID(),custom_label:custom.label,custom_unit:custom.unit});setCustom({label:'',unit:'count'})}}>+ Custom metric</button></div>
 </>}
 {section==='requests'&&<>
  <div className="dw-inline"><input value={text} placeholder="What should the customer send?" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')quickAdd('requests',{status:'open',related_id:objectId||null})}}/><button className="dw-button" onClick={()=>quickAdd('requests',{status:'open',related_id:objectId||null})}>+ Request</button></div>
  {objectId&&REQUEST_TEMPLATES[objectId]&&<div className="dw-choice">{REQUEST_TEMPLATES[objectId].map(name=><button key={name} onClick={()=>add('requests',{item:name,related_id:objectId,status:'open'})}>+ {name}</button>)}</div>}
  {list.map(row=><div className="dw-first-row" key={row.id}><div className="dw-form-grid">{input('requests',row,'item','Requested item')}{input('requests',row,'related_id','Related object / process',allObjects)}{input('requests',row,'format','Format',types.format)}{input('requests',row,'from_stakeholder','From stakeholder',stakeholderOpts)}{input('requests',row,'due_date','Due date')}{input('requests',row,'status','Status',types.status)}{input('requests',row,'note','Notes')}</div><button className="dw-inline-button" onClick={()=>remove('requests',row.id)}>Remove request</button></div>)}
 </>}
 {section==='parking'&&<>
  <div className="dw-inline"><input value={text} onChange={e=>setText(e.target.value)} placeholder="Park a topic for later…" onKeyDown={e=>{if(e.key==='Enter')quickAdd('parking',{context_id:objectId||null,status:'parked'})}}/><button className="dw-button" onClick={()=>quickAdd('parking',{context_id:objectId||null,status:'parked'})}>+ Park</button></div>
  {list.map(row=><div className="dw-first-row" key={row.id}><div className="dw-form-grid">{input('parking',row,'text','Topic')}{input('parking',row,'context_id','Context',allObjects)}{input('parking',row,'status','Status',['parked','discussed','moved','dropped'])}{input('parking',row,'note','Notes')}</div>{row.status!=='moved'&&<button className="dw-button" onClick={()=>onTodo(row)}>Move to to-do</button>}<button className="dw-inline-button" onClick={()=>remove('parking',row.id)}>Delete</button></div>)}
 </>}
 </div>
}
