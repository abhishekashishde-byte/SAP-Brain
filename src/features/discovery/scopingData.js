import { supabase } from '../../supabaseClient'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'
import { entryKey } from './data.js'
const result=r=>{if(r.error)throw r.error;return r.data}
export const GAP_TYPES=['fit','configuration','workaround','development','org_change','out_of_scope']
export const RICEFW_TYPES=['report','interface','conversion','enhancement','form','workflow']
export const SIZE_POINTS={S:1,M:3,L:8,XL:13}
export async function loadScopingP1(workshopId){
 const [gaps,ignored]=await Promise.all([
  supabase.from('discovery_gaps').select('*').eq('workshop_id',workshopId).order('seq'),
  supabase.from('discovery_gap_ignored').select('*').eq('workshop_id',workshopId)])
 return {gaps:result(gaps),ignored:result(ignored)}
}
export async function addGap(workshopId,values){
 // The unique(workshop_id,seq) constraint protects numbering under concurrent tabs.
 for(let attempt=0;attempt<4;attempt++){
  const {data,error}=await supabase.from('discovery_gaps').select('seq').eq('workshop_id',workshopId).order('seq',{ascending:false}).limit(1)
  if(error)throw error
  const seq=(data[0]?.seq||0)+1
  const insert=await supabase.from('discovery_gaps').insert({...values,workshop_id:workshopId,seq}).select('*').single()
  if(!insert.error)return insert.data
  if(insert.error.code!=='23505')throw insert.error
 }
 throw new Error('Gap numbering conflict: retry after refreshing the register')
}
export const editGap=(id,values)=>supabase.from('discovery_gaps').update({...values,updated_at:new Date().toISOString()}).eq('id',id).select('*').single().then(result)
export const deleteGap=(id)=>supabase.from('discovery_gaps').delete().eq('id',id).then(result)
export const ignoreCandidate=row=>supabase.from('discovery_gap_ignored').upsert(row,{onConflict:'workshop_id,origin,origin_ref'}).then(result)
export const unignoreCandidate=(workshopId,origin,originRef)=>supabase.from('discovery_gap_ignored').delete().eq('workshop_id',workshopId).eq('origin',origin).eq('origin_ref',originRef).then(result)

export function collectGapCandidates({entries={},legacyFields=[],processEntries={},legacyHints=[],gaps=[],ignored=[]}){
 const out=[],used=new Set([...gaps.filter(g=>g.origin_ref).map(g=>g.origin+':'+g.origin_ref),...ignored.map(x=>x.origin+':'+x.origin_ref)])
 const add=(origin,origin_ref,title,related_id,description='')=>{
  if(used.has(origin+':'+origin_ref))return
  out.push({origin,origin_ref,title,related_id,description})
 }
 for(const o of discoveryCatalog.objects){
  for(const f of o.fields){const value=entries[entryKey(o.id,'field',f.id)]?.value||{};if(value.mark==='clarify')add('clarify_field',f.id,f.label,o.id,o.title+' — field marked Clarify')}
  for(const d of o.decisions){const value=entries[entryKey(o.id,'decision',d.id)]?.value||{};if(value.status==='open')add('open_decision',d.id,d.text,o.id,'Decision remains open')}
 }
 for(const row of legacyFields){if(['custom_field','clarify','separate_object'].includes(row.sap_handling))add('extra_field',row.id,row.source_field,row.object_id,row.meaning||'Legacy extra field')}
 for(const p of processCatalog.processes){
  const v=processEntries[p.id]
  if(v?.status==='clarify'||v?.status==='valid'&&v?.answers?.needs_solution===true)add('process',p.id,p.title,p.id,p.plain)
 }
 for(const row of legacyHints){if(row.accepted===true&&row.gap_type==='missing_in_sap')add('legacy_hint',row.id,row.legacy_feature,row.object_id,row.hint)}
 return out
}

const INVENTORY_TABLES={interfaces:'discovery_interfaces',forms_reports:'discovery_forms_reports',raid:'discovery_raid'}
export async function loadScopingInventories(workshopId){
 const pairs=await Promise.all(Object.entries(INVENTORY_TABLES).map(async([key,table])=>{
  const result=await supabase.from(table).select('*').eq('workshop_id',workshopId).order('updated_at',{ascending:false})
  if(result.error)throw result.error
  return [key,result.data]
 }))
 return Object.fromEntries(pairs)
}
export async function addInventory(kind,values){
 const r=await supabase.from(INVENTORY_TABLES[kind]).insert(values).select('*').single()
 if(r.error)throw r.error;return r.data
}
export async function editInventory(kind,id,values,workshopId){
 const r=await supabase.from(INVENTORY_TABLES[kind]).update({...values,updated_at:new Date().toISOString()}).eq('id',id).eq('workshop_id',workshopId).select('*').single()
 if(r.error)throw r.error;return r.data
}
export async function deleteInventory(kind,id,workshopId){
 const r=await supabase.from(INVENTORY_TABLES[kind]).delete().eq('id',id).eq('workshop_id',workshopId)
 if(r.error)throw r.error
}
