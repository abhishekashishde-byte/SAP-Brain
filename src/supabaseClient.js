import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const signOut = async () => {
  // Delete only this session's active-session record. If this browser has
  // already been replaced by a newer login, the RPC safely deletes nothing.
  try { await supabase.rpc('clear_wani_session') } catch {}

  const result = await supabase.auth.signOut({ scope: 'local' })
  if (!result?.error) {
    try { localStorage.removeItem('wani-last-auth-session-v1') } catch {}
  }
  return result
}

const CONVERSATION_LIST_FIELDS = 'id,user_id,title,created_at,updated_at,deliverable_type,is_project,project_name,fs_title,fs_generated_at,module,topic,is_summarised'

// History must stay lightweight. Never download the full messages JSON just to
// render titles/cards; one large account can otherwise transfer tens of MB on login.
export const loadConversations = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('sap_conversations')
      .select(CONVERSATION_LIST_FIELDS)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) { console.error('loadConversations error:', error); return [] }
    return data || []
  } catch { return [] }
}

// Fetch the heavy message payload only when the user actually opens a chat.
export const loadConversation = async (id, userId) => {
  try {
    const { data, error } = await supabase
      .from('sap_conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    if (error) return null
    return data || null
  } catch { return null }
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
      .select(CONVERSATION_LIST_FIELDS)
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
