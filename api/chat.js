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

// ── 4. GEMINI SEARCH — extracts real links from grounding metadata ────────────
async function geminiSearch(question) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash']
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `SAP documentation search: ${question}` }] }],
            tools: [{ google_search: {} }],
            generationConfig: { maxOutputTokens: 800, temperature: 0.1 },
          }),
        }
      )
      if (!res.ok) continue
      const data = await res.json()

      // Extract from grounding metadata — this is where real URLs are
      const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      const groundingSupport = data.candidates?.[0]?.groundingMetadata?.searchEntryPoint

      const links = []

      // Method 1: grounding chunks (most reliable)
      for (const chunk of groundingChunks) {
        const web = chunk.web
        if (!web?.uri || !web?.title) continue
        const uri = web.uri
        // Only SAP official domains
        if (!uri.includes('help.sap.com') && !uri.includes('community.sap.com') && !uri.includes('blogs.sap.com') && !uri.includes('launchpad.support.sap.com')) continue
        const source = uri.includes('help.sap.com') ? 'SAP Help'
          : uri.includes('community.sap.com') ? 'SAP Community'
          : uri.includes('blogs.sap.com') ? 'SAP Blog' : 'SAP Support'
        links.push({ title: web.title, url: uri, source })
        if (links.length >= 3) break
      }

      if (links.length > 0) {
        console.log('GEMINI LINKS FOUND:', links.length)
        return links
      }

      // Method 2: extract URLs from response text as fallback
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const urlMatches = text.match(/https?:\/\/(help|community|blogs)\.sap\.com[^\s\)\"]+/g) || []
      if (urlMatches.length > 0) {
        return urlMatches.slice(0, 3).map(url => ({
          title: url.split('/').pop().replace(/-/g, ' ') || 'SAP Documentation',
          url,
          source: url.includes('help.sap.com') ? 'SAP Help' : url.includes('community.sap.com') ? 'SAP Community' : 'SAP Blog'
        }))
      }

      console.log('GEMINI: no SAP links found in response')
    } catch (err) {
      console.log('GEMINI ERROR:', err.message)
      continue
    }
  }
  return null
}

function formatResources(resources) {
  if (!resources?.length) return ''
  const icon = { 'SAP Help': '📖', 'SAP Community': '💬', 'SAP Blog': '✍️', 'SAP Support': '🔧' }
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
      model: 'claude-sonnet-4-6',
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
    // STEP 1 — Classify (for search detection) + load corrections in parallel
    // Both run simultaneously — don't block Claude on classification
    const [classification, globalCorrections] = await Promise.all([
      groqClassify(lastMsg),
      loadGlobalCorrections().catch(() => []),
    ])

    const { intent, needsBlogSearch, isCorrection } = classification

    console.log('CLASSIFICATION:', JSON.stringify({
      q: lastMsg.slice(0, 60), intent, needsBlogSearch, isCorrection,
      corrections: globalCorrections.length,
    }))

    // STEP 2 — Save correction if detected (fire and forget)
    if (isCorrection && prevAssistantMsg) {
      saveGlobalCorrection(lastMsg, prevAssistantMsg, userId).catch(() => { })
    }

    // STEP 3 — Build system prompt
    let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || '')
    systemPrompt += `\n\nIMPORTANT: NEVER say "I can't search online". Resources are appended automatically.`
    if (firstName) {
      systemPrompt += `\n\nUser: ${firstName}${userRole ? `, ${userRole}` : ''}${userModules?.length ? `, focuses on ${userModules.join('/')}` : ''}.`
    }
    if (isFirstMessage && firstName) {
      systemPrompt += ` Greet with "${timeGreeting}, ${firstName}." then answer. Only once.`
    }
    if (globalCorrections.length > 0) {
      systemPrompt += `\n\n⚠️ VERIFIED CORRECTIONS:\n${globalCorrections.slice(0, 5).map(c => `- ${c}`).join('\n')}`
    }

    // STEP 4 — Start Gemini search in parallel with Claude (both run at same time)
    const blogPromise = needsBlogSearch ? geminiSearch(lastMsg) : Promise.resolve(null)

    // STEP 5 — Prepare messages
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
