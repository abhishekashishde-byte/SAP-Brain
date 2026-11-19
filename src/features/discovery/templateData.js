import { supabase } from '../../supabaseClient'
export async function loadTemplates(ownerId){
 const r=await supabase.from('discovery_templates').select('*').eq('owner_id',ownerId).order('created_at',{ascending:false})
 if(r.error)throw r.error;return r.data
}
export async function saveTemplate(row){
 const r=await supabase.from('discovery_templates').insert(row).select('*').single()
 if(r.error)throw r.error;return r.data
}
export async function editTemplate(id,values){
 const r=await supabase.from('discovery_templates').update(values).eq('id',id).select('*').single()
 if(r.error)throw r.error;return r.data
}
export async function deleteTemplate(id){
 const r=await supabase.from('discovery_templates').delete().eq('id',id)
 if(r.error)throw r.error
}
export function pickTemplateContent({entries={},processEntries={},requests=[],gaps=[],raid=[]},include={}){
 const out={entries:[],processes:[],requests:[],gaps:[],raid:[]}
 if(include.custom){
  out.entries.push(...Object.values(entries).filter(x=>['custom_field','custom_question'].includes(x.item_type)).map(x=>({object_id:x.object_id,item_type:x.item_type,item_id:x.item_id,value:{
   label:x.value?.label||'',text:x.value?.text||'',mark:x.value?.mark||'',answer:x.value?.answer||''
  }})))
 }
 if(include.answers){
  out.entries.push(...Object.values(entries).filter(x=>['question','decision'].includes(x.item_type)).map(x=>({object_id:x.object_id,item_type:x.item_type,item_id:x.item_id,value:x.item_type==='question'?{answer:x.value?.answer??null}:{choice:x.value?.choice||''}})))
 }
 if(include.processes)out.processes=Object.values(processEntries).map(x=>({process_id:x.process_id,status:x.status,frequency:x.frequency,custom:x.custom?{title:x.custom.title,plain:x.custom.plain,category:x.custom.category,kind:x.custom.kind}:null}))
 if(include.requests)out.requests=requests.map(x=>({item:x.item,related_id:x.related_id,format:x.format}))
 if(include.gaps)out.gaps=gaps.map(x=>({title:x.title,gap_type:x.gap_type,ricefw:x.ricefw,description:x.description,solution_idea:x.solution_idea,related_id:x.related_id}))
 if(include.raid)out.raid=raid.map(x=>({kind:x.kind,text:x.text,related_id:x.related_id,mitigation:x.mitigation}))
 return out
}
export const templateItems=content=>[
 ...(content.entries||[]).map(x=>({kind:'entry',key:x.object_id+':'+x.item_type+':'+x.item_id,label:x.value?.text||x.value?.label||x.item_id,data:x})),
 ...(content.processes||[]).map(x=>({kind:'process',key:x.process_id,label:x.process_id,data:x})),
 ...(content.requests||[]).map((x,i)=>({kind:'request',key:'request:'+i,label:x.item,data:x})),
 ...(content.gaps||[]).map((x,i)=>({kind:'gap',key:'gap:'+i,label:x.title,data:x})),
 ...(content.raid||[]).map((x,i)=>({kind:'raid',key:'raid:'+i,label:x.text,data:x}))
]
