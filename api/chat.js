// api/chat.js — Smart routing: Claude for complex SAP, Groq for simple questions
// v2: imports shared utilities, injects passive memories as context

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, tokenize, detokenize,
  callClaude, callGroq,
} from './_shared.js'

async function fetchMemories(userId, query, mod) {
  if (!process.env.SUPABASE_SERVICE_KEY) return []
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
    const terms = extractSAPTerms(query)
    if (terms.length === 0) return []
    const filters = terms.map(t => `fact.ilike.*${encodeURIComponent(t)}*`).join(',')
    const moduleFilter = mod ? `&module=eq.${encodeURIComponent(mod)}` : ''
    const url = `${SUPABASE_URL}/rest/v1/sap_memories?user_id=eq.${userId}${moduleFilter}&or=(${filters})&order=created_at.desc&limit=6`
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
    })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(r => r.fact).filter(Boolean) : []
  } catch { return [] }
}

function extractSAPTerms(text) {
  const terms = []
  const tcodes = text.match(/\b([A-Z]{1,4}\d{2,3}N?)\b/g) || []
  terms.push(...tcodes)
  const sapNouns = [
    'settlement','valuation','refurbish','routing','bom','mrp','capacity',
    'person responsible','functional location','equipment','notification',
    'production version','batch','split valuation','costing','variance',
  ]
  const lower = text.toLowerCase()
  sapNouns.forEach(noun => { if (lower.includes(noun)) terms.push(noun) })
  return [...new Set(terms)].slice(0, 6)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, module: mod, topic, tone = 'balanced', userId } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid body' })

  // Build system prompt
  let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || TONE_ADDITIONS.balanced)

  // Inject passive memories if userId provided
  const lastUserMessage = messages[messages.length - 1]?.content || ''
  if (userId) {
    const memories = await fetchMemories(userId, lastUserMessage, mod)
    if (memories.length > 0) {
      systemPrompt += `\n\nRELEVANT FACTS FROM PAST CONVERSATIONS (use as context, do not cite explicitly):\n${memories.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    }
  }

  // Add topic context to last user message
  const withContext = messages.map((m, i) =>
    i === messages.length - 1 && m.role === 'user'
      ? { ...m, content: `SAP context: module="${mod || 'General'}", topic="${topic || 'General'}"\n\n${m.content}` }
      : m
  )

  // Tokenize sensitive values
  const { anonymised, map } = tokenize(withContext)

  // Route to Claude or Groq
  const useClaudeKey = process.env.ANTHROPIC_API_KEY
  const useGroqKey   = process.env.GROQ_API_KEY
  const complex      = isComplexQuestion(lastUserMessage)

  let raw = '', modelUsed = ''

  try {
    if (complex && useClaudeKey) {
      raw = await callClaude(systemPrompt, anonymised); modelUsed = 'claude'
    } else if (useGroqKey) {
      raw = await callGroq(systemPrompt, anonymised); modelUsed = 'groq'
    } else if (useClaudeKey) {
      raw = await callClaude(systemPrompt, anonymised); modelUsed = 'claude'
    } else {
      return res.status(500).json({ error: 'No API keys configured' })
    }
  } catch (err) {
    try {
      if (modelUsed !== 'groq' && useGroqKey) {
        raw = await callGroq(systemPrompt, anonymised); modelUsed = 'groq'
      } else if (modelUsed !== 'claude' && useClaudeKey) {
        raw = await callClaude(systemPrompt, anonymised); modelUsed = 'claude'
      } else {
        return res.status(500).json({ error: err.message })
      }
    } catch (fallbackErr) {
      return res.status(500).json({ error: fallbackErr.message })
    }
  }

  return res.status(200).json({ reply: detokenize(raw, map), model: modelUsed })
}
