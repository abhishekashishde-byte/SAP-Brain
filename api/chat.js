// api/chat.js — v8 Hybrid Architecture
// Groq classifies intent → routes to specialized prompt per intent
// GPT-4o answers SAP questions + generates deliverables
// Claude Sonnet for code analysis only
// Google CSE for SAP source links (needsSearch=true only)

import { BASE_SYSTEM_PROMPT, TONE_ADDITIONS, callOpenAISearch } from './_shared.js'
import { INTENT_PROMPTS, CODE_INTENTS, DELIVERABLE_INTENTS } from './intent-prompts.js'
import { createClient } from '@supabase/supabase-js'

// ── 1. GROQ — classify intent with confidence + multi-intent detection ────────
async function groqClassify(question) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 180,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Classify this SAP consultant request. Return ONLY valid JSON.

intent options (pick the SINGLE best match):
SAP_QA         = general SAP question, T-code, table, process, config
CODE_ANALYSIS  = user pasted ABAP/code for analysis
ERROR_ANALYSIS = user pasted SAP error, dump, SM21/ST22 log
FS_SPEC        = generate functional specification document
TECH_SPEC      = generate technical/developer specification
TEST_CASES     = generate test cases or test script
GAP_ANALYSIS   = find gaps, missing items, what is incomplete
WORKSHOP_PLAN  = create workshop plan, agenda, questions for business
WORKSHOP_TOPICS= what topics to cover for a module/phase/object
WORKSHOP_PPT   = create a PowerPoint or slide presentation for a workshop on a standard SAP process
FORMS_SPEC     = SAP output forms: Adobe, SmartForms, NACE, Output Mgmt
FIORI_REC      = recommend Fiori apps for a process or role
SLIDE_CONTENT  = create presentation content, slide structure, storyline
BEST_PRACTICES = question about SAP best practices, SAP Activate methodology, fit-to-standard, scope items, standard SAP process design
CUSTOMIZING    = question about SAP SPRO configuration, customizing paths, where to configure something in SPRO, IMG activities, configuration tables, how to set up order types, movement types, document types, pricing, scheduling parameters
GENERAL        = anything else

Also detect secondary intents if the question clearly asks for multiple things.
Example: "explain this error and create test cases" → intent: ERROR_ANALYSIS, secondaryIntent: TEST_CASES

confidence: 0.0-1.0 — how certain you are about the primary intent
flags:
isCode: true if message contains ABAP keywords (METHOD, LOOP AT, SELECT, DATA:, FIELD-SYMBOL, ENDLOOP, FORM, FUNCTION)
isError: true if message contains error text, dump, ST22, SM21, runtime error, message class number
isCorrection: true if user is correcting a previous wrong answer
needsSearch: true if question is about latest S/4HANA changes, deprecated objects, explicitly asks to search, mentions SAP Notes or known issues, asks about errors or patches, or asks about a specific T-code behaviour

Question: "${question.slice(0, 400)}"

