import { supabase } from '../../supabaseClient'

const requireData = ({ data, error }) => {
  if (error) throw error
  return data
}
export const loadWorkshops = ownerId => supabase.from('discovery_workshops').select('*').eq('owner_id',ownerId).order('updated_at',{ascending:false}).then(requireData)
export const createWorkshop = values => supabase.from('discovery_workshops').insert(values).select('*').single().then(requireData)
export const updateWorkshop = (id, values) => supabase.from('discovery_workshops').update({...values,updated_at:new Date().toISOString()}).eq('id',id).select('*').single().then(requireData)
export const removeWorkshop = id => supabase.from('discovery_workshops').delete().eq('id',id).then(requireData)
export const loadEntries = id => supabase.from('discovery_entries').select('*').eq('workshop_id',id).then(requireData)
export const saveEntry = row => supabase.from('discovery_entries').upsert({...row,updated_at:new Date().toISOString()},{onConflict:'workshop_id,object_id,item_type,item_id'}).then(requireData)
export const loadTodos = id => supabase.from('discovery_todos').select('*').eq('workshop_id',id).order('created_at').then(requireData)
export const createTodo = values => supabase.from('discovery_todos').insert(values).select('*').single().then(requireData)
export const updateTodo = (id,values) => supabase.from('discovery_todos').update(values).eq('id',id).then(requireData)
export const removeTodo = id => supabase.from('discovery_todos').delete().eq('id',id).then(requireData)
export const loadMinutes = id => supabase.from('discovery_minutes').select('*').eq('workshop_id',id).order('created_at',{ascending:false}).then(requireData)
export const saveMinutes = values => supabase.from('discovery_minutes').insert(values).select('*').single().then(requireData)
export const loadHints = id => supabase.from('discovery_legacy_hints').select('*').eq('workshop_id',id).then(requireData)
export const saveHints = values => supabase.from('discovery_legacy_hints').insert(values).select('*').then(requireData)
export const reviewHint = (id,accepted) => supabase.from('discovery_legacy_hints').update({accepted}).eq('id',id).then(requireData)

export const entryKey = (object_id,item_type,item_id) => [object_id,item_type,item_id].join('::')
export const cachedEntryKey = (workshopId,userId) => 'wani-discovery-pending:'+userId+':'+workshopId

// This queue is durable through offline periods and page reloads; it only stores
// pending changes, never replaces Supabase as the source of truth.
export function createEntryQueue(workshopId,userId,onChange) {
  const key = cachedEntryKey(workshopId,userId)
  const pending = new Map()
  try { for(const row of JSON.parse(localStorage.getItem(key)||'[]')) pending.set(entryKey(row.object_id,row.item_type,row.item_id),row) } catch {}
  let timer=null, inFlight=false, closed=false, retry=800
  const notify=()=>onChange?.(pending.size)
  function persist() {
    try { localStorage.setItem(key,JSON.stringify([...pending.values()])) } catch {}
    notify()
  }
  async function flush() {
    if(closed||inFlight||!pending.size) return
    inFlight=true
    for(const [id,row] of [...pending]) {
      try {
        await saveEntry(row)
        // Never remove a newer edit that arrived while the network request ran.
        if(pending.get(id)===row) pending.delete(id)
        retry=800
        persist()
      } catch {
        inFlight=false
        timer=setTimeout(flush,retry)
        retry=Math.min(retry*2,30000)
        return
      }
    }
    inFlight=false
    if(pending.size) schedule()
  }
  function schedule() { if(timer)clearTimeout(timer);timer=setTimeout(flush,600) }
  function enqueue(row) { pending.set(entryKey(row.object_id,row.item_type,row.item_id),row);persist();schedule() }
  function start() { window.addEventListener('online',flush); if(pending.size)schedule();notify() }
  function close() { closed=true;if(timer)clearTimeout(timer);window.removeEventListener('online',flush);persist() }
  return {enqueue,start,close,flush,pending}
}

export const loadSourceSystems = id => supabase.from('discovery_source_systems').select('*').eq('workshop_id',id).order('created_at').then(requireData)
export const addSourceSystem = values => supabase.from('discovery_source_systems').insert(values).select('*').single().then(requireData)
export const changeSourceSystem = (id,values) => supabase.from('discovery_source_systems').update(values).eq('id',id).select('*').single().then(requireData)
export const deleteSourceSystem = id => supabase.from('discovery_source_systems').delete().eq('id',id).then(requireData)
export const loadObjectSources = id => supabase.from('discovery_object_sources').select('*').eq('workshop_id',id).then(requireData)
export const saveObjectSources = row => supabase.from('discovery_object_sources').upsert({...row,updated_at:new Date().toISOString()},{onConflict:'workshop_id,object_id'}).select('*').single().then(requireData)

export const loadLegacyFields = id => supabase.from('discovery_legacy_fields').select('*').eq('workshop_id',id).order('sort_order').then(requireData)
export const createLegacyField = values => supabase.from('discovery_legacy_fields').insert(values).select('*').single().then(requireData)
export const updateLegacyField = (id,values) => supabase.from('discovery_legacy_fields').update({...values,updated_at:new Date().toISOString()}).eq('id',id).select('*').single().then(requireData)
export const deleteLegacyField = id => supabase.from('discovery_legacy_fields').delete().eq('id',id).then(requireData)
