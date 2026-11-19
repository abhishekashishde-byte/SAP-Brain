import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { WaniLogo, WaniWordmark } from '../../pages/Login.jsx'
import { discoveryCatalog, discoveryCounts } from './catalog.js'
import { loadWorkshops,createWorkshop,updateWorkshop,removeWorkshop,loadEntries,loadTodos,createTodo,updateTodo,removeTodo,entryKey,createEntryQueue,saveEntry,saveMinutes,loadMinutes,loadSourceSystems,addSourceSystem,changeSourceSystem,deleteSourceSystem,loadObjectSources,saveObjectSources,loadLegacyFields,createLegacyField,updateLegacyField,deleteLegacyField,loadProcessEntries,createProcessQueue,loadHints,reviewHint } from './data.js'
import './DiscoveryWorkshop.css'
import {SourceSystemList,ObjectSourcePicker} from './SourceSystems.jsx'
import LegacyFieldsGrid from './LegacyFieldsGrid.jsx'
import ProcessJobs from './ProcessJobs.jsx'
import {LegacyImportPanel,LegacyHintsPanel} from './LegacyImport.jsx'
import {processCatalog} from './processCatalog.js'
import {exportCSV,exportJSON,exportMarkdown,exportXLSX,printReport,exportScopePack} from './exports.js'
import FirstCall,{FIRST_CALL_SECTIONS} from './FirstCall.jsx'
import {loadFirstCall,addFirstCall,removeFirstCall,createFirstCallQueue,SIZING_LINKS} from './firstCallData.js'
import FitGap from './FitGap.jsx'
import {loadScopingP1,addGap,editGap,deleteGap,ignoreCandidate,unignoreCandidate,loadScopingInventories,addInventory,editInventory,deleteInventory} from './scopingData.js'
import ScopingInventory from './ScopingInventory.jsx'
import FollowupEmail from './FollowupEmail.jsx'
import {createNextSession,loadEngagementSessions,loadPreviousEntries} from './seriesData.js'
import {CarryoverReview,EngagementTimeline} from './Series.jsx'
import {loadTemplates,saveTemplate,editTemplate,deleteTemplate,templateItems} from './templateData.js'
import {SaveTemplate,TemplateLibrary,TemplateSuggestions} from './Templates.jsx'
import {localizeObject,getAreaTitle,germanHoverText,germanCatalogStatus} from './i18n.js'
import Transcripts from './Transcripts.jsx'
import {loadTranscripts,loadTranscriptSuggestions} from './transcriptData.js'

const today=()=>new Date().toLocaleDateString('en-CA')
const emptyForm=()=>({client_name:'',title:'SAP PM Discovery Workshop',project_name:'',consultant_name:'',call_date:today(),start_time:'',end_time:'',participants:'',legacy_system:'',scope_areas:discoveryCatalog.areas.map(a=>a.id)})
const inputTypes={yesno:['Yes','No','Unsure']}
const markCycle=['','needed','not_needed','clarify']
const statuses=['not_started','in_progress','done','out_of_scope']
const labels={needed:'Used',not_needed:'Not used',clarify:'Clarify',not_started:'Not started',in_progress:'In progress',done:'Done',out_of_scope:'Out of scope'}
const eKey=(o,t,id)=>entryKey(o,t,id)
function Section({title,count,children,open=true,id,summary}){return <details id={id} className="dw-section" defaultOpen={open}><summary>{title}{summary&&<span className="dw-section-progress">{summary}</span>}<span className="dw-count">{count}</span></summary><div className="dw-section-body">{children}</div></details>}

function CompactField({field, value={}, onChange, presenter}) {
 const [editing,setEditing]=useState(false)
 const noteRef=useRef(null)
 const cycle=()=>onChange({...value,mark:markCycle[(markCycle.indexOf(value.mark||'')+1)%markCycle.length]})
 useEffect(()=>{if(editing)noteRef.current?.focus()},[editing])
 return <div className={`dw-compact-field ${value.mark?'dw-compact-'+value.mark:''}`}>
  <div className="dw-compact-row">
   <button type="button" className={`dw-compact-status dw-compact-status-${value.mark||'none'}`}
     title={`${value.mark?labels[value.mark]:'Unmarked'} — click to change status`}
     aria-label={`${field.label}: ${value.mark?labels[value.mark]:'Unmarked'}. Click to change status`} onClick={cycle}>
     <span className={`dw-status-light dw-status-light-${value.mark||'none'}`} aria-hidden="true">{value.mark==='needed'?'✓':value.mark==='not_needed'?'×':value.mark==='clarify'?'?':'·'}</span>
    </button>
   <div className="dw-compact-name"><span>{field.label}</span>{value.note?.trim()&&<small className="dw-compact-preview" title={value.note}>{value.note}</small>}</div>
   <span className="dw-compact-tier">{field.tier==='optional'?'Optional':''}</span>
   {!presenter&&<button type="button" className={`dw-compact-note-toggle ${value.note?.trim()?'dw-note-saved':''}`} onClick={()=>setEditing(x=>!x)} aria-expanded={editing} aria-label={`${editing?'Close':'Edit'} note for ${field.label}`} title="Field note">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4 10.5-10.5Z"/></svg>
   </button>}
  </div>
  {editing&&!presenter&&<div className="dw-compact-editor"><label>Note for {field.label}</label><textarea ref={noteRef} rows="2" value={value.note||''} placeholder="Add a short note…" onChange={e=>onChange({...value,note:e.target.value})}/><button type="button" onClick={()=>setEditing(false)}>Done</button></div>}
 </div>
}

