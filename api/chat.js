// api/chat.js — v7 Hybrid Architecture
// Groq classifies intent → GPT-4o mini rewrites question for context
// GPT-4o (full) answers all SAP questions
// Claude Sonnet answers code analysis (ABAP)
// Google CSE for SAP source links (when needsSearch=true only)

import { BASE_SYSTEM_PROMPT, TONE_ADDITIONS } from './_shared.js'
import { createClient } from '@supabase/supabase-js'

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

intent: TABLE (asking for table name), TCODE (asking for transaction code), PROCESS (how-to, process steps), CONFIG (SPRO/config), DEBUG (error/troubleshooting), CODE (user pasted ABAP/code for analysis), ERROR (user pasted SAP error message, short dump, SM21 log, runtime error, ABAP exception), GENERAL (other)
isSimple: true if just asking for a table name or T-code, false for anything requiring explanation
isCorrection: true if user is correcting a previous wrong answer
needsSearch: true if question is about S/4HANA changes, deprecated fields, "not there", "removed", "can you search", how-to, config steps
isCode: true if the message contains ABAP code, METHOD, CLASS, LOOP AT, SELECT, DATA:, FIELD-SYMBOL, or any code block
isError: true if message contains SAP error text, short dump, runtime error, SM21/ST22 content, message class numbers like "M7 001"

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
      isError: result.isError === true || /\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\.)\b/i.test(question),
    }
  } catch {
    return { intent: 'GENERAL', isSimple: false, isCorrection: false, needsSearch: false, isCode: false, isError: false }
  }
}

// ── 2. GPT-4o mini — rewrite question with full context awareness ─────────────
// ── 2a. REWRITE QUESTION — context-aware enrichment via GPT-4o mini ──────────
async function rewriteQuestion(question, conversationHistory = []) {
  try {
    const recentContext = conversationHistory.slice(-6)
      .filter(m => m.role && m.content)
      .map(m => `${m.role === 'user' ? 'User' : 'Wani'}: ${m.content.slice(0, 300)}`)
      .join('\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0.1,
        messages: [{
          role: 'system',
          content: `You are an SAP question optimizer. Rewrite this SAP question to be clearer and more specific.

IMPORTANT — use the conversation context below to:
- Connect follow-up questions to the topic being discussed
- If someone asks a general term after discussing a specific SAP topic, link them
- Example: if discussing "Construction Type" then user asks "what is material BOM?" 
  → rewrite as "What is a Material BOM in the context of the Construction Type field in IE01 equipment master?"
- Fix typos and grammar
- Make SAP terminology precise
- Keep the same meaning but add context linkage
- Return ONLY the rewritten question, nothing else

Recent conversation:
${recentContext || 'No previous context'}`
        }, { role: 'user', content: question }]
      })
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || question
  } catch { return question }
}

// ── 3. CLAUDE SONNET — code analysis only ────────────────────────────────────
// Note: streamClaudeHaiku removed — all non-code SAP questions go to GPT-4o

async function streamClaudeSonnet(systemPrompt, messages, onChunk) {
  // claude-sonnet-4-5 is the current stable Sonnet model
  return streamClaude('claude-sonnet-4-5-20251022', systemPrompt, messages, onChunk)
}

async function streamClaude(model, systemPrompt, messages, onChunk) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: model.includes('sonnet') ? 4096 : 2048,
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
async function streamGPT(systemPrompt, messages, onChunk) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
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

// ── 7. EMBEDDINGS — OpenAI text-embedding-3-small ────────────────────────────
async function embed(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) })
  })
  const data = await res.json()
  return data.data?.[0]?.embedding || null
}

// ── SUPABASE — service role key for server-side writes ────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url) throw new Error('SUPABASE_URL not configured')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured — do not fall back to anon key for server writes')
  return createClient(url, key)
}

// ── 9. SEMANTIC KNOWLEDGE SEARCH ─────────────────────────────────────────────
async function fetchRelevantKnowledge(question, userId) {
  try {
    const supabase = getSupabase()
    if (!supabase || !userId) return []
    const queryEmbedding = await embed(question)
    if (!queryEmbedding) return []
    const { data, error } = await supabase.rpc('match_wani_knowledge', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_threshold: 0.75,
      match_count: 3
    })
    if (error) { console.error('knowledge search error:', error.message); return [] }
    return data || []
  } catch (err) {
    console.error('fetchRelevantKnowledge error:', err.message)
    return []
  }
}

