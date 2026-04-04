// api/chat.js — v4: Parallel Specialist Architecture
// Groq (theory) + Gemini (facts) run in parallel → Groq merges → user gets best of both
// Claude handles complex questions directly (BAdI, debug, config, integration)

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, isUltraSimple, isCorrecting,
  tokenize, detokenize,
} from './_shared.js'

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
  const nouns = ['settlement','valuation','refurbish','routing','bom','mrp','capacity',
    'person responsible','functional location','equipment','notification',
    'production version','batch','split valuation','costing','variance']
  const lower = text.toLowerCase()
  nouns.forEach(n => { if (lower.includes(n)) terms.push(n) })
  return [...new Set(terms)].slice(0,6)
}

// ── Groq call (non-streaming — used for theory + merge) ──────────────────────
async function callGroqDirect(systemPrompt, messages, maxTokens=800) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.GROQ_API_KEY}` },
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
// SAP knowledge anchors — Gemini fallback for well-known T-codes
const SAP_ANCHORS = {
  'maintenance order': '**T-codes:** `IW31` (create), `IW32` (change), `IW33` (display), `IW38` (mass change)\n**Order types:** PM01 (corrective), PM03 (inspection), PM04 (refurbishment) — exact types depend on implementation\n**Key table:** AUFK (order header)',
  'production order': '**T-codes:** `CO01` (create), `CO02` (change), `CO03` (display), `COHV` (mass processing)\n**Key table:** AUFK (order header), AFKO (order header PP)',
  'purchase order': '**T-codes:** `ME21N` (create), `ME22N` (change), `ME23N` (display), `ME2N` (list)\n**Key table:** EKKO (header), EKPO (item)',
  'goods receipt': '**T-codes:** `MIGO` (goods movement), `MB51` (material document list)\n**Key table:** MKPF (header), MSEG (item)',
  'material master': '**T-codes:** `MM01` (create), `MM02` (change), `MM03` (display), `MM60` (where-used)\n**Key table:** MARA (general), MARC (plant), MARD (storage location)',
  'bom': '**T-codes:** `CS01` (create), `CS02` (change), `CS03` (display), `CS15` (where-used)\n**Key table:** MAST, STKO, STPO',
  'routing': '**T-codes:** `CA01` (create), `CA02` (change), `CA03` (display)\n**Key table:** PLKO (header), PLPO (operations)',
  'work center': '**T-codes:** `CR01` (create), `CR02` (change), `CR03` (display)\n**Key table:** CRHD',
  'functional location': '**T-codes:** `IL01` (create), `IL02` (change), `IL03` (display)\n**Key table:** IFLOT',
  'equipment': '**T-codes:** `IE01` (create), `IE02` (change), `IE03` (display)\n**Key table:** EQUI, EQUZ',
  'notification': '**T-codes:** `IW21` (create PM), `IW22` (change), `IW23` (display), `IW28` (list)\n**Key table:** QMEL',
  'mrp': '**T-codes:** `MD01` (run), `MD02` (single item), `MD04` (stock/req list), `MD05` (MRP list)\n**Key table:** MDKP, MDTB',
  'teco': '**T-codes:** `IW32` (PM orders), `CO02` (production orders), `IW38`/`COHV` (mass TECO)\n**Status:** TECO = technically complete, CLSD = closed',
  'goods issue': '**T-codes:** `MIGO` (goods movement - 261 for order), `MB1A` (classic)\n**Key table:** MSEG',
  'settlement': '**T-codes:** `KO88` (individual), `KO8G` (collective), `KSU5` (actual settlement)\n**Key table:** COBRA, COBRB',
  'production version': '**T-codes:** `C223` (mass maintenance), `C220` (individual), `MM02` (via material master MRP4 view)\n**Key fields:** BOM usage, routing, plant, lot size validity',
  'sales order': '**T-codes:** `VA01` (create), `VA02` (change), `VA03` (display), `VA05` (list)\n**Key table:** VBAK (header), VBAP (item)',
  'delivery': '**T-codes:** `VL01N` (create outbound), `VL02N` (change), `VL03N` (display)\n**Key table:** LIKP (header), LIPS (item)',
  'invoice': '**T-codes:** `VF01` (create billing), `MIRO` (logistics invoice verification)\n**Key table:** VBRK (billing header)',
  'plant maintenance plan': '**T-codes:** `IP01` (create), `IP02` (change), `IP10` (schedule), `IP30` (deadline monitoring)\n**Key table:** MPLA',
  'measuring point': '**T-codes:** `IK01` (create), `IK02` (change), `IK11` (enter measurement)\n**Key table:** IMPTT',
}

function getAnchorFacts(question) {
  const lower = question.toLowerCase()
  // Find the MOST SPECIFIC (longest) matching anchor key
  // This avoids "maintenance order" matching when question is about "production order"
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

  // Check anchors — but only if question is about a single specific object
  // Multi-object questions (prerequisite, master data, list all) go to Claude so this is safe
  const anchorFacts = getAnchorFacts(question)

  if (!key) return anchorFacts  // no Gemini key — use anchors only

  const prompt = `You are an SAP S/4HANA facts specialist. For this SAP question provide ONLY:
- The most important T-codes (be confident — include well-known ones like IW31, CO01, ME21N)
- Key table names if relevant
- BAdI or user exit names if the question involves enhancement
- Fiori app names only if well-known (e.g. "Manage Production Orders")
- SPRO path if it is a configuration question