{"intent":"SAP_QA","confidence":0.9,"secondaryIntent":null,"isCode":false,"isError":false,"isCorrection":false,"needsSearch":false}`
        }]
      })
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // ── Hard regex overrides — always win over Groq classification ────────────
    const isCode  = result.isCode  === true || /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |FUNCTION /i.test(question)
    const isError = result.isError === true || /\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\.)\b/i.test(question)
    const isFsKeyword    = /\b(functional spec|FS|create.*spec|write.*spec|generate.*spec|specification for)\b/i.test(question)
    const isTestKeyword  = /\b(test case|test script|test scenario|UAT|SIT|generate.*test|write.*test)\b/i.test(question)
    const isFioriKeyword = /\b(fiori|app.*recommendation|recommend.*app|which.*app|tile)\b/i.test(question)
    const isWorkshopPPT  = /\b(workshop.*ppt|workshop.*presentation|workshop.*slides|ppt.*workshop|presentation.*workshop|create.*ppt|make.*ppt|generate.*ppt|build.*ppt)\b/i.test(question)
    const isCustomizing  = /\b(spro|customiz|IMG|where.*config|config.*where|how.*config|configure.*path|customising|t-code.*config|configuration.*path|where.*set up|where.*setup|where.*maintain|where can i|where do i.*config)\b/i.test(question)

    let intent = result.intent || 'SAP_QA'
    let confidence = typeof result.confidence === 'number' ? result.confidence : 0.7
    let secondaryIntent = result.secondaryIntent || null

    // Hard overrides — regex is more reliable than LLM for these
    if (isCode)        { intent = 'CODE_ANALYSIS';  confidence = 1.0 }
    if (isError)       { intent = 'ERROR_ANALYSIS'; confidence = 1.0 }
    if (isFsKeyword && !isCode && !isError)   { intent = 'FS_SPEC';       confidence = 0.95 }
    if (isTestKeyword && !isCode && !isError) { intent = 'TEST_CASES';    confidence = 0.95 }
    if (isFioriKeyword && !isCode && !isError){ intent = 'FIORI_REC';     confidence = 0.95 }
    if (isWorkshopPPT && !isCode && !isError) { intent = 'WORKSHOP_PPT';  confidence = 1.0  }
    if (isCustomizing && !isCode && !isError)  { intent = 'CUSTOMIZING';  confidence = 0.95 }
    const isBestPractice = /\b(best practice|sap activate|fit.to.standard|scope item|standard process|activate methodology|rapid\.sap|solution package|explore phase|realize phase|fit gap|fit-gap)\b/i.test(question)
    if (isBestPractice && !isCode && !isError)  { intent = 'BEST_PRACTICES'; confidence = 0.95 }

    // ── Low confidence fallback — use SAP_QA rather than force wrong template ──
    // Deliverable intents need high confidence — wrong template produces useless output
    const DELIVERABLE_INTENTS_SET = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT'])
    if (DELIVERABLE_INTENTS_SET.has(intent) && confidence < 0.75) {
      intent = 'SAP_QA'
      secondaryIntent = null
    }

    // FIORI_REC must always search — app IDs hallucinate without live data
    // Additional hard triggers — these always force search regardless of Groq
    const isNoteSearch   = /\b(sap note|note \d{5,}|oss note|known issue|patch|correction note)\b/i.test(question)
    const isErrorSearch  = /\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\.|termination|sy-msgno)\b/i.test(question)
    const isNewFeature   = /\b(2024|2025|2026|S\/4HANA 2|latest|new in|what changed|release note|what.s new)\b/i.test(question)
    const isSpecificTcode = /\b(VA01|VA02|VA03|IW31|IW32|IW33|ME21N|ME22N|MIGO|MB51|MM01|MM02|CO01|CO02|CO03|MD01|MD04|IE01|IE02|XK01|XK02|FK01|FK02|VF01|VF02|VL01N|VL02N|SPRO|SE38|SE80|SM30|PFCG)\b/.test(question)
    const isBapiSearch   = /\b(bapi|function module|rfc|which.*bapi|bapi.*for|what.*bapi|what.*function module)\b/i.test(question)
    const isExitSearch   = /\b(user exit|badi|ba[d]i|enhancement spot|enhancement point|which.*exit|exit.*for|badi.*for|userexit|include.*exit|implicit enhancement)\b/i.test(question)

    // ── CONCEPT QUESTION DETECTOR — fires Google CSE for any substantive SAP question ──
    // Triggers when the question involves relationships, configuration, processes, or
    // integration — things a consultant would Google to find blogs, help docs, or Q&A
    const isConceptQuestion = !isCode && !isError && (
      /\b(how|why|what|when|where|which|difference|relation|link|connect|integrat|config|set up|setup|between|versus|vs\.?|compare|explain|understand|work|flow|trigger|impact|affect|depend)\b/i.test(question) &&
      question.trim().split(/\s+/).length >= 5   // at least 5 words — not a one-liner lookup
    )

    const needsSearch = result.needsSearch === true || intent === 'FIORI_REC' || isFioriKeyword
      || isNoteSearch || isErrorSearch || isNewFeature || isSpecificTcode
      || isConceptQuestion  // ← broadened: concept/relationship/config questions always search

    return {
      intent,
      confidence,
      secondaryIntent,
      isCode,
      isError,
      isCorrection: result.isCorrection === true,
      needsSearch,
      isConceptQuestion,
      isBapiSearch,
      isExitSearch,
      isNoteSearch,
    }
  } catch {
    return { intent: 'SAP_QA', confidence: 0.5, secondaryIntent: null, isCode: false, isError: false, isCorrection: false, needsSearch: false, isConceptQuestion: false, isBapiSearch: false, isExitSearch: false, isNoteSearch: false }
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

async function streamClaudeSonnet(systemPrompt, messages, onChunk, maxTokens) {
  // claude-sonnet-4-5: latest stable Sonnet model
  return streamClaude('claude-sonnet-4-5', systemPrompt, messages, onChunk, maxTokens)
}

async function streamClaude(model, systemPrompt, messages, onChunk, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || (model.includes('sonnet') ? 8000 : 2048),
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

// GPT-4o-mini — for simple Q&A, cheap and fast
async function streamGPTMini(systemPrompt, messages, onChunk) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
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
    throw new Error(`GPT-mini error ${res.status}: ${errText.slice(0, 100)}`)
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
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
        if (delta) { fullText += delta; onChunk?.(delta) }
      } catch {}
    }
  }
  return fullText
}

// ── 5. GOOGLE CUSTOM SEARCH — real SAP links ─────────────────────────────────
// ── BUILD CLEAN SAP SEARCH QUERY ─────────────────────────────────────────────
// Extracts SAP-relevant keywords from a conversational question for CSE
async function buildSAPSearchQuery(question) {
  try {
    // Use Groq to fix typos and extract the real SAP concept to search for
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 40,
        temperature: 0,
        messages: [{ role: 'user', content: `Convert this SAP question into a short Google search query (4-6 words max). Fix any typos. Extract the core SAP concept — ignore conversational words. Return ONLY the search query, nothing else.

Examples:
"What is the correct table for chekcing Maiutnenace plan" → "SAP Maintenance Plan table MPLA"
"how does equipment link to asset master" → "SAP equipment asset master integration"
"I have to built a report for production order daily review" → "SAP production order daily review report"
"where do I config order type for PM" → "SAP PM order type configuration"
"explain badi for goods issue" → "SAP BAdI goods issue enhancement"

