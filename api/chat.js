// api/chat.js — v14 FULL: DB + Groq + Gemini + Groq Merge + Claude fallback + source label + fact validator + correction memory

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, isCorrecting,
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
// 6. BASIC CLEANUP
// ─────────────────────────────────────────────────────────────────────────────
function guardAnswer(answer) {
  if (!answer) return answer

  let cleaned = answer

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
// 13. FACT VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────
function extractTcodes(text = '') {
  const matches = text.match(/\b[A-Z]{1,4}\d{2,3}N?\b/g) || []
  return [...new Set(matches)]
}

function extractTableNames(text = '') {
  const matches = text.match(/\b[A-Z][A-Z0-9_]{2,9}\b/g) || []
  const blacklist = new Set([
    'SAP','S4','S4HANA','ERP','PP','PM','MM','SD','FI','CO','QM','WM','EWM',
    'BOM','MRP','FICO','ABAP','API','UI','APP','DB','RFC','BADI','IMG','SPRO',
    'TECO','CLSD','CRUD','JSON','HTTP','HTTPS'
  ])

  return [...new Set(matches.filter(x => !blacklist.has(x)))]
}

async function validateTcodes(tcodes = []) {
  if (!tcodes.length) return new Set()

  try {
    const encoded = tcodes.map(x => `"${x}"`).join(',')
    const url = `${process.env.SUPABASE_URL}/rest/v1/sap_objects?object_type=eq.TCODE&tech_name=in.(${encoded})&select=tech_name`

    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })

    const data = await res.json()
    return new Set((data || []).map(x => x.tech_name))
  } catch {
    return new Set()
  }
}

async function validateTables(tables = []) {
  if (!tables.length) return new Set()

  try {
    const encoded = tables.map(x => `"${x}"`).join(',')
    const url = `${process.env.SUPABASE_URL}/rest/v1/sap_objects?object_type=eq.TABLE&tech_name=in.(${encoded})&select=tech_name`

    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })

    const data = await res.json()
    return new Set((data || []).map(x => x.tech_name))
  } catch {
    return new Set()
  }
}

async function validateAndCleanAnswer(answer) {
  if (!answer) return answer

  let cleaned = answer

  const tcodes = extractTcodes(answer)
  const tables = extractTableNames(answer)

  const [validTcodes, validTables] = await Promise.all([
    validateTcodes(tcodes),
    validateTables(tables),
  ])

  for (const tcode of tcodes) {
    if (!validTcodes.has(tcode)) {
      const regex = new RegExp(`\\b${tcode}\\b`, 'g')
      cleaned = cleaned.replace(regex, '[unverified]')
    }
  }

  for (const table of tables) {
    if (!validTables.has(table)) {
      const regex = new RegExp(`\\b${table}\\b`, 'g')
      cleaned = cleaned.replace(regex, '[unverified]')
    }
  }

  cleaned = cleaned
    .replace(/\[unverified\](,\s*\[unverified\])+/g, '[unverified]')
    .replace(/\(\s*\[unverified\]\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')

  return cleaned.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. CORRECTION MEMORY SAVE
// ─────────────────────────────────────────────────────────────────────────────
function isCorrectionMessage(text = '') {
  const t = text.toLowerCase()

  return (
    t.includes('wrong') ||
    t.includes('not correct') ||
    t.includes('incorrect') ||
    t.includes('no no') ||
    t.includes('i asked for') ||
    t.includes('i meant') ||
    t.includes('not this') ||
    t.includes('that is not what i asked')
  )
}

async function saveCorrectionMemory({ userId, module, topic, userMessage, previousAnswer }) {
  try {
    if (!userId || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) return

    const fact = `User correction: ${userMessage}. Previous assistant answer was: ${previousAnswer || 'N/A'}`

    await fetch(`${process.env.SUPABASE_URL}/rest/v1/sap_memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        module: module || 'General',
        topic: topic || 'Corrections',
        fact,
      }),
    })
  } catch (err) {
    console.error('saveCorrectionMemory error:', err.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const { messages, tone='balanced', userName, userId, module, topic } = req.body
  const lastMsg = messages[messages.length-1]?.content || ''
  const lastAIMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''

  const previousAssistantMessage =
    [...messages].reverse().find((m, idx) => m.role === 'assistant' && idx > 0)?.content || lastAIMsg

  if (isCorrectionMessage(lastMsg)) {
    await saveCorrectionMemory({
      userId,
      module,
      topic,
      userMessage: lastMsg,
      previousAnswer: previousAssistantMessage,
    })
  }

  const intent = classifyIntent(lastMsg)
  const complex = isComplexQuestion(lastMsg)
  const correcting = isCorrecting(lastMsg)
  const previousClaude = lastAIMsg.includes('_✦ Claude_')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    // STEP 1 — DB FIRST
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

    // STEP 2 — CHEAP PIPELINE
    const shouldUseCheapPipeline =
      !complex &&
      !correcting &&
      !previousClaude

    if (shouldUseCheapPipeline) {
      const [explanation, nuance] = await Promise.all([
        groqExplainOnly(lastMsg),
        geminiNuance(lastMsg),
      ])

      if (dbHit && dbAnswer) {
        const merged = await groqStrictMerge(lastMsg, explanation, dbAnswer, nuance)
        let finalAnswer = guardAnswer(merged || `${explanation || ''}\n\n${dbAnswer || ''}\n\n${nuance || ''}`)
        finalAnswer = await validateAndCleanAnswer(finalAnswer)

        const output = withSource(finalAnswer, 'Groq + Database + Gemini')
        send({ type:'chunk', text: output })
        send({ type:'done', model:'groq+db+gemini', full: output })
        return
      }

      if (!dbHit && (explanation || nuance)) {
        const merged = await groqStrictMerge(lastMsg, explanation, '', nuance)
        let finalAnswer = guardAnswer(merged || `${explanation || ''}\n\n${nuance || ''}`)
        finalAnswer = await validateAndCleanAnswer(finalAnswer)

        if (finalAnswer && finalAnswer.length > 20) {
          const source = nuance ? 'Groq + Gemini' : 'Groq'
          const output = withSource(finalAnswer, source)
          send({ type:'chunk', text: output })
          send({ type:'done', model:'groq+gemini', full: output })
          return
        }
      }
    }

    // STEP 3 — DB + Gemini direct fallback
    if (dbHit && dbAnswer) {
      const refined = await callGemini(`Refine this SAP answer for consultant readability. Do not add new facts.\n\n${dbAnswer}`, 300)
      let finalAnswer = guardAnswer(refined || dbAnswer)
      finalAnswer = await validateAndCleanAnswer(finalAnswer)

      const source = refined ? 'Database + Gemini' : 'Database'
      const output = withSource(finalAnswer, source)

      send({ type:'chunk', text: output })
      send({ type:'done', model:'db+gemini', full: output })
      return
    }

    // STEP 4 — Claude only last
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
      let finalAnswer = guardAnswer(claudeAnswer)
      finalAnswer = await validateAndCleanAnswer(finalAnswer)

      const output = withSource(finalAnswer, 'Claude')
      send({ type:'chunk', text: output })
      send({ type:'done', model:'claude', full: output })
      return
    }

    send({ type:'error', error:'No model available' })

  } catch (err) {
    send({ type:'error', error: err.message })
  } finally {
    res.end()
  }
}
