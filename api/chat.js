// api/chat.js — v12: DB + Groq + Gemini + Groq Merge + Claude fallback + source label always

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, isUltraSimple, isCorrecting,
  tokenize,
} from './_shared.js'

// ─────────────────────────────────────────────────────────────────────────────
// 1. INTENT CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────
function classifyIntent(q = '') {
  const text = q.toLowerCase()

  if (text.match(/\bfield\b|\bstores\b|\bwhere is\b/)) return 'FIELD_LOOKUP'
  if (text.match(/\bdifference\b|\bvs\b|\bcompare\b/)) return 'COMPARISON'
  if (text.match(/\bconfig\b|\bspro\b|\bsetting\b|\bcustomizing\b/)) return 'CONFIG'
  if (text.match(/\berror\b|\bdump\b|\bissue\b|\bnot working\b/)) return 'DEBUG'
  if (text.match(/\bhow\b|\bprocess\b|\bflow\b|\bwhat is\b/)) return 'PROCESS'
  if (text.match(/\btable\b|\btcode\b|\bfiori\b|\bapp\b/)) return 'REFERENCE'

  return 'GENERAL'
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SOURCE LABEL HELPER
// ─────────────────────────────────────────────────────────────────────────────
function withSource(answer, sourceLabel) {
  if (!answer) return `_✦ ${sourceLabel}_`
  return `${answer.trim()}\n\n_✦ ${sourceLabel}_`
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REFERENCE SEARCH
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
// 4. RELATED OBJECT EXPANSION
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
// 5. FORMAT DB OUTPUT
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
// 6. HALLUCINATION GUARD
// ─────────────────────────────────────────────────────────────────────────────
function guardAnswer(answer) {
  if (!answer) return answer

  let cleaned = answer

  // basic cleanup only
  if (cleaned.includes('Z_') || cleaned.includes('Custom app')) {
    cleaned = cleaned.replace(/Z_\w+/g, '[custom object]')
  }

  return cleaned.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. GROQ CALL
// ─────────────────────────────────────────────────────────────────────────────
async function callGroq(systemPrompt, messages, maxTokens = 700) {
  if (!process.env.GROQ_API_KEY) return null

  try {
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
    if (!res.ok) return null
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. GEMINI CALL
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(promptText, maxOutputTokens = 400) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          maxOutputTokens,
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
// 9. CLAUDE CALL
// ─────────────────────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, messages) {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
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
    return data.content?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. GROQ EXPLANATION LAYER (SAFE USE)
// ─────────────────────────────────────────────────────────────────────────────
async function groqExplainOnly(question) {
  const prompt = `You are writing ONLY the high-level conceptual explanation for an SAP question.

CRITICAL RULES:
- Explain only the concept in plain SAP consultant language
- Do NOT give T-codes
- Do NOT give table names
- Do NOT give Fiori app names
- Do NOT invent SAP facts
- Keep it concise
- Max 5 bullets or short paragraphs

Question:
${question}

Return only the explanation.`

  return await callGroq(prompt, [{ role: 'user', content: question }], 350)
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. GEMINI NUANCE LAYER
// ─────────────────────────────────────────────────────────────────────────────
async function geminiNuance(question) {
  const prompt = `You are an SAP S/4HANA assistant.

Provide only useful practical SAP nuance for this question.

CRITICAL RULES:
- Do NOT explain the full concept
- Do NOT repeat generic definition
- Focus only on practical options / caveats / system behavior
- Mention T-codes or tables only if reasonably confident
- If nothing useful, reply exactly: NO_NUANCE
- Keep it short

Question:
${question}

Return only the nuance.`

  const out = await callGemini(prompt, 250)
  if (!out || out.trim() === 'NO_NUANCE') return null
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. GROQ STRICT MERGE (SAFE)
// ─────────────────────────────────────────────────────────────────────────────
async function groqStrictMerge(question, explanation, dbFacts, nuance) {
  const mergePrompt = `You are a formatter that merges SAP answer parts.

CRITICAL RULES:
- Use ONLY the information provided
- Do NOT add any new SAP facts
- Do NOT invent T-codes, tables, Fiori apps, statuses, options, or fields
- If something is missing, ignore it
- Do NOT guess
- Keep the answer concise and consultant-friendly
- Structure naturally
- Output only the final merged answer

User question:
${question}

PART 1 — Explanation:
${explanation || ''}

PART 2 — Structured DB Facts:
${dbFacts || ''}

PART 3 — Practical Nuance:
${nuance || ''}`

  return await callGroq(mergePrompt, [{ role: 'user', content: question }], 500)
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
  const correcting = isCorrecting(lastMsg)
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

    let dbAnswer = null
    let dbHit = false

    if (ref && ref.match && ref.confidence >= 0.55) {
      dbHit = true

      if (ref.matches?.length) {
        if (ref.intent === 'MULTI_FIELD_LOOKUP') {
          dbAnswer = `**Relevant fields:**\n\n` +
            ref.matches.slice(0, 6).map(f => `- \`${f.field_name}\` — ${f.short_desc}`).join('\n')
        } else {
          dbAnswer = `**Relevant SAP objects:**\n\n` +
            ref.matches.slice(0, 6).map(o => `- \`${o.tech_name}\` — ${o.title}`).join('\n')
        }
      } else {
        const related = await fetchRelated(ref.match)
        dbAnswer = formatReferenceAnswer(intent, ref.match, related)
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // STEP 2 — SIMPLE / MID SAP QUESTIONS
    // DB + Groq + Gemini + Groq merge
    // ───────────────────────────────────────────────────────────────────────
    const shouldUseCheapPipeline =
      !complex &&
      !correcting &&
      !previousClaude

    if (shouldUseCheapPipeline) {
      const [explanation, nuance] = await Promise.all([
        groqExplainOnly(lastMsg),
        geminiNuance(lastMsg),
      ])

      // If DB exists, merge all 3
      if (dbHit && dbAnswer) {
        const merged = await groqStrictMerge(lastMsg, explanation, dbAnswer, nuance)
        const finalAnswer = guardAnswer(merged || `${explanation || ''}\n\n${dbAnswer || ''}\n\n${nuance || ''}`)

        send({ type:'chunk', text: withSource(finalAnswer, 'Groq + Database + Gemini') })
        send({ type:'done', model:'groq+db+gemini', full: withSource(finalAnswer, 'Groq + Database + Gemini') })
        return
      }

      // No DB but Gemini has enough
      if (!dbHit && (explanation || nuance)) {
        const merged = await groqStrictMerge(lastMsg, explanation, '', nuance)
        const finalAnswer = guardAnswer(merged || `${explanation || ''}\n\n${nuance || ''}`)

        if (finalAnswer && finalAnswer.length > 20) {
          send({ type:'chunk', text: withSource(finalAnswer, nuance ? 'Groq + Gemini' : 'Groq') })
          send({ type:'done', model:'groq+gemini', full: withSource(finalAnswer, nuance ? 'Groq + Gemini' : 'Groq') })
          return
        }
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // STEP 3 — DB + Gemini direct fallback
    // ───────────────────────────────────────────────────────────────────────
    if (dbHit && dbAnswer) {
      const refined = await callGemini(`Refine this SAP answer for consultant readability. Do not add new facts.\n\n${dbAnswer}`, 300)
      const finalAnswer = guardAnswer(refined || dbAnswer)

      send({ type:'chunk', text: withSource(finalAnswer, refined ? 'Database + Gemini' : 'Database') })
      send({ type:'done', model:'db+gemini', full: withSource(finalAnswer, refined ? 'Database + Gemini' : 'Database') })
      return
    }

    // ───────────────────────────────────────────────────────────────────────
    // STEP 4 — Claude only last
    // ───────────────────────────────────────────────────────────────────────
    const systemPrompt =
      BASE_SYSTEM_PROMPT +
      (TONE_ADDITIONS[tone] || '') +
      (userName ? `\n\nUser name: ${userName}` : '')

    const { anonymised } = tokenize(messages)

    const claudePrompt = systemPrompt + `

You are the high-accuracy fallback for difficult SAP consultant questions.
Use deeper reasoning only when needed.
Avoid unnecessary long answers.`

    const claudeAnswer = await callClaude(claudePrompt, anonymised)

    if (claudeAnswer) {
      const finalAnswer = guardAnswer(claudeAnswer)
      send({ type:'chunk', text: withSource(finalAnswer, 'Claude') })
      send({ type:'done', model:'claude', full: withSource(finalAnswer, 'Claude') })
      return
    }

    send({ type:'error', error:'No model available' })

  } catch (err) {
    send({ type:'error', error: err.message })
  } finally {
    res.end()
  }
}