Question: "${question.slice(0, 200)}"` }]
      })
    })
    const data = await res.json()
    const query = data.choices?.[0]?.message?.content?.trim() || ''
    if (query && query.length > 3 && query.length < 100) {
      console.log('Groq search query:', query)
      return query
    }
  } catch (e) {
    console.error('buildSAPSearchQuery Groq error:', e.message)
  }

  // Fallback: simple keyword extraction if Groq fails
  const sapTerms = (question.match(/\b(production order|maintenance plan|work center|capacity|purchase order|goods receipt|material master|equipment|functional location|routing|settlement|batch|sales order|delivery|billing|cost center|asset master|movement type|MPLA|AFKO|AUFK|AFIH|MARA|EQUI)\b/gi) || [])
  const tcodes   = (question.match(/\b[A-Z]{1,4}\d{2,3}N?\b/g) || [])
  const modules  = (question.match(/\b(PP|PM|MM|SD|FI|CO|QM|CS|PS|WM)\b/g) || [])
  const terms    = [...new Set([...sapTerms, ...tcodes, ...modules])].join(' ')
  return terms.length > 5 ? `SAP ${terms}`.slice(0, 100) : `SAP S/4HANA ${question.slice(0, 60)}`
}

async function googleSAPSearch(question, intent = 'SAP_QA') {
  const key = process.env.GOOGLE_CSE_KEY
  const cx = process.env.GOOGLE_CSE_ID
  if (!key || !cx) {
    console.error('Google CSE: missing key or cx. GOOGLE_CSE_KEY:', !!key, 'GOOGLE_CSE_ID:', !!cx)
    return []
  }
  console.log('Google CSE: searching for:', question.slice(0, 60), 'intent:', intent)

  // Build clean query ONCE — fixes typos, extracts SAP concept — reused by all paths below
  const globalCleanQuery = await buildSAPSearchQuery(question)
  console.log('Google CSE clean query:', globalCleanQuery)

  // Helper — run a single CSE query and return mapped items
  async function runCSE(rawQuery, num = 3) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(rawQuery)}&num=${num}`
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return (data.items || []).map(item => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet?.slice(0, 150),
        source: item.displayLink?.includes('fioriappslibrary') ? 'SAP Fiori Library'
          : item.displayLink?.includes('community.sap.com') ? 'SAP Community'
          : item.displayLink?.includes('help.sap.com') ? 'SAP Help'
          : item.displayLink?.includes('blogs.sap.com') ? 'SAP Blog'
          : item.displayLink?.includes('launchpad.support.sap.com') ? 'SAP Support'
          : 'SAP',
      }))
    } catch (e) {
      console.error('runCSE error:', e.message)
      return []
    }
  }

  try {
    let results = []

    // ── FIORI: target Fiori Apps Library specifically ────────────────────────
    if (intent === 'FIORI_REC') {
      results = await runCSE(`site:fioriappslibrary.hana.ondemand.com SAP Fiori ${question}`)
      if (results.length === 0) {
        results = await runCSE(`site:help.sap.com SAP Fiori ${question}`)
      }
      return results
    }

    // ── ERROR: simplified query with fallback ────────────────────────────────
    if (intent === 'ERROR_ANALYSIS') {
      const coreQuery = question
        .replace(/what sap notes are available for/i, '')
        .replace(/how to fix|how do i|what is|what are/i, '')
        .trim()
      results = await runCSE(coreQuery, 5)
      // Fallback — try even shorter query if no results
      if (results.length === 0) {
        const keywords = coreQuery.split(' ').slice(0, 4).join(' ')
        results = await runCSE(keywords, 5)
      }
      console.log('Google CSE ERROR_ANALYSIS results:', results.length, 'query:', coreQuery.slice(0,50))
      return results
    }

    // ── NOTE questions: search for SAP Note numbers specifically ─────────────
    const isNoteQuestion = /\b(sap note|note \d{5,}|oss note|known issue|patch|correction)\b/i.test(question)
    if (isNoteQuestion) {
      results = await runCSE(`SAP Note ${globalCleanQuery} site:community.sap.com OR site:help.sap.com`, 5)
      return results
    }

    // ── BAPI/FM questions: target SAP Help API docs ──────────────────────────
    const isBapiQuestion = /\b(bapi|function module|rfc)\b/i.test(question)
    if (isBapiQuestion) {
      results = await runCSE(`${globalCleanQuery} site:help.sap.com OR site:community.sap.com`, 4)
      return results
    }

    // ── EXIT/BAdI questions: target SAP Help enhancement docs ────────────────
    const isExitQuestion = /\b(user exit|badi|enhancement spot|enhancement point)\b/i.test(question)
    if (isExitQuestion) {
      results = await runCSE(`${globalCleanQuery} enhancement site:help.sap.com OR site:community.sap.com`, 4)
      return results
    }

    // ── DEFAULT: clean keyword query, multi-source SAP search ────────────────
    // ── DEFAULT: parallel searches — targeted + open to catch community/blogs ─
    const [helpResults, communityResults, blogResults, openResults] = await Promise.all([
      runCSE(`${globalCleanQuery} site:help.sap.com`, 3),
      runCSE(`${globalCleanQuery} site:community.sap.com`, 2),
      runCSE(`${globalCleanQuery} site:blogs.sap.com`, 2),
      runCSE(globalCleanQuery, 4),  // unrestricted — catches whatever CSE is configured for
    ])

    // Merge all, deduplicate by URL, prefer specific sources first
    const seenUrls = new Set()
    const allResults = [...helpResults, ...communityResults, ...blogResults, ...openResults]
    results = allResults.filter(r => {
      if (seenUrls.has(r.url)) return false
      seenUrls.add(r.url)
      return true
    }).slice(0, 6)

    console.log(`Google CSE — help:${helpResults.length} community:${communityResults.length} blogs:${blogResults.length} open:${openResults.length} total:${results.length}`)

    // Always append search links for community + blogs if those sources have no results
    // so the user always has a way to search those sources
    const hasComm  = results.some(r => r.url.includes('community.sap.com'))
    const hasBlog  = results.some(r => r.url.includes('blogs.sap.com'))
    const rawTerms2 = globalCleanQuery.replace(/^SAP\s+S\/4HANA\s+|^SAP\s+/i, '').trim()
    const enc2 = encodeURIComponent(rawTerms2)
    if (!hasComm) results.push({
      title: `SAP Community: ${rawTerms2.slice(0, 55)}`,
      url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&q=${enc2}`,
      snippet: 'Questions and answers from SAP consultants worldwide',
      source: 'SAP Community',
    })
    if (!hasBlog) results.push({
      title: `SAP Blogs: ${rawTerms2.slice(0, 60)}`,
      url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&filter=location&location=category%3Aall-blogs&q=${enc2}`,
      snippet: 'Expert blog posts from the SAP community',
      source: 'SAP Blog',
    })
    if (!results.some(r => r.url.includes('help.sap.com'))) results.push({
      title: `SAP Help: ${rawTerms2.slice(0, 60)}`,
      url: `https://help.sap.com/docs/search?q=${enc2}`,
      snippet: 'Official SAP documentation',
      source: 'SAP Help',
    })
    if (results.length === 0) {
      const rawTerms = globalCleanQuery.replace(/^SAP\s+S\/4HANA\s+|^SAP\s+/i, '').trim()
      const encoded = encodeURIComponent(rawTerms)
      const encodedFull = encodeURIComponent(globalCleanQuery)
      results = [
        {
          title: `SAP Help: ${rawTerms.slice(0, 60)}`,
          url: `https://help.sap.com/docs/search?q=${encoded}&version=2023`,
          snippet: 'Official SAP documentation, configuration guides and release notes',
          source: 'SAP Help',
        },
        {
          title: `SAP Community: ${rawTerms.slice(0, 60)}`,
          url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&q=${encoded}`,
          snippet: 'Questions, answers and discussions from SAP consultants worldwide',
          source: 'SAP Community',
        },
        {
          title: `Google: ${rawTerms.slice(0, 60)} — SAP`,
          url: `https://www.google.com/search?q=${encodedFull}+site%3Ahelp.sap.com+OR+site%3Acommunity.sap.com+OR+site%3Ablogs.sap.com`,
          snippet: 'Search SAP Help, Community and Blogs via Google for the most relevant results',
          source: 'Web',
        },
      ]
      console.log('Google CSE fallback links generated for:', globalCleanQuery)
    }
    return results

  } catch (err) {
    console.error('Google CSE error:', err.message)
    return []
  }
  console.log('Google CSE: search complete, results:', results?.length || 0)
}

