import {createClient} from '@supabase/supabase-js'
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET required'})
 const provided=req.headers.authorization||'',secret=process.env.CRON_SECRET
 if(!secret||provided!=='Bearer '+secret)return res.status(401).json({error:'Unauthorized'})
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY
 if(!url||!key)return res.status(503).json({error:'Service not configured'})
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
 const today=new Date().toISOString().slice(0,10)
 const {data:rows,error}=await db.from('discovery_transcripts').select('id,workshop_id,file_path,audio_path').lte('delete_after',today).order('delete_after').limit(200)
 if(error)return res.status(500).json({error:'Retention lookup failed'})
 let deleted=0,skipped=0
 for(const t of rows||[]){
  try{
   const w=await db.from('discovery_workshops').select('owner_id').eq('id',t.workshop_id).single()
   if(w.error||!w.data?.owner_id){skipped++;continue}
   const prefix=w.data.owner_id+'/'+t.workshop_id+'/'
   const paths=[t.file_path,t.audio_path].filter(Boolean)
   if(paths.some(path=>!path.startsWith(prefix))){skipped++;continue}
   if(paths.length){const result=await db.storage.from('discovery-transcripts').remove(paths);if(result.error){skipped++;continue}}
   const del=await db.from('discovery_transcripts').delete().eq('id',t.id).eq('workshop_id',t.workshop_id)
   if(del.error){skipped++;continue}deleted++
  }catch{skipped++}
 }
 return res.status(200).json({deleted,skipped})
}
