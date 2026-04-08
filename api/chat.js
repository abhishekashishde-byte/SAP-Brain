// api/chat.js — v10 FIXED: No node-fetch import

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  tokenize, detokenize,
} from './_shared.js'

// ─────────────────────────────────────────────────────────────────────────────
// 1. INTENT CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────
function classifyIntent(q) {
  const text = q.toLowerCase()

  if (text.match(/\bfield\b|\bstores\b|\bwhere is\b/)) return 'FIELD_LOOKUP'
  if (text.match(/\bdifference\b|\bvs\b|\bcompare\b/)) return 'COMPARISON'
  if (text.match(/\bconfig\b|\bspro\b|\bsetting\b/)) return 'CONFIG'
  if (text.match(/\berror\b|\bdump\b|\bissue\b/)) return 'DEBUG'
  if (text.match(/\bhow\b|\bprocess\b|\bflow\b/)) return 'PROCESS'
  if (text.match(/\btable\b|\btcode\b|\bfiori\b/)) return 'REFERENCE'

  return 'GENERAL'
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. REFERENCE SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function callReferenceSearch(question) {
  try {
    const baseUrl =
      process.env.BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

    if (!baseUrl) return null

    const res = await fetch(`${baseUrl}/api/reference-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })

    return await res.json()
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RELATED OBJECT EXPANSION
// ─────────────────────────────────────────────────────────────────────────────
async function fetchRelated(object) {
  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/sap_relationships?from_tech_name=eq.${object.tech_name}`
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })

    const data = await res.json()
    return data || []
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HALLUCINATION GUARD
// ─────────────────────────────────────────────────────────────────────────────
function guardAnswer(answer) {
  if (!answer) return answer

  if (answer.includes('Z_') || answer.includes('Custom app')) {
    return answer.replace(/Z_\w+/g, '[custom object]')
  }

  return answer
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORMATTER
// ─────────────────────────────────────────────────────────────────────────────
function formatResponse(intent, data, related = []) {
  if (intent === 'REFERENCE') {
    return `**${data.object_type}:** \`${data.tech_name}\`
${data.title}

${data.short_desc || ''}

**Related:**
${related.slice(0,5).map(r => `- ${r.to_tech_name}`).join('\n')}`
  }

  if (intent === 'FIELD_LOOKUP') {
    return `**Field:** \`${data.field_name}\`
**Table:** \`${data.table_name}\`

${data.short_desc}

${data.common_meaning || ''}`
  }

  if (intent === 'COMPARISON') {
    return `**Comparison**

${data}`
  }

  return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GEMINI ENRICHMENT
// ─────────────────────────────────────────────────────────────────────────────
async function enrichWithGemini(question, baseAnswer) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return baseAnswer

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Refine this SAP answer:\n${baseAnswer}` }] }],
      }),
    })

    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || baseAnswer
  } catch {
    return baseAnswer
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. CLAUDE FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, messages) {
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
    }),
  })

  const data = await res.json()
  return data.content?.[0]?.text || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const { messages, tone='balanced' } = req.body
  const lastMsg = messages[messages.length-1]?.content || ''

  const intent = classifyIntent(lastMsg)

  res.setHeader('Content-Type', 'text/event-stream')
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    // ── STEP 1: DB SEARCH
    const ref = await callReferenceSearch(lastMsg)

    if (ref && ref.match && ref.confidence > 0.6) {
      let answer = ''

      // MULTI OBJECT / MULTI FIELD
      if (ref.matches?.length) {
        if (ref.intent === 'MULTI_FIELD_LOOKUP') {
          answer = ref.matches.map(f => `- ${f.field_name} — ${f.short_desc}`).join('\n')
        } else {
          answer = ref.matches.map(o => `- ${o.tech_name} — ${o.title}`).join('\n')
        }
      } else {
        const related = await fetchRelated(ref.match)
        answer = formatResponse(intent, ref.match, related)
      }

      answer = await enrichWithGemini(lastMsg, answer)
      answer = guardAnswer(answer)

      send({ type:'chunk', text: answer })
      send({ type:'done', model:'db-layer', full: answer })
      return
    }

    // ── STEP 2: FALLBACK → CLAUDE
    let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || '')

    const { anonymised } = tokenize(messages)

    let answer = await callClaude(systemPrompt, anonymised)
    answer = guardAnswer(answer)

    send({ type:'chunk', text: answer })
    send({ type:'done', model:'claude', full: answer })

  } catch (err) {
    send({ type:'error', error: err.message })
  } finally {
    res.end()
  }
}
