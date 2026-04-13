// api/chat.js — Final stable version
// Groq classifies → Claude answers → Gemini finds resources → DB stores corrections

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
} from './_shared.js'

// ── 1. GROQ CLASSIFIER ────────────────────────────────────────────────────────
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
        max_tokens: 80,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `SAP question classifier. Return ONLY valid JSON.

needsBlogSearch = true if ANY of:
- S/4HANA changes, deprecated/removed fields/features
- "not there", "missing", "removed", "can you search", "find document"
- how-to, config steps, process questions, BAdI/BAPI implementation
- troubleshooting, errors, "why is", "why doesn't"
- differences between ECC and S/4HANA

needsBlogSearch = false ONLY for: pure table/T-code/field name lookups

isCorrection = true if user is correcting a previous wrong answer

Question: "${question}"

{"intent":"TABLE|TCODE|PROCESS|CONFIG|DEBUG|GENERAL","needsBlogSearch":false,"isCorrection":false}`
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

// ── 2. LOAD GLOBAL CORRECTIONS ───────────────────────────────────────────────
async function loadGlobalCorrections() {
  try {
    const URL = process.env.SUPABASE_URL
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!URL || !KEY) return []
    const res = await fetch(
      `${URL}/rest/v1/sap_corrections?select=fact&order=created_at.desc&limit=10`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data)
      ? data.map(d => d.fact).filter(f => f && f.length > 10 && f.length < 300)
      : []
  } catch { return [] }
}

// ── 3. SAVE GLOBAL CORRECTION ────────────────────────────────────────────────
async function saveGlobalCorrection(userMsg, assistantMsg, userId) {
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 150,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Extract the corrected SAP fact. Return JSON: {"fact":"clear statement","topic":"1-3 word topic"} or {"fact":"","topic":""}
User: "${userMsg}"
Wrong answer: "${assistantMsg?.slice(0, 300)}"`
        }],
      }),
    })
    const data = await groqRes.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content?.replace(/```json|```/g, '').trim() || '{}')
    if (!parsed.fact || parsed.fact.length < 10) return

    const URL = process.env.SUPABASE_URL
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!URL || !KEY) return

    await fetch(`${URL}/rest/v1/sap_corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=minimal' },
      body: JSON.stringify([{ fact: parsed.fact, topic: parsed.topic, corrected_by: userId || 'anonymous', created_at: new Date().toISOString() }]),
    })
    console.log('CORRECTION SAVED:', parsed.fact)
  } catch (err) { console.error('saveCorrection error:', err.message) }
}

// ── 4. GEMINI SEARCH ─────────────────────────────────────────────────────────
async function geminiSearch(question) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  try {
    // Try newer model first, fallback to older
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash']
    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Find official SAP resources about: ${question}
Return JSON array of max 3 results from help.sap.com, community.sap.com, or blogs.sap.com only.
Format: [{"title":"...","url":"https://...","source":"SAP Help|SAP Community|SAP Blog"}]
Return [] if no confident results found.` }] }],
              tools: [{ google_search: {} }],
              generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
            }),
          }
        )
        if (!res.ok) continue
        const data = await res.json()
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (!raw) continue
        const results = JSON.parse(raw.replace(/```json|```/g, '').trim())
        if (!Array.isArray(results)) continue
        const valid = results.filter(r => r.url && r.title && (
          r.url.includes('help.sap.com') || r.url.includes('community.sap.com') || r.url.includes('blogs.sap.com')
        ))
        if (valid.length > 0) return valid
      } catch { continue }
    }
    return null
  } catch { return null }
}

function formatResources(resources) {
  if (!resources?.length) return ''
  const icon = { 'SAP Help': '📖', 'SAP Community': '💬', 'SAP Blog': '✍️' }
  const links = resources.map(r => `${icon[r.source] || '🔗'} [${r.title}](${r.url}) — _${r.source}_`).join('\n')
  return `\n\n---\n**📚 SAP Resources Found**\n${links}`
}

// ── 5. CLAUDE STREAMING ──────────────────────────────────────────────────────
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
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('CLAUDE API ERROR:', res.status, errText.slice(0, 300))
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 150)}`)
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

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, tone = 'balanced', userName, userRole, userModules = [], userId } = req.body
  const lastMsg = messages?.[messages.length - 1]?.content || ''
  const prevAssistantMsg = [...(messages || [])].reverse().find(m => m.role === 'assistant')?.content || ''

  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = userName?.split(' ')[0] || null
  const isFirstMessage = !messages?.some(m => m.role === 'assistant')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    // STEP 1 — Classify + load corrections in parallel
    const [classification, globalCorrections] = await Promise.all([
      groqClassify(lastMsg),
      loadGlobalCorrections().catch(() => []),
    ])

    const { intent, needsBlogSearch, isCorrection } = classification

    console.log('CLASSIFICATION:', JSON.stringify({
      q: lastMsg.slice(0, 60), intent, needsBlogSearch, isCorrection,
      corrections: globalCorrections.length,
    }))

    // STEP 2 — Save correction if detected
    if (isCorrection && prevAssistantMsg) {
      saveGlobalCorrection(lastMsg, prevAssistantMsg, userId).catch(() => { })
    }

    // STEP 3 — Build system prompt
    let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || '')

    // Never say can't search
    systemPrompt += `\n\nIMPORTANT: You have access to SAP documentation resources. NEVER say "I can't search online" or "I can't access external documents". When uncertain about S/4HANA specifics, say "let me check" — resources will be appended.`

    // Personalization
    if (firstName) {
      systemPrompt += `\n\nUser name: ${firstName}.`
      if (userRole) systemPrompt += ` Role: ${userRole}.`
      if (userModules?.length > 0) systemPrompt += ` SAP modules: ${userModules.join(', ')}.`
    }
    if (isFirstMessage && firstName) {
      systemPrompt += ` This is the first message — start with "${timeGreeting}, ${firstName}." then answer directly. Only greet once.`
    }

    // Corrections
    if (globalCorrections.length > 0) {
      systemPrompt += `\n\n⚠️ VERIFIED CORRECTIONS (ground truth):\n${globalCorrections.slice(0, 5).map(c => `- ${c}`).join('\n')}`
    }

    // STEP 4 — Start blog search in parallel if needed
    const blogPromise = needsBlogSearch ? geminiSearch(lastMsg) : Promise.resolve(null)

    // STEP 5 — Prepare messages — last 8 only, max 2000 chars each
    const validMessages = (messages || [])
      .filter(m => m.role && m.content?.trim())
      .map(m => ({ role: m.role, content: String(m.content).trim().slice(0, 2000) }))
      .slice(-8)

    console.log('SENDING TO CLAUDE:', { messageCount: validMessages.length, systemPromptLength: systemPrompt.length })

    if (validMessages.length === 0) {
      send({ type: 'error', error: 'No messages to process' })
      res.end()
      return
    }

    // STEP 6 — Stream Claude
    let fullAnswer = ''
    send({ type: 'start' })

    try {
      fullAnswer = await streamClaude(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }))
    } catch (err) {
      console.error('CLAUDE ERROR:', err.message)
      send({ type: 'error', error: err.message })
      res.end()
      return
    }

    if (!fullAnswer?.trim()) {
      console.error('CLAUDE EMPTY RESPONSE — messageCount:', validMessages.length, 'systemLen:', systemPrompt.length)
      send({ type: 'error', error: 'Empty response — please try again' })
      res.end()
      return
    }

    // STEP 7 — Append resources if found
    const resources = await blogPromise
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