// ── 10. SUGGEST FINDING — propose to user for confirmation ───────────────────
async function suggestFinding(messages, module) {
  try {
    const conversation = messages.slice(-10)
      .filter(m => m.role && m.content)
      .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 400)}`)
      .join('\n')

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Scan this SAP conversation for ONE finding worth saving to a consultant knowledge base.

Save ONLY if it meets at least ONE:
- Corrects wrong info in standard SAP docs
- Real project finding (migration, upload, specific field behaviour)
- Error root cause confirmed from experience  
- Specific gotcha that would save another consultant time

Return JSON: {"found":true,"module":"PP","topic":"Migration","object":"MKAL","finding":"VERID must be populated before ADATU in LSMW upload","confidence":"verified"}
Or if nothing qualifies: {"found":false}
Most conversations return {"found":false}.

Conversation:
${conversation}`
        }]
      })
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch { return { found: false } }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body

  // ── EARLY-EXIT ACTIONS (JSON responses, no streaming) ───────────────────────

  // Classify document type
  if (body.action === 'classify_doc') {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', max_tokens: 15, temperature: 0,
          messages: [{ role: 'user', content: `Classify this SAP document. Return ONLY one word:\nFUNCTIONAL_SPEC, TEST_SCRIPT, MEETING_NOTES, PROJECT_PLAN, TECHNICAL_SPEC, OTHER\n\nDocument: ${(body.content || '').slice(0, 1000)}` }]
        })
      })
      const groqData = await groqRes.json()
      const docType = groqData.choices?.[0]?.message?.content?.trim().toUpperCase() || 'OTHER'
      const valid = ['FUNCTIONAL_SPEC', 'TEST_SCRIPT', 'MEETING_NOTES', 'PROJECT_PLAN', 'TECHNICAL_SPEC', 'OTHER']
      return res.status(200).json({ docType: valid.includes(docType) ? docType : 'OTHER' })
    } catch { return res.status(200).json({ docType: 'OTHER' }) }
  }

  // Store document chunks with embeddings
  if (body.action === 'store_chunks') {
    try {
      const { content, docName, docType, userId } = body
      if (!content || !userId) return res.status(400).json({ error: 'Missing content or userId' })
      const supabase = getSupabase()
      if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })

      // Delete existing chunks for this document
      await supabase.from('wani_doc_chunks').delete().eq('user_id', userId).eq('doc_name', docName)

      // Chunk document — 1200 chars with 150 char overlap
      // Larger chunks preserve SAP process context better
      const chunks = []
      const chunkSize = 1200, overlap = 150
      for (let i = 0; i < content.length; i += chunkSize - overlap) {
        const chunk = content.slice(i, i + chunkSize).trim()
        if (chunk.length > 100) chunks.push(chunk) // skip tiny trailing chunks
        if (i + chunkSize >= content.length) break
      }

      // Embed and store each chunk
      let stored = 0
      for (let i = 0; i < Math.min(chunks.length, 50); i++) {
        const embedding = await embed(chunks[i])
        if (!embedding) continue
        await supabase.from('wani_doc_chunks').insert({
          user_id: userId, doc_name: docName, doc_type: docType,
          chunk_index: i, chunk_text: chunks[i], embedding
        })
        stored++
      }
      return res.status(200).json({ stored, total: chunks.length })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // Retrieve relevant document chunks for a question
  if (body.action === 'retrieve_chunks') {
    try {
      const { question, userId } = body
      if (!question || !userId) return res.status(400).json({ chunks: [] })
      const supabase = getSupabase()
      if (!supabase) return res.status(200).json({ chunks: [] })
      const queryEmbedding = await embed(question)
      if (!queryEmbedding) return res.status(200).json({ chunks: [] })
      const { data } = await supabase.rpc('match_wani_chunks', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_threshold: 0.70,
        match_count: 6
      })
      return res.status(200).json({ chunks: (data || []).map(d => d.chunk_text) })
    } catch (err) { return res.status(200).json({ chunks: [] }) }
  }

  // Suggest finding from conversation (user confirms separately)
  if (body.action === 'suggest_finding') {
    try {
      const { messages, module } = body
      const finding = await suggestFinding(messages || [], module)
      return res.status(200).json(finding)
    } catch { return res.status(200).json({ found: false }) }
  }

  // Save confirmed finding with embedding
  if (body.action === 'save_finding') {
    try {
      const { userId, module, topic, object, finding, confidence } = body
      if (!userId || !finding) return res.status(400).json({ error: 'Missing fields' })
      const supabase = getSupabase()
      if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })
      const embeddingText = `${module} ${topic} ${object} ${finding}`
      const embedding = await embed(embeddingText)
      const { error } = await supabase.from('wani_knowledge').insert({
        user_id: userId, module, topic, object, finding,
        confidence: confidence || 'verified', embedding
      })
      if (error) throw error
      return res.status(200).json({ saved: true })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // Load all knowledge for panel
  if (body.action === 'load_knowledge') {
    try {
      const { userId } = body
      if (!userId) return res.status(400).json({ entries: [] })
      const supabase = getSupabase()
      if (!supabase) return res.status(200).json({ entries: [] })
      const { data } = await supabase.from('wani_knowledge')
        .select('id, module, topic, object, finding, confidence, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      return res.status(200).json({ entries: data || [] })
    } catch { return res.status(200).json({ entries: [] }) }
  }

  // Delete knowledge entry
  if (body.action === 'delete_finding') {
    try {
      const { userId, id } = body
      if (!userId || !id) return res.status(400).json({ error: 'Missing fields' })
      const supabase = getSupabase()
      if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })
      await supabase.from('wani_knowledge').delete().eq('id', id).eq('user_id', userId)
      return res.status(200).json({ deleted: true })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // ── STREAMING HANDLER (existing code unchanged below) ────────────────────────
  const { messages, tone = 'balanced', userName, userRole, userModules = [], userId } = body
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

    const { intent, isSimple, isCorrection, needsSearch, isCode, isError } = classification

    console.log('CLASSIFICATION:', JSON.stringify({
      q: lastMsg.slice(0, 60), intent, isSimple, needsSearch,
      corrections: globalCorrections.length,
    }))

    // STEP 2 — Save correction if detected (fire and forget)
    if (isCorrection && prevAssistantMsg) {
      saveGlobalCorrection(lastMsg, prevAssistantMsg, userId).catch(() => { })
    }

    // STEP 3 — GPT-4o mini rewrites question for context (skip if code present)
    const rewrittenQuestion = isCode
      ? lastMsg // keep code exactly as-is
      : await rewriteQuestion(lastMsg, messages || [])

    // STEP 4 — Google search — only when question needs current/external info
    const searchPromise = (!isCode && needsSearch) ? googleSAPSearch(lastMsg) : Promise.resolve([])

    // STEP 5.5 — Semantic knowledge fetch (parallel with search, no impact on existing flow)
    const knowledgePromise = userId ? fetchRelevantKnowledge(lastMsg, userId).catch(() => []) : Promise.resolve([])

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
      validMessages[validMessages.length - 1].content = rewrittenQuestion
    }

    send({ type: 'start' })
    let fullAnswer = ''

    // Resolve knowledge (was fetching in parallel)
    const relevantKnowledge = await knowledgePromise

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

    // Error analysis mode
    if (isError && !isCode) {
      systemPrompt += `\n\n🔴 ERROR DETECTED: User has pasted a SAP error/dump. Follow ERROR ANALYSIS RULES:
Always output a markdown table with these exact rows:
| Aspect | Detail |
|--------|--------|
| Error Type | What kind of error |
| Root Cause | Why this happens technically |
| Most Likely Cause | In context of SAP PP/PM/MM |
| Fix Steps | 1. First step 2. Second step 3. Third step |
| T-codes to Check | e.g. SM21; ST22; SU53 |
| Prevention | How to avoid in future |
| SAP Note Hint | Search SAP Note for [specific term] |
After table: 📌 Summary — one sentence bottom line`
    }

    // Document context injection — only relevant chunks not full document
    const { documentChunks, documentName, documentType } = body
    if (documentChunks?.length > 0) {
      systemPrompt += `\n\n📄 DOCUMENT CONTEXT: User has uploaded "${documentName}" (${documentType})
Relevant sections for this question:
${documentChunks.map((c, i) => `[${i+1}] ${c}`).join('\n\n')}
Answer questions using this document as primary source. Reference specific sections when possible.`
    }

    // Consultant knowledge injection — verified project experience
    if (relevantKnowledge.length > 0) {
      systemPrompt += `\n\n📌 VERIFIED CONSULTANT KNOWLEDGE (from real project experience — prioritise over generic docs):
${relevantKnowledge.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object}, ${k.confidence})`).join('\n')}
Reference this knowledge explicitly when answering.`
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

    // GPT-4o answers SAP questions — better T-code/table accuracy than Haiku
    // Claude Sonnet for code analysis — keeps its superior code understanding
    if (isCode || hasCodeInHistory) {
      console.log('SENDING TO CLAUDE SONNET (code detected)')
      fullAnswer = await streamClaudeSonnet(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }))
    } else {
      console.log('SENDING TO GPT-4o (SAP question)')
      fullAnswer = await streamGPT(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }))
    }
    const modelUsed = (isCode || hasCodeInHistory) ? 'claude-sonnet' : 'gpt4o'

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
