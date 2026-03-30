import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const signOut = () => supabase.auth.signOut()

// Conversations
export const loadConversations = async (userId) => {
  const { data, error } = await supabase
    .from('sap_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
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

// Profile
export const getProfile = async (userId) => {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export const upsertProfile = async (userId, updates) => {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates })
  if (error) throw error
}
