import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const signOut = () => supabase.auth.signOut()

export const loadConversations = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('sap_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) return []
    return data || []
  } catch { return [] }
}

export const createConversation = async (userId, { title, module, topic, messages }) => {
  const { data, error } = await supabase
    .from('sap_conversations')
    .insert({ user_id: userId, title, module, topic, messages })
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateConversation = async (id, updates) => {
  const { error } = await supabase
    .from('sap_conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export const deleteConversation = async (id) => {
  const { error } = await supabase
    .from('sap_conversations')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export const markAsProject = async (convId, fsTitle) => {
  try {
    const { error } = await supabase
      .from('sap_conversations')
      .update({
        is_project: true,
        project_name: fsTitle,
        fs_title: fsTitle,
        fs_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', convId)
    if (error) console.error('markAsProject error:', error)
  } catch(e) { console.error(e) }
}

export const loadProjects = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('sap_conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_project', true)
      .order('updated_at', { ascending: false })
    if (error) return []
    return data || []
  } catch { return [] }
}

export const getProfile = async (userId) => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return data
  } catch { return null }
}

export const upsertProfile = async (userId, updates) => {
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, ...updates })
    if (error) console.error('upsertProfile error:', error)
  } catch(e) { console.error(e) }
}
