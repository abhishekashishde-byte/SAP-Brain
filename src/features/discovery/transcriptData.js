import { supabase } from '../../supabaseClient'
const expect=r=>{if(r.error)throw r.error;return r.data}
export const loadTranscripts=id=>supabase.from('discovery_transcripts').select('*').eq('workshop_id',id).order('created_at',{ascending:false}).then(expect)
export const loadTranscriptSuggestions=id=>supabase.from('discovery_transcript_suggestions').select('*').eq('workshop_id',id).order('created_at',{ascending:false}).then(expect)
export const updateTranscriptSuggestion=(id,patch)=>supabase.from('discovery_transcript_suggestions').update(patch).eq('id',id).select('*').single().then(expect)
export async function uploadTranscript(workshop,user,file,days,consentText,meeting={}){
 const ext=file.name.split('.').at(-1).toLowerCase()
 if(!['txt','vtt','docx','mp3','m4a','wav'].includes(ext))throw Error('Unsupported file type')
 if(file.size>20*1024*1024)throw Error('Maximum file size is 20 MB')
 const path=user.id+'/'+workshop.id+'/'+crypto.randomUUID()+'.'+ext
 // Content type from the extension (not the browser's guess) — the bucket only accepts these types.
 const TYPES={txt:'text/plain',vtt:'text/vtt',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav'}
 const upload=await supabase.storage.from('discovery-transcripts').upload(path,file,{upsert:false,contentType:TYPES[ext]})
 if(upload.error)throw upload.error
 const audio=['mp3','m4a','wav'].includes(ext)
 const deleteAfter=days?new Date(Date.now()+days*86400000).toISOString().slice(0,10):null
 try{
  const row={
   workshop_id:workshop.id,consent_given_at:new Date().toISOString(),consent_text:consentText,
   file_path:audio?null:path,audio_path:audio?path:null,delete_after:deleteAfter,status:'uploaded'
  }
  const meta={meeting_title:meeting.title?.trim()||null,meeting_date:meeting.date||null,participants:meeting.participants?.trim()||null}
  const first=await supabase.from('discovery_transcripts').insert({...row,...meta}).select('*').single()
  // Before migration 023 the meeting columns don't exist yet — save the transcript without them.
  if(first.error&&/meeting_title|meeting_date|participants|column/i.test(first.error.message||''))return expect(await supabase.from('discovery_transcripts').insert(row).select('*').single())
  return expect(first)
 }catch(e){await supabase.storage.from('discovery-transcripts').remove([path]);throw e}
}
export async function deleteTranscript(t){
 const paths=[t.file_path,t.audio_path].filter(Boolean)
 if(paths.length){const r=await supabase.storage.from('discovery-transcripts').remove(paths);if(r.error)throw r.error}
 const r=await supabase.from('discovery_transcripts').delete().eq('id',t.id)
 if(r.error)throw r.error
}
