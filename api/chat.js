// api/chat.js — v4 CLEAN ARCHITECTURE
// Groq classifies → Claude answers → Gemini finds resources → DB stores corrections

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isCorrecting, tokenize,
} from './_shared.js'

// ─────────────────────────────────────────────────────────────────────────────
// 1. GROQ CLASSIFIER — replaces all regex pattern matching
// ─────────────────────────────────────────────────────────────────────────────
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
          content: `You are an SAP question classifier. Classify this question and return ONLY valid JSON, nothing else.

Rules for needsBlogSearch:
- true: how-to questions, process questions, app usage, BAdI/BAPI implementation, configuration steps, troubleshooting workflows
- false: table name lookups, T-code lookups, field names, simple definitions, comparisons

Rules for isCorrection:
- true: user is saying previous answer was wrong, correcting a fact, providing the right answer

Question: "${question}"

Return exactly this JSON:
{"intent":"TABLE|TCODE|PROCESS|CONFIG|DEBUG|BAPI|GENERAL","needsBlogSearch":false,"isCorrection":false}`
        }],
      }),
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const result = JSON.parse(cleaned)
    return {
      intent: result.intent || 'GENERAL',
      needsBlogSearch: result.needsBlogSearch === true,
      isCorrection: result.isCorrection === true,
    }
  } catch {
    return { intent: 'GENERAL', needsBlogSearch: false, isCorrection: false }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOAD VERIFIED CORRECTIONS FROM MEMORY
// ─────────────────────────────────────────────────────────────────────────────
async function loadVerifiedCorrections(userId) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) return []

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/memories?user_id=eq.${userId}&select=content&order=created_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data.map(d => d.content).filter(Boolean) : []
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SAVE CORRECTION TO MEMORY
// ─────────────────────────────────────────────────────────────────────────────
async function saveCorrection(userId, userMsg, assistantMsg) {
  try {
    // Use Groq to extract the corrected fact
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Extract the corrected SAP fact from this exchange as a single clear statement.
Return ONLY the fact as a string, no JSON, no explanation.
If no clear correction, return: NO_CORRECTION

User correction: "${userMsg}"
Previous answer: "${assistantMsg}"

Example output: "BAPI_PRODVERSION_CREATE does not exist — use C_MKAL_MAINTAIN FM instead for production version creation"`
        }],
      }),
    })
    const data = await res.json()
    const fact = data.choices?.[0]?.message?.content?.trim()
    if (!fact || fact === 'NO_CORRECTION') return

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    await fetch(`${SUPABASE_URL}/rest/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{
        user_id: userId,
        content: `[VERIFIED CORRECTION] ${fact}`,
        created_at: new Date().toISOString(),
      }]),
    })
    console.log('CORRECTION SAVED:', fact)
  } catch (err) {
    console.error('saveCorrection error:', err.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GEMINI RESOURCE SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function geminiSearchResources(question) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  try {
    const prompt = `Search for SAP official resources about this topic.
Focus ONLY on these domains: help.sap.com, community.sap.com, blogs.sap.com

Return ONLY a JSON array of max 3 results. Each result must have real, working URLs.
Format: [{"title":"...","url":"https://...","source":"SAP Help|SAP Community|SAP Blog"}]

If you cannot find real URLs with confidence, return: []

Topic: ${question}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.1 },
        }),
      }
    )
    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!raw) return null

    const cleaned = raw.replace(/```json|```/g, '').trim()
    const results = JSON.parse(cleaned)
    if (!Array.isArray(results) || results.length === 0) return null

    // Filter to only SAP official domains
    const valid = results.filter(r =>
      r.url &&
      r.title &&
      (r.url.includes('help.sap.com') ||
       r.url.includes('community.sap.com') ||
       r.url.includes('blogs.sap.com'))
    )
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORMAT RESOURCES
// ─────────────────────────────────────────────────────────────────────────────
function formatResources(resources) {
  if (!resources || resources.length === 0) return ''

  const sourceIcon = {
    'SAP Help': '📖',
    'SAP Community': '💬',
    'SAP Blog': '✍️',
  }

  const links = resources
    .map(r => `${sourceIcon[r.source] || '🔗'} [${r.title}](${r.url}) — _${r.source}_`)
    .join('\n')

  return `\n\n---\n**📚 Further Reading**\n${links}`
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CLAUDE CALL — streaming
// ─────────────────────────────────────────────────────────────────────────────
async function streamClaude(systemPrompt, messages, onChunk) {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.error?.message || 'Claude error')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

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
          if (text) {
            fullText += text
            onChunk(text)
          }
        }
      } catch { }
    }
  }

  return fullText
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, tone = 'balanced', userName, userId } = req.body
  const lastMsg = messages[messages.length - 1]?.content || ''
  const prevAssistantMsg = messages[messages.length - 2]?.content || ''

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    // STEP 1 — Groq classifies in parallel with loading memories
    const [classification, corrections] = await Promise.all([
      groqClassify(lastMsg),
      userId ? loadVerifiedCorrections(userId) : Promise.resolve([]),
    ])

    const { intent, needsBlogSearch, isCorrection } = classification

    console.log('CLASSIFICATION:', JSON.stringify({
      question: lastMsg.slice(0, 60),
      intent,
      needsBlogSearch,
      isCorrection,
      correctionsLoaded: corrections.length,
    }))

    // STEP 2 — Save correction if user is correcting
    if (isCorrection && userId && prevAssistantMsg) {
      saveCorrection(userId, lastMsg, prevAssistantMsg).catch(() => { })
    }

    // STEP 3 — Build system prompt with verified corrections injected
    let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || '')

    if (userName) {
      systemPrompt += `\n\nUser name: ${userName}`
    }

    if (corrections.length > 0) {
      const correctionList = corrections.map(c => `- ${c}`).join('\n')
      systemPrompt += `\n\n⚠️ VERIFIED CORRECTIONS — These are facts confirmed correct by the user. Use them as ground truth, they override your training data:\n${correctionList}`
    }

    // STEP 4 — Start blog search in parallel if needed
    const blogSearchPromise = needsBlogSearch
      ? geminiSearchResources(lastMsg)
      : Promise.resolve(null)

    // STEP 5 — Stream Claude answer
    const { anonymised } = tokenize(messages)
    let fullAnswer = ''

    send({ type: 'start' })

    fullAnswer = await streamClaude(systemPrompt, anonymised, (chunk) => {
      send({ type: 'chunk', text: chunk })
    })

    // STEP 6 — Append blog resources if found
    const resources = await blogSearchPromise
    const resourceSection = formatResources(resources)

    if (resourceSection) {
      send({ type: 'chunk', text: resourceSection })
      fullAnswer += resourceSection
      console.log('RESOURCES APPENDED:', resources.length, 'links')
    }

    send({
      type: 'done',
      model: needsBlogSearch ? 'claude+gemini' : 'claude',
      full: fullAnswer,
    })

  } catch (err) {
    console.error('HANDLER ERROR:', err.message)
    send({ type: 'error', error: err.message })
  } finally {
    res.end()
  }
}
