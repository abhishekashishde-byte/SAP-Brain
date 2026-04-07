// api/chat.js — v9: Confidence-based Reference Routing + Multi-object + Field-meaning Support + Specialist Fallback

import fetch from 'node-fetch'
import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, isUltraSimple, isCorrecting,
  tokenize, detokenize,
} from './_shared.js'

// ── Reference Search ──────────────────────────────────────────────────────────
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

// ── Gemini enrichment for DB answers ─────────────────────────────────────────
async function enrichReferenceAnswer(refResult, userQuestion) {
  const key = process.env.GEMINI_API_KEY
  if (!key || !refResult?.match) return null

  const prompt = `You are an SAP S/4HANA assistant.
You are given a structured SAP reference result from an internal database.

Your job:
- explain it briefly and clearly
- do NOT change the technical object names
- do NOT invent SAP facts
- do NOT guess if something is unclear
- keep answer concise
- max 6 bullet points or short paragraphs

User Question:
${userQuestion}

Reference Result:
${JSON.stringify(refResult, null, 2)}

Return a concise user-facing answer only.`

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 350, temperature: 0.2 },
      }),
    })

    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

// ── Memory fetch ──────────────────────────────────────────────────────────────
async function fetchMemories(userId, query, mod) {
  if (!process.env.SUPABASE_SERVICE_KEY) return []
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const KEY = process.env.SUPABASE_SERVICE_KEY
    const terms = extractSAPTerms(query)
    if (!terms.length) return []
    const filters = terms.map(t => `fact.ilike.*${encodeURIComponent(t)}*`).join(',')
    const modFilter = mod ? `&module=eq.${encodeURIComponent(mod)}` : ''
    const url = `${SUPABASE_URL}/rest/v1/sap_memories?user_id=eq.${userId}${modFilter}&or=(${filters})&order=created_at.desc&limit=6`
    const res = await fetch(url, { headers:{ 'apikey':KEY, 'Authorization':`Bearer ${KEY}` } })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(r=>r.fact).filter(Boolean) : []
  } catch { return [] }
}

function extractSAPTerms(text) {
  const terms = []
  const tcodes = text.match(/\b([A-Z]{1,4}\d{2,3}N?)\b/g) || []
  terms.push(...tcodes)
  const nouns = [
    'settlement','valuation','refurbish','routing','bom','mrp','capacity',
    'person responsible','functional location','equipment','notification',
    'production version','batch','split valuation','costing','variance'
  ]
  const lower = text.toLowerCase()
  nouns.forEach(n => { if (lower.includes(n)) terms.push(n) })
  return [...new Set(terms)].slice(0,6)
}

