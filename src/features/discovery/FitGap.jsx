import { useMemo,useState } from 'react'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'
import { collectGapCandidates,GAP_TYPES,RICEFW_TYPES,SIZE_POINTS } from './scopingData.js'
const opts=[...discoveryCatalog.objects.map(o=>[o.id,o.title]),...processCatalog.processes.map(p=>[p.id,p.title])]
const format=s=>String(s||'').replaceAll('_',' ')
const GAP_COLUMNS=[
 ['title','Title'],['description','Description'],['related_id','Related object / process'],['gap_type','Gap type'],['ricefw','RICEFW'],['size','Size'],['priority','Priority'],['owner','Owner'],['status','Status'],['solution_idea','Solution idea'],['note','Note']
]
function EditField({row,field,label,options,onChange,asTextArea=false,type='text'}){
 const value=row[field]??''
 return <label className="dw-scope-field">{label}{options?<select value={value} onChange={e=>onChange(field,e.target.value||null)}><option value="">Choose…</option>{options.map(o=>Array.isArray(o)?<option key={o[0]} value={o[0]}>{o[1]}</option>:<option key={o} value={o}>{format(o)}</option>)}</select>:asTextArea?<textarea rows="2" value={value} onChange={e=>onChange(field,e.target.value)}/>:<input type={type} value={value} onChange={e=>onChange(field,e.target.value)}/>}</label>
}
export default function FitGap({entries,legacyFields,processEntries,legacyHints,gaps,ignored,stakeholders=[],onAdd,onEdit,onDelete,onIgnore,onUnignore,presenter=false,filterRelated=null}){
 const [showCandidates,setShowCandidates]=useState(false)
 const [onlyStatus,setOnlyStatus]=useState('all')
 const [onlyType,setOnlyType]=useState('all')
 const [onlyPriority,setOnlyPriority]=useState('all')
 const [search,setSearch]=useState('')
 const [sort,setSort]=useState('seq')
 const [draft,setDraft]=useState('')
 const [related,setRelated]=useState(filterRelated||'all')
 const candidates=useMemo(()=>collectGapCandidates({entries,legacyFields,processEntries,legacyHints,gaps,ignored}),[entries,legacyFields,processEntries,legacyHints,gaps,ignored])
 const sorted=useMemo(()=>gaps.filter(g=>(onlyStatus==='all'||g.status===onlyStatus)&&(onlyType==='all'||g.gap_type===onlyType)&&(onlyPriority==='all'||g.priority===onlyPriority)&&(related==='all'||g.related_id===related)&&(!search||[g.title,g.description,g.owner].join(' ').toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>sort==='size'?(SIZE_POINTS[b.size]||0)-(SIZE_POINTS[a.size]||0):sort==='priority'?(['must','should','could'].indexOf(a.priority))-(['must','should','could'].indexOf(b.priority)):a.seq-b.seq),[gaps,onlyStatus,onlyType,onlyPriority,related,search,sort])
 const points=gaps.reduce((n,g)=>n+(g.status!=='rejected'?(SIZE_POINTS[g.size]||0):0),0)
 const count=(field,value)=>gaps.filter(g=>g[field]===value).length
 const options={related_id:opts,gap_type:GAP_TYPES,ricefw:RICEFW_TYPES,size:['S','M','L','XL'],priority:['must','should','could'],status:['open','analysing','agreed','rejected','done'],owner_stakeholder:stakeholders.map(s=>[s.id,s.name])}
 const make=row=>onAdd({title:row.title,related_id:row.related_id||null,description:row.description||'',origin:row.origin||'manual',origin_ref:row.origin_ref||null,status:'open'})
 return <div className="dw-card dw-scoping"><div className="dw-kicker">After the call · Scoping</div><h2>Fit-gap register</h2>
 <div className="dw-stats"><span>{gaps.length} total gaps</span><span>{gaps.filter(g=>g.status==='open').length} open</span><span>{points} relative size points</span>{GAP_TYPES.map(t=><span key={t}>{format(t)}: {count('gap_type',t)}</span>)}{RICEFW_TYPES.map(t=><span key={t}>{format(t)}: {count('ricefw',t)}</span>)}</div>
 {!presenter&&<div className="dw-inline"><input value={draft} placeholder="New gap title" onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&draft.trim()){make({title:draft.trim()});setDraft('')}}}/><button className="dw-button dw-primary" disabled={!draft.trim()} onClick={()=>{make({title:draft.trim()});setDraft('')}}>+ Add gap</button><button className="dw-button" onClick={()=>setShowCandidates(v=>!v)}>{showCandidates?'Hide candidates':'Collect candidates'} ({candidates.length})</button></div>}
 {showCandidates&&!presenter&&<div className="dw-scope-candidates"><h3>Potential gaps from explicitly recorded statuses</h3><p className="dw-caption">No AI interpretation. Creating or ignoring a candidate is always your choice.</p>{candidates.map(c=><div className="dw-hint-row" key={c.origin+':'+c.origin_ref}><div><strong>{c.title}</strong><p>{c.description} · {format(c.origin)}</p></div><div className="dw-actions"><button className="dw-button dw-primary" onClick={()=>make(c)}>Create gap</button><button className="dw-button" onClick={()=>onIgnore(c)}>Ignore</button></div></div>)}{!candidates.length&&<p className="dw-caption">No new candidates.</p>}</div>}
 {ignored.length>0&&!presenter&&<details><summary>{ignored.length} ignored candidates</summary>{ignored.map(c=><div key={c.origin+':'+c.origin_ref}><span>{c.origin} · {c.origin_ref}</span><button className="dw-inline-button" onClick={()=>onUnignore(c)}>Restore</button></div>)}</details>}
 <div className="dw-scope-filters"><input placeholder="Search gaps" value={search} onChange={e=>setSearch(e.target.value)}/>{[['Status',onlyStatus,setOnlyStatus,['open','analysing','agreed','rejected','done']],['Gap type',onlyType,setOnlyType,GAP_TYPES],['Priority',onlyPriority,setOnlyPriority,['must','should','could']],['Related',related,setRelated,opts],['Sort',sort,setSort,['seq','size','priority']]].map(([label,value,set,options])=><label key={label}>{label}<select value={value} onChange={e=>set(e.target.value)}>{label==='Sort'?null:<option value="all">All</option>}{options.map(o=>Array.isArray(o)?<option key={o[0]} value={o[0]}>{o[1]}</option>:<option key={o} value={o}>{format(o)}</option>)}</select></label>)}</div>
 {sorted.map(row=><article className="dw-first-row dw-gap-row" key={row.id}><div className="dw-object-heading"><strong>G-{String(row.seq).padStart(3,'0')} · {row.title}</strong><span className="dw-status">{format(row.status)}</span></div><div className="dw-caption">Origin: {format(row.origin)}{row.origin_ref?' · '+row.origin_ref:''}</div><div className="dw-form-grid">
 {GAP_COLUMNS.filter(([key])=>!presenter||key!=='solution_idea'||!row.is_internal_solution).map(([key,label])=><EditField key={key} field={key} label={label} row={row} options={key==='ricefw'&&row.gap_type!=='development'?[]:options[key]} asTextArea={['description','solution_idea','note'].includes(key)} onChange={(field,value)=>onEdit(row,{[field]:value})}/>)}
 <EditField label="Owner stakeholder" field="owner_stakeholder" row={row} options={options.owner_stakeholder} onChange={(field,value)=>onEdit(row,{[field]:value})}/>
 {!presenter&&<label className="dw-internal"><input type="checkbox" checked={!!row.is_internal_solution} onChange={e=>onEdit(row,{is_internal_solution:e.target.checked})}/>Internal solution idea</label>}</div>{!presenter&&<button className="dw-inline-button" onClick={()=>onDelete(row.id)}>Delete gap</button>}</article>)}
 {!sorted.length&&<p className="dw-caption">No gaps match the current filters.</p>}
 </div>
}
