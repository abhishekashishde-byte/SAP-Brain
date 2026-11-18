import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { discoveryCatalog, discoveryCounts } from './catalog.js'
import { loadWorkshops,createWorkshop,updateWorkshop,removeWorkshop,loadEntries,loadTodos,createTodo,updateTodo,removeTodo,entryKey,createEntryQueue } from './data.js'
import './DiscoveryWorkshop.css'

const today=()=>new Date().toLocaleDateString('en-CA')
const emptyForm=()=>({client_name:'',title:'SAP PM Discovery Workshop',project_name:'',consultant_name:'',call_date:today(),start_time:'',end_time:'',participants:'',legacy_system:'',scope_areas:discoveryCatalog.areas.map(a=>a.id)})
const inputTypes={yesno:['Yes','No','Unsure']}
const markCycle=['','needed','not_needed','clarify']
const statuses=['not_started','in_progress','done','out_of_scope']
const labels={needed:'Needed',not_needed:'Not needed',clarify:'Clarify',not_started:'Not started',in_progress:'In progress',done:'Done',out_of_scope:'Out of scope'}
const eKey=(o,t,id)=>entryKey(o,t,id)
function Section({title,count,children,open=true}){return <details className="dw-section" defaultOpen={open}><summary>{title}<span className="dw-count">{count}</span></summary><div className="dw-section-body">{children}</div></details>}
function NoteInput({label,value,onChange,internal,onInternal,placeholder='Add notes here…'}) {
 return <div className="dw-note"><label>{label}</label>{onInternal&&<label className="dw-internal"><input type="checkbox" checked={!!internal} onChange={e=>onInternal(e.target.checked)}/> Internal only</label>}
 <textarea rows="2" value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>
}
function QuestionEditor({item,value={},onChange}) {
 const v=value.answer??(item.type==='multi'?[]:'')
 const set=answer=>onChange({...value,answer})
 const options=item.type==='yesno'?inputTypes.yesno:item.options||[]
 return <div className="dw-item"><div className="dw-item-title">{item.text}</div>
 {['yesno','single'].includes(item.type)&&<div className="dw-choice">{[...options,'Other…'].map(opt=><button key={opt} type="button" className={v===opt?'selected':''} onClick={()=>set(opt)}>{opt}</button>)}</div>}
 {item.type==='multi'&&<div className="dw-choice">{[...options,'Other…'].map(opt=><button key={opt} className={Array.isArray(v)&&v.includes(opt)?'selected':''} onClick={()=>set(Array.isArray(v)?v.includes(opt)?v.filter(x=>x!==opt):[...v,opt]:[opt])}>{opt}</button>)}</div>}
 {((Array.isArray(v)&&v.includes('Other…'))||v==='Other…')&&<input className="dw-input" aria-label="Other answer" placeholder="Please specify" value={value.other||''} onChange={e=>onChange({...value,other:e.target.value})}/>}
 {item.type==='number'&&<div className="dw-inline"><input className="dw-input" aria-label={item.text} type="number" value={v} onChange={e=>set(e.target.value===''?'':Number(e.target.value))}/><label><input type="checkbox" checked={!!value.approx} onChange={e=>onChange({...value,approx:e.target.checked})}/> Approx.</label></div>}
 {item.type==='text'&&<textarea rows="2" aria-label={item.text} value={v} onChange={e=>set(e.target.value)} placeholder="Record customer's answer…"/>}
 <details className="dw-mini-note"><summary>+ Note</summary><textarea rows="2" value={value.note||''} onChange={e=>onChange({...value,note:e.target.value})} placeholder="Additional context…"/></details></div>
}
function DecisionEditor({item,value={},onChange}) {
 return <div className="dw-item"><div className="dw-item-title">{item.text}</div><div className="dw-choice">{[...item.options,'Other…'].map(opt=><button key={opt} className={value.choice===opt?'selected':''} onClick={()=>onChange({...value,choice:opt,status:'decided'})}>{opt}</button>)}</div>
 {value.choice==='Other…'&&<input className="dw-input" placeholder="Custom decision" value={value.other||''} onChange={e=>onChange({...value,other:e.target.value})}/>}
 <div className="dw-inline"><label>Decision status <select value={value.status||'open'} onChange={e=>onChange({...value,status:e.target.value})}><option value="open">Open</option><option value="decided">Decided</option></select></label></div><textarea rows="2" placeholder="Rationale / decision notes…" value={value.rationale||''} onChange={e=>onChange({...value,rationale:e.target.value})}/></div>
}
export default function DiscoveryWorkshop({session}) {
 const [workshops,setWorkshops]=useState([])
 const [workshop,setWorkshop]=useState(null)
 const [form,setForm]=useState(emptyForm())
 const [mode,setMode]=useState('list')
 const [entries,setEntries]=useState({})
 const [todos,setTodos]=useState([])
 const [selectedId,setSelectedId]=useState(discoveryCatalog.objects[0].id)
 const [presenter,setPresenter]=useState(false)
 const [showOptional,setShowOptional]=useState(false)
 const [mobileNav,setMobileNav]=useState(false)
 const [scope,setScope]=useState('all')
 const [search,setSearch]=useState('')
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)
 const [pending,setPending]=useState(0)
 const [savingMeta,setSavingMeta]=useState(false)
 const [newTodo,setNewTodo]=useState('')
 const [audience,setAudience]=useState('client')
 const [showSummary,setShowSummary]=useState(false)
 const queue=useRef(null)
 const userId=session?.user?.id
 const scoped=useMemo(()=>discoveryCatalog.objects.filter(o=>workshop?.scope_areas?.length?workshop.scope_areas.includes(o.area):true),[workshop])
 const objects=useMemo(()=>scoped.filter(o=>(scope==='all'||o.area===scope)&&(o.title.toLowerCase().includes(search.toLowerCase())||o.plain.toLowerCase().includes(search.toLowerCase())||o.tcodes.some(t=>t.toLowerCase().includes(search.toLowerCase())))),[scoped,scope,search])
 const selected=objects.find(o=>o.id===selectedId)||objects[0]
 const selectedIndex=objects.findIndex(o=>o.id===selected?.id)
 const area=discoveryCatalog.areas.find(a=>a.id===selected?.area)
 const entry=(o,t,id)=>entries[eKey(o,t,id)]||null
 const val=(o,t,id)=>entry(o,t,id)?.value||{}
 const counts=useMemo(()=>{
  let fields=0,questions=0,decisions=0,clarify=0
  for(const o of scoped){if(entries[eKey(o.id,'object_status','main')]?.value?.status==='out_of_scope')continue
   for(const f of o.fields){const m=entries[eKey(o.id,'field',f.id)]?.value?.mark;if(m)fields++;if(m==='clarify')clarify++}
   for(const q of o.questions){const a=entries[eKey(o.id,'question',q.id)]?.value?.answer;if(a!==undefined&&a!==''&&(!Array.isArray(a)||a.length))questions++}
   for(const d of o.decisions){if(entries[eKey(o.id,'decision',d.id)]?.value?.status==='decided')decisions++}
  }
  return{fields,questions,decisions,clarify}
 },[scoped,entries])
 const refresh=useCallback(async()=>{if(!userId)return;setLoading(true);try{setWorkshops(await loadWorkshops(userId));setError('')}catch(e){setError(e.message)}finally{setLoading(false)}},[userId])
 useEffect(()=>{refresh()},[refresh])
 useEffect(()=>()=>queue.current?.close(),[])
 async function openWorkshop(w) {
  queue.current?.close();queue.current=null;setLoading(true);setError('')
  try {
   const [rows,taskRows]=await Promise.all([loadEntries(w.id),loadTodos(w.id)])
   const q=createEntryQueue(w.id,userId,setPending)
   const map={};for(const row of rows)map[eKey(row.object_id,row.item_type,row.item_id)]=row
   for(const row of q.pending.values())map[eKey(row.object_id,row.item_type,row.item_id)]=row
   setEntries(map);setTodos(taskRows);queue.current=q;q.start();setWorkshop(w);setSelectedId(discoveryCatalog.objects.find(o=>!w.scope_areas?.length||w.scope_areas.includes(o.area))?.id||discoveryCatalog.objects[0].id)
   setMode('workshop');setShowSummary(false);setScope('all');setSearch('')
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 async function create(e) {
  e.preventDefault();setError('')
  if(!form.client_name.trim()||!form.call_date){setError('Customer and meeting date are required.');return}
  setLoading(true)
  try {const w=await createWorkshop({...form,owner_id:userId,catalog_id:discoveryCatalog.catalogId,catalog_version:discoveryCatalog.version, start_time:form.start_time||null,end_time:form.end_time||null});await refresh();await openWorkshop(w)}
  catch(e){setError(e.message);setLoading(false)}
 }
 async function changeWorkshop(field,value) {
  const updated={...workshop,[field]:value};setWorkshop(updated);setSavingMeta(true)
  try {setWorkshop(await updateWorkshop(workshop.id,{[field]:value}))}catch(e){setError('Workshop details could not be saved: '+e.message)}finally{setSavingMeta(false)}
 }
 function writeEntry(o,t,id,value,extra={}) {
  if(!workshop)return
  const k=eKey(o,t,id);const old=entries[k]||{}
  const row={workshop_id:workshop.id,object_id:o,item_type:t,item_id:id,value,note:old.note||null,is_internal:old.is_internal||false,...extra}
  setEntries(prev=>({...prev,[k]:row}));queue.current?.enqueue(row)
  if(o!==''&&t!=='object_status'&&val(o,'object_status','main').status!=='out_of_scope'&&!val(o,'object_status','main').status) {
   const status={workshop_id:workshop.id,object_id:o,item_type:'object_status',item_id:'main',value:{status:'in_progress'},is_internal:false,note:null}
   setEntries(prev=>({...prev,[k]:row,[eKey(o,'object_status','main')]:status}));queue.current?.enqueue(status)
  }
 }
 function writeNote(o,t,id,text,internal) {
  const old=entry(o,t,id)
  writeEntry(o,t,id,{text}, {is_internal:internal===undefined?!!old?.is_internal:internal})
 }
 async function addTodo() {
  if(!newTodo.trim())return
  try {const task=await createTodo({workshop_id:workshop.id,object_id:selected.id,text:newTodo.trim(),owner:'',done:false});setTodos(x=>[...x,task]);setNewTodo('')}catch(e){setError(e.message)}
 }
 async function editTodo(id,values){setTodos(x=>x.map(t=>t.id===id?{...t,...values}:t));try{await updateTodo(id,values)}catch(e){setError(e.message)}}
 async function deleteTodo(id){try{await removeTodo(id);setTodos(x=>x.filter(t=>t.id!==id))}catch(e){setError(e.message)}}
 async function deleteWorkshop(w){if(!window.confirm('Delete workshop and all its notes and decisions permanently?'))return;try{await removeWorkshop(w.id);await refresh()}catch(e){setError(e.message)}}
 function selectObject(id){setSelectedId(id);setShowOptional(false);setMobileNav(false)}
 function goBack(){queue.current?.flush();queue.current?.close();queue.current=null;setWorkshop(null);setMode('list');setShowSummary(false);refresh()}
 const covered={objects:scoped.length,fields:scoped.reduce((n,o)=>n+o.fields.length,0),questions:scoped.reduce((n,o)=>n+o.questions.length,0),decisions:scoped.reduce((n,o)=>n+o.decisions.length,0)}
 return <main className={`dw ${presenter?'dw-presenter':''}`}>
  <header className="dw-header"><div className="dw-brand"><button className="dw-back" onClick={mode==='workshop'?goBack:()=>window.location.assign('/')} aria-label="Go back">←</button><span className="dw-logo">W</span><span>Wani <span className="dw-slash">/</span> Discovery Workshop</span></div>
   {mode==='workshop'&&<div className="dw-actions"><span className="dw-save" aria-live="polite">{pending?pending+' pending sync':savingMeta?'Saving…':'Saved'}</span><button className="dw-button" onClick={()=>setPresenter(x=>!x)}>{presenter?'Work mode':'Presenter mode'}</button><button className="dw-button dw-mobile-nav" onClick={()=>setMobileNav(x=>!x)}>Objects</button></div>}
  </header>
  <div className="dw-container">
  {error&&<div role="alert" className="dw-alert">{error}<button className="dw-close" onClick={()=>setError('')}>×</button></div>}
  {mode==='list'&&<><div className="dw-list-heading"><div><div className="dw-kicker">SAP PM · Discovery</div><h1>Customer workshops</h1><p>Client-confidential data. Only your signed-in account can access your workshop records.</p></div><button className="dw-button dw-primary" onClick={()=>{setForm(emptyForm());setMode('create')}}>+ New workshop</button></div>
   {loading&&<p>Loading workshops…</p>}{!loading&&!workshops.length&&<div className="dw-card"><h2>No workshops yet</h2><p>Create a workshop to begin capturing SAP PM requirements.</p></div>}
   <div className="dw-workshop-list">{workshops.map(w=><article className="dw-list-card" key={w.id}><div><div className="dw-kicker">{w.call_date} · {w.status}</div><h2>{w.client_name}</h2><p>{w.title} · {w.project_name||'SAP PM'}</p></div><div className="dw-actions"><button className="dw-button dw-primary" onClick={()=>openWorkshop(w)}>Open</button><button className="dw-button" onClick={()=>deleteWorkshop(w)}>Delete</button></div></article>)}</div></>}
  {mode==='create'&&<div className="dw-card dw-form-card"><button className="dw-inline-button" onClick={()=>setMode('list')}>← All workshops</button><h1>New discovery workshop</h1><form onSubmit={create}><div className="dw-form-grid">
   {[['client_name','Customer / company *','text'],['call_date','Meeting date *','date'],['title','Workshop title','text'],['project_name','Project','text'],['consultant_name','Consultant','text'],['participants','Participants','text'],['legacy_system','Legacy system','text'],['start_time','Start time','time'],['end_time','End time','time']].map(([key,label,type])=><label key={key}>{label}<input required={key==='client_name'||key==='call_date'} type={type} value={form[key]} onChange={e=>setForm(x=>({...x,[key]:e.target.value}))}/></label>)}
   </div><fieldset className="dw-scope-fields"><legend>SAP process areas in scope</legend>{discoveryCatalog.areas.map(a=><label key={a.id}><input type="checkbox" checked={form.scope_areas.includes(a.id)} onChange={e=>setForm(x=>({...x,scope_areas:e.target.checked?[...x.scope_areas,a.id]:x.scope_areas.filter(k=>k!==a.id)}))}/>{a.title}</label>)}</fieldset>
   <p className="dw-caption">Customer information and workshop notes are confidential and are not included in Wani's shared knowledge base.</p><button type="submit" disabled={loading||!form.scope_areas.length} className="dw-button dw-primary">Create workshop</button></form></div>}
  {mode==='workshop'&&workshop&&<>
   <section className="dw-intro"><div className="dw-kicker">SAP PM · {discoveryCatalog.version}</div><div className="dw-list-heading"><div><h1>{workshop.client_name}</h1><p>{workshop.title} · {workshop.project_name||'Discovery workshop'}</p></div><div className="dw-actions"><button className="dw-button" onClick={()=>setShowSummary(s=>!s)}>{showSummary?'Back to objects':'Summary & exports'}</button></div></div>
    <div className="dw-metadata">{[['Customer',workshop.client_name],['Meeting date',workshop.call_date],['Consultant',workshop.consultant_name||'—'],['Catalog coverage',`${covered.objects} objects · ${covered.fields} fields · ${covered.questions} questions · ${covered.decisions} decisions`]].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
    {!presenter&&<details className="dw-meta-edit"><summary>Edit workshop details</summary><div className="dw-form-grid">{[['client_name','Customer'],['call_date','Meeting date'],['title','Title'],['project_name','Project'],['consultant_name','Consultant'],['participants','Participants'],['legacy_system','Legacy system'],['start_time','Start time'],['end_time','End time']].map(([k,l])=><label key={k}>{l}<input type={k==='call_date'?'date':k.endsWith('_time')?'time':'text'} defaultValue={workshop[k]||''} onBlur={e=>{if(e.target.value!==(workshop[k]||''))changeWorkshop(k,e.target.value||((k.endsWith('_time'))?null:''))}}/></label>)}</div></details>}
    <div className="dw-stats"><span>Fields marked: {counts.fields}/{covered.fields}</span><span>Questions answered: {counts.questions}/{covered.questions}</span><span>Decisions made: {counts.decisions}/{covered.decisions}</span><span>Need clarification: {counts.clarify}</span><span>Open tasks: {todos.filter(t=>!t.done).length}</span></div>
    <NoteInput label="General workshop notes" value={val('workshop','workshop_note','main').text} onChange={v=>writeNote('workshop','workshop_note','main',v)} internal={entry('workshop','workshop_note','main')?.is_internal} onInternal={v=>writeNote('workshop','workshop_note','main',val('workshop','workshop_note','main').text||'',v)}/>
   </section>
   {showSummary?<div className="dw-card"><h2>Workshop summary</h2><p className="dw-caption">All catalog items, including unanswered items, are part of the export dataset. Documents are only generated on request.</p><p>{counts.fields} fields marked · {counts.questions} questions answered · {counts.decisions} decisions made · {todos.filter(t=>!t.done).length} open to-dos</p><label>Export audience <select value={audience} onChange={e=>setAudience(e.target.value)}><option value="client">Client — hide internal notes</option><option value="internal">Internal — include all notes</option></select></label><div className="dw-actions"><button className="dw-button" onClick={()=>window.print()}>Print current view</button></div>{scoped.map(o=><div key={o.id} className="dw-summary-object"><h3>{o.title}</h3><p>Fields marked: {o.fields.filter(f=>val(o.id,'field',f.id).mark).length}/{o.fields.length} · Answers: {o.questions.filter(q=>val(o.id,'question',q.id).answer!==undefined).length}/{o.questions.length} · Decisions: {o.decisions.filter(d=>val(o.id,'decision',d.id).status==='decided').length}/{o.decisions.length}</p><button className="dw-inline-button" onClick={()=>{selectObject(o.id);setShowSummary(false)}}>Review object →</button></div>)}</div>:
   <div className="dw-workspace"><aside className={`dw-sidebar ${mobileNav?'dw-open':''}`}><div className="dw-sidebar-top"><strong>Workshop catalog</strong><span>{objects.length}/{scoped.length}</span></div><input className="dw-search" placeholder="Search objects or T-codes" value={search} onChange={e=>setSearch(e.target.value)}/><select className="dw-scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All areas</option>{discoveryCatalog.areas.filter(a=>scoped.some(o=>o.area===a.id)).map(a=><option value={a.id} key={a.id}>{a.title}</option>)}</select>
    {discoveryCatalog.areas.map(a=>{const children=objects.filter(o=>o.area===a.id);return children.length?<div key={a.id} className="dw-nav-group"><div className="dw-nav-heading">{a.title}</div><NoteInput label="Area notes" value={val(a.id,'area_note','main').text} onChange={v=>writeNote(a.id,'area_note','main',v)} internal={entry(a.id,'area_note','main')?.is_internal} onInternal={v=>writeNote(a.id,'area_note','main',val(a.id,'area_note','main').text||'',v)}/>{children.map(o=><button className={`dw-nav-item ${o.id===selected?.id?'dw-active':''}`} key={o.id} onClick={()=>selectObject(o.id)}>{o.title}<span>{labels[val(o.id,'object_status','main').status]||'Not started'}</span></button>)}</div>:null})}</aside>
   <div className="dw-main">{selected&&<div className="dw-card"><div className="dw-object-heading"><div><div className="dw-kicker">{area?.title} · {selectedIndex+1} / {objects.length}</div><h2>{selected.title}</h2></div><select aria-label="Object status" value={val(selected.id,'object_status','main').status||'not_started'} onChange={e=>writeEntry(selected.id,'object_status','main',{status:e.target.value})}>{statuses.map(x=><option key={x} value={x}>{labels[x]}</option>)}</select></div>
    <div className="dw-tcodes">{selected.tcodes.map(c=><code key={c}>{c}</code>)}</div><p className="dw-description">{selected.plain}</p>
    {val(selected.id,'object_status','main').status!=='out_of_scope'&&<>
    {!presenter&&<Section title="Current legacy process" count="Notes"><NoteInput label="How the customer works today" value={val(selected.id,'legacy_today','main').text} onChange={v=>writeNote(selected.id,'legacy_today','main',v)}/></Section>}
    <Section title="Key fields" count={selected.fields.length}><p className="dw-caption">Click a field to cycle: Needed → Not needed → Clarify → Unmarked.</p><div className="dw-fields">{selected.fields.filter(f=>showOptional||f.tier==='core').map(f=>{const v=val(selected.id,'field',f.id),i=markCycle.indexOf(v.mark||'');return <div key={f.id} className="dw-field-wrap"><button title="Cycle field marking" className={`dw-field dw-mark-${v.mark||'none'}`} onClick={()=>writeEntry(selected.id,'field',f.id,{...v,mark:markCycle[(i+1)%markCycle.length]})}><span>{v.mark?labels[v.mark]:'○'}</span><strong>{f.label}</strong><small>{f.tier}</small></button><details className="dw-mini-note"><summary>+ Field note</summary><textarea value={v.note||''} onChange={e=>writeEntry(selected.id,'field',f.id,{...v,note:e.target.value})}/></details></div>})}</div>{selected.fields.some(f=>f.tier==='optional')&&<button className="dw-inline-button" onClick={()=>setShowOptional(x=>!x)}>{showOptional?'Hide optional fields':`Show optional fields (${selected.fields.filter(f=>f.tier==='optional').length})`}</button>}</Section>
    <Section title="Process questions" count={selected.questions.length}>{selected.questions.map(q=><QuestionEditor key={q.id} item={q} value={val(selected.id,'question',q.id)} onChange={v=>writeEntry(selected.id,'question',q.id,v)}/>)}</Section>
    <Section title="Decisions" count={selected.decisions.length}>{selected.decisions.map(d=><DecisionEditor key={d.id} item={d} value={val(selected.id,'decision',d.id)} onChange={v=>writeEntry(selected.id,'decision',d.id,v)}/>)}</Section>
    <Section title="Notes & action items" count={todos.filter(t=>t.object_id===selected.id).length}><NoteInput label="Object notes" value={val(selected.id,'note','main').text} onChange={v=>writeNote(selected.id,'note','main',v)} internal={entry(selected.id,'note','main')?.is_internal} onInternal={v=>writeNote(selected.id,'note','main',val(selected.id,'note','main').text||'',v)}/>
    {!presenter&&<><div className="dw-inline"><input className="dw-input" aria-label="New action item" value={newTodo} onChange={e=>setNewTodo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTodo()}}} placeholder="Add follow-up / action item…"/><button className="dw-button" onClick={addTodo}>Add</button></div>{todos.filter(t=>t.object_id===selected.id).map(t=><div key={t.id} className="dw-task"><label><input type="checkbox" checked={t.done} onChange={e=>editTodo(t.id,{done:e.target.checked})}/>{t.text}</label><input aria-label="Owner" placeholder="Owner" defaultValue={t.owner||''} onBlur={e=>editTodo(t.id,{owner:e.target.value})}/><input aria-label="Due date" type="date" defaultValue={t.due_date||''} onChange={e=>editTodo(t.id,{due_date:e.target.value||null})}/><button className="dw-button" onClick={()=>deleteTodo(t.id)}>Remove</button></div>)}</>}</Section>
    </>}
    <div className="dw-pagination"><button className="dw-button" disabled={selectedIndex<=0} onClick={()=>selectObject(objects[selectedIndex-1].id)}>← Previous</button><span>{selectedIndex+1}/{objects.length}</span><button className="dw-button dw-primary" disabled={selectedIndex>=objects.length-1} onClick={()=>selectObject(objects[selectedIndex+1].id)}>Next →</button></div>
    </div>}</div></div>}
   </>}
  </div>
 </main>
}