// ── Groq call (non-streaming — used for theory + merge) ──────────────────────
async function callGroqDirect(systemPrompt, messages, maxTokens=800) {
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

// ── Gemini Flash call (facts only) ───────────────────────────────────────────
const SAP_ANCHORS = {
  'maintenance order': '**T-codes:** `IW31`, `IW32`, `IW33`, `IW38`\n**Key table:** AUFK, AFIH',
  'production order': '**T-codes:** `CO01`, `CO02`, `CO03`, `COHV`\n**Key table:** AUFK, AFKO, AFPO',
  'purchase order': '**T-codes:** `ME21N`, `ME22N`, `ME23N`, `ME2N`\n**Key table:** EKKO, EKPO',
  'goods receipt': '**T-codes:** `MIGO`, `MB51`\n**Key table:** MKPF, MSEG',
  'material master': '**T-codes:** `MM01`, `MM02`, `MM03`\n**Key table:** MARA, MARC, MARD',
  'bom': '**T-codes:** `CS01`, `CS02`, `CS03`, `CS15`\n**Key table:** MAST, STKO, STPO',
  'routing': '**T-codes:** `CA01`, `CA02`, `CA03`\n**Key table:** PLKO, PLPO',
  'work center': '**T-codes:** `CR01`, `CR02`, `CR03`\n**Key table:** CRHD',
  'functional location': '**T-codes:** `IL01`, `IL02`, `IL03`\n**Key table:** IFLOT',
  'equipment': '**T-codes:** `IE01`, `IE02`, `IE03`\n**Key table:** EQUI, EQKT',
  'notification': '**T-codes:** `IW21`, `IW22`, `IW23`, `IW28`\n**Key table:** QMEL',
  'mrp': '**T-codes:** `MD01`, `MD02`, `MD04`, `MD05`\n**Key table:** MDKP, MDTB',
  'teco': '**T-codes:** `IW32`, `CO02`, `IW38`, `COHV`\n**Status:** TECO = technically complete',
  'goods issue': '**T-codes:** `MIGO`, `MB1A`\n**Key table:** MSEG',
  'settlement': '**T-codes:** `KO88`, `KO8G`\n**Key table:** COBRA, COBRB',
  'production version': '**T-codes:** `C223`, `C220`, `MM02`\n**Key table:** MKAL',
  'sales order': '**T-codes:** `VA01`, `VA02`, `VA03`, `VA05`\n**Key table:** VBAK, VBAP',
  'delivery': '**T-codes:** `VL01N`, `VL02N`, `VL03N`\n**Key table:** LIKP, LIPS',
  'invoice': '**T-codes:** `VF01`, `MIRO`\n**Key table:** VBRK',
  'plant maintenance plan': '**T-codes:** `IP01`, `IP02`, `IP10`, `IP30`\n**Key table:** MPLA',
  'measuring point': '**T-codes:** `IK01`, `IK02`, `IK11`\n**Key table:** IMPTT',
}

function getAnchorFacts(question) {
  const lower = question.toLowerCase()
  let bestMatch = ''
  let bestFacts = ''
  for (const [key, facts] of Object.entries(SAP_ANCHORS)) {
    if (lower.includes(key) && key.length > bestMatch.length) {
      bestMatch = key
      bestFacts = facts
    }
  }
  return bestFacts
}

async function callGeminiFacts(question, context) {
  const key = process.env.GEMINI_API_KEY
  const anchorFacts = getAnchorFacts(question)

  if (!key) return anchorFacts

  const prompt = `You are an SAP S/4HANA facts specialist. For this SAP question provide ONLY:
- The most important T-codes
- Key table names if relevant
- BAdI or user exit names if the question involves enhancement
- Fiori app names only if well-known
- SPRO path if it is a configuration question

IMPORTANT:
- For standard SAP objects ALWAYS include the primary T-codes
- Format as short bullet points with **bold** for T-codes
- Do not write explanations
- Maximum 6 bullet points
- If truly nothing applies, reply: NO_FACTS

SAP Context: ${context}
Question: ${question}`

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
      }),
    })
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

    if (!text || text === 'NO_FACTS') return anchorFacts
    return text
  } catch {
    return anchorFacts
  }
}

// ── Groq merge ────────────────────────────────────────────────────────────────
async function mergeWithGroq(theoryAnswer, factsAnswer, userName) {
  const nameNote = userName ? `Address the user as ${userName} naturally if appropriate.` : ''
  const mergePrompt = `You will receive two parts of an SAP answer:
PART 1: Theory/explanation
PART 2: Specific facts — T-codes, tables, app names

Combine them into ONE clean answer.

RULES:
- Only include facts from Part 2 that are directly relevant
- Ignore irrelevant facts
- Do NOT add any new information
- Do NOT invent any T-codes, app names or table names
- Keep the combined answer concise
- Use **bold** for T-codes and key terms
- ${nameNote}
- Output only the final merged answer`

  const userMsg = `PART 1 (Theory):\n${theoryAnswer}\n\nPART 2 (Facts):\n${factsAnswer}`
  return callGroqDirect(mergePrompt, [{ role:'user', content:userMsg }], 600)
}

// ── Claude streaming ──────────────────────────────────────────────────────────
async function streamClaude(systemPrompt, anonymised, map, send) {
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      stream: true,
      system: systemPrompt,
      messages: anonymised,
    }),
  })
  if (!claudeRes.ok) {
    const err = await claudeRes.json()
    throw new Error(err?.error?.message || 'Claude error')
  }
  let fullText = ''
  const reader = claudeRes.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream:true })
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (raw === '[DONE]') continue
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          const chunk = evt.delta.text
          fullText += chunk
          send({ type:'chunk', text: detokenize(chunk, map) })
        }
      } catch {}
    }
  }
  return detokenize(fullText, map)
}

