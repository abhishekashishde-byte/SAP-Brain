import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Load all conversations for this user from Supabase
export async function loadConversations() {
  const { data, error } = await supabase
    .from('sap_conversations')
    .select('topic_key, messages')

  if (error) {
    console.error('Error loading conversations:', error)
    return {}
  }

  // Convert array to object keyed by topic_key
  return data.reduce((acc, row) => {
    acc[row.topic_key] = row.messages
    return acc
  }, {})
}

// Save a single topic's conversation
export async function saveConversation(topicKey, messages) {
  const { error } = await supabase
    .from('sap_conversations')
    .upsert(
      { topic_key: topicKey, messages, updated_at: new Date().toISOString() },
      { onConflict: 'topic_key' }
    )

  if (error) {
    console.error('Error saving conversation:', error)
  }
}

// Delete a single topic's conversation
export async function deleteConversation(topicKey) {
  const { error } = await supabase
    .from('sap_conversations')
    .delete()
    .eq('topic_key', topicKey)

  if (error) {
    console.error('Error deleting conversation:', error)
  }
}
