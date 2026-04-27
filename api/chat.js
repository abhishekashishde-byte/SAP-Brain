// api/chat.js — v6 Hybrid Architecture
// Groq classifies → GPT-4o mini rewrites + answers simple → Claude Haiku answers complex → Google CSE for real links

import { BASE_SYSTEM_PROMPT, TONE_ADDITIONS } from './_shared.js'

// ── 1. GROQ — classify only, never answers SAP ───────────────────────────────
async function groqClassify(question) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 80,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Classify this SAP question. Return ONLY valid JSON.

intent: TABLE (asking for table name), TCODE (asking for transaction code), PROCESS (how-to, process steps), CONFIG (SPRO/config), DEBUG (error/troubleshooting), CODE (user pasted ABAP/code for analysis), GENERAL (other)
isSimple: true if just asking for a table name or T-code, false for anything requiring explanation
isCorrection: true if user is correcting a previous wrong answer
needsSearch: true if question is about S/4HANA changes, deprecated fields, "not there", "removed", "can you search", how-to, config steps
isCode: true if the message contains ABAP code, METHOD, CLASS, LOOP AT, SELECT, DATA:, FIELD-SYMBOL, or any code block

Question: "${question}"

{"intent":"TABLE","isSimple":true,"isCorrection":false,"needsSearch":false,"isCode":false}`
        }]
      })
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      intent: result.intent || 'GENERAL',
      isSimple: result.isSimple === true,
      isCorrection: result.isCorrection === true,
      needsSearch: result.needsSearch === true,
      isCode: result.isCode === true || /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |FUNCTION /i.test(question),
    }
  } catch {
    return { intent: 'GENERAL', isSimple: false, isCorrection: false, needsSearch: false, isCode: false }
  }
}

// ── 2. GPT-4o mini — rewrite question + answer simple TABLE/TCODE ────────────
async function gptRewriteAndAnswer(question, intent, isSimple) {
  try {
    const systemPrompt = isSimple
      ? `You are a senior SAP S/4HANA consultant. Give a complete, accurate answer.
- For table questions: list ALL relevant tables with their purpose, key fields where useful
- For T-code questions: give the T-code, full name, and what it does including variants if relevant
- Use bullet points and bold for table/T-code names
- If unsure about any specific detail say "verify in your system"
- Never invent table names, T-codes, or field names
- Be thorough — a consultant needs the complete picture, not just one line`
      : `You are an SAP question optimizer. Rewrite this SAP question to be clearer and more specific.
- Fix typos and grammar
- Make SAP terminology precise (e.g. "MRP4 view" → "MRP 4 view in MM01 material master")
- Keep the same meaning
- Return ONLY the rewritten question, nothing else`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: isSimple ? 800 : 150,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ]
      })
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || question
  } catch {
    return question
  }
}

// ── 3. CLAUDE HAIKU — complex SAP answers ────────────────────────────────────
async function streamClaudeHaiku(systemPrompt, messages, onChunk) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('CLAUDE ERROR:', res.status, errText.slice(0, 200))
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 100)}`)
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

// ── 4. GPT-4o mini streaming — for simple answers ────────────────────────────
async function streamGPTAnswer(systemPrompt, messages, onChunk) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      temperature: 0.1,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    })
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`GPT error ${res.status}: ${errText.slice(0, 100)}`)
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
        const text = json.choices?.[0]?.delta?.content || ''
        if (text) { fullText += text; onChunk(text) }
      } catch { }
    }
  }
  return fullText
}

