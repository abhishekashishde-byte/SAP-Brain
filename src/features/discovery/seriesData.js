import { supabase } from '../../supabaseClient'
export async function createNextSession(previousId,meetingDate){
 const r=await supabase.rpc('discovery_next_session',{_previous:previousId,_meeting_date:meetingDate})
 if(r.error)throw r.error
 return r.data
}
export async function loadEngagementSessions(id){
 if(!id)return []
 const r=await supabase.from('discovery_workshops').select('id,client_name,title,call_date,session_no,status,previous_workshop_id,engagement_id').eq('engagement_id',id).order('session_no')
 if(r.error)throw r.error
 return r.data
}
export async function loadPreviousEntries(id){
 if(!id)return []
 const r=await supabase.from('discovery_entries').select('object_id,item_type,item_id,value,carried_from').eq('workshop_id',id)
 if(r.error)throw r.error
 return r.data
}
export const compareEntries=(current,previous)=>{
 const before=new Map(previous.map(r=>[[r.object_id,r.item_type,r.item_id].join('::'),r.value]))
 return current.filter(r=>r.carried_from&&before.has([r.object_id,r.item_type,r.item_id].join('::'))&&JSON.stringify(before.get([r.object_id,r.item_type,r.item_id].join('::')))!==JSON.stringify(r.value)).map(r=>({...r,previous_value:before.get([r.object_id,r.item_type,r.item_id].join('::'))}))
}
