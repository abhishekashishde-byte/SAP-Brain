import { supabase } from '../../supabaseClient'
const TABLES={stakeholders:'discovery_stakeholders',drivers:'discovery_drivers',sizing:'discovery_sizing',requests:'discovery_requests',parking:'discovery_parking'}
function required(result){if(result.error)throw result.error;return result.data}
export const FIRST_CALL_TABLES=TABLES
export async function loadFirstCall(workshopId){
 const pairs=await Promise.all(Object.entries(TABLES).map(async([key,table])=>[key,required(await supabase.from(table).select('*').eq('workshop_id',workshopId).limit(2000))]))
 return Object.fromEntries(pairs)
}
export async function addFirstCall(kind,values) {
 return required(await supabase.from(TABLES[kind]).insert(values).select('*').single())
}
export async function editFirstCall(kind,id,values,workshopId) {
 const field=kind==='sizing'?'metric_id':'id'
 if(kind==='sizing')return required(await supabase.from(TABLES[kind]).upsert({...values,workshop_id:workshopId,metric_id:id,updated_at:new Date().toISOString()},{onConflict:'workshop_id,metric_id'}).select('*').single())
 return required(await supabase.from(TABLES[kind]).update(kind==='parking'?values:{...values,updated_at:new Date().toISOString()}).eq(field,id).eq('workshop_id',workshopId).select('*').single())
}
export async function removeFirstCall(kind,id,workshopId){
 return required(await supabase.from(TABLES[kind]).delete().eq(kind==='sizing'?'metric_id':'id',id).eq('workshop_id',workshopId))
}
// These are strictly pre-written SAP consultant request templates, not AI suggestions.
export const REQUEST_TEMPLATES={
 eq:['Asset list export','Asset statuses used','Additional Info field list'],
 mplan:['PM schedule list with next due dates'],
 cat:['Failure code list'],
 order:['Sample work order prints'],
 kpi:['Management reports / Excel KPIs']
}
export const SIZING_METRICS=[
 ['sites','Sites / plants in scope','count'],['locations','Locations','count'],
 ['assets','Assets / equipment','count'],['pm_schedules','PM schedules','count'],
 ['checklists','PM checklists / task lists','count'],['meters','Meters / measuring points','count'],
 ['orders_month','Work orders per month','count'],['requests_month','Work requests per month','count'],
 ['spare_parts','Spare parts (materials)','count'],['stores','Stores / storage locations','count'],
 ['suppliers','Suppliers / contractors','count'],['technicians','Internal technicians','count'],
 ['planners','Planners / supervisors','count'],['requesters','Requesters (people reporting work)','count'],
 ['history_years','Years of history available','years']
]
// Linked question mappings are reviewed by id, never inferred by text. Add when verified.
export const SIZING_LINKS={}

// Queue individual updates by row rather than issuing a network call at each keystroke.
export function createFirstCallQueue(workshopId,userId,onChange){
 const key='wani-discovery-first-call:'+userId+':'+workshopId,pending=new Map()
 try{for(const item of JSON.parse(localStorage.getItem(key)||'[]'))pending.set(item.kind+':'+item.id,item)}catch{}
 let timer=null,closed=false,running=false,backoff=700
 function persist(){try{localStorage.setItem(key,JSON.stringify([...pending.values()]))}catch{}onChange?.(pending.size)}
 function schedule(ms=650){clearTimeout(timer);timer=setTimeout(flush,ms)}
 function enqueue(kind,id,values){pending.set(kind+':'+id,{kind,id,values,workshopId});persist();schedule()}
 async function flush(){
  if(running||!pending.size)return
  running=true
  for(const [key,row] of [...pending]){
   try{await editFirstCall(row.kind,row.id,row.values,workshopId);if(pending.get(key)===row)pending.delete(key);backoff=700;persist()}
   catch{running=false;schedule(backoff);backoff=Math.min(backoff*2,30000);return}
  }running=false;if(pending.size)schedule()
 }
 function start(){window.addEventListener('online',flush);persist();if(pending.size)schedule()}
 function close(){closed=true;clearTimeout(timer);window.removeEventListener('online',flush);persist()}
 return {pending,enqueue,start,close,flush}
}
