// api/chat.js — v18 DEBUG ROUTING
// DB first + Gemini refine + Groq explanation/merge + Claude only last
// NO validator
// DEBUG logs added so we can see why Claude is being used

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, isCorrecting,
  tokenize,
} from './_shared.js'

function classifyIntent(q = '') {
  const text = q.toLowerCase()

  if (
    text.match(/\btable\b|\btcode\b|\bfiori\b|\bapp\b|\bfield\b|\bstores\b|\bwhere is\b|\bwhich table\b|\bwhich tcode\b|\bwhich app\b/)
  ) return 'REFERENCE'

  if (text.match(/\bdifference\b|\bvs\b|\bcompare\b/)) return 'COMPARISON'
  if (text.match(/\bconfig\b|\bspro\b|\bsetting\b|\bcustomizing\b/)) return 'CONFIG'
  if (text.match(/\berror\b|\bdump\b|\bissue\b|\bnot working\b/)) return 'DEBUG'
  if (text.match(/\bhow\b|\bprocess\b|\bflow\b|\bwhat is\b/)) return 'PROCESS'

  return 'GENERAL'
}

function withSource(answer, sourceLabel) {
  if (!answer) return `_✦ ${sourceLabel}_`
  return `${answer.trim()}\n\n_✦ ${sourceLabel}_`
}

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
  } catch (err) {
    console.error('REFERENCE SEARCH ERROR:', err.message)
    return null
  }
}

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
  } catch (err) {
    console.error('FETCH RELATED ERROR:', err.message)
    return []
  }
}

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

function guardAnswer(answer) {
  if (!answer) return answer
  return answer.trim()
}

async function callGroq(systemPrompt, messages, maxTokens = 700) {
  if (!process.env.GROQ_API_KEY) {
    console.log('GROQ SKIPPED: no API key')
    return null
  }

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
    if (!res.ok) {
      console.error('GROQ ERROR:', data)
      return null
    }

    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (err) {
    console.error('GROQ CALL ERROR:', err.message)
    return null
  }
}

async function callGemini(promptText, maxOutputTokens = 400) {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.log('GEMINI SKIPPED: no API key')
    return null
  }

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
  } catch (err) {
    console.error('GEMINI CALL ERROR:', err.message)
    return null
  }
}

async function callClaude(systemPrompt, messages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('CLAUDE SKIPPED: no API key')
    return null
  }

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
  } catch (err) {
    console.error('CLAUDE CALL ERROR:', err.message)
    return null
  }
}

async function groqExplainOnly(question) {
  const prompt = `You are writing ONLY the high-level conceptual explanation for an SAP question.

CRITICAL RULES:
- Explain only the concept in plain SAP consultant language
- Do NOT give T-codes
- Do NOT give table names
- Do NOT give Fiori app names
- Do NOT invent SAP facts
- Keep it concise

Question:
${question}

Return only the explanation.`

  return await callGroq(prompt, [{ role: 'user', content: question }], 350)
}

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
${question}`

  const out = await callGemini(prompt, 250)
  if (!out || out.trim() === 'NO_NUANCE') return null
  return out
}

async function geminiLookup(question) {
  const prompt = `You are an SAP lookup assistant.

User is asking for a SAP object like table / field / tcode.

CRITICAL RULES:
- Answer directly with correct SAP objects
- Prefer standard SAP tables like T001L, MARD, EQUI, AUFK, AFKO, MKAL etc.
- If multiple answers possible, list them clearly
- Do NOT explain concepts
- Do NOT hallucinate
- If unsure, say exactly: NOT_FOUND

Question:
${question}`

  const out = await callGemini(prompt, 220)
  if (!out || out.includes('NOT_FOUND')) return null
  return out
}

async function groqStrictMerge(question, explanation, dbFacts, nuance) {
  const mergePrompt = `You are a formatter that merges SAP answer parts.

CRITICAL RULES:
- Use ONLY the information provided
- Do NOT add any new SAP facts
- Do NOT invent T-codes, tables, Fiori apps, statuses, options, or fields
- Keep the answer concise and consultant-friendly
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

