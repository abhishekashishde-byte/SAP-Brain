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
async function callGeminiFacts(question, context) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return ''
  const prompt = `You are an SAP facts extractor. For this SAP question, list ONLY:
- Relevant T-codes (e.g. IW31, CO01)
- Relevant table names (e.g. AUFK, MARA)  
- Relevant BAdI or user exit names if applicable
- Relevant Fiori app names ONLY if you are 100% certain they exist
- Key configuration paths if applicable

RULES:
- If you are not 100% certain a T-code or app name exists, DO NOT include it
- Do not write explanations — only facts
- Format as a short bullet list
- If nothing specific applies, reply with exactly: NO_FACTS

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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (text.trim() === 'NO_FACTS') return ''
    return text.trim()
  } catch { return '' }
}

// ── Groq merge — clubs theory + facts into one clean answer ──────────────────
async function mergeWithGroq(theoryAnswer, factsAnswer, userName) {
  const nameNote = userName ? `Address the user as ${userName} naturally if appropriate.` : ''
  const mergePrompt = `You are a merger. You will receive two parts of an SAP answer:
PART 1: Theory/explanation (written by an AI)
PART 2: Specific facts — T-codes, tables, app names (verified facts)

Your job: Combine them into ONE clean, natural answer. 
RULES:
- Do NOT add any new information not present in Part 1 or Part 2
- Do NOT invent any T-codes, app names or table names
- Weave the facts from Part 2 naturally into the explanation from Part 1
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
  const withContext = messages.map((m,i) =>
    i===messages.length-1 && m.role==='user'
      ? { ...m, content:`SAP context: module="${mod||'General'}", topic="${topic||'General'}"\n\n${m.content}` }
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
