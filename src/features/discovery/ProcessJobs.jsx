import { useMemo, useState } from 'react'
import { processCatalog } from './processCatalog.js'
const labels={valid:'Valid',not_valid:'Not valid',later:'Later',clarify:'Clarify'}
const freqLabels={daily:'Daily',weekly:'Weekly',fortnightly:'Fortnightly',monthly:'Monthly',period_end:'Period-end',yearly:'Yearly',on_demand:'On demand',event_driven:'Event-driven'}
const plain=v=>String(v||'').replace(/_/g,' ')
function ProcessAnswer({question,value,onChange}){
 const options=question.type==='yesno'?['Yes','No','Unsure']:question.options||[]
 const v=value?.answer??''
 return <div className="dw-process-question"><label>{question.text}</label>
 {['yesno','single','multi'].includes(question.type)?<div className="dw-choice">{options.map(opt=><button key={opt} className={Array.isArray(v)?v.includes(opt)?'selected':'':v===opt?'selected':''} onClick={()=>onChange({answer:question.type==='multi'?(Array.isArray(v)?v.includes(opt)?v.filter(a=>a!==opt):[...v,opt]:[opt]):opt})}>{opt}</button>)}</div>:question.type==='number'?<input type="number" value={v} onChange={e=>onChange({answer:e.target.value})}/>:<textarea rows="2" value={v} onChange={e=>onChange({answer:e.target.value})}/>}
 </div>
}
export default function ProcessJobs({workshopId,entries,onChange,presenter,onJump,onTask}) {
 const [search,setSearch]=useState('')
 const [filter,setFilter]=useState('all')
 const [newCategory,setNewCategory]=useState(null)
 const [newTitle,setNewTitle]=useState('')
 const [newPlain,setNewPlain]=useState('')
 const [taskText,setTaskText]=useState({})
 const [expanded,setExpanded]=useState({})
 const customs=Object.values(entries).filter(e=>e.custom).map(e=>({...e.custom,id:e.process_id,questions:[],sapHint:'',relatedObjects:''}))
 const processes=[...processCatalog.processes,...customs]
 const visible=useMemo(()=>processes.filter(p=>{
  const e=entries[p.id]||{},needle=search.trim().toLowerCase()
  return (!needle||p.title.toLowerCase().includes(needle)||p.plain.toLowerCase().includes(needle))&&(filter==='all'||filter==='unanswered'&&!e.status||filter===e.status)
 }),[processes,entries,search,filter])
 const set=(p,changes)=>onChange(p.id,{...(entries[p.id]||{}),...changes,workshop_id:workshopId,process_id:p.id})
 const addCustom=cat=>{if(!newTitle.trim())return;const id='custom:'+crypto.randomUUID();onChange(id,{workshop_id:workshopId,process_id:id,status:null,frequency:null,answers:{},custom:{title:newTitle.trim(),plain:newPlain.trim(),category:cat,kind:processCatalog.categories.find(c=>c.id===cat).kind}});setNewTitle('');setNewPlain('');setNewCategory(null)}
 const stats=processCatalog.processes.reduce((a,p)=>{const s=entries[p.id]?.status;a[s||'unanswered']=(a[s||'unanswered']||0)+1;return a},{})
 return <div className="dw-card dw-process-page"><div className="dw-kicker">Process catalog v{processCatalog.version}</div><h2>Processes & background jobs</h2><p className="dw-caption">Review all 55 process variants and jobs. Click a status again to clear it. Optional details are shown for Valid or Clarify.</p>
 <div className="dw-stats">{Object.entries({...stats,unanswered:stats.unanswered||0}).map(([key,n])=><span key={key}>{plain(key)}: {n}</span>)}</div>
 <div className="dw-process-filters"><input aria-label="Search process or job" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search processes or jobs…"/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter processes"><option value="all">All</option><option value="valid">Valid</option><option value="clarify">Clarify</option><option value="unanswered">Unanswered</option></select></div>
 {processCatalog.categories.map(cat=>{
  const list=visible.filter(p=>p.category===cat.id)
  if(!list.length&&filter!=='all'&&search)return null
  return <section key={cat.id} className="dw-process-category"><h3>{cat.title} <span>{list.length}</span></h3>
  {list.map(p=>{const e=entries[p.id]||{},shown=e.status==='valid'||e.status==='clarify',q=e.answers||{}
   return <article key={p.id} className={`dw-process-row dw-process-${e.status||'unanswered'}`}><div className="dw-process-head">
    <div className="dw-process-title"><strong>{p.title}</strong><p>{p.plain}</p></div>
    <div className="dw-choice dw-process-status">{processCatalog.statuses.map(status=><button key={status} className={status===e.status?'selected':''} onClick={()=>set(p,{status:status===e.status?null:status})}>{labels[status]}</button>)}</div>
    </div>
    {shown&&<div className="dw-process-details">
    {cat.kind==='job'&&<strong className="dw-caption">Background job frequency</strong>}
    <div className="dw-choice">{processCatalog.frequencies.map(f=><button key={f} className={e.frequency===f?'selected':''} onClick={()=>set(p,{frequency:e.frequency===f?null:f})}>{freqLabels[f]}</button>)}</div>
    <div className="dw-process-grid">{[['run_window','Run window / timing'],['volume','Volume'],['responsible','Responsible']].map(([field,label])=><label key={field}>{label}<input value={e[field]||''} onChange={x=>set(p,{[field]:x.target.value})}/></label>)}</div>
    <label className="dw-process-label">How it is done today<textarea rows="2" value={e.today||''} onChange={x=>set(p,{today:x.target.value})}/></label>
    {(p.questions||[]).map(question=><ProcessAnswer key={question.id} question={question} value={q[question.id]} onChange={v=>set(p,{answers:{...q,[question.id]:v}})}/>)}
    {(!presenter||!e.is_internal)&&<label className="dw-process-label">Process notes<textarea rows="2" value={e.note||''} onChange={x=>set(p,{note:x.target.value})}/></label>}
    {!presenter&&<label className="dw-internal"><input type="checkbox" checked={!!e.is_internal} onChange={x=>set(p,{is_internal:x.target.checked})}/> Internal note</label>}
    {!presenter&&<div className="dw-inline"><input value={taskText[p.id]||''} onChange={x=>setTaskText(v=>({...v,[p.id]:x.target.value}))} onKeyDown={x=>{if(x.key==='Enter'){x.preventDefault();if(taskText[p.id]?.trim()){onTask(p,taskText[p.id].trim());setTaskText(v=>({...v,[p.id]:''}))}}}} placeholder="New action item…"/><button className="dw-button" onClick={()=>{if(taskText[p.id]?.trim()){onTask(p,taskText[p.id].trim());setTaskText(v=>({...v,[p.id]:''}))}}}>+ To-do</button></div>}
    </div>}
    {!presenter&&<div className="dw-process-meta"><span>SAP approach: {p.sapHint||'Custom process'}</span><span>Related SAP objects: {String(p.relatedObjects||'').split(',').filter(Boolean).map(id=><button key={id} className="dw-inline-button" onClick={()=>onJump(id)}>{id}</button>)}</span></div>}
    </article>
   })}
   {!presenter&&<div className="dw-process-custom">{newCategory===cat.id?<div className="dw-inline"><input placeholder="Custom process title" value={newTitle} onChange={e=>setNewTitle(e.target.value)}/><input placeholder="Plain description" value={newPlain} onChange={e=>setNewPlain(e.target.value)}/><button className="dw-button dw-primary" onClick={()=>addCustom(cat.id)}>Save</button><button className="dw-button" onClick={()=>setNewCategory(null)}>Cancel</button></div>:<button className="dw-inline-button" onClick={()=>{setNewCategory(cat.id);setNewTitle('');setNewPlain('')}}>+ Add custom {cat.kind}</button>}</div>}
  </section>
 })}
 </div>
}
