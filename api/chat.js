// api/chat.js — v5 with GLOBAL corrections (shared across all users)

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  tokenize,
} from './_shared.js'

// ──────────────────────────────────────────────────────────────────────────────
// 1. GROQ CLASSIFIER
// ──────────────────────────────────────────────────────────────────────────────
async function groqClassify(question) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 120,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `You are an SAP question classifier. Classify this question and return ONLY valid JSON.

Rules for needsBlogSearch:
- true: how-to questions, process questions, BAdI/BAPI implementation, config steps, troubleshooting workflows
- false: table lookups, T-code lookups, field names, simple definitions, comparisons

Rules for isCorrection:
- true: user is saying previous answer was wrong, correcting a fact, providing the right answer

Question: "${question}"

Return exactly: {"intent":"TABLE|TCODE|PROCESS|CONFIG|DEBUG|BAPI|GENERAL","needsBlogSearch":false,"isCorrection":false}`
        }],
      }),
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      intent: result.intent || 'GENERAL',
      needsBlogSearch: result.needsBlogSearch === true,
      isCorrection: result.isCorrection === true,
    }
  } catch {
    return { intent: 'GENERAL', needsBlogSearch: false, isCorrection: false }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. LOAD GLOBAL SAP CORRECTIONS — shared across ALL users
// ──────────────────────────────────────────────────────────────────────────────
async function loadGlobalCorrections() {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) return []

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sap_corrections?select=fact,topic&order=created_at.desc&limit=50`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data.map(d => d.fact).filter(Boolean) : []
  } catch {
    return []
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. SAVE GLOBAL CORRECTION — benefits ALL users
// ──────────────────────────────────────────────────────────────────────────────
async function saveGlobalCorrection(userMsg, assistantMsg, userId) {
  try {
    // Use Groq to extract the corrected fact clearly
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Extract the corrected SAP fact from this exchange.
Return JSON with two fields:
- "fact": a clear, standalone SAP fact statement (what is CORRECT)
- "topic": 1-3 word SAP topic (e.g. "Production Orders", "MM Tables", "PM BAdIs")

If no clear correction exists, return: {"fact":"","topic":""}

User correction: "${userMsg}"
Previous (wrong) answer: "${assistantMsg?.slice(0, 500)}"

Example output: {"fact":"Table MKAL stores production versions — not MAST which stores BOM headers","topic":"Production Versions"}`
        }],
      }),
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) return

    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    if (!parsed.fact || parsed.fact.length < 10) return

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    // Check if similar correction already exists (avoid duplicates)
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sap_corrections?topic=eq.${encodeURIComponent(parsed.topic)}&limit=5`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (checkRes.ok) {
      const existing = await checkRes.json()
      const isDuplicate = existing.some(e =>
        e.fact?.toLowerCase().includes(parsed.fact.toLowerCase().slice(0, 30))
      )
      if (isDuplicate) {
        console.log('CORRECTION ALREADY EXISTS — skipping duplicate')
        return
      }
    }

    await fetch(`${SUPABASE_URL}/rest/v1/sap_corrections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{
        fact: parsed.fact,
        topic: parsed.topic,
        corrected_by: userId || 'anonymous',
        created_at: new Date().toISOString(),
      }]),
    })
    console.log('GLOBAL CORRECTION SAVED:', parsed.fact)
  } catch (err) {
    console.error('saveGlobalCorrection error:', err.message)
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. GEMINI RESOURCE SEARCH
// ──────────────────────────────────────────────────────────────────────────────
async function geminiSearchResources(question) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Find SAP official resources about: ${question}\nReturn JSON array of max 3: [{"title":"...","url":"https://...","source":"SAP Help|SAP Community|SAP Blog"}]\nOnly use help.sap.com, community.sap.com, blogs.sap.com. Return [] if unsure.` }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.1 },
        }),
      }
    )
    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!raw) return null
    const results = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const valid = results.filter(r => r.url && r.title && (
      r.url.includes('help.sap.com') || r.url.includes('community.sap.com') || r.url.includes('blogs.sap.com')
    ))
    return valid.length > 0 ? valid : null
  } catch { return null }
}

function formatResources(resources) {
  if (!resources?.length) return ''
  const icon = { 'SAP Help': '📖', 'SAP Community': '💬', 'SAP Blog': '✍️' }
  const links = resources.map(r => `${icon[r.source] || '🔗'} [${r.title}](${r.url}) — _${r.source}_`).join('\n')
  return `\n\n---\n**📚 Further Reading**\n${links}`
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. CLAUDE STREAMING
// ──────────────────────────────────────────────────────────────────────────────
async function streamClaude(systemPrompt, messages, onChunk) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('CLAUDE API ERROR:', res.status, errText.slice(0, 300))
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta') {
          const text = json.delta?.text || ''
          if (text) { fullText += text; onChunk(text) }
        }
      } catch { }
    }
  }
  return fullText
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, tone = 'balanced', userName, userRole, userModules = [], userId } = req.body
  const lastMsg = messages[messages.length - 1]?.content || ''
  const prevAssistantMsg = messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content || ''

  // Detect time of day for natural greeting
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = userName?.split(' ')[0] || null

  // Only greet on first message of session (no previous assistant messages)
  const isFirstMessage = messages.filter(m => m.role === 'assistant').length === 0

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    // STEP 1 — Classify + load global corrections in parallel
    const [classification, globalCorrections] = await Promise.all([
      groqClassify(lastMsg),
      loadGlobalCorrections().catch(() => []),
    ])

    const { intent, needsBlogSearch, isCorrection } = classification

    // Filter to only valid corrections
    const validCorrections = globalCorrections.filter(c =>
      c && typeof c === 'string' && c.trim().length > 10 && c.trim().length < 500
    )

    console.log('CLASSIFICATION:', JSON.stringify({
      q: lastMsg.slice(0, 60), intent, needsBlogSearch, isCorrection,
      corrections: validCorrections.length,
    }))

    // STEP 2 — Save correction globally if detected
    if (isCorrection && prevAssistantMsg) {
      saveGlobalCorrection(lastMsg, prevAssistantMsg, userId).catch(() => { })
    }

    // STEP 3 — Build system prompt
    let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || '')
    if (firstName || userRole || userModules?.length > 0) {
      systemPrompt += `\n\nUSER PROFILE:`
      if (firstName) systemPrompt += `\n- Name: ${firstName}`
      if (userRole) systemPrompt += `\n- Role: ${userRole}`
      if (userModules?.length > 0) systemPrompt += `\n- SAP Focus: ${userModules.join(', ')}`
    }
    if (isFirstMessage && firstName) {
      systemPrompt += `\n\nThis is the first message of this session. Start with "${timeGreeting}, ${firstName}." then answer directly. Only do this ONCE.`
    }

    if (validCorrections.length > 0) {
      systemPrompt += `\n\n⚠️ VERIFIED SAP CORRECTIONS — Confirmed correct by senior consultants. Use as ground truth:\n${validCorrections.map(c => `- ${c}`).join('\n')}`
    }

    // STEP 4 — Start blog search in parallel
    const blogSearchPromise = needsBlogSearch
      ? geminiSearchResources(lastMsg)
      : Promise.resolve(null)

    // STEP 5 — Stream Claude answer
    const { anonymised } = tokenize(messages)
    let fullAnswer = ''

    // Validate messages before sending
    const validMessages = anonymised.filter(m => m.role && m.content && m.content.trim())
    if (validMessages.length === 0) {
      send({ type: 'error', error: 'No valid messages to process' })
      res.end()
      return
    }

    send({ type: 'start' })

    try {
      fullAnswer = await streamClaude(systemPrompt, validMessages, (chunk) => {
        send({ type: 'chunk', text: chunk })
      })
    } catch (claudeErr) {
      console.error('CLAUDE STREAM ERROR:', claudeErr.message)
      send({ type: 'error', error: `Claude error: ${claudeErr.message}` })
      res.end()
      return
    }

    if (!fullAnswer || fullAnswer.trim().length === 0) {
      console.error('CLAUDE RETURNED EMPTY RESPONSE')
      send({ type: 'error', error: 'Empty response from Claude — please try again' })
      res.end()
      return
    }

    // STEP 6 — Append resources if found
    const resources = await blogSearchPromise
    const resourceSection = formatResources(resources)
    if (resourceSection) {
      send({ type: 'chunk', text: resourceSection })
      fullAnswer += resourceSection
    }

    send({ type: 'done', model: needsBlogSearch ? 'claude+gemini' : 'claude', full: fullAnswer })

  } catch (err) {
    console.error('HANDLER ERROR:', err.message)
    send({ type: 'error', error: err.message })
  } finally {
    res.end()
  }
}