export default async function handler(req, res) {
  console.log('WANI CHAT VERSION = V18 DEBUG')

  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const { messages, tone='balanced', userName, userId, module, topic } = req.body
  const lastMsg = messages[messages.length-1]?.content || ''
  const lastAIMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''

  console.log('QUESTION:', lastMsg)

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
  const isStrictLookup = ['REFERENCE', 'FIELD_LOOKUP', 'COMPARISON'].includes(intent)

  console.log('ROUTING:', { intent, complex, correcting, previousClaude, isStrictLookup })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    const ref = await callReferenceSearch(lastMsg)
    console.log('REFERENCE SEARCH RESULT:', JSON.stringify(ref))

    let dbAnswer = null
    let dbHit = false

    if (ref && ref.confidence >= 0.45 && (ref.match || (ref.matches && ref.matches.length))) {
      dbHit = true

      if (ref.matches?.length) {
        if (ref.intent === 'MULTI_FIELD_LOOKUP') {
          dbAnswer = `**Relevant fields:**\n\n` +
            ref.matches.slice(0, 6).map(f => `- \`${f.field_name}\` — ${f.short_desc}`).join('\n')
        } else {
          dbAnswer = `**Relevant SAP objects:**\n\n` +
            ref.matches.slice(0, 6).map(o => `- \`${o.tech_name}\` — ${o.title || o.short_desc || ''}`).join('\n')
        }
      } else if (ref.match) {
        const related = await fetchRelated(ref.match)
        dbAnswer = formatReferenceAnswer(intent, ref.match, related)
      }
    }

    console.log('DB HIT:', dbHit)
    console.log('DB ANSWER:', dbAnswer)

    if (isStrictLookup) {
      if (dbHit && dbAnswer) {
        console.log('PATH USED: DATABASE')
        const refined = await callGemini(`Refine this SAP answer for consultant readability. Do not add new facts.\n\n${dbAnswer}`, 260)
        const finalAnswer = guardAnswer(refined || dbAnswer)
        const source = refined ? 'Database + Gemini' : 'Database'
        const output = withSource(finalAnswer, source)

        send({ type:'chunk', text: output })
        send({ type:'done', model:'db+gemini', full: output })
        return
      }

      const lookupAnswer = await geminiLookup(lastMsg)
      console.log('GEMINI LOOKUP:', lookupAnswer)

      if (lookupAnswer) {
        console.log('PATH USED: GEMINI LOOKUP')
        const output = withSource(guardAnswer(lookupAnswer), 'Gemini')
        send({ type:'chunk', text: output })
        send({ type:'done', model:'gemini', full: output })
        return
      }
    }

    const shouldUseCheapPipeline =
      !complex &&
      !correcting &&
      !previousClaude &&
      !isStrictLookup

    console.log('SHOULD USE CHEAP PIPELINE:', shouldUseCheapPipeline)

    if (shouldUseCheapPipeline) {
      const [explanation, nuance] = await Promise.all([
        groqExplainOnly(lastMsg),
        geminiNuance(lastMsg),
      ])

      console.log('GROQ EXPLANATION:', explanation)
      console.log('GEMINI NUANCE:', nuance)

      if (dbHit && dbAnswer) {
        console.log('PATH USED: GROQ + DB + GEMINI')
        const merged = await groqStrictMerge(lastMsg, explanation, dbAnswer, nuance)
        const finalAnswer = guardAnswer(merged || `${explanation || ''}\n\n${dbAnswer || ''}\n\n${nuance || ''}`)
        const output = withSource(finalAnswer, 'Groq + Database + Gemini')

        send({ type:'chunk', text: output })
        send({ type:'done', model:'groq+db+gemini', full: output })
        return
      }

      if (explanation || nuance) {
        console.log('PATH USED: GROQ + GEMINI')
        const merged = await groqStrictMerge(lastMsg, explanation, '', nuance)
        const finalAnswer = guardAnswer(merged || `${explanation || ''}\n\n${nuance || ''}`)

        if (finalAnswer && finalAnswer.length > 20) {
          const source = nuance ? 'Groq + Gemini' : 'Groq'
          const output = withSource(finalAnswer, source)

          send({ type:'chunk', text: output })
          send({ type:'done', model:'groq+gemini', full: output })
          return
        }
      }
    }

    console.log('PATH USED: CLAUDE FALLBACK')

    const systemPrompt =
      BASE_SYSTEM_PROMPT +
      (TONE_ADDITIONS[tone] || '') +
      (userName ? `\n\nUser name: ${userName}` : '')

    const { anonymised } = tokenize(messages)

    const claudePrompt = systemPrompt + `

You are the high-accuracy fallback for difficult SAP consultant questions.
Use deeper reasoning only when needed.
Avoid unnecessary long answers.

IMPORTANT:
- If user is asking a lookup-style SAP question, answer directly and specifically.
- Do NOT drift into generic definitions if the user is clearly asking for a table / field / object.`

    const claudeAnswer = await callClaude(claudePrompt, anonymised)

    if (claudeAnswer) {
      const output = withSource(guardAnswer(claudeAnswer), 'Claude')
      send({ type:'chunk', text: output })
      send({ type:'done', model:'claude', full: output })
      return
    }

    send({ type:'error', error:'No model available' })

  } catch (err) {
    console.error('CHAT HANDLER ERROR:', err)
    send({ type:'error', error: err.message })
  } finally {
    res.end()
  }
}