// ── 5. GOOGLE CUSTOM SEARCH — real SAP links ─────────────────────────────────
async function googleSAPSearch(question) {
  const key = process.env.GOOGLE_CSE_KEY
  const cx = process.env.GOOGLE_CSE_ID
  if (!key || !cx) return []

  try {
    const query = encodeURIComponent(`SAP ${question}`)
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${query}&num=3`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const items = data.items || []
    return items.map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet?.slice(0, 120),
      source: item.displayLink?.includes('community.sap.com') ? 'SAP Community'
        : item.displayLink?.includes('help.sap.com') ? 'SAP Help'
        : item.displayLink?.includes('blogs.sap.com') ? 'SAP Blog' : 'SAP',
    }))
  } catch (err) {
    console.error('Google CSE error:', err.message)
    return []
  }
}

// ── 6. LOAD + SAVE CORRECTIONS ───────────────────────────────────────────────
async function loadGlobalCorrections() {
  try {
    const URL = process.env.SUPABASE_URL
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!URL || !KEY) return []
    const res = await fetch(
      `${URL}/rest/v1/sap_corrections?select=fact&order=created_at.desc&limit=5`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data.map(d => d.fact).filter(f => f && f.length > 10 && f.length < 300) : []
  } catch { return [] }
}

async function saveGlobalCorrection(userMsg, assistantMsg, userId) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 150,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Extract the corrected SAP fact. Return JSON: {"fact":"clear statement","topic":"1-3 words"} or {"fact":"","topic":""}
User: "${userMsg}"
Wrong answer: "${assistantMsg?.slice(0, 300)}"`
        }]
      })
    })
    const data = await res.json()
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
    // STEP 1 — Classify + load corrections in parallel
    const [classification, globalCorrections] = await Promise.all([
      groqClassify(lastMsg),
      loadGlobalCorrections().catch(() => []),
    ])

    const { intent, isSimple, isCorrection, needsSearch, isCode } = classification

    console.log('CLASSIFICATION:', JSON.stringify({
      q: lastMsg.slice(0, 60), intent, isSimple, needsSearch,
      corrections: globalCorrections.length,
    }))

    // STEP 2 — Save correction if detected (fire and forget)
    if (isCorrection && prevAssistantMsg) {
      saveGlobalCorrection(lastMsg, prevAssistantMsg, userId).catch(() => { })
    }

    // STEP 3 — GPT-4o mini rewrites question (skip rewrite if code is present)
    const rewrittenOrAnswer = isCode
      ? lastMsg // Keep code messages exactly as-is — never rewrite
      : await gptRewriteAndAnswer(lastMsg, intent, isSimple)

    // STEP 4 — Google search runs in parallel — only when relevant
    const searchPromise = needsSearch
      ? googleSAPSearch(lastMsg)
      : Promise.resolve([])

    // STEP 5 — Prepare messages with rewritten question
    // Check if any recent message contains code
    const recentMessages = (messages || []).slice(-12)
    const hasCodeInHistory = recentMessages.some(m =>
      /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |FUNCTION /i.test(m.content || '')
    )

    const validMessages = recentMessages
      .filter(m => m.role && m.content?.trim())
      .map(m => ({
        role: m.role,
        // Code messages and history with code get more space
        content: String(m.content).trim().slice(0, hasCodeInHistory ? 6000 : 2000)
      }))
      .slice(hasCodeInHistory ? -12 : -8) // keep more history when code is present

    // Replace last user message with rewritten version ONLY if no code present
    if (!isCode && !hasCodeInHistory && validMessages.length > 0 && validMessages[validMessages.length - 1].role === 'user') {
      validMessages[validMessages.length - 1].content = rewrittenOrAnswer
    }

    send({ type: 'start' })
    let fullAnswer = ''

    // Claude Haiku answers EVERYTHING — GPT-4o mini only rewrote the question
    let systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || '')
    systemPrompt += `\n\nNEVER say "I can't search online". Resources are shown to the user separately.`
    systemPrompt += `\nAnswer the user's CURRENT question directly. Do not reference or assume anything from previous messages unless explicitly relevant. Never say "as you mentioned" or "you shared" unless the user actually said it in this conversation.`

    // Code analysis boost
    if (isCode) {
      systemPrompt += `\n\n🔍 CODE DETECTED: The user has pasted ABAP/code. Follow CODE ANALYSIS RULES strictly:
- Read the code immediately — do NOT ask for more context
- Structure: What it does → Logic flow (→ arrows) → Key objects → Watch out
- End with 📌 Summary (1-2 sentences)
- Be direct and technical — no pleasantries`
    }

    if (firstName) {
      systemPrompt += `\n\nUser: ${firstName}${userRole ? `, ${userRole}` : ''}${userModules?.length ? `, SAP: ${userModules.join('/')}` : ''}.`
    }
    if (isFirstMessage && firstName) {
      systemPrompt += ` Greet with "${timeGreeting}, ${firstName}." then answer. Only once.`
    }
    if (globalCorrections.length > 0) {
      systemPrompt += `\n\n⚠️ VERIFIED CORRECTIONS — ground truth:\n${globalCorrections.map(c => `- ${c}`).join('\n')}`
    }

    console.log('SENDING TO CLAUDE HAIKU:', { messageCount: validMessages.length, systemLen: systemPrompt.length })

    fullAnswer = await streamClaudeHaiku(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }))
    const modelUsed = 'claude-haiku'

    if (!fullAnswer?.trim()) {
      send({ type: 'error', error: 'Empty response — please try again' })
      res.end()
      return
    }

    // STEP 6 — Append Google search links as structured data (not text)
    const searchResults = await searchPromise
    if (searchResults.length > 0) {
      send({ type: 'search_results', results: searchResults })
    }

    send({ type: 'done', model: modelUsed, full: fullAnswer })

  } catch (err) {
    console.error('HANDLER ERROR:', err.message)
    send({ type: 'error', error: err.message })
  } finally {
    res.end()
  }
}