function NoteInput({label,value,onChange,internal,onInternal,placeholder='Add notes here…'}) {
 return <div className="dw-note"><label>{label}</label>{onInternal&&<label className="dw-internal"><input type="checkbox" checked={!!internal} onChange={e=>onInternal(e.target.checked)}/> Internal only</label>}
 <textarea rows="2" value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>
}
function QuestionEditor({item,display=item,value={},onChange,linkedSizing=null}) {
 const [editing,setEditing]=useState(false)
 const v=value.answer??(item.type==='multi'?[]:'')
 const answered=Array.isArray(v)?v.length>0:String(v).trim()!==''
 const preview=Array.isArray(v)?v.join(', '):String(v)
 const set=answer=>onChange({...value,answer})
 const options=item.type==='yesno'?inputTypes.yesno:item.options||[]
 return <div className={`dw-question-row ${answered?'dw-question-complete':''}`}>
  <div className="dw-question-head">
   <span className={`dw-question-indicator ${answered?'dw-question-indicator-done':''}`} title={answered?'Answered':'Unanswered'}>{answered?'✓':'·'}</span>
   <button type="button" className="dw-question-summary" onClick={()=>setEditing(x=>!x)} aria-expanded={editing}><span className="dw-question-text">{display.text}</span>{answered&&<small className="dw-question-preview" title={preview}>{preview}</small>}{linkedSizing!==null&&linkedSizing!==undefined&&linkedSizing!==''&&<small className="dw-question-sizing">Sizing: {linkedSizing}</small>}</button>
   <button type="button" className="dw-question-edit" onClick={()=>setEditing(x=>!x)}>{editing?'Close':answered?'Edit':'Answer'}</button>
  </div>
  {editing&&<div className="dw-question-editor">
   {['yesno','single'].includes(item.type)&&<div className="dw-choice">{[...options,'Other…'].map(opt=><button key={opt} type="button" className={v===opt?'selected':''} onClick={()=>set(opt)}>{display.options?.[options.indexOf(opt)]||opt}</button>)}</div>}
   {item.type==='multi'&&<div className="dw-choice">{[...options,'Other…'].map(opt=><button type="button" key={opt} className={Array.isArray(v)&&v.includes(opt)?'selected':''} onClick={()=>set(Array.isArray(v)?v.includes(opt)?v.filter(x=>x!==opt):[...v,opt]:[opt])}>{display.options?.[options.indexOf(opt)]||opt}</button>)}</div>}
   {((Array.isArray(v)&&v.includes('Other…'))||v==='Other…')&&<input className="dw-input" aria-label="Other answer" placeholder="Please specify" value={value.other||''} onChange={e=>onChange({...value,other:e.target.value})}/>}
   {item.type==='number'&&<div className="dw-inline"><input className="dw-input" aria-label={item.text} type="number" value={v} onChange={e=>set(e.target.value===''?'':Number(e.target.value))}/><label><input type="checkbox" checked={!!value.approx} onChange={e=>onChange({...value,approx:e.target.checked})}/> Approx.</label></div>}
   {item.type==='text'&&<textarea rows="3" aria-label={item.text} value={v} onChange={e=>set(e.target.value)} placeholder="Record customer's answer…"/>}
   <details className="dw-mini-note"><summary>Additional note</summary><textarea rows="2" value={value.note||''} onChange={e=>onChange({...value,note:e.target.value})} placeholder="Additional context…"/></details>
   <button type="button" className="dw-button" onClick={()=>setEditing(false)}>Done</button>
  </div>}
 </div>
}
function DecisionEditor({item,display=item,value={},onChange,stakeholders=[]}) {
 return <div className="dw-item"><div className="dw-item-title" title={display.text!==item.text?item.text:undefined}>{display.text}</div><div className="dw-choice">{[...item.options,'Other…'].map(opt=><button key={opt} className={value.choice===opt?'selected':''} onClick={()=>onChange({...value,choice:opt,status:'decided',decided_at:value.decided_at||new Date().toLocaleDateString('en-CA')})}>{display.options?.[item.options.indexOf(opt)]||opt}</button>)}</div>
 {value.choice==='Other…'&&<input className="dw-input" placeholder="Custom decision" value={value.other||''} onChange={e=>onChange({...value,other:e.target.value})}/>}
 <div className="dw-inline"><label>Decision status <select value={value.status||'open'} onChange={e=>onChange({...value,status:e.target.value,decided_at:e.target.value==='decided'?(value.decided_at||new Date().toLocaleDateString('en-CA')):value.decided_at})}><option value="open">Open</option><option value="decided">Decided</option></select></label><label>Decided by <select value={value.decided_by||''} onChange={e=>onChange({...value,decided_by:e.target.value||null})}><option value="">Not recorded</option>{stakeholders.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>Decision date <input type="date" value={value.decided_at||''} onChange={e=>onChange({...value,decided_at:e.target.value||null})}/></label></div><textarea rows="2" placeholder="Rationale / decision notes…" value={value.rationale||''} onChange={e=>onChange({...value,rationale:e.target.value})}/></div>
}
export default function DiscoveryWorkshop({session}) {
 const [workshops,setWorkshops]=useState([])
 const [templates,setTemplates]=useState([])
 const [selectedTemplate,setSelectedTemplate]=useState(null)
 const [templateOpen,setTemplateOpen]=useState(false)
 const [workshop,setWorkshop]=useState(null)
 const [engagementSessions,setEngagementSessions]=useState([])
 const [previousEntries,setPreviousEntries]=useState([])
 const [carryoverOpen,setCarryoverOpen]=useState(false)
 const [onlyCarried,setOnlyCarried]=useState(false)
 const [nextDate,setNextDate]=useState('')
 const [nextOpen,setNextOpen]=useState(false)
 const [sourceSystems,setSourceSystems]=useState([])
 const [objectSources,setObjectSources]=useState({})
 const [legacyFields,setLegacyFields]=useState([])
 const [legacyHints,setLegacyHints]=useState([])
 const [firstCall,setFirstCall]=useState({stakeholders:[],drivers:[],sizing:[],requests:[],parking:[]})
 const [firstTab,setFirstTab]=useState(null)
 const [scopingTab,setScopingTab]=useState(null)
 const [emailOpen,setEmailOpen]=useState(false)
 const [gaps,setGaps]=useState([])
 const [inventories,setInventories]=useState({interfaces:[],forms_reports:[],raid:[]})
 const [transcripts,setTranscripts]=useState([])
 const [transcriptSuggestions,setTranscriptSuggestions]=useState([])
 const [ignoredGaps,setIgnoredGaps]=useState([])
 const [firstPending,setFirstPending]=useState(0)
 const [parkOpen,setParkOpen]=useState(false)
 const [parkText,setParkText]=useState('')
 const [processEntries,setProcessEntries]=useState({})
 const [showProcesses,setShowProcesses]=useState(false)
 const [processPending,setProcessPending]=useState(0)
 const [form,setForm]=useState(emptyForm())
 const [mode,setMode]=useState('list')
 const [entries,setEntries]=useState({})
 const [todos,setTodos]=useState([])
 const [selectedId,setSelectedId]=useState(discoveryCatalog.objects[0].id)
 const [presenter,setPresenter]=useState(false)
 const [showOptional,setShowOptional]=useState(false)
 const [mobileNav,setMobileNav]=useState(false)
 const [sidebarCollapsed,setSidebarCollapsed]=useState(false)
 const [scope,setScope]=useState('all')
 const [search,setSearch]=useState('')
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)
 const [pending,setPending]=useState(0)
 const [savingMeta,setSavingMeta]=useState(false)
 const [newTodo,setNewTodo]=useState('')
 const [audience,setAudience]=useState('client')
 const [showSummary,setShowSummary]=useState(false)
 const [summaryFilter,setSummaryFilter]=useState('all')
 const [customLabel,setCustomLabel]=useState('')
 const [customQuestion,setCustomQuestion]=useState('')
 const [quickText,setQuickText]=useState('')
 const [quickOpen,setQuickOpen]=useState(false)
 const [aiBusy,setAiBusy]=useState('')
 const [aiQuestion,setAiQuestion]=useState('')
 const [aiAnswer,setAiAnswer]=useState('')
 const [followups,setFollowups]=useState([])
 const [minutes,setMinutes]=useState('')
 const [minutesAudience,setMinutesAudience]=useState('client')
 const queue=useRef(null)
 const processQueue=useRef(null)
 const firstQueue=useRef(null)
 const userId=session?.user?.id
 const scoped=useMemo(()=>discoveryCatalog.objects.filter(o=>workshop?.scope_areas?.length?workshop.scope_areas.includes(o.area):true),[workshop])
 const objects=useMemo(()=>scoped.filter(o=>(!onlyCarried||Object.values(entries).some(r=>r.object_id===o.id&&r.carried_from))&&(scope==='all'||o.area===scope)&&(o.title.toLowerCase().includes(search.toLowerCase())||o.plain.toLowerCase().includes(search.toLowerCase())||o.tcodes.some(t=>t.toLowerCase().includes(search.toLowerCase())))),[scoped,scope,search,onlyCarried,entries])
 const selected=objects.find(o=>o.id===selectedId)||objects[0]
 const selectedIndex=objects.findIndex(o=>o.id===selected?.id)
 const area=discoveryCatalog.areas.find(a=>a.id===selected?.area)
 const displaySelected=localizeObject(selected,presenter?workshop?.client_language||'en':'en')
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
 const refreshTemplateLibrary=useCallback(async()=>{if(!userId)return;try{setTemplates(await loadTemplates(userId))}catch(e){setError('Template library unavailable: '+e.message)}},[userId])
 useEffect(()=>{refreshTemplateLibrary()},[refreshTemplateLibrary])
 useEffect(()=>()=>{queue.current?.close();processQueue.current?.close();firstQueue.current?.close()},[])
 async function openWorkshop(w) {
  queue.current?.close();queue.current=null;processQueue.current?.close();processQueue.current=null;firstQueue.current?.close();firstQueue.current=null;setLoading(true);setError('')
  try {
   const [rows,taskRows,sources,objectRows,extraRows,procRows,hintRows,firstRows,scopeRows,inventoryRows,seriesRows,prevRows,transcriptRows,suggestionRows]=await Promise.all([loadEntries(w.id),loadTodos(w.id),loadSourceSystems(w.id),loadObjectSources(w.id),loadLegacyFields(w.id),loadProcessEntries(w.id),loadHints(w.id),loadFirstCall(w.id),loadScopingP1(w.id),loadScopingInventories(w.id),loadEngagementSessions(w.engagement_id),loadPreviousEntries(w.previous_workshop_id),loadTranscripts(w.id),loadTranscriptSuggestions(w.id)])
   const q=createEntryQueue(w.id,userId,setPending)
   const map={};for(const row of rows)map[eKey(row.object_id,row.item_type,row.item_id)]=row
   for(const row of q.pending.values())map[eKey(row.object_id,row.item_type,row.item_id)]=row
   setEntries(map);setTodos(taskRows);setSourceSystems(sources);setObjectSources(Object.fromEntries(objectRows.map(r=>[r.object_id,r])));setLegacyFields(extraRows);setLegacyHints(hintRows);setFirstCall(firstRows);const fq=createFirstCallQueue(w.id,userId,setFirstPending);firstQueue.current=fq;for(const edit of fq.pending.values())firstRows[edit.kind]=firstRows[edit.kind].map(row=>(row.id||row.metric_id)===edit.id?{...row,...edit.values}:row);setFirstCall({...firstRows});setGaps(scopeRows.gaps);setIgnoredGaps(scopeRows.ignored);setInventories(inventoryRows);setTranscripts(transcriptRows);setTranscriptSuggestions(suggestionRows);setEngagementSessions(seriesRows);setPreviousEntries(prevRows);setCarryoverOpen(!!w.previous_workshop_id);setOnlyCarried(false);fq.start();const pq=createProcessQueue(w.id,userId,setProcessPending);const procMap=Object.fromEntries(procRows.map(r=>[r.process_id,r]));for(const row of pq.pending.values())procMap[row.process_id]=row;setProcessEntries(procMap);processQueue.current=pq;pq.start();queue.current=q;q.start();setWorkshop(w);setSelectedId(discoveryCatalog.objects.find(o=>!w.scope_areas?.length||w.scope_areas.includes(o.area))?.id||discoveryCatalog.objects[0].id)
   setMode('workshop');setNextOpen(false);setEmailOpen(false);setFirstTab(null);setScopingTab(null);setShowProcesses(false);setShowSummary(false);setScope('all');setSearch('');setAiAnswer('');setFollowups([]);setMinutes('');setAiQuestion('')
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 async function create(e) {
  e.preventDefault();setError('')
  if(!form.client_name.trim()||!form.call_date){setError('Customer and meeting date are required.');return}
  setLoading(true)
  try {const w=await createWorkshop({...form,owner_id:userId,catalog_id:discoveryCatalog.catalogId,catalog_version:discoveryCatalog.version, start_time:form.start_time||null,end_time:form.end_time||null});
   if(selectedTemplate){const items=templateItems(selectedTemplate.content||{});await saveEntry({workshop_id:w.id,object_id:'workshop',item_type:'note',item_id:'template_suggestions',value:{template_id:selectedTemplate.id,template_name:selectedTemplate.name,items,accepted:[]},is_internal:true})}
   setSelectedTemplate(null);await refresh();await openWorkshop(w)}
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
  if(discoveryCatalog.objects.some(obj=>obj.id===o)&&t!=='area_note'&&t!=='workshop_note'&&t!=='object_status'&&val(o,'object_status','main').status!=='out_of_scope'&&!val(o,'object_status','main').status) {
   const status={workshop_id:workshop.id,object_id:o,item_type:'object_status',item_id:'main',value:{status:'in_progress'},is_internal:false,note:null}
   setEntries(prev=>({...prev,[k]:row,[eKey(o,'object_status','main')]:status}));queue.current?.enqueue(status)
  }
 }
 function writeNote(o,t,id,text,internal) {
  const old=entry(o,t,id)
  writeEntry(o,t,id,{text}, {is_internal:internal===undefined?!!old?.is_internal:internal})
 }
 async function createSource(values){
  try{const row=await addSourceSystem({...values,workshop_id:workshop.id});setSourceSystems(prev=>[...prev,row])}catch(e){setError('Source system could not be saved: '+e.message)}
 }
 async function editSource(id,values){
  try{const row=await changeSourceSystem(id,values);setSourceSystems(prev=>prev.map(x=>x.id===id?row:x))}catch(e){setError('Source system could not be updated: '+e.message)}
 }
 async function removeSource(id){
  try{await deleteSourceSystem(id);setSourceSystems(prev=>prev.filter(x=>x.id!==id));const toFix=Object.values(objectSources).filter(v=>(v.source_system_ids||[]).includes(id));for(const row of toFix){const fixed={...row,source_system_ids:row.source_system_ids.filter(x=>x!==id)};await saveObjectSources(fixed);setObjectSources(prev=>({...prev,[row.object_id]:fixed}))}}catch(e){setError('Source deletion or mapping cleanup failed: '+e.message)}
 }
 async function updateObjectSources(row){
  const old=objectSources[row.object_id]
  setObjectSources(prev=>({...prev,[row.object_id]:row}))
  try{const saved=await saveObjectSources(row);setObjectSources(prev=>({...prev,[row.object_id]:saved}))}
  catch(e){setObjectSources(prev=>({...prev,[row.object_id]:old}));setError('Source mapping save failed: '+e.message)}
 }
 async function addExtraField(row) {
  try {const {id:_id,updated_at:_updated, ...values}=row;const saved=await createLegacyField({...values,workshop_id:workshop.id});setLegacyFields(old=>[...old,saved])}
  catch(e){setError('Extra field could not be saved: '+e.message)}
 }
 async function editExtraField(id,changes){
  const old=legacyFields.find(x=>x.id===id)
  setLegacyFields(rows=>rows.map(r=>r.id===id?{...r,...changes}:r))
  try{const saved=await updateLegacyField(id,changes);setLegacyFields(rows=>rows.map(r=>r.id===id?saved:r))}
  catch(e){setLegacyFields(rows=>rows.map(r=>r.id===id?old:r));setError('Extra field update failed: '+e.message)}
 }
 async function removeExtraField(id) {
  try{await deleteLegacyField(id);setLegacyFields(rows=>rows.filter(r=>r.id!==id))}catch(e){setError('Extra field deletion failed: '+e.message)}
 }
 async function pasteExtraFields(rows){
  for(const row of rows)await addExtraField({...row,object_id:selected.id,workshop_id:workshop.id})
 }
 function changeProcess(id,row){
  const p={...row,workshop_id:workshop.id,process_id:id}
  setProcessEntries(old=>({...old,[id]:p}))
  processQueue.current?.enqueue(p)
 }
 async function createProcessTask(process,text){
  try{const row=await createTodo({workshop_id:workshop.id,object_id:null,text:'['+process.id+'] '+text,owner:'',done:false});setTodos(old=>[...old,row])}
  catch(e){setError(e.message)}
 }
 async function refreshLegacyHints(){
  try{setLegacyHints(await loadHints(workshop.id))}catch(e){setError('Legacy hints could not be loaded: '+e.message)}
 }
 async function reviewLegacyHint(id,accepted){
  try{await reviewHint(id,accepted);setLegacyHints(rows=>rows.map(h=>h.id===id?{...h,accepted}:h))}
  catch(e){setError('Hint review could not be saved: '+e.message)}
 }
 async function addFirst(kind,values){
  const id=kind==='sizing'?values.metric_id:crypto.randomUUID()
  const row={...values,workshop_id:workshop.id,...(kind==='sizing'?{}:{id})}
  setFirstCall(prev=>({...prev,[kind]:[...(prev[kind]||[]),row]}))
  try{const stored=await addFirstCall(kind,row);setFirstCall(prev=>({...prev,[kind]:prev[kind].map(x=>(x.id||x.metric_id)===id?stored:x)}));return stored}
  catch(e){setFirstCall(prev=>({...prev,[kind]:prev[kind].filter(x=>(x.id||x.metric_id)!==id)}));setError('Could not create '+kind+': '+e.message);return null}
 }
 function editFirst(kind,row,patch){
  const id=row.id||row.metric_id
  if(kind==='sizing'&&Object.prototype.hasOwnProperty.call(patch,'value')){
   for(const [questionId,metric] of Object.entries(SIZING_LINKS))if(metric===id){
    const object=discoveryCatalog.objects.find(o=>o.questions.some(q=>q.id===questionId))
    if(object)writeEntry(object.id,'question',questionId,{...val(object.id,'question',questionId),answer:patch.value??''})
   }
  }
  const updated={...row,...patch}
  setFirstCall(prev=>({...prev,[kind]:(prev[kind]||[]).some(x=>(x.id||x.metric_id)===id)?prev[kind].map(x=>(x.id||x.metric_id)===id?updated:x):[...prev[kind],updated]}))
  firstQueue.current?.enqueue(kind,id,updated)
 }
 async function deleteFirst(kind,id){
  try{await removeFirstCall(kind,id,workshop.id);setFirstCall(prev=>({...prev,[kind]:prev[kind].filter(x=>(x.id||x.metric_id)!==id)}))}
  catch(e){setError('Could not delete '+kind+': '+e.message)}
 }
 async function moveParkToTodo(row){
  try{const todo=await createTodo({workshop_id:workshop.id,object_id:row.context_id||null,text:row.text,owner:'',done:false});setTodos(prev=>[...prev,todo]);editFirst('parking',row,{status:'moved',todo_id:todo.id})}
  catch(e){setError('Could not move parked point: '+e.message)}
 }
 function openFirst(section){setScopingTab(null);setFirstTab(section);setShowProcesses(false);setShowSummary(false);setMobileNav(false)}
 async function quickPark(){if(!parkText.trim())return;await addFirst('parking',{text:parkText.trim(),context_id:firstTab||showProcesses?null:selected?.id,status:'parked'});setParkText('');setParkOpen(false)}
 useEffect(()=>{
  if(mode!=='workshop')return
  const key=e=>{const target=e.target;if(target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName)))return;if(e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();setParkOpen(true)}}
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[mode])
 async function createGap(values){
  try{const g=await addGap(workshop.id,values);setGaps(rows=>[...rows,g]);return g}catch(e){setError('Gap could not be created: '+e.message);return null}
 }
 async function changeGap(row,changes){
  setGaps(rows=>rows.map(g=>g.id===row.id?{...g,...changes}:g))
  try{const saved=await editGap(row.id,changes);setGaps(rows=>rows.map(g=>g.id===row.id?saved:g))}
  catch(e){setError('Gap update failed: '+e.message)}
 }
 async function removeGap(id){
  try{await deleteGap(id);setGaps(rows=>rows.filter(g=>g.id!==id))}catch(e){setError(e.message)}
 }
 async function ignoreGapCandidate(c){
  try{await ignoreCandidate({workshop_id:workshop.id,origin:c.origin,origin_ref:c.origin_ref});setIgnoredGaps(rows=>[...rows,{workshop_id:workshop.id,origin:c.origin,origin_ref:c.origin_ref}])}catch(e){setError(e.message)}
 }
 async function unignoreGapCandidate(c){
  try{await unignoreCandidate(workshop.id,c.origin,c.origin_ref);setIgnoredGaps(rows=>rows.filter(x=>x.origin!==c.origin||x.origin_ref!==c.origin_ref))}catch(e){setError(e.message)}
 }
 function openScoping(tab){setScopingTab(tab);setFirstTab(null);setShowProcesses(false);setShowSummary(false);setMobileNav(false)}
 async function newInventory(kind,values){
  try{const row=await addInventory(kind,{...values,workshop_id:workshop.id});setInventories(v=>({...v,[kind]:[...v[kind],row]}));return row}
  catch(e){setError('Could not create '+kind+': '+e.message);return null}
 }
 async function changeInventory(kind,row,patch){
  setInventories(v=>({...v,[kind]:v[kind].map(x=>x.id===row.id?{...x,...patch}:x)}))
  try{const saved=await editInventory(kind,row.id,patch,workshop.id);setInventories(v=>({...v,[kind]:v[kind].map(x=>x.id===row.id?saved:x)}))}
  catch(e){setError('Could not update '+kind+': '+e.message)}
 }
 async function removeInventory(kind,id){
  try{await deleteInventory(kind,id,workshop.id);setInventories(v=>({...v,[kind]:v[kind].filter(x=>x.id!==id)}))}
  catch(e){setError('Could not delete '+kind+': '+e.message)}
 }
 function inventoryToGap(kind,row){
  createGap({title:row.name,origin:kind==='interfaces'?'interface':'form_report',origin_ref:row.id,related_id:row.related_id,
    description:kind==='interfaces'?row.data_text||row.partner_system||'':row.today_in||'',gap_type:'development',ricefw:kind==='interfaces'?'interface':row.kind==='form'?'form':'report'})
 }
 async function mergeGapGroup(group){
  const groupRows=group.gap_ids.map(id=>gaps.find(g=>g.id===id)).filter(Boolean)
  if(groupRows.length<2)return
  if(!window.confirm('Merge '+groupRows.length+' gaps into G-'+String(groupRows[0].seq).padStart(3,'0')+'? Other gaps are marked Rejected with a reference to the kept gap, not deleted.'))return
  const target=groupRows[0]
  for(const other of groupRows.slice(1)){
   await changeGap(other,{status:'rejected',note:(other.note||'')+'\\nGrouped with G-'+String(target.seq).padStart(3,'0')})
  }
  await changeGap(target,{note:(target.note||'')+'\\nPossible duplicates reviewed: '+groupRows.slice(1).map(x=>'G-'+String(x.seq).padStart(3,'0')).join(', ')})
 }
 async function nextSession(){
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(nextDate)){setError('Choose a valid next-session meeting date.');return}
  setLoading(true);setError('')
  try{
   const id=await createNextSession(workshop.id,nextDate)
   const {data,error}=await supabase.from('discovery_workshops').select('*').eq('id',id).single()
   if(error)throw error
   await refresh();await openWorkshop(data);setNextOpen(false)
  }catch(e){setError('Next session could not be created: '+e.message)}finally{setLoading(false)}
 }
 async function createPersonalTemplate(values){
  const created=await saveTemplate({...values,owner_id:userId});setTemplates(v=>[created,...v])
 }
 async function renamePersonalTemplate(id,values){try{const saved=await editTemplate(id,values);setTemplates(v=>v.map(x=>x.id===id?saved:x))}catch(e){setError(e.message)}}
 async function removePersonalTemplate(id){try{await deleteTemplate(id);setTemplates(v=>v.filter(x=>x.id!==id))}catch(e){setError(e.message)}}
 async function acceptTemplateBatch(items){
  const stage=val('workshop','note','template_suggestions')
  if(!stage?.items?.length)return
  const accepted=new Set(stage.accepted||[])
  for(const item of items.filter(x=>!accepted.has(x.key))){
   const x=item.data
   if(item.kind==='entry')writeEntry(x.object_id,x.item_type,x.item_id,x.value)
   if(item.kind==='process')changeProcess(x.process_id,{workshop_id:workshop.id,process_id:x.process_id,status:x.status,frequency:x.frequency,custom:x.custom,answers:{}})
   if(item.kind==='request')await addFirst('requests',{...x,status:'open'})
   if(item.kind==='gap')await createGap({title:x.title,description:x.description,gap_type:x.gap_type,ricefw:x.ricefw,related_id:x.related_id,solution_idea:x.solution_idea,origin:'manual'})
   if(item.kind==='raid')await newInventory('raid',{kind:x.kind,text:x.text,related_id:x.related_id,mitigation:x.mitigation,status:'open'})
   accepted.add(item.key)
  }
  writeEntry('workshop','note','template_suggestions',{...stage,accepted:[...accepted]})
 }
 async function refreshTranscriptData(){
  if(!workshop)return
  try{const [ts,ss]=await Promise.all([loadTranscripts(workshop.id),loadTranscriptSuggestions(workshop.id)]);setTranscripts(ts);setTranscriptSuggestions(ss)}
  catch(e){setError('Transcript refresh failed: '+e.message)}
 }
 function existingTranscriptValue(s){
  const p=s.payload||{},id=s.target_ref
  if(s.kind==='field_mark'){
   const o=discoveryCatalog.objects.find(o=>o.fields.some(f=>f.id===id))
   const existing=o&&val(o.id,'field',id).mark
   return existing?{object_id:o.id,field_id:id,mark:existing}:undefined
  }
  if(s.kind==='answer'){
   const o=discoveryCatalog.objects.find(o=>o.questions.some(q=>q.id===id))
   const existing=o&&val(o.id,'question',id).answer
   return existing!==undefined?{object_id:o.id,question_id:id,answer:existing}:undefined
  }
  if(s.kind==='decision'){
   const o=discoveryCatalog.objects.find(o=>o.decisions.some(d=>d.id===id))
   const value=o&&val(o.id,'decision',id)
   return value?.choice?{object_id:o.id,decision_id:id,choice:value.choice,status:value.status}:undefined
  }
  if(s.kind==='process'){
   const row=processEntries[id]
   return row?.status?{process_id:id,status:row.status,frequency:row.frequency}:undefined
  }
  return undefined
 }
 async function acceptTranscriptSuggestion(s){
  const p=s.payload||{},id=s.target_ref
  const evidence=['[Transcript finding'+(s.ts?' · '+s.ts:'')+']',s.quote?'Source: '+s.quote:'', 'Transcript interpretation: '+JSON.stringify(p)].filter(Boolean).join('\n')
  const append=(old)=>old&&old.includes(evidence)?old:[old,evidence].filter(Boolean).join('\n\n')
  if(s.kind==='field_mark'){
   const o=discoveryCatalog.objects.find(o=>o.fields.some(f=>f.id===id))
   if(!o||!['needed','not_needed','clarify'].includes(p.mark))throw Error('Invalid SAP field suggestion')
   const current=val(o.id,'field',id)
   writeEntry(o.id,'field',id,{...current,mark:current.mark||p.mark,note:append(current.note)})
   return
  }
  if(s.kind==='answer'){
   const o=discoveryCatalog.objects.find(o=>o.questions.some(q=>q.id===id))
   if(!o||p.answer===undefined)throw Error('Invalid question suggestion')
   const current=val(o.id,'question',id)
   const hasExisting=Array.isArray(current.answer)?current.answer.length>0:current.answer!==undefined&&current.answer!==null&&String(current.answer).trim()!==''
   writeEntry(o.id,'question',id,{...current,answer:hasExisting?current.answer:p.answer,note:append(current.note)})
   return
  }
  if(s.kind==='decision'){
   const o=discoveryCatalog.objects.find(o=>o.decisions.some(d=>d.id===id))
   if(!o||!p.choice)throw Error('Invalid decision suggestion')
   const current=val(o.id,'decision',id)
   writeEntry(o.id,'decision',id,{...current,choice:current.choice||p.choice,status:current.status||'open',rationale:append(current.rationale)})
   return
  }
  if(s.kind==='process'){
   if(!processCatalog.processes.some(x=>x.id===id))throw Error('Invalid process suggestion')
   const current=processEntries[id]||{}
   changeProcess(id,{...current,status:current.status||p.status||'clarify',frequency:current.frequency||p.frequency||null,answers:{...(current.answers||{}),transcript_evidence:append(current.answers?.transcript_evidence)}})
   return
  }
  if(s.kind==='stakeholder'){
   if(!p.name?.trim())throw Error('Missing stakeholder name')
   if(!await addFirst('stakeholders',{name:p.name.trim(),organisation:['client','consultant','partner','vendor'].includes(p.organisation)?p.organisation:'client',function_role:p.function_role||'',project_role:'other',present:false}))throw Error('Stakeholder save failed');return
  }
  if(s.kind==='driver'){
   if(!p.text?.trim()||!['pain','goal'].includes(p.kind))throw Error('Invalid pain point or goal')
   if(!await addFirst('drivers',{kind:p.kind,text:p.text.trim(),priority:['must','should','could'].includes(p.priority)?p.priority:'should'}))throw Error('Driver save failed');return
  }
  if(s.kind==='sizing'){
   if(!p.metric_id||p.value===undefined||!Number.isFinite(Number(p.value)))throw Error('Invalid sizing suggestion')
   editFirst('sizing',{metric_id:p.metric_id},{metric_id:p.metric_id,value:Number(p.value),approx:!!p.approx,source:'client'});return
  }
  if(s.kind==='request'){
   if(!p.item?.trim())throw Error('Missing request text')
   if(!await addFirst('requests',{item:p.item.trim(),related_id:p.related_id||null,status:'open'}))throw Error('Request save failed');return
  }
  if(s.kind==='todo'){
   if(!p.text?.trim())throw Error('Missing action-item text')
   const task=await createTodo({workshop_id:workshop.id,object_id:p.object_id||null,text:p.text.trim(),owner:p.owner||'',done:false});setTodos(v=>[...v,task]);return
  }
  if(s.kind==='risk'){
   if(!p.text?.trim())throw Error('Missing risk text')
   if(!await newInventory('raid',{kind:'risk',text:p.text.trim(),related_id:p.related_id||null,probability:['low','medium','high'].includes(p.probability)?p.probability:null,impact:['low','medium','high'].includes(p.impact)?p.impact:null,status:'open'}))throw Error('Risk save failed');return
  }
  if(s.kind==='gap'){
   if(!p.title?.trim())throw Error('Missing gap title')
   if(!await createGap({title:p.title.trim(),description:p.description||'',related_id:p.related_id||null,origin:'ai',gap_type:null,status:'open'}))throw Error('Gap save failed');return
  }
  throw Error('Unsupported transcript proposal kind')
 }
 async function addTodo() {
  if(!newTodo.trim())return
  try {const task=await createTodo({workshop_id:workshop.id,object_id:selected.id,text:newTodo.trim(),owner:'',done:false});setTodos(x=>[...x,task]);setNewTodo('')}catch(e){setError(e.message)}
 }
 async function editTodo(id,values){setTodos(x=>x.map(t=>t.id===id?{...t,...values}:t));try{await updateTodo(id,values)}catch(e){setError(e.message)}}
 async function deleteTodo(id){try{await removeTodo(id);setTodos(x=>x.filter(t=>t.id!==id))}catch(e){setError(e.message)}}
 async function deleteWorkshop(w){
  if(!window.confirm('Permanently delete this workshop, its notes, AI hints and uploaded manuals?'))return
  try {
   // Storage objects do not cascade with database rows. Remove private uploads first.
   const folder=userId+'/'+w.id
   for(const bucket of ['discovery-legacy','discovery-transcripts']){
    const paths=[];let offset=0
    for(;;){
     const {data,error}=await supabase.storage.from(bucket).list(folder,{limit:100,offset})
     if(error)throw error
     paths.push(...(data||[]).filter(x=>x.id&&x.name).map(x=>folder+'/'+x.name))
     if(!data||data.length<100)break
     offset+=data.length
    }
    for(let i=0;i<paths.length;i+=100){
     const {error}=await supabase.storage.from(bucket).remove(paths.slice(i,i+100))
     if(error)throw error
    }
   }
   await removeWorkshop(w.id)
   await refresh()
  }catch(e){setError('Workshop deletion could not complete: '+e.message)}
 }
 function selectObject(id){setScopingTab(null);setFirstTab(null);setSelectedId(id);setShowProcesses(false);setShowSummary(false);setShowOptional(false);setMobileNav(false);setCustomLabel('');setCustomQuestion('');setFollowups([]);setAiAnswer('')}
 function addCustom(type,label) {
  if(!label.trim()||!selected)return
  const id=crypto.randomUUID()
  writeEntry(selected.id,type,id,type==='custom_field'?{label:label.trim(),mark:''}:{text:label.trim(),answer:''})
  if(type==='custom_field')setCustomLabel('');else setCustomQuestion('')
 }
 function quickCapture(){
  if(!quickText.trim()||!selected)return
  if(quickText.toLowerCase().startsWith('todo:')){setNewTodo(quickText.slice(5).trim());setQuickOpen(false);setQuickText('');return}
  const old=val(selected.id,'note','main').text||''
  writeNote(selected.id,'note','main',old+(old?'\\n':'')+quickText.trim())
  setQuickText('');setQuickOpen(false)
 }
 useEffect(()=>{
  if(mode!=='workshop'||presenter||showSummary)return
  const onKey=e=>{
   const el=e.target;const typing=el instanceof HTMLElement&&(el.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el.tagName))
   if((e.key==='/'&&!typing)||(e.key.toLowerCase()==='k'&&e.ctrlKey)){e.preventDefault();setQuickOpen(true);return}
   if(typing||e.ctrlKey||e.metaKey||e.altKey)return
   if(e.key==='j'){e.preventDefault();if(selectedIndex<objects.length-1)selectObject(objects[selectedIndex+1].id)}
   if(e.key==='k'){e.preventDefault();if(selectedIndex>0)selectObject(objects[selectedIndex-1].id)}
   if(e.key==='p'){e.preventDefault();setPresenter(v=>!v)}
  };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)
 },[mode,presenter,showSummary,objects,selectedIndex])
 async function askAI(action,extra={}) {
  if(!workshop||aiBusy)return
  setAiBusy(action);setError('')
  try {
   const labels=Object.fromEntries(discoveryCatalog.objects.flatMap(o=>[
    [o.id,{title:o.title,area:o.area,tcodes:o.tcodes}],
    ...o.fields.map(x=>[x.id,x.label]),...o.questions.map(x=>[x.id,x.text]),...o.decisions.map(x=>[x.id,x.text])
   ]))
   const res=await fetch('/api/discovery-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
    body:JSON.stringify({workshopId:workshop.id,action,payload:{audience:minutesAudience,language:workshop.client_language||'en',objectId:selected?.id,objectTitle:selected?.title,tcodes:selected?.tcodes,question:aiQuestion,catalogLookup:labels,processLookup:Object.fromEntries(processCatalog.processes.map(p=>[p.id,p.title])),...extra}})})
   const data=await res.json();if(!res.ok)throw new Error(data.error||'AI request failed')
   if(action==='minutes'){setMinutes(data.content_md||'');setMinutesAudience(extra.audience||minutesAudience)}
   if(action==='followups')setFollowups(data.questions||[])
   if(action==='ask')setAiAnswer(data.reply||'')
  }catch(e){setError(e.message)}finally{setAiBusy('')}
 }
 async function translateMinutes(){
  if(!minutes.trim())return
  setAiBusy('translate');setError('')
  try{
   const response=await fetch('/api/discovery-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'translate_de',workshopId:workshop.id,payload:{format:'minutes',text:minutes}})})
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Translation failed')
   setMinutes(data.text||minutes)
  }catch(e){setError(e.message)}finally{setAiBusy('')}
 }
 async function storeMinutes(){
  if(!minutes.trim())return
  try{await saveMinutes({workshop_id:workshop.id,content_md:minutes,audience:minutesAudience,model:'claude-sonnet-5-5'});setError('');alert('Minutes saved.')}catch(e){setError(e.message)}
 }
 function goBack(){firstQueue.current?.flush();firstQueue.current?.close();firstQueue.current=null;queue.current?.flush();queue.current?.close();queue.current=null;processQueue.current?.flush();processQueue.current?.close();processQueue.current=null;setWorkshop(null);setMode('list');setShowSummary(false);refresh()}
 const covered={objects:scoped.length,fields:scoped.reduce((n,o)=>n+o.fields.length,0),questions:scoped.reduce((n,o)=>n+o.questions.length,0),decisions:scoped.reduce((n,o)=>n+o.decisions.length,0)}
 return <main className={`dw ${presenter?'dw-presenter':''}`}>
  <header className="dw-header"><div className="dw-brand"><button className="dw-back" onClick={mode==='workshop'?goBack:()=>window.location.assign('/implementation')} aria-label="Go back">←</button><WaniLogo size={27} dark={true}/><WaniWordmark height={14} dark={true}/><span className="dw-slash">/</span><span className="dw-brand-subtitle">Discovery Workshop</span></div>
   {mode==='workshop'&&<div className="dw-actions"><span className="dw-save" aria-live="polite">{pending+processPending+firstPending?(pending+processPending+firstPending)+' pending sync':savingMeta?'Saving…':'Saved'}</span><button className="dw-button" onClick={()=>setPresenter(x=>!x)}>{presenter?'Work mode':'Presenter mode'}</button><button className="dw-button" onClick={()=>setTemplateOpen(true)}>Save as template</button><button className="dw-button" onClick={()=>{setNextOpen(x=>!x);setNextDate(workshop.call_date)}}>Next session</button><button className="dw-button" onClick={()=>setEmailOpen(true)}>Draft follow-up email</button><button className="dw-button" onClick={()=>setParkOpen(x=>!x)}>Parking ({firstCall.parking.filter(x=>x.status==='parked').length})</button><button className="dw-button dw-mobile-nav" onClick={()=>setMobileNav(x=>!x)}>Objects</button></div>}
  </header>
  <div className="dw-container">
  {templateOpen&&workshop&&<SaveTemplate workshop={workshop} session={session} source={{entries,processEntries,requests:firstCall.requests,gaps,raid:inventories.raid}} onSave={createPersonalTemplate} onClose={()=>setTemplateOpen(false)}/>}
  {nextOpen&&workshop&&<div className="dw-quick dw-inline"><label>Next meeting date <input type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}/></label><button className="dw-button dw-primary" disabled={loading} onClick={nextSession}>Create next session</button><button className="dw-button" onClick={()=>setNextOpen(false)}>Cancel</button></div>}
  {emailOpen&&workshop&&<FollowupEmail workshop={workshop} session={session} stakeholders={firstCall.stakeholders} onClose={()=>setEmailOpen(false)}/>}
  {error&&<div role="alert" className="dw-alert">{error}<button className="dw-close" onClick={()=>setError('')}>×</button></div>}
  {mode==='list'&&<><div className="dw-list-heading"><div><div className="dw-kicker">SAP PM · Discovery</div><h1>Customer workshops</h1><p>Client-confidential data. Only your signed-in account can access your workshop records.</p></div><div className="dw-actions"><button className="dw-button" onClick={()=>setMode('templates')}>My templates ({templates.length})</button><button className="dw-button dw-primary" onClick={()=>{setForm(emptyForm());setMode('create')}}>+ New workshop</button></div></div>
   {loading&&<p>Loading workshops…</p>}{!loading&&!workshops.length&&<div className="dw-card"><h2>No workshops yet</h2><p>Create a workshop to begin capturing SAP PM requirements.</p></div>}
   <div className="dw-workshop-list">{workshops.map(w=><article className="dw-list-card" key={w.id}><div><div className="dw-kicker">{w.call_date} · {w.status}</div><h2>{w.client_name}</h2><p>{w.title} · {w.project_name||'SAP PM'}</p></div><div className="dw-actions"><button className="dw-button dw-primary" onClick={()=>openWorkshop(w)}>Open</button><button className="dw-button" onClick={()=>deleteWorkshop(w)}>Delete</button></div></article>)}</div></>}
  {mode==='templates'&&<><button className="dw-inline-button" onClick={()=>setMode('list')}>← All workshops</button><TemplateLibrary templates={templates} onRename={renamePersonalTemplate} onDelete={removePersonalTemplate} onUse={template=>{setSelectedTemplate(template);setForm(emptyForm());setMode('create')}}/></>}
  {mode==='create'&&<div className="dw-card dw-form-card"><button className="dw-inline-button" onClick={()=>setMode('list')}>← All workshops</button><h1>New discovery workshop</h1>{selectedTemplate&&<p className="dw-caption">Starting from template: {selectedTemplate.name}. All content remains suggestions until accepted.</p>}<form onSubmit={create}><div className="dw-form-grid">
   {[['client_name','Customer / company *','text'],['call_date','Meeting date *','date'],['title','Workshop title','text'],['project_name','Project','text'],['consultant_name','Consultant','text'],['participants','Participants','text'],['legacy_system','Legacy system','text'],['start_time','Start time','time'],['end_time','End time','time']].map(([key,label,type])=><label key={key}>{label}<input required={key==='client_name'||key==='call_date'} type={type} value={form[key]} onChange={e=>setForm(x=>({...x,[key]:e.target.value}))}/></label>)}
   </div><fieldset className="dw-scope-fields"><legend>SAP process areas in scope</legend>{discoveryCatalog.areas.map(a=><label key={a.id}><input type="checkbox" checked={form.scope_areas.includes(a.id)} onChange={e=>setForm(x=>({...x,scope_areas:e.target.checked?[...x.scope_areas,a.id]:x.scope_areas.filter(k=>k!==a.id)}))}/>{a.title}</label>)}</fieldset>
   <p className="dw-caption">Customer information and workshop notes are confidential and are not included in Wani's shared knowledge base.</p><button type="submit" disabled={loading||!form.scope_areas.length} className="dw-button dw-primary">Create workshop</button></form></div>}
  {mode==='workshop'&&workshop&&<>
   {parkOpen&&<div className="dw-quick dw-inline"><input autoFocus placeholder="Park this topic…" value={parkText} onChange={e=>setParkText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')quickPark();if(e.key==='Escape')setParkOpen(false)}}/><button className="dw-button" onClick={quickPark}>Save</button><button className="dw-button" onClick={()=>setParkOpen(false)}>Cancel</button></div>}
   <section className="dw-intro dw-intro-compact"><div className="dw-kicker">SAP PM · {discoveryCatalog.version}</div><div className="dw-list-heading"><div><h1>{workshop.client_name}</h1><p>{workshop.title} · {workshop.project_name||'Discovery workshop'}</p></div><div className="dw-actions"><button className="dw-button" onClick={()=>{setShowSummary(s=>!s);setCarryoverOpen(false);setShowProcesses(false);setFirstTab(null);setScopingTab(null)}}>{showSummary?'Back to objects':'Summary & exports'}</button></div></div>
    <div className="dw-stats dw-overview-stats"><span>Fields marked: {counts.fields}/{covered.fields}</span><span>Questions answered: {counts.questions}/{covered.questions}</span><span>Decisions made: {counts.decisions}/{covered.decisions}</span><span>Need clarification: {counts.clarify}</span><span>Open tasks: {todos.filter(t=>!t.done).length}</span></div>
    <details className="dw-workshop-setup" key={workshop.id}>
      <summary><span className="dw-setup-title">Workshop details & sources</span><span className="dw-setup-caption">{sourceSystems.length} source{sourceSystems.length===1?'':'s'} · {workshop.consultant_name||'Consultant not set'} · {val('workshop','workshop_note','main').text?.trim()?'Notes saved':'Notes available'}</span></summary>
      <div className="dw-setup-body">
      {workshop.engagement_id&&<div className="dw-stats"><span>Engagement · Session {workshop.session_no||1}</span>{workshop.previous_workshop_id&&<button className="dw-button" onClick={()=>{setCarryoverOpen(v=>!v);setShowSummary(false)}}>{carryoverOpen?'Hide carry-over':'Open from last session'}</button>}</div>}
    <div className="dw-metadata">{[['Customer',workshop.client_name],['Meeting date',workshop.call_date],['Consultant',workshop.consultant_name||'—'],['Catalog coverage',`${covered.objects} objects · ${covered.fields} fields · ${covered.questions} questions · ${covered.decisions} decisions`]].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
    {workshop.client_language==='de'&&(!germanCatalogStatus.objects||!germanCatalogStatus.processes)&&<p className="dw-caption" role="status">German catalog text is awaiting terminology review; unapproved sections display English until reviewed German overlays are installed.</p>}
    {!presenter&&<label className="dw-mini-field">Client language<select value={workshop.client_language||'en'} onChange={e=>changeWorkshop('client_language',e.target.value)}><option value="en">English</option><option value="de">German</option></select></label>}
    {!presenter&&<details className="dw-meta-edit"><summary>Edit workshop details</summary><div className="dw-form-grid">{[['client_name','Customer'],['call_date','Meeting date'],['title','Title'],['project_name','Project'],['consultant_name','Consultant'],['participants','Participants'],['legacy_system','Legacy system'],['start_time','Start time'],['end_time','End time']].map(([k,l])=><label key={k}>{l}<input type={k==='call_date'?'date':k.endsWith('_time')?'time':'text'} defaultValue={workshop[k]||''} onBlur={e=>{if(e.target.value!==(workshop[k]||''))changeWorkshop(k,e.target.value||((k.endsWith('_time'))?null:''))}}/></label>)}</div></details>}
    {!presenter&&<SourceSystemList workshop={workshop} systems={sourceSystems} onAdd={createSource} onUpdate={editSource} onDelete={removeSource}/>}
    {!presenter&&<LegacyImportPanel workshop={workshop} session={session} onImported={refreshLegacyHints}/>}
    <NoteInput label="General workshop notes" value={val('workshop','workshop_note','main').text} onChange={v=>writeNote('workshop','workshop_note','main',v)} internal={entry('workshop','workshop_note','main')?.is_internal} onInternal={v=>writeNote('workshop','workshop_note','main',val('workshop','workshop_note','main').text||'',v)}/>
   
      </div>
     </details>
   {quickOpen&&!presenter&&<div className="dw-inline dw-quick"><input autoFocus className="dw-input" value={quickText} onChange={e=>setQuickText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){quickCapture()}if(e.key==='Escape')setQuickOpen(false)}} placeholder="Quick capture note; todo: for an action item"/><button className="dw-button" onClick={quickCapture}>Save note</button><button className="dw-button" onClick={()=>setQuickOpen(false)}>Cancel</button></div>}
    </section>
   {val('workshop','note','template_suggestions').items?.length>0&&<TemplateSuggestions template={val('workshop','note','template_suggestions').template_name} items={val('workshop','note','template_suggestions').items} accepted={val('workshop','note','template_suggestions').accepted||[]} onAccept={item=>acceptTemplateBatch([item])} onAcceptAll={acceptTemplateBatch} onDismiss={()=>writeEntry('workshop','note','template_suggestions',{items:[],accepted:[]})}/>}
   {carryoverOpen?<CarryoverReview workshop={workshop} entries={entries} previousEntries={previousEntries} todos={todos} requests={firstCall.requests} parking={firstCall.parking} onJump={id=>{selectObject(id);setCarryoverOpen(false)}} onTodo={t=>editTodo(t.id,{done:true})} onRequest={r=>editFirst('requests',r,{status:'received'})} onParking={p=>editFirst('parking',p,{status:'dropped'})}/>:showSummary?<div className="dw-card"><h2>Workshop summary</h2><EngagementTimeline workshops={engagementSessions} current={workshop}/><p className="dw-caption">All catalog items, including unanswered items, are part of the export dataset. Documents are only generated on request.</p><p>{counts.fields} fields marked · {counts.questions} questions answered · {counts.decisions} decisions made · {todos.filter(t=>!t.done).length} open to-dos</p><label>Export audience <select value={audience} onChange={e=>setAudience(e.target.value)}><option value="client">Client — hide internal notes</option><option value="internal">Internal — include all notes</option></select></label><div className="dw-ai-box"><h3>AI meeting minutes (optional)</h3><p className="dw-caption">Generated only when requested. Review and edit before sharing. Internal notes stay out of client minutes.</p><div className="dw-inline"><label>Minutes audience <select value={minutesAudience} onChange={e=>setMinutesAudience(e.target.value)}><option value="client">Client</option><option value="internal">Internal</option></select></label><button className="dw-button" disabled={!!aiBusy||!!pending||!!processPending} onClick={()=>askAI('minutes',{audience:minutesAudience})}>{aiBusy==='minutes'?'Generating…':'Generate minutes'}</button></div>
 {minutes&&<><textarea rows="14" aria-label="Editable meeting minutes" value={minutes} onChange={e=>setMinutes(e.target.value)}/><button className="dw-button" disabled={!!aiBusy} onClick={translateMinutes}>Translate minutes to German</button><button className="dw-button" onClick={storeMinutes}>Save reviewed minutes</button></>}</div>
 <div className="dw-export-actions"><button className="dw-button" onClick={()=>exportScopePack(workshop,entries,todos,audience,{sourceSystems,objectSources,legacyFields,processEntries,legacyHints,firstCall,gaps,inventories})}>Scope pack (.md)</button><button className="dw-button dw-primary" onClick={()=>exportXLSX(workshop,entries,todos,audience,{sourceSystems,objectSources,legacyFields,processEntries,legacyHints,firstCall,gaps,inventories})}>Download Excel (.xlsx)</button><button className="dw-button" onClick={()=>printReport(workshop,entries,todos,audience,{sourceSystems,objectSources,legacyFields,processEntries,legacyHints,firstCall,gaps,inventories})}>Print / Save PDF</button><button className="dw-button" onClick={()=>exportCSV(workshop,entries,todos,audience,{sourceSystems,objectSources,legacyFields,processEntries,legacyHints,firstCall,gaps,inventories})}>CSV ZIP</button><button className="dw-button" onClick={()=>exportMarkdown(workshop,entries,todos,audience,{sourceSystems,objectSources,legacyFields,processEntries,legacyHints,firstCall,gaps,inventories})}>Markdown</button><button className="dw-button" onClick={()=>exportJSON(workshop,entries,todos,audience,{sourceSystems,objectSources,legacyFields,processEntries,legacyHints,firstCall,gaps,inventories})}>JSON</button></div>
 <div className="dw-summary-extra">
 <h3>Interfaces / Forms / RAID</h3><p>{inventories.interfaces.length} interfaces · {inventories.forms_reports.length} forms/reports · {inventories.raid.length} risks/assumptions/dependencies</p><h3>Fit-gap</h3><p>{gaps.length} gaps · {gaps.filter(g=>g.status==='open').length} open · {gaps.reduce((a,g)=>a+({S:1,M:3,L:8,XL:13}[g.size]||0),0)} estimated points</p><h3>Workshop essentials</h3><p>{firstCall.stakeholders.length} stakeholders · {firstCall.drivers.length} pain points/goals · {firstCall.sizing.length} sizing values · {firstCall.requests.filter(x=>x.status==='open').length} open requests · {firstCall.parking.filter(x=>x.status==='parked').length} parked topics</p><h3>Legacy manual mapping hints</h3><p>{legacyHints.length} suggestions · {legacyHints.filter(x=>x.accepted===true).length} accepted · {legacyHints.filter(x=>x.accepted==null).length} awaiting review</p><h3>Source systems</h3><p>{sourceSystems.length} sources registered</p>
 {sourceSystems.map(x=><p key={x.id}><strong>{x.name}</strong> · {x.system_type} · {x.version||'Version not specified'} · {x.owner||'Owner not assigned'}</p>)}
 <h3>Extra fields from source</h3><p>{legacyFields.length} extra source fields · {legacyFields.filter(x=>!x.sap_handling||x.sap_handling==='clarify').length} still open</p>
 {legacyFields.map(f=><p key={f.id}><strong>{discoveryCatalog.objects.find(o=>o.id===f.object_id)?.title||f.object_id}: {f.source_field}</strong> · {f.sap_handling||'Not mapped'} · {f.sap_target||'Target open'}</p>)}
 <h3>Processes & jobs</h3><p>{processCatalog.processes.length} catalog processes in {processCatalog.categories.length} categories, plus {Object.values(processEntries).filter(x=>x.custom).length} custom</p>
 <div className="dw-stats">{processCatalog.statuses.map(status=><span key={status}>{status}: {Object.values(processEntries).filter(x=>x.status===status).length}</span>)}<span>Unanswered: {processCatalog.processes.filter(p=>!processEntries[p.id]?.status).length}</span></div>
 {processCatalog.processes.filter(p=>['valid','clarify','later'].includes(processEntries[p.id]?.status)).map(p=><p key={p.id}><strong>{p.title}</strong> · {processEntries[p.id]?.status} · {processEntries[p.id]?.frequency||'Frequency open'}</p>)}
 </div>
 <div className="dw-stats"><strong>Completeness check</strong><span>{covered.fields-counts.fields} unmarked fields</span><span>{covered.questions-counts.questions} unanswered questions</span><span>{covered.decisions-counts.decisions} undecided decisions</span><span>{counts.clarify} clarifications</span></div>
 <div className="dw-inline"><label>Show <select value={summaryFilter} onChange={e=>setSummaryFilter(e.target.value)}><option value="all">All objects</option><option value="open">With unresolved points</option><option value="decisions">With decisions</option><option value="todos">With action items</option></select></label></div>
 {scoped.filter(o=>summaryFilter==='all'||summaryFilter==='open'&&(o.fields.some(f=>!val(o.id,'field',f.id).mark||val(o.id,'field',f.id).mark==='clarify')||o.questions.some(q=>val(o.id,'question',q.id).answer===undefined)||o.decisions.some(d=>val(o.id,'decision',d.id).status!=='decided'))||summaryFilter==='decisions'&&o.decisions.some(d=>val(o.id,'decision',d.id).status==='decided')||summaryFilter==='todos'&&todos.some(t=>t.object_id===o.id)).map(o=><div key={o.id} className="dw-summary-object"><h3>{o.title}</h3><p>Fields marked: {o.fields.filter(f=>val(o.id,'field',f.id).mark).length}/{o.fields.length} · Answers: {o.questions.filter(q=>val(o.id,'question',q.id).answer!==undefined).length}/{o.questions.length} · Decisions: {o.decisions.filter(d=>val(o.id,'decision',d.id).status==='decided').length}/{o.decisions.length}</p><button className="dw-inline-button" onClick={()=>{selectObject(o.id);setShowSummary(false)}}>Review object →</button></div>)}</div>:
   <div className={`dw-workspace ${sidebarCollapsed?'dw-sidebar-collapsed':''}`}><aside className={`dw-sidebar ${mobileNav?'dw-open':''}`}><button type="button" className="dw-sidebar-collapse" onClick={()=>setSidebarCollapsed(true)} aria-label="Collapse Discovery navigation" title="Collapse navigation">‹ <span>Hide navigation</span></button><details className="dw-nav-group dw-nav-disclosure"><summary className="dw-nav-heading">Workshop</summary><button className={`dw-nav-item ${scopingTab==='transcripts'?'dw-active':''}`} onClick={()=>openScoping('transcripts')}>Transcripts <span>{transcriptSuggestions.filter(x=>x.status==='pending'||x.status==='edited').length}</span></button>{FIRST_CALL_SECTIONS.map(([id,title])=><button key={id} className={`dw-nav-item ${firstTab===id?'dw-active':''}`} onClick={()=>openFirst(id)}>{title}<span>{(firstCall[id]||[]).length}</span></button>)}</details>{workshop.previous_workshop_id&&<label className="dw-mini-checkbox"><input type="checkbox" checked={onlyCarried} onChange={e=>setOnlyCarried(e.target.checked)}/>Carried-over items</label>}<div className="dw-sidebar-top"><strong>Workshop catalog</strong><span>{objects.length}/{scoped.length}</span></div><input className="dw-search" placeholder="Search objects or T-codes" value={search} onChange={e=>setSearch(e.target.value)}/><select className="dw-scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All areas</option>{discoveryCatalog.areas.filter(a=>scoped.some(o=>o.area===a.id)).map(a=><option value={a.id} key={a.id}>{a.title}</option>)}</select>
    {discoveryCatalog.areas.map(a=>{const children=objects.filter(o=>o.area===a.id);return children.length?<div key={a.id} className="dw-nav-group"><div className="dw-nav-heading">{getAreaTitle(a,presenter?workshop.client_language:'en')}</div><details className="dw-nav-area-notes"><summary>Area notes{val(a.id,'area_note','main').text?.trim()?' • saved':''}</summary><NoteInput label="Area notes" value={val(a.id,'area_note','main').text} onChange={v=>writeNote(a.id,'area_note','main',v)} internal={entry(a.id,'area_note','main')?.is_internal} onInternal={v=>writeNote(a.id,'area_note','main',val(a.id,'area_note','main').text||'',v)}/></details>{children.map(o=><button className={`dw-nav-item ${o.id===selected?.id?'dw-active':''}`} key={o.id} onClick={()=>selectObject(o.id)} title={germanHoverText(o.id,'object')}>{localizeObject(o,presenter?workshop.client_language:'en').title}<span>{objectSources[o.id]?.not_maintained?'None':(objectSources[o.id]?.source_system_ids||[]).map(id=>sourceSystems.find(x=>x.id===id)?.system_type||'').filter(Boolean).map(type=>type==='sap_ecc'||type==='sap_s4'?'SAP':type==='excel_access'?'Excel':type==='paper'?'Paper':type.startsWith('non_sap_')?'Non-SAP':'Other').filter((x,i,a)=>a.indexOf(x)===i).join('+')||'—'} · {labels[val(o.id,'object_status','main').status]||'Not started'}</span></button>)}</div>:null})}<div className="dw-nav-group"><div className="dw-nav-heading">Additional discovery</div><button className={`dw-nav-item ${showProcesses?'dw-active':''}`} onClick={()=>{setShowProcesses(true);setScopingTab(null);setFirstTab(null);setShowSummary(false);setMobileNav(false)}}>Processes & jobs <span>{processCatalog.processes.length}</span></button></div><div className="dw-nav-group"><div className="dw-nav-heading">Scoping</div><button className={`dw-nav-item ${scopingTab==='gaps'?'dw-active':''}`} onClick={()=>openScoping('gaps')}>Fit-gap <span>{gaps.length}</span></button>{[['interfaces','Interfaces'],['forms_reports','Forms & reports'],['raid','Risks & assumptions']].map(([id,title])=><button key={id} className={`dw-nav-item ${scopingTab===id?'dw-active':''}`} onClick={()=>openScoping(id)}>{title}<span>{inventories[id].length}</span></button>)}</div></aside>
   <div className="dw-main"><button type="button" className="dw-sidebar-reopen" onClick={()=>{if(window.matchMedia('(max-width:700px)').matches){setSidebarCollapsed(false);setMobileNav(x=>!x)}else{setSidebarCollapsed(x=>!x)}}} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed?'Show navigation':'Toggle navigation'}>{sidebarCollapsed?'☰ Show navigation':'☰ Navigation'}</button>{scopingTab==='transcripts'?<Transcripts workshop={workshop} session={session} transcripts={transcripts} suggestions={transcriptSuggestions} onRefresh={refreshTranscriptData} onAccept={acceptTranscriptSuggestion} onExisting={existingTranscriptValue} presenter={presenter}/>:['interfaces','forms_reports','raid'].includes(scopingTab)?<ScopingInventory key={scopingTab} kind={scopingTab} rows={inventories[scopingTab]} stakeholders={firstCall.stakeholders} requests={firstCall.requests} onAdd={newInventory} onEdit={changeInventory} onDelete={removeInventory} onGap={inventoryToGap} presenter={presenter}/>:scopingTab==='gaps'?<FitGap entries={entries} legacyFields={legacyFields} processEntries={processEntries} legacyHints={legacyHints} gaps={gaps} ignored={ignoredGaps} stakeholders={firstCall.stakeholders} onAdd={createGap} onEdit={changeGap} onDelete={removeGap} onIgnore={ignoreGapCandidate} onUnignore={unignoreGapCandidate} presenter={presenter} session={session} workshopId={workshop.id} onMerge={mergeGapGroup}/>:firstTab?<FirstCall key={firstTab} section={firstTab} rows={firstCall} workshopId={workshop.id} add={addFirst} edit={editFirst} remove={deleteFirst} onTodo={moveParkToTodo} objectId={selected?.id} presenter={presenter}/>:showProcesses?<ProcessJobs workshopId={workshop.id} entries={processEntries} onChange={changeProcess} presenter={presenter} language={workshop.client_language||'en'} onJump={selectObject} onTask={createProcessTask} categoryNotes={Object.fromEntries(processCatalog.categories.map(cat=>[cat.id,{text:val('process:'+cat.id,'area_note','main').text||'',internal:!!entry('process:'+cat.id,'area_note','main')?.is_internal}]))} onCategoryNote={(id,text,internal)=>writeNote('process:'+id,'area_note','main',text,internal)}/>:selected&&<div className="dw-card"><div className="dw-object-heading"><div><div className="dw-kicker">{area?.title} · {selectedIndex+1} / {objects.length}</div><h2 title={germanHoverText(selected.id,'object')}>{displaySelected.title}</h2></div><select aria-label="Object status" value={val(selected.id,'object_status','main').status||'not_started'} onChange={e=>writeEntry(selected.id,'object_status','main',{status:e.target.value})}>{statuses.map(x=><option key={x} value={x}>{labels[x]}</option>)}</select></div>
    <details className="dw-object-context"><summary>Object context, SAP transactions & related work</summary><div className="dw-object-context-body">    <button className="dw-inline-button" onClick={()=>openFirst('stakeholders')}>Owners: {firstCall.stakeholders.filter(x=>(x.responsible_for||[]).includes(selected.id)).map(x=>x.name).join(', ')||'not recorded'}</button>
    <button className="dw-inline-button" onClick={()=>openFirst('drivers')}>{firstCall.drivers.filter(x=>x.kind==='pain'&&(x.affected||[]).includes(selected.id)).length} pain points · {firstCall.drivers.filter(x=>x.kind==='goal'&&(x.affected||[]).includes(selected.id)).length} goals</button>
    <button className="dw-inline-button" onClick={()=>openFirst('requests')}>Requests: {firstCall.requests.filter(x=>x.related_id===selected.id&&x.status==='open').length} open</button>
    <button className="dw-inline-button" onClick={()=>openScoping('gaps')}>Gaps: {gaps.filter(g=>g.related_id===selected.id).length}</button><button className="dw-inline-button" onClick={()=>setShowProcesses(true)}>Related processes: {processCatalog.processes.filter(p=>p.relatedObjects?.split(',').includes(selected.id)&&processEntries[p.id]?.status==='valid').length} valid · {processCatalog.processes.filter(p=>p.relatedObjects?.split(',').includes(selected.id)&&processEntries[p.id]?.status==='clarify').length} clarify</button><div className="dw-caption">{legacyFields.filter(x=>x.object_id===selected.id).length} extra source fields · {legacyFields.filter(x=>x.object_id===selected.id&&(!x.sap_handling||x.sap_handling==='clarify')).length} open</div><div className="dw-tcodes">{selected.tcodes.map(c=><code key={c}>{c}</code>)}</div><p className="dw-description">{displaySelected.plain}</p></div></details>
    {val(selected.id,'object_status','main').status!=='out_of_scope'&&<>
    <Section title="Legacy data & source mapping" count={legacyFields.filter(x=>x.object_id===selected.id).length+' fields'} open={false} id="dw-legacy"><p className="dw-caption">Source systems, uploaded legacy fields and AI mapping hints.</p>
    <ObjectSourcePicker workshopId={workshop.id} objectId={selected.id} systems={sourceSystems} value={objectSources[selected.id]} onSave={updateObjectSources} presenter={presenter}/>
    <LegacyHintsPanel objectId={selected.id} hints={legacyHints} onReview={reviewLegacyHint} presenter={presenter}/>
    <LegacyFieldsGrid workshopId={workshop.id} object={selected} systems={sourceSystems} fields={legacyFields} onAdd={addExtraField} onEdit={editExtraField} onDelete={removeExtraField} onPaste={pasteExtraFields} presenter={presenter} session={session}/>

    </Section>

    <nav className="dw-workflow-nav" aria-label="Discovery workflow sections">
      {[
        {id:'dw-fields',title:'Fields',progress:`${selected.fields.filter(f=>!!val(selected.id,'field',f.id).mark).length}/${selected.fields.length}`},
        {id:'dw-questions',title:'Questions',progress:`${selected.questions.filter(q=>{const a=val(selected.id,'question',q.id).answer;return a!==undefined&&a!==''&&(!Array.isArray(a)||a.length)}).length}/${selected.questions.length}`},
        {id:'dw-decisions',title:'Decisions',progress:`${selected.decisions.filter(d=>val(selected.id,'decision',d.id).status==='decided').length}/${selected.decisions.length}`},
        {id:'dw-actions',title:'Notes & actions',progress:String(todos.filter(t=>t.object_id===selected.id&&!t.done).length)+' open'}
      ].map(x=><button key={x.id} type="button" onClick={()=>{const el=document.getElementById(x.id);if(el){el.open=true;el.scrollIntoView({behavior:'smooth',block:'start'})}}}>{x.title}<strong>{x.progress}</strong></button>)}
    </nav>
    {!presenter&&<Section title="Current legacy process" count="Notes" open={false}><NoteInput label="How the customer works today" value={val(selected.id,'legacy_today','main').text} onChange={v=>writeNote(selected.id,'legacy_today','main',v)}/></Section>}
    <Section id="dw-fields" title="Key fields" count={selected.fields.length} summary={`${selected.fields.filter(f=>!!val(selected.id,'field',f.id).mark).length} marked`}>
     <div className="dw-field-toolbar"><div className="dw-field-legend" aria-label="Field status colours">
      {[['needed','✓','Used'],['not_needed','×','Not used'],['clarify','?','Clarify'],['none','·','Unmarked']].map(([mark,symbol,title])=><span className="dw-field-legend-item" key={mark}><span className={`dw-status-light dw-status-light-${mark}`} aria-hidden="true">{symbol}</span>{title}</span>)}
     </div><small className="dw-field-help">Click a light to change status · pencil to add a note</small></div>
     <div className="dw-compact-list">{displaySelected.fields.filter(f=>showOptional||f.tier==='core').map(f=><CompactField key={selected.id+':'+f.id} field={f} presenter={presenter} value={val(selected.id,'field',f.id)} onChange={v=>writeEntry(selected.id,'field',f.id,v)}/>)}
     {Object.values(entries).filter(x=>x.object_id===selected.id&&x.item_type==='custom_field').map(x=><CompactField key={selected.id+':custom:'+x.item_id} field={{label:x.value?.label||'Custom field',tier:'optional'}} presenter={presenter} value={x.value||{}} onChange={v=>writeEntry(selected.id,'custom_field',x.item_id,v)}/>)}</div>
     <div className="dw-compact-footer">
      {selected.fields.some(f=>f.tier==='optional')&&<button className="dw-inline-button" onClick={()=>setShowOptional(x=>!x)}>{showOptional?'Hide optional fields':`Show optional fields (${selected.fields.filter(f=>f.tier==='optional').length})`}</button>}
      {!presenter&&<div className="dw-inline"><input className="dw-input" aria-label="New custom field" placeholder="Add another field" value={customLabel} onChange={e=>setCustomLabel(e.target.value)}/><button className="dw-button" onClick={()=>addCustom('custom_field',customLabel)}>+ Add</button></div>}
     </div>
    </Section>
    <Section id="dw-questions" title="Process questions" count={selected.questions.length} open={false} summary={`${selected.questions.filter(q=>{const a=val(selected.id,'question',q.id).answer;return a!==undefined&&a!==''&&(!Array.isArray(a)||a.length)}).length} answered`}>{selected.questions.map((q,i)=><QuestionEditor key={q.id} item={q} display={displaySelected.questions[i]} value={val(selected.id,'question',q.id)} linkedSizing={SIZING_LINKS[q.id]?firstCall.sizing.find(x=>x.metric_id===SIZING_LINKS[q.id])?.value:null} onChange={v=>{writeEntry(selected.id,'question',q.id,v);if(SIZING_LINKS[q.id])editFirst('sizing',{metric_id:SIZING_LINKS[q.id]},{metric_id:SIZING_LINKS[q.id],value:v.answer===''?null:v.answer,source:'client'})}}/>)}
 {Object.values(entries).filter(x=>x.object_id===selected.id&&x.item_type==='custom_question').map(x=><QuestionEditor key={x.item_id} item={{text:x.value?.text,type:'text'}} value={{answer:x.value?.answer||''}} onChange={v=>writeEntry(selected.id,'custom_question',x.item_id,{...x.value,answer:v.answer})}/>)}
 <div className="dw-inline"><input className="dw-input" placeholder="Add custom question" aria-label="New custom question" value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)}/><button className="dw-button" onClick={()=>addCustom('custom_question',customQuestion)}>+ Question</button></div></Section>
    <Section id="dw-decisions" title="Decisions" count={selected.decisions.length} open={false} summary={`${selected.decisions.filter(d=>val(selected.id,'decision',d.id).status==='decided').length} decided`}>{selected.decisions.map((d,i)=><DecisionEditor key={d.id} item={d} display={displaySelected.decisions[i]} stakeholders={firstCall.stakeholders} value={val(selected.id,'decision',d.id)} onChange={v=>writeEntry(selected.id,'decision',d.id,v)}/>)}</Section>
    {!presenter&&<Section title="Ask Wani & follow-ups" count="AI" open={false}><div className="dw-ai-box"><p className="dw-caption">Suggestions only. Nothing is added to your notes unless you select Save.</p><div className="dw-inline"><button className="dw-button" disabled={!!aiBusy||!!pending||!!processPending} onClick={()=>askAI('followups')}>{aiBusy==='followups'?'Thinking…':'Suggest follow-ups'}</button></div>{followups.map((q,i)=><div className="dw-item" key={i}><strong>{q.question}</strong><p className="dw-caption">{q.why}</p><button className="dw-inline-button" onClick={()=>addCustom('custom_question',q.question)}>Add as custom question</button></div>)}<textarea rows="2" placeholder="Ask about the current SAP PM object…" value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)}/><button className="dw-button" disabled={!!aiBusy||!aiQuestion.trim()} onClick={()=>askAI('ask')}>{aiBusy==='ask'?'Asking…':'Ask Wani'}</button>{aiAnswer&&<div className="dw-ai-answer"><p>{aiAnswer}</p><button className="dw-inline-button" onClick={()=>{writeNote(selected.id,'note','main',(val(selected.id,'note','main').text||'')+'\\n'+aiAnswer,true)}}>Save to internal notes</button></div>}</div></Section>}
    <Section id="dw-actions" title="Notes & action items" count={todos.filter(t=>t.object_id===selected.id).length} open={false}><NoteInput label="Object notes" value={val(selected.id,'note','main').text} onChange={v=>writeNote(selected.id,'note','main',v)} internal={entry(selected.id,'note','main')?.is_internal} onInternal={v=>writeNote(selected.id,'note','main',val(selected.id,'note','main').text||'',v)}/>
    {!presenter&&<><div className="dw-inline"><input className="dw-input" aria-label="New action item" value={newTodo} onChange={e=>setNewTodo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTodo()}}} placeholder="Add follow-up / action item…"/><button className="dw-button" onClick={addTodo}>Add</button></div>{todos.filter(t=>t.object_id===selected.id).map(t=><div key={t.id} className="dw-task"><label><input type="checkbox" checked={t.done} onChange={e=>editTodo(t.id,{done:e.target.checked})}/>{t.text}</label><input aria-label="Owner" placeholder="Owner" defaultValue={t.owner||''} onBlur={e=>editTodo(t.id,{owner:e.target.value})}/><input aria-label="Due date" type="date" defaultValue={t.due_date||''} onChange={e=>editTodo(t.id,{due_date:e.target.value||null})}/><button className="dw-button" onClick={()=>deleteTodo(t.id)}>Remove</button></div>)}</>}</Section>
    </>}
    <div className="dw-pagination"><button className="dw-button" disabled={selectedIndex<=0} onClick={()=>selectObject(objects[selectedIndex-1].id)}>← Previous</button><span>{selectedIndex+1}/{objects.length}</span><button className="dw-button dw-primary" disabled={selectedIndex>=objects.length-1} onClick={()=>selectObject(objects[selectedIndex+1].id)}>Next →</button></div>
    </div>}</div></div>}
   </>}
  </div>
 </main>
}
