// api/chat.js — v11: DB → Gemini → Groq → Claude (correct cost-first routing)

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, isUltraSimple, isCorrecting,
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
  if (text.match(/\btable\b|\btcode\b|\bfiori\b|\bapp\b/)) return 'REFERENCE'

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
    if (!object?.tech_name) return []

    const url = `${process.env.SUPABASE_URL}/rest/v1/sap_relationships?from_tech_name=eq.${object.tech_name}`
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })

    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HALLUCINATION GUARD
// ─────────────────────────────────────────────────────────────────────────────
function guardAnswer(answer) {
  if (!answer) return answer

  let cleaned = answer

  if (cleaned.includes('Z_') || cleaned.includes('Custom app')) {
    cleaned = cleaned.replace(/Z_\w+/g, '[custom object]')
  }

  return cleaned
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORMATTER
// ─────────────────────────────────────────────────────────────────────────────
function formatReferenceAnswer(intent, ref, related = []) {
  if (!ref) return ''

  if (intent === 'FIELD_LOOKUP' || ref.field_name) {
    let out = `**Field:** \`${ref.field_name}\`
**Table:** \`${ref.table_name}\`

**Meaning:** ${ref.short_desc || 'No description available'}`

    if (ref.common_meaning) out += `\n\n${ref.common_meaning}`
    return out
  }

  let out = `**${ref.object_type || 'Object'}:** \`${ref.tech_name}\`
**${ref.title || ref.tech_name}**
${ref.short_desc || ''}`

  if (related.length) {
    const grouped = related.slice(0, 8).map(r => `- \`${r.to_tech_name}\``).join('\n')
    out += `\n\n**Related objects:**\n${grouped}`
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GEMINI ENRICHMENT / FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(question, contextText, mode = 'answer') {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  let prompt = ''

  if (mode === 'refine') {
    prompt = `You are an SAP S/4HANA assistant.

Refine this SAP answer for a consultant.
Rules:
- keep it concise
- do not invent facts
- do not add extra T-codes or tables unless obvious from input
- keep it practical

User question:
${question}

Base answer:
${contextText}

Return only the improved answer.`
  } else {
    prompt = `You are an SAP S/4HANA assistant.

Answer this SAP question.
Rules:
- Be concise and practical
- Mention tables / T-codes only if reasonably confident
- Do NOT invent SAP objects
- If uncertain, say so briefly
- Max 8 bullets or short paragraphs

Question:
${question}

Return only the answer.`
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.2,
        },
      }),
    })

    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. GROQ
// ─────────────────────────────────────────────────────────────────────────────
async function callGroq(systemPrompt, messages, maxTokens = 900) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'Authorization':`Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [{ role:'system', content:systemPrompt }, ...messages],
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Groq error')
  return data.choices?.[0]?.message?.content || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. CLAUDE
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
// 9. CORRECTION MEMORY HOOK (placeholder for future save)
// ─────────────────────────────────────────────────────────────────────────────
function isLikelyCorrection(text = '') {
  const t = text.toLowerCase()
  return (
    t.includes('wrong') ||
    t.includes('no no') ||
    t.includes('not correct') ||
    t.includes('you are wrong') ||
    t.includes('incorrect')
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const { messages, tone='balanced', userName } = req.body
  const lastMsg = messages[messages.length-1]?.content || ''
  const lastAIMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''

  const intent = classifyIntent(lastMsg)
  const complex = isComplexQuestion(lastMsg)
  const ultraSimple = isUltraSimple(lastMsg)
  const correcting = isCorrecting(lastMsg) || isLikelyCorrection(lastMsg)
  const previousClaude = lastAIMsg.includes('_✦ Claude_')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    // ───────────────────────────────────────────────────────────────────────
    // STEP 1 — DB FIRST
    // ───────────────────────────────────────────────────────────────────────
    const ref = await callReferenceSearch(lastMsg)

    if (ref && ref.match && ref.confidence >= 0.55) {
      let answer = ''

      // MULTI OBJECT / MULTI FIELD
      if (ref.matches?.length) {
        if (ref.intent === 'MULTI_FIELD_LOOKUP') {
          answer = `**Relevant fields:**\n\n` +
            ref.matches.slice(0, 6).map(f => `- \`${f.field_name}\` — ${f.short_desc}`).join('\n')
        } else {
          answer = `**Relevant SAP objects:**\n\n` +
            ref.matches.slice(0, 6).map(o => `- \`${o.tech_name}\` — ${o.title}`).join('\n')
        }
      } else {
        const related = await fetchRelated(ref.match)
        answer = formatReferenceAnswer(intent, ref.match, related)
      }

      // DB answer → Gemini refine
      const geminiRefined = await callGemini(lastMsg, answer, 'refine')
      const finalAnswer = guardAnswer(geminiRefined || answer)

      send({ type:'chunk', text: finalAnswer })
      send({ type:'done', model:'reference+gemini', full: finalAnswer })
      return
    }

    // ───────────────────────────────────────────────────────────────────────
    // STEP 2 — GEMINI DIRECT (before Groq / Claude)
    // ───────────────────────────────────────────────────────────────────────
    const shouldTryGeminiFirst =
      intent === 'REFERENCE' ||
      intent === 'FIELD_LOOKUP' ||
      intent === 'COMPARISON' ||
      ultraSimple

    if (shouldTryGeminiFirst) {
      const geminiAnswer = await callGemini(lastMsg, '', 'answer')

      if (geminiAnswer && geminiAnswer.length > 20) {
        const finalAnswer = guardAnswer(geminiAnswer)
        send({ type:'chunk', text: finalAnswer })
        send({ type:'done', model:'gemini', full: finalAnswer })
        return
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // STEP 3 — GROQ (cheap conceptual fallback)
    // ───────────────────────────────────────────────────────────────────────
    const useClaude =
      complex ||
      correcting ||
      previousClaude

    const systemPrompt =
      BASE_SYSTEM_PROMPT +
      (TONE_ADDITIONS[tone] || '') +
      (userName ? `\n\nUser name: ${userName}` : '')

    const { anonymised } = tokenize(messages)

    if (!useClaude && process.env.GROQ_API_KEY) {
      const groqPrompt = systemPrompt + `

You are answering SAP consultant questions.
Rules:
- Be practical and concise
- Do not invent tables / T-codes / Fiori apps
- If unsure, say "check in system" briefly instead of guessing
- Prefer standard SAP explanation`

      const groqAnswer = await callGroq(groqPrompt, anonymised, 900)
      const finalAnswer = guardAnswer(groqAnswer)

      send({ type:'chunk', text: finalAnswer })
      send({ type:'done', model:'groq', full: finalAnswer })
      return
    }

    // ───────────────────────────────────────────────────────────────────────
    // STEP 4 — CLAUDE ONLY LAST
    // ───────────────────────────────────────────────────────────────────────
    if (process.env.ANTHROPIC_API_KEY) {
      const claudePrompt = systemPrompt + `

You are the high-accuracy fallback for difficult SAP consultant questions.
Use deeper reasoning only when needed.
Avoid unnecessary long answers.`

      const claudeAnswer = await callClaude(claudePrompt, anonymised)
      const finalAnswer = guardAnswer(claudeAnswer)

      send({ type:'chunk', text: finalAnswer })
      send({ type:'done', model:'claude', full: finalAnswer })
      return
    }

    send({ type:'error', error:'No model available' })

  } catch (err) {
    send({ type:'error', error: err.message })
  } finally {
    res.end()
  }
}