// ── Groq streaming ────────────────────────────────────────────────────────────
async function streamGroq(systemPrompt, anonymised, map, send) {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'Authorization':`Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 800,
      temperature: 0.2,
      stream: true,
      messages: [{ role:'system', content:systemPrompt }, ...anonymised],
    }),
  })
  if (!groqRes.ok) {
    const err = await groqRes.json()
    throw new Error(err?.error?.message || 'Groq error')
  }
  let fullText = ''
  const reader = groqRes.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream:true })
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (raw === '[DONE]') continue
      try {
        const evt = JSON.parse(raw)
        const chunk = evt.choices?.[0]?.delta?.content
        if (chunk) {
          fullText += chunk
          send({ type:'chunk', text: detokenize(chunk, map) })
        }
      } catch {}
    }
  }
  return detokenize(fullText, map)
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const { messages, module: mod, topic, tone='balanced', userId, userName } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error:'Invalid body' })

  const lastMsg = messages[messages.length-1]?.content || ''
  const lastAIMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
  const convDepth = messages.length
  const previousClaude = lastAIMsg.includes('_✦ Claude_')
  const userCorrecting = isCorrecting(lastMsg)
  const complex = isComplexQuestion(lastMsg)
  const ultraSimple = isUltraSimple(lastMsg)

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  const keepalive = setInterval(() => res.write(': ping\n\n'), 15000)

  try {
    // ── 1) Reference DB First ───────────────────────────────────────────────
    const refResult = await callReferenceSearch(lastMsg)

    if (refResult && refResult.match && refResult.confidence >= 0.55) {
      // MULTI OBJECT LOOKUP
      if (refResult.intent === 'MULTI_OBJECT_LOOKUP' && refResult.matches?.length) {
        const enrichedAnswer = await enrichReferenceAnswer(refResult, lastMsg)

        if (enrichedAnswer) {
          send({ type:'chunk', text: enrichedAnswer })
          send({ type:'done', model:'reference+gemini', full: enrichedAnswer })
          return
        }

        const lines = refResult.matches
          .slice(0, 5)
          .map(o => `- \`${o.tech_name}\` — ${o.title}`)
          .join('\n')

        const answer = `I found multiple relevant SAP objects:\n\n${lines}`

        send({ type:'chunk', text: answer })
        send({ type:'done', model:'reference', full: answer })
        return
      }

      // MULTI FIELD LOOKUP
      if (refResult.intent === 'MULTI_FIELD_LOOKUP' && refResult.matches?.length) {
        const enrichedAnswer = await enrichReferenceAnswer(refResult, lastMsg)

        if (enrichedAnswer) {
          send({ type:'chunk', text: enrichedAnswer })
          send({ type:'done', model:'reference+gemini', full: enrichedAnswer })
          return
        }

        const lines = refResult.matches
          .slice(0, 5)
          .map(f => `- \`${f.field_name}\` — ${f.short_desc}`)
          .join('\n')

        const answer = `I found multiple relevant fields:\n\n${lines}`

        send({ type:'chunk', text: answer })
        send({ type:'done', model:'reference', full: answer })
        return
      }

      const enrichedAnswer = await enrichReferenceAnswer(refResult, lastMsg)

      if (refResult.should_answer_directly) {
        if (enrichedAnswer) {
          send({ type:'chunk', text: enrichedAnswer })
          send({ type:'done', model:'reference+gemini', full: enrichedAnswer })
          return
        }
      }

      if (refResult.should_enrich_with_gemini) {
        if (enrichedAnswer) {
          send({ type:'chunk', text: enrichedAnswer })
          send({ type:'done', model:'reference+gemini', full: enrichedAnswer })
          return
        }
      }

      // Fallback if Gemini enrichment fails
      if (refResult.intent === 'FIELD_LOOKUP' || refResult.intent === 'FIELD_MEANING_LOOKUP') {
        const f = refResult.match
        let answer = `**Field:** \`${f.field_name}\`
**Table:** \`${f.table_name}\`
**Meaning:** ${f.short_desc}`

        if (f.common_meaning) answer += `\n\n${f.common_meaning}`

        send({ type:'chunk', text: answer })
        send({ type:'done', model:'reference', full: answer })
        return
      }

      if (refResult.intent === 'OBJECT_LOOKUP' || refResult.intent === 'TECH_NAME_LOOKUP') {
        const o = refResult.match
        let answer = `**${o.object_type}:** \`${o.tech_name}\`
**${o.title}**
${o.short_desc || ''}`

        send({ type:'chunk', text: answer })
        send({ type:'done', model:'reference', full: answer })
        return
      }
    }

    // ── Routing decision ────────────────────────────────────────────────────
    const useClaude = complex || userCorrecting || previousClaude || convDepth > 8

    let systemPrompt = BASE_SYSTEM_PROMPT
    if (userName) {
      systemPrompt += `\n\nUSER NAME: The user's name is ${userName}. Address them by name occasionally — naturally, max once per response.`
    }
    systemPrompt += TONE_ADDITIONS[tone] || TONE_ADDITIONS.balanced

    if (userId) {
      const memories = await fetchMemories(userId, lastMsg, mod)
      if (memories.length) {
        systemPrompt += `\n\nRELEVANT FACTS FROM PAST CONVERSATIONS:\n${memories.map((f,i)=>`${i+1}. ${f}`).join('\n')}`
      }
    }

    const MODULE_HINTS = {
      'pp': 'PP – Production Planning', 'production': 'PP – Production Planning',
      'pm': 'PM – Plant Maintenance', 'maintenance': 'PM – Plant Maintenance',
      'mm': 'MM – Logistics', 'logistics': 'MM – Logistics', 'purchase': 'MM – Logistics',
      'fiori': 'Fiori / UX', 'launchpad': 'Fiori / UX',
      's/4': 'S/4HANA General', 's4hana': 'S/4HANA General',
    }

    const lastMsgLower = lastMsg.toLowerCase()
    let effectiveMod = mod
    for (const [hint, moduleName] of Object.entries(MODULE_HINTS)) {
      if (lastMsgLower.includes(hint) && moduleName !== mod) {
        effectiveMod = moduleName
        break
      }
    }

    const withContext = messages.map((m,i) =>
      i===messages.length-1 && m.role==='user'
        ? { ...m, content:`SAP context: module="${effectiveMod||'General'}", topic="${topic||'General'}"\n\n${m.content}` }
        : m
    )

    const { anonymised, map } = tokenize(withContext)

    // ── 2) Claude for complex / corrections / follow-ups ───────────────────
    if (useClaude && process.env.ANTHROPIC_API_KEY) {
      const full = await streamClaude(systemPrompt, anonymised, map, send)
      send({ type:'done', model:'claude', full })
      return
    }

    // ── 3) Ultra-simple → Groq direct ──────────────────────────────────────
    if (ultraSimple && process.env.GROQ_API_KEY) {
      const groqPrompt = systemPrompt + '\n\nFor this simple question: give a clear, concise answer. Include T-codes only if you are 100% certain they are correct.'
      const full = await streamGroq(groqPrompt, anonymised, map, send)
      send({ type:'done', model:'groq', full })
      return
    }

    // ── 4) Groq theory + Gemini facts → merge ──────────────────────────────
    if (process.env.GROQ_API_KEY) {
      const groqTheoryPrompt = systemPrompt + `

IMPORTANT FOR THIS RESPONSE:
- Explain the concept, process, and context clearly
- Do NOT include specific T-codes, table names, BAdI names, or Fiori app names — those will be added separately
- Focus on the "what" and "why"
- Keep explanation clear and conversational`

      const contextStr = `module="${mod||'General'}", topic="${topic||'General'}"`

      const [theoryAnswer, factsAnswer] = await Promise.all([
        callGroqDirect(groqTheoryPrompt, anonymised, 700),
        callGeminiFacts(lastMsg, contextStr),
      ])

      let finalAnswer = ''

      if (factsAnswer && factsAnswer.length > 10) {
        finalAnswer = await mergeWithGroq(theoryAnswer, factsAnswer, userName)
      } else {
        finalAnswer = theoryAnswer
      }

      const words = finalAnswer.split(' ')
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? '' : ' ') + words[i]
        send({ type:'chunk', text: detokenize(chunk, map) })
        await new Promise(r => setTimeout(r, 15))
      }

      send({ type:'done', model:'specialist', full: detokenize(finalAnswer, map) })
      return
    }

    send({ type:'error', error:'No API keys configured' })

  } catch (err) {
    send({ type:'error', error: err.message })
  } finally {
    clearInterval(keepalive)
    res.end()
  }
}
