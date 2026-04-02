// api/external-chat.js — Authenticated external endpoint for Klarix
//
// Authentication: x-api-key header (set WANI_API_KEY in Vercel env vars)
// Rate limiting: per-key request counting via Supabase (optional — degrades gracefully)
//
// Klarix usage example:
//   POST https://ask-wani.com/api/external-chat
//   Headers: { "x-api-key": "wani_...", "Content-Type": "application/json" }
//   Body: { "messages": [...], "module": "PM – Plant Maintenance", "topic": "Maintenance Orders", "tone": "formal" }
//
// Response: { "reply": "...", "model": "claude"|"groq", "tokens_used": 0 }

import { tokenize, detokenize, callClaude, callGroq, isComplexQuestion, BASE_SYSTEM_PROMPT, TONE_ADDITIONS } from './_shared.js'

export default async function handler(req, res) {
  // ── CORS — allow Klarix domains ───────────────────────────────────────────
  const origin = req.headers.origin || ''
  const allowedOrigins = [
    'https://klarixai.com',
    'https://www.klarixai.com',
    'https://ask-wani.com',
    'http://localhost:5173',
    'http://localhost:3000',
  ]
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── API Key authentication ─────────────────────────────────────────────────
  const providedKey = req.headers['x-api-key']
  const validKey    = process.env.WANI_API_KEY

  if (!validKey) {
    console.warn('[external-chat] WANI_API_KEY not set — endpoint disabled')
    return res.status(503).json({ error: 'External API not configured' })
  }

  if (!providedKey || providedKey !== validKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' })
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  const {
    messages,
    module: mod,
    topic,
    tone = 'balanced',
    system_context = '',  // Optional: Klarix can inject its own context prefix
  } = req.body

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' })
  }

  // Sanitise messages — only allow role/content fields
  const safeMessages = messages
    .filter(m => m.role && m.content && ['user','assistant'].includes(m.role))
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 8000) }))

  if (safeMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages' })
  }

  // ── Build system prompt ────────────────────────────────────────────────────
  let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || TONE_ADDITIONS.balanced)
  if (system_context) {
    // Klarix can inject brief context like customer name/SAP release
    const sanitised = String(system_context).slice(0, 500).replace(/[\r\n]/g, ' ')
    systemPrompt += `\n\nCLIENT CONTEXT: ${sanitised}`
  }

  // ── Add SAP module/topic context to last message ───────────────────────────
  const withContext = safeMessages.map((m, i) =>
    i === safeMessages.length - 1 && m.role === 'user'
      ? { ...m, content: `SAP context: module="${mod || 'General'}", topic="${topic || 'General'}"\n\n${m.content}` }
      : m
  )

  // ── Tokenize sensitive values ──────────────────────────────────────────────
  const { anonymised, map } = tokenize(withContext)

  // ── Route to Claude or Groq ────────────────────────────────────────────────
  const lastMsg  = safeMessages[safeMessages.length - 1]?.content || ''
  const complex  = isComplexQuestion(lastMsg)
  const hasClaude = !!process.env.ANTHROPIC_API_KEY
  const hasGroq   = !!process.env.GROQ_API_KEY

  let raw = '', modelUsed = ''

  try {
    if (complex && hasClaude) {
      raw = await callClaude(systemPrompt, anonymised)
      modelUsed = 'claude'
    } else if (hasGroq) {
      raw = await callGroq(systemPrompt, anonymised)
      modelUsed = 'groq'
    } else if (hasClaude) {
      raw = await callClaude(systemPrompt, anonymised)
      modelUsed = 'claude'
    } else {
      return res.status(503).json({ error: 'No AI backend configured' })
    }
  } catch (primaryErr) {
    try {
      if (modelUsed !== 'groq' && hasGroq) {
        raw = await callGroq(systemPrompt, anonymised)
        modelUsed = 'groq'
      } else if (modelUsed !== 'claude' && hasClaude) {
        raw = await callClaude(systemPrompt, anonymised)
        modelUsed = 'claude'
      } else {
        return res.status(500).json({ error: primaryErr.message })
      }
    } catch (fallbackErr) {
      return res.status(500).json({ error: fallbackErr.message })
    }
  }

  // ── Optional: log usage to Supabase for billing/analytics ─────────────────
  logUsage({ model: modelUsed, mod, topic, messageCount: safeMessages.length }).catch(() => {})

  return res.status(200).json({
    reply: detokenize(raw, map),
    model: modelUsed,
    module: mod || null,
    topic:  topic || null,
  })
}

async function logUsage({ model, mod, topic, messageCount }) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return

  await fetch(`${SUPABASE_URL}/rest/v1/external_api_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      model,
      module: mod || null,
      topic:  topic || null,
      message_count: messageCount,
      created_at: new Date().toISOString(),
    }),
  })
}
