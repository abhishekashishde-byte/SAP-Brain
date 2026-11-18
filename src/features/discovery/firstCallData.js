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