// ── 5a. EXTRACT SAP NOTE NUMBERS from search results ─────────────────────────
// Finds note numbers in titles and snippets, builds direct login links
function extractNoteNumbers(searchResults) {
  const notePattern = /\b(?:SAP\s+)?[Nn]ote[s]?\s+#?(\d{6,10})\b|\b(\d{7,10})\b/g
  const found = new Map()
  for (const r of searchResults) {
    const text = `${r.title} ${r.snippet || ''}`
    let match
    while ((match = notePattern.exec(text)) !== null) {
      const num = match[1] || match[2]
      // Filter out obvious non-note numbers (years, short numbers)
      if (num && num.length >= 6 && !found.has(num)) {
        found.set(num, {
          number: num,
          url: `https://me.sap.com/notes/${num}`,
          sourceTitle: r.title,
        })
      }
    }
  }
  return Array.from(found.values()).slice(0, 5)
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

// ── SEMANTIC KNOWLEDGE SEARCH ─────────────────────────────────────────────────
async function fetchRelevantKnowledge(question, userId, userToken) {
  try {
    // Use user's JWT token for RPC — auth.uid() in function will return correct user
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey || !userToken) return []
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } }
    })
    const queryEmbedding = await embed(question)
    if (!queryEmbedding) return []
    const { data, error } = await userClient.rpc('match_wani_knowledge', {
      query_embedding: queryEmbedding,
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

// ── AUTH HELPER — always derive userId from JWT, never trust body ─────────────
async function getAuthenticatedUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new Error('Missing auth token')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id) throw new Error('Invalid auth token')
  return { userId: data.user.id, token }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body

  // ── EARLY-EXIT ACTIONS (JSON responses, no streaming) ───────────────────────

  // Classify document type — no auth needed, no user data involved
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

  // All actions below require authentication — derive userId from JWT
  let authUser
  try {
    authUser = await getAuthenticatedUser(req)
  } catch (e) {
    return res.status(401).json({ error: e.message })
  }
  const { userId, token: userToken } = authUser

  // Store document chunks with embeddings
  if (body.action === 'store_chunks') {
    try {
      const { content, docName, docType } = body
      if (!content) return res.status(400).json({ error: 'Missing content' })
      const supabase = getSupabase()

      // Delete existing chunks for this document
      await supabase.from('wani_doc_chunks').delete().eq('user_id', userId).eq('doc_name', docName)

      // Chunk document — 1200 chars with 150 char overlap
      const chunks = []
      const chunkSize = 1200, overlap = 150
      for (let i = 0; i < content.length; i += chunkSize - overlap) {
        const chunk = content.slice(i, i + chunkSize).trim()
        if (chunk.length > 100) chunks.push(chunk)
        if (i + chunkSize >= content.length) break
      }

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
      const { question } = body
      if (!question) return res.status(400).json({ chunks: [] })
      const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      })
      const queryEmbedding = await embed(question)
      if (!queryEmbedding) return res.status(200).json({ chunks: [] })
      const { data } = await userClient.rpc('match_wani_chunks', {
        query_embedding: queryEmbedding,
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
      const { module, topic, object, finding, confidence } = body
      if (!finding) return res.status(400).json({ error: 'Missing finding' })
      const supabase = getSupabase()
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
      const supabase = getSupabase()
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
      const { id } = body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const supabase = getSupabase()
      await supabase.from('wani_knowledge').delete().eq('id', id).eq('user_id', userId)
      return res.status(200).json({ deleted: true })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // ── STREAMING HANDLER ────────────────────────────────────────────────────────
  const { messages, tone = 'balanced', userName, userRole, userModules = [] } = body
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

    let { intent, confidence, secondaryIntent, isCorrection, needsSearch, isConceptQuestion, isCode, isError, isBapiSearch, isExitSearch, isNoteSearch } = classification

    // Declare early — used in STEP 3, 4, and system prompt building
    const isDeliverable = ['FS_SPEC', 'TECH_SPEC', 'WORKSHOP_PPT'].includes(intent)

    console.log('CLASSIFICATION:', JSON.stringify({
      q: lastMsg.slice(0, 60), intent, confidence, secondaryIntent, needsSearch,
      corrections: globalCorrections.length,
    }))

    // STEP 2 — Save correction if detected (fire and forget)
    if (isCorrection && prevAssistantMsg) {
      saveGlobalCorrection(lastMsg, prevAssistantMsg, userId).catch(() => { })
    }

    // STEP 3 — GPT-4o mini rewrites question for context (skip for code and deliverables)
    const rewrittenQuestion = (isCode || isDeliverable)
      ? lastMsg  // keep as-is — full conversation history already has context
      : await rewriteQuestion(lastMsg, messages || [])

    // STEP 4 — Web search: OpenAI for content, Groq for clean query → supplemental pills
    // CSE removed — it returns 0 results consistently. OpenAI handles real link content.
    let searchResults = []
    let geminiSearchText = ''
    let googleLinks = []   // supplemental pill links — always generated from Groq query

    if (!isCode && !isDeliverable && needsSearch) {
      // Run OpenAI search + Groq query cleaning in parallel
      const [openAIResult, cleanQuery] = await Promise.all([
        callOpenAISearch(lastMsg).catch(() => null),
        buildSAPSearchQuery(lastMsg).catch(() => null),
      ])

      if (openAIResult && typeof openAIResult === 'object') {
        searchResults = openAIResult.sources || []
        geminiSearchText = openAIResult.text || ''
      }

      // Always generate 3 supplemental pill links from the clean Groq query
      if (cleanQuery) {
        const rawTerms = cleanQuery.replace(/^SAP\s+S\/4HANA\s+|^SAP\s+/i, '').trim()
        const enc = encodeURIComponent(rawTerms)
        googleLinks = [
          {
            title: `SAP Community: ${rawTerms.slice(0, 55)}`,
            url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&q=${enc}`,
            snippet: 'Questions and answers from SAP consultants worldwide',
            source: 'SAP Community',
          },
          {
            title: `SAP Help: ${rawTerms.slice(0, 60)}`,
            url: `https://help.sap.com/docs/search?q=${enc}`,
            snippet: 'Official SAP documentation',
            source: 'SAP Help',
          },
          {
            title: `SAP Blogs: ${rawTerms.slice(0, 60)}`,
            url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&filter=location&location=category%3Aall-blogs&q=${enc}`,
            snippet: 'Expert blog posts from the SAP community',
            source: 'SAP Blog',
          },
        ]
      }

      console.log('Search complete — OpenAI sources:', searchResults.length, 'supplemental pills:', googleLinks.length)
    } else if (!isCode && !isDeliverable && isConceptQuestion) {
      const cleanQuery = await buildSAPSearchQuery(lastMsg).catch(() => null)
      if (cleanQuery) {
        const rawTerms = cleanQuery.replace(/^SAP\s+S\/4HANA\s+|^SAP\s+/i, '').trim()
        const enc = encodeURIComponent(rawTerms)
        googleLinks = [
          { title: `SAP Community: ${rawTerms.slice(0, 55)}`, url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&q=${enc}`, snippet: 'Questions and answers from SAP consultants worldwide', source: 'SAP Community' },
          { title: `SAP Help: ${rawTerms.slice(0, 60)}`, url: `https://help.sap.com/docs/search?q=${enc}`, snippet: 'Official SAP documentation', source: 'SAP Help' },
          { title: `SAP Blogs: ${rawTerms.slice(0, 60)}`, url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&filter=location&location=category%3Aall-blogs&q=${enc}`, snippet: 'Expert blog posts from the SAP community', source: 'SAP Blog' },
        ]
      }
    }

    // Extract SAP Note numbers from search results — build direct login links
    const noteRefs = searchResults.length > 0 ? extractNoteNumbers(searchResults) : []

    // STEP 5.5 — Semantic knowledge fetch (parallel already started above)
    const knowledgePromise = userId ? fetchRelevantKnowledge(lastMsg, userId, userToken).catch(() => []) : Promise.resolve([])

    // STEP 5 — Prepare messages with rewritten question
    // Check if any recent message contains code
    const recentMessages = (messages || []).slice(-12)
    const hasCodeInHistory = recentMessages.some(m =>
      /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |FUNCTION /i.test(m.content || '')
    )

    // Detect attached code block and its line count for complexity routing
    const codeBlockMatch = lastMsg.match(/\[ATTACHED_CODE[^\]]*lines=(\d+)\]/)
    const attachedCodeLines = codeBlockMatch ? parseInt(codeBlockMatch[1]) || 0 : 0

    const validMessages = recentMessages
      .filter(m => m.role && m.content?.trim())
      .map(m => ({
        role: m.role,
        // Code messages and history with code get more space
        content: String(m.content).trim().slice(0, hasCodeInHistory ? 6000 : 2000)
      }))
      .slice(hasCodeInHistory ? -12 : -8) // keep more history when code is present

    // Replace last user message with rewritten version ONLY if no code and not a deliverable
    if (!isCode && !isDeliverable && !hasCodeInHistory && validMessages.length > 0 && validMessages[validMessages.length - 1].role === 'user') {
      validMessages[validMessages.length - 1].content = rewrittenQuestion
    }

    send({ type: 'start', intent })
    let fullAnswer = ''

    // Resolve knowledge (was fetching in parallel)
    const relevantKnowledge = await knowledgePromise

    // ── FIX 2: Normalise GENERAL to SAP_QA ───────────────────────────────────
    if (intent === 'GENERAL') intent = 'SAP_QA'

    // ── BUILD SYSTEM PROMPT — BASE rules + intent-specific template ──────────
    // For deliverables (FS/PPT) skip the large BASE_SYSTEM_PROMPT to save tokens & time.
    // The intent prompt is self-contained and already has all the rules needed.
    const intentPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS['SAP_QA']
    const toneAddition = TONE_ADDITIONS[tone] || ''
    let systemPrompt = isDeliverable
      ? intentPrompt + toneAddition   // lean: intent prompt only
      : BASE_SYSTEM_PROMPT + '\n\n' + intentPrompt + toneAddition  // full: base + intent

    // ── FIX 3: Multi-intent — light secondary section, not full second template
    if (secondaryIntent && secondaryIntent !== intent && INTENT_PROMPTS[secondaryIntent]) {
      const secondaryLabel = secondaryIntent.replace(/_/g, ' ')
      systemPrompt += `\n\nADDITIONAL REQUEST: After completing the primary task above, also provide a ${secondaryLabel} section. Keep it focused and clearly separated with a "---" divider and heading.`
    }

    // ── OUTPUT LENGTH CONTROL — per intent ───────────────────────────────────
    const LONG_INTENTS  = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT'])
    const SHORT_INTENTS = new Set(['SAP_QA','ERROR_ANALYSIS','FIORI_REC'])
    if (SHORT_INTENTS.has(intent)) {
      systemPrompt += `\n\nOUTPUT LENGTH: Keep answers concise and direct. Do not pad with unnecessary sections.`
    } else if (LONG_INTENTS.has(intent)) {
      systemPrompt += `\n\nOUTPUT LENGTH: This is a deliverable document. Be thorough and complete all sections.`
    }

    // ── GLOBAL ANTI-HALLUCINATION — already in BASE but reinforced for deliverables
    if (LONG_INTENTS.has(intent)) {
      systemPrompt += `\n\nNever invent SAP T-codes, table names, BAdI names, function modules, or Fiori app IDs. Write "verify in your system" when uncertain.`
    }

    // Document context injection — only relevant chunks, not full document
    const { documentChunks, documentName, documentType } = body
    if (documentChunks?.length > 0) {
      systemPrompt += `\n\n📄 DOCUMENT CONTEXT: User has uploaded "${documentName}" (${documentType})
Relevant sections:
${documentChunks.map((c, i) => `[${i+1}] ${c}`).join('\n\n')}
Base your output on this document. Reference specific sections.`
    }

    // Verified consultant knowledge from knowledge base
    if (relevantKnowledge.length > 0) {
      systemPrompt += `\n\n📌 VERIFIED FROM REAL PROJECTS (prioritise over generic docs):
${relevantKnowledge.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object})`).join('\n')}`
    }

    // Gemini search text — inject as primary web context
    if (geminiSearchText) {
      // Replace Gemini redirect URLs with direct SAP note links where possible
      const cleanedText = geminiSearchText.replace(
        /https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s\)]+/g,
        (url) => {
          // Try to extract note number from surrounding context — will be handled by note extractor
          return url
        }
      )
      systemPrompt += `\n\nWEB SEARCH RESULTS (from Google via Gemini — use as primary source):\n${cleanedText.slice(0, 2000)}\n\nIMPORTANT: For any SAP Note numbers found above, present them as direct links in this format: https://me.sap.com/notes/NOTENUMBER — replace the Gemini redirect URLs with these direct SAP links. Tell user to log in with their S-user to read the full note.`
    }

    // Source links — inline citations only, no separate Sources block at the end
    if (searchResults.length > 0) {
      const sourceRef = searchResults.map((r, i) => `[${i+1}] ${r.title} — ${r.url}`).join('\n')
      systemPrompt += `\n\nSOURCE REFERENCES (for inline use only):\n${sourceRef}\n\nCITATION RULES — CRITICAL:\n- Weave citations INLINE into your answer using [1] [2] [3] notation right after the relevant sentence or fact.\n- Example: "You can find this configuration under SPRO → Plant Maintenance [1], which aligns with SAP's recommended approach [2]."\n- Do NOT add a separate "📚 Sources" or "References" section at the end of your answer.\n- Do NOT list URLs at the bottom. All links must appear inline as [N] references.\n- The user sees the source URLs via the inline citation numbers — no footer block needed.`
    }

    // SAP Note anti-hallucination — critical rule
    if (isNoteSearch || intent === 'ERROR_ANALYSIS') {
      systemPrompt += `\n\n⚠️ SAP NOTE RULE: NEVER invent or guess SAP Note numbers. Do NOT make up note numbers like 1234567. If you do not have verified note numbers from search results, tell the user to search SAP Support Portal at support.sap.com/notes using these exact search terms: "${lastMsg.slice(0, 80)}". Never present invented note numbers as real.`
    }

    // SAP Note references — extracted from search results, direct login links
    if (noteRefs.length > 0) {
      systemPrompt += `\n\n📋 SAP NOTES FOUND IN SEARCH RESULTS:\nPresent these to the user clearly. Tell them to log in with their S-user at me.sap.com to read the full note content:\n${noteRefs.map(n => `- SAP Note ${n.number}: ${n.url}`).join('\n')}`
    }

    // BAPI/Function Module questions — hard anti-hallucination enforcement
    if (isBapiSearch) {
      systemPrompt += `\n\n⚠️ BAPI/FM ACCURACY RULE: NEVER invent or guess BAPI or Function Module names. Only state names you are 100% certain exist. If uncertain, say "verify in SE37 or SAP API Business Hub" and provide this link: https://api.sap.com`
    }

    // User Exit / BAdI questions — structured table output + anti-hallucination
    if (isExitSearch) {
      systemPrompt += `\n\n⚠️ USER EXIT/BAdI RULE: Format your answer as a markdown table with columns: Exit/BAdI Name | Type | T-code | What It Controls. Only state exits and BAdIs you are certain exist. For verification, direct the user to SE84 in their SAP system (Program > Enhancements > Business Add-Ins or User Exits). NEVER invent exit or BAdI names.`
    }

        // User context
    if (firstName) {
      systemPrompt += `\n\nConsultant: ${firstName}${userRole ? `, ${userRole}` : ''}${userModules?.length ? `, SAP: ${userModules.join('/')}` : ''}.`
    }
    if (isFirstMessage && firstName) {
      systemPrompt += ` Greet with "${timeGreeting}, ${firstName}." then proceed. Only once.`
    }
    if (globalCorrections.length > 0) {
      systemPrompt += `\n\n⚠️ VERIFIED CORRECTIONS:\n${globalCorrections.map(c => `- ${c}`).join('\n')}`
    }

    // ── SMART MODEL ROUTING ───────────────────────────────────────────────────
    //
    // Claude Sonnet  → Complex ABAP analysis, FS generation
    // GPT-4o         → Complex Q&A, impact analysis, workshops, error diagnosis
    // GPT-4o-mini    → Simple Q&A, simple lookups, Fiori app search
    //
    // Complexity signals for ABAP:
    // Complex = has CLASS/BADI/ENHANCEMENT keywords OR > 80 lines OR risk question
    // Simple  = short program, basic SELECT/LOOP, explain-only question

    const isComplexAbap = isCode && (
      /\b(CLASS|INTERFACE|BADI|BA[Dd]I|ENHANCEMENT|ENHANCEMENT-POINT|IMPLICIT ENHANCEMENT|METHOD\s+\w+|CALL METHOD)\b/i.test(systemPrompt) ||
      (attachedCodeLines > 80) ||
      /\b(risk|vulnerabilit|why.*built|reverse engineer|impact|what.*break|performance|optimi[sz]e)\b/i.test(lastMsg)
    )

    const isSimpleQA = !isCode && !hasCodeInHistory && (
      intent === 'SAP_QA' &&
      confidence >= 0.9 &&
      !needsSearch &&
      lastMsg.length < 120 &&
      !/\b(impact|what.*break|change.*affect|if.*change|complex|architecture|design|integration)\b/i.test(lastMsg)
    )

    const isComplexDeliverable = ['FS_SPEC', 'TECH_SPEC', 'WORKSHOP_PPT'].includes(intent)

    let modelUsed
    if (isComplexAbap || isCode) {
      // Complex ABAP or any code → Claude Sonnet (8k sufficient for code analysis)
      fullAnswer = await streamClaudeSonnet(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 8000)
      modelUsed = 'claude-sonnet'
      console.log('MODEL: Claude Sonnet (ABAP/code)')
    } else if (isComplexDeliverable) {
      // FS, Tech Spec, Workshop PPT → Claude Sonnet with max tokens (17 sections needs space)
      fullAnswer = await streamClaudeSonnet(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 16000)
      modelUsed = 'claude-sonnet'
      console.log('MODEL: Claude Sonnet (deliverable, 16k tokens)')
    } else if (isSimpleQA) {
      // Simple SAP Q&A → GPT-4o-mini (cheap, fast, good enough)
      fullAnswer = await streamGPTMini(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }))
      modelUsed = 'gpt4o-mini'
      console.log('MODEL: GPT-4o-mini (simple Q&A)')
    } else {
      // Everything else → GPT-4o (complex Q&A, error diagnosis, impact analysis, workshops)
      fullAnswer = await streamGPT(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }))
      modelUsed = 'gpt4o'
      console.log('MODEL: GPT-4o (complex/default)')
    }

    // Deliverable type — stored on conversation for UI filtering
    const DELIVERABLE_TYPES = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','FIORI_REC','WORKSHOP_PPT','CUSTOMIZING', 'BEST_PRACTICES'])
    const deliverableType = DELIVERABLE_TYPES.has(intent) ? intent : 'NONE'

    if (!fullAnswer?.trim()) {
      send({ type: 'error', error: 'Empty response — please try again' })
      res.end()
      return
    }

    // STEP 6 — Send search links to frontend (already resolved above, just send)
    if (searchResults.length > 0) {
      send({ type: 'search_results', results: searchResults })
    }

    // further_reading = OpenAI real page links + supplemental search pills
    // Frontend knows: titles starting "SAP Community:" etc = pills, rest = full rows
    const allFurtherReading = [...searchResults, ...googleLinks].slice(0, 9)
    if (allFurtherReading.length > 0) {
      send({ type: 'further_reading', links: allFurtherReading })
    }

    // ── FS COMPLETION DETECTION ───────────────────────────────────────────────
    // Primary: explicit signal. Fallback: has at least 8 ---SECTION N:--- markers
    const fsSectionCount = (fullAnswer.match(/---SECTION \d+:/g) || []).length
    const fsComplete = fullAnswer.includes('WANI_FS_COMPLETE') ||
      (intent === 'FS_SPEC' && fsSectionCount >= 6)
    // Strip signal token + everything after it from the displayed/stored text
    const cleanAnswer = fullAnswer
      .replace(/WANI_FS_COMPLETE[\s\S]*$/, '')
      .trim()

    // ── PPT COMPLETION DETECTION ──────────────────────────────────────────────
    // Primary: explicit signal. Fallback: 5+ slide blocks generated for WORKSHOP_PPT
    const slideBlockCount = (fullAnswer.match(/---SLIDE \d+---/g) || []).length
    const pptComplete = fullAnswer.includes('WANI_PPT_COMPLETE') ||
      (intent === 'WORKSHOP_PPT' && slideBlockCount >= 5)
    const cleanPPTAnswer = fullAnswer
      .replace(/WANI_PPT_COMPLETE[\s\S]*$/, '')
      .trim()

    // Which clean answer to show in chat
    // For FS and PPT: show a brief confirmation card, not the full raw content
    let chatAnswer
    if (fsComplete) {
      const fsTitleMatch = cleanAnswer.match(/FS_TITLE:\s*(.+)/i)
      const fsTitle = (fsTitleMatch?.[1]?.trim() || 'Functional Specification').replace(/\*/g, '').trim()
      const sectionCount = (cleanAnswer.match(/---SECTION \d+:/g) || []).length
      chatAnswer = `✅ **Functional Specification generated — ${fsTitle}**\n\n📄 Your Word document has been downloaded automatically. It contains **${sectionCount} sections** covering all requirements discussed.\n\n_If the download didn't start, use the button below to download again._`
    } else if (pptComplete) {
      const slideCount = (cleanPPTAnswer.match(/---SLIDE \d+---/g) || []).length
      chatAnswer = `✅ **Workshop Presentation generated — ${slideCount} slides**\n\n📊 Your PowerPoint file has been downloaded automatically with speaker notes and SAP references on every slide.\n\n_If the download didn't start, use the button below to download again._`
    } else {
      chatAnswer = cleanAnswer
    }

    send({
      type: 'done',
      model: modelUsed,
      full: chatAnswer,
      deliverableType,
      ...(fsComplete  ? { fsComplete:  true, fsText:  cleanAnswer    } : {}),
      ...(pptComplete ? { pptComplete: true, pptText: cleanPPTAnswer } : {}),
    })

  } catch (err) {
    console.error('HANDLER ERROR:', err.message)
    send({ type: 'error', error: err.message })
  } finally {
    res.end()
  }
}