IMPORTANT:
- For standard SAP objects (orders, materials, BOM etc.) ALWAYS include the primary T-codes — do not be overly cautious
- Format as short bullet points with **bold** for T-codes
- Do not write explanations — facts only
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

    if (!text || text === 'NO_FACTS') {
      // Gemini returned nothing — fall back to our anchors
      return anchorFacts
    }
    return text
  } catch {
    // API error — fall back to anchors
    return anchorFacts
  }
}

// ── Groq merge — clubs theory + facts into one clean answer ──────────────────
async function mergeWithGroq(theoryAnswer, factsAnswer, userName) {
  const nameNote = userName ? `Address the user as ${userName} naturally if appropriate.` : ''
  const mergePrompt = `You are a merger. You will receive two parts of an SAP answer:
PART 1: Theory/explanation
PART 2: Specific facts — T-codes, tables, app names

Your job: Combine them into ONE clean, natural answer.
CRITICAL RULES:
- Only include facts from Part 2 that are DIRECTLY relevant to the specific objects mentioned in Part 1
- If Part 2 contains T-codes for a different SAP object than what Part 1 is explaining — IGNORE those facts
- Do NOT add any new information not present in Part 1 or Part 2
- Do NOT invent any T-codes, app names or table names
- Weave ONLY the relevant facts naturally into the explanation
- Keep the combined answer concise — no longer than Part 1
- Use **bold** for T-codes and key terms
- ${nameNote}
- Output only the final merged answer, nothing else`

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

// ── Groq streaming (for ultra-simple direct answers) ─────────────────────────
async function streamGroq(systemPrompt, anonymised, map, send) {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.GROQ_API_KEY}` },
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
        if (chunk) { fullText += chunk; send({ type:'chunk', text: detokenize(chunk, map) }) }
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

  const lastMsg       = messages[messages.length-1]?.content || ''
  const lastAIMsg     = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
  const convDepth     = messages.length
  const previousClaude = lastAIMsg.includes('_✦ Claude_')
  const userCorrecting = isCorrecting(lastMsg)
  const complex        = isComplexQuestion(lastMsg)
  const ultraSimple    = isUltraSimple(lastMsg)

  // ── Routing decision ──────────────────────────────────────────────────────
  // Claude if: complex OR correcting OR previous was Claude OR deep conversation
  const useClaude = complex || userCorrecting || previousClaude || convDepth > 8

  // Build system prompt
  let systemPrompt = BASE_SYSTEM_PROMPT
  if (userName) {
    systemPrompt += `\n\nUSER NAME: The user's name is ${userName}. Address them by name occasionally — naturally, max once per response.`
  }
  systemPrompt += TONE_ADDITIONS[tone] || TONE_ADDITIONS.balanced

  // Inject memories
  if (userId) {
    const memories = await fetchMemories(userId, lastMsg, mod)
    if (memories.length) {
      systemPrompt += `\n\nRELEVANT FACTS FROM PAST CONVERSATIONS:\n${memories.map((f,i)=>`${i+1}. ${f}`).join('\n')}`
    }
  }

  // Add topic context to last message
  // BUT: if user is asking about a different module, don't inject stored module context
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
      effectiveMod = moduleName  // user is asking about a different module — use that
      break
    }
  }
  const withContext = messages.map((m,i) =>
    i===messages.length-1 && m.role==='user'
      ? { ...m, content:`SAP context: module="${effectiveMod||'General'}", topic="${topic||'General'}"\n\n${m.content}` }
      : m
  )
  const { anonymised, map } = tokenize(withContext)

  // ── SSE setup ────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  const keepalive = setInterval(() => res.write(': ping\n\n'), 15000)

  try {

    // ── PATH A: Claude for complex / corrections / follow-ups ─────────────
    if (useClaude && process.env.ANTHROPIC_API_KEY) {
      const full = await streamClaude(systemPrompt, anonymised, map, send)
      send({ type:'done', model:'claude', full })
      return
    }

    // ── PATH B: Ultra-simple → Groq direct streaming (no Gemini needed) ───
    if (ultraSimple && process.env.GROQ_API_KEY) {
      const groqPrompt = systemPrompt + '\n\nFor this simple question: give a clear, concise answer. Include T-codes only if you are 100% certain they are correct.'
      const full = await streamGroq(groqPrompt, anonymised, map, send)
      send({ type:'done', model:'groq', full })
      return
    }

    // ── PATH C: Parallel specialist — Groq theory + Gemini facts → merge ──
    if (process.env.GROQ_API_KEY) {
      const groqTheoryPrompt = systemPrompt + `\n\nIMPORTANT FOR THIS RESPONSE:
- Explain the concept, process, and context clearly
- Do NOT include specific T-codes, table names, BAdI names, or Fiori app names — those will be added separately
- Focus on the "what" and "why" — leave the "where in the system" to the facts layer
- Keep explanation clear and conversational`

      const contextStr = `module="${mod||'General'}", topic="${topic||'General'}"`

      // Run Groq theory + Gemini facts in parallel
      const [theoryAnswer, factsAnswer] = await Promise.all([
        callGroqDirect(groqTheoryPrompt, anonymised, 700),
        callGeminiFacts(lastMsg, contextStr),
      ])

      let finalAnswer = ''

      if (factsAnswer && factsAnswer.length > 10) {
        // Merge theory + facts using Groq
        finalAnswer = await mergeWithGroq(theoryAnswer, factsAnswer, userName)
      } else {
        // No facts found — use theory answer directly
        finalAnswer = theoryAnswer
      }

      // Stream the merged answer word by word for smooth animation
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
