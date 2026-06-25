// api/chat.js — v9 RAG + Synthesis Architecture
// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE:
//   Groq           → intent classification only
//   GPT-4o mini    → query rewriting, Tavily relevance filtering, synthesis merging,
//                    conversation compression, document requirement gathering
//   GPT-4o         → all SAP Q&A answers (primary)
//   Claude Sonnet  → all SAP Q&A answers (parallel complement) + code + deliverables
//   pgvector RAG   → SAP book chunk retrieval (fires in parallel with search)
//   Tavily         → SAP Community + blogs targeted search
//   OpenAI search  → SAP Notes + broader official docs
// ─────────────────────────────────────────────────────────────────────────────

import { BASE_SYSTEM_PROMPT, TONE_ADDITIONS, callOpenAISearch } from './_shared.js'
import { INTENT_PROMPTS, CODE_INTENTS, DELIVERABLE_INTENTS } from './intent-prompts.js'
import { createClient } from '@supabase/supabase-js'

// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url) throw new Error('SUPABASE_URL not configured')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key)
}

// ── 1. GROQ — intent classification ──────────────────────────────────────────
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
SAP_QA         = SAP customizing or configuration question
PROCESS_QA     = SAP business process or behavioural question
CODE_ANALYSIS  = user pasted ABAP/code for analysis
ERROR_ANALYSIS = user pasted SAP error, dump, SM21/ST22 log
PROBLEM_ANALYSIS = complex scenario with unexpected system behaviour
SAVE_TO_MEMORY  = user wants to save conversation to memory
FS_SPEC        = generate functional specification document
TECH_SPEC      = generate technical/developer specification
TEST_CASES     = generate test cases or test script
GAP_ANALYSIS   = find gaps, missing items
WORKSHOP_PLAN  = create workshop plan or agenda
WORKSHOP_TOPICS= what topics to cover for a module/phase
WORKSHOP_PPT   = create PowerPoint for a workshop
FORMS_SPEC     = SAP output forms specification
FIORI_REC      = recommend Fiori apps
SLIDE_CONTENT  = create presentation content
BEST_PRACTICES = SAP best practices, Activate methodology
CUSTOMIZING    = SPRO configuration paths and settings
DOC_CONFIRM    = user is confirming or denying a document generation request (yes/no/go ahead/correct/wrong)
DOC_REQUIREMENTS = user is answering requirement questions for document generation
GENERAL        = anything else

confidence: 0.0-1.0
flags:
isCode: true if ABAP keywords present
isError: true if error text, dump, ST22 present
isCorrection: true if user is correcting previous answer
needsSearch: true if question needs live/specific data verification

Question: "${question.slice(0, 500)}"

{"intent":"SAP_QA","confidence":0.9,"secondaryIntent":null,"isCode":false,"isError":false,"isCorrection":false,"needsSearch":false}`
        }]
      })
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // isCode should not trigger on 'function module' questions — those are Q&A not code
    const hasFmPhrase = /\b(function module|bapi|rfc module)\b/i.test(question)
    const isCode  = result.isCode  === true || (!hasFmPhrase && /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |FUNCTION /i.test(question))
    const isError = result.isError === true || /\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\.)\b/i.test(question)
    const isCorrectionRegex = /\b(actually|that('s| is) (wrong|incorrect|not right)|you('re| are) wrong|wrong answer|incorrect answer|it should be|the correct|please (note|correct)|i('m| am) correcting)\b/i.test(question)
    const isCorrection = result.isCorrection === true || isCorrectionRegex

    const isFsKeyword    = /\b(functional spec|FS|create.*spec|write.*spec|generate.*spec|specification for)\b/i.test(question)
    const isTestKeyword  = /\b(test case|test script|test scenario|UAT|SIT|generate.*test|write.*test)\b/i.test(question)
    const isFioriKeyword = /\b(fiori|app.*recommendation|recommend.*app|which.*app|tile)\b/i.test(question)
    const isWorkshopPPT  = /\b(workshop.*ppt|workshop.*presentation|workshop.*slides|ppt.*workshop)\b/i.test(question)
    const isCustomizing  = /\b(spro|customiz|IMG|where.*config|config.*where|how.*config|configure.*path|where.*set up|where.*maintain)\b/i.test(question)
    const isBestPractice = /\b(best practice|sap activate|fit.to.standard|scope item|standard process|activate methodology)\b/i.test(question)
    const isNoteSearch   = /\b(sap note|note \d{5,}|oss note|known issue|patch|correction note)\b/i.test(question)
    const isErrorSearch  = /\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW)\b/i.test(question)
    const isNewFeature   = /\b(2024|2025|2026|S\/4HANA 2|latest|new in|what changed|release note)\b/i.test(question)
    const isTroubleshoot = /\b(not working|doesn't work|missing|error|wrong|incorrect|failed|why is|why does|not found|not appearing|problem|issue)\b/i.test(question)
    const isVersionSpecific = /\b(s\/4hana \d|ecc|r\/3|vs\.|versus|difference between.*version|upgrade|migration)\b/i.test(question)
    const isBapiSearch   = /\b(bapi|function module|fm|rfc|which.*bapi|bapi.*for|function.*module|module.*function)\b/i.test(question)
    const isExitSearch   = /\b(user exit|badi|enhancement spot|which.*exit|exit.*for)\b/i.test(question)

    // User confirming or answering doc wizard
    const isDocConfirm = /\b(yes|go ahead|create it|generate it|proceed|do it|sure|yeah|correct|that's right)\b/i.test(question)
    const isDocDeny    = /\b(no|don't|stop|cancel|not now|not yet|wrong|incorrect)\b/i.test(question)

    let intent = result.intent || 'SAP_QA'
    let confidence = typeof result.confidence === 'number' ? result.confidence : 0.7
    let secondaryIntent = result.secondaryIntent || null

    if (isCode && !hasFmPhrase) { intent = 'CODE_ANALYSIS';   confidence = 1.0 }
    if (isError)          { intent = 'ERROR_ANALYSIS';   confidence = 1.0 }
    if (isFsKeyword && !isCode && !isError)    { intent = 'FS_SPEC';        confidence = 0.95 }
    if (isTestKeyword && !isCode && !isError)  { intent = 'TEST_CASES';     confidence = 0.95 }
    if (isFioriKeyword && !isCode && !isError) { intent = 'FIORI_REC';      confidence = 0.95 }
    if (isWorkshopPPT && !isCode && !isError)  { intent = 'WORKSHOP_PPT';   confidence = 1.0  }
    if (isCustomizing && !isCode && !isError)  { intent = 'CUSTOMIZING';    confidence = 0.95 }
    if (isBestPractice && !isCode && !isError) { intent = 'BEST_PRACTICES'; confidence = 0.95 }

    const DELIVERABLE_INTENTS_SET = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','WORKSHOP_PPT'])
    if (DELIVERABLE_INTENTS_SET.has(intent) && confidence < 0.75) {
      intent = 'SAP_QA'
      secondaryIntent = null
    }

    // Tavily fires by default for all SAP questions
    // Only skip for pure conversational messages and memory saves
    const isNonSAPMessage = intent === 'GENERAL' && !isBapiSearch && !isExitSearch && !isNoteSearch
    const needsSearch = !isNonSAPMessage && intent !== 'SAVE_TO_MEMORY'

    return {
      intent, confidence, secondaryIntent,
      isCode, isError, isCorrection, needsSearch,
      isDocConfirm, isDocDeny,
      isTroubleshoot, isVersionSpecific,
      isBapiSearch, isExitSearch, isNoteSearch,
    }
  } catch {
    return {
      intent: 'SAP_QA', confidence: 0.5, secondaryIntent: null,
      isCode: false, isError: false, isCorrection: false, needsSearch: false,
      isDocConfirm: false, isDocDeny: false,
      isTroubleshoot: false, isVersionSpecific: false,
      isBapiSearch: false, isExitSearch: false, isNoteSearch: false,
    }
  }
}

// ── 2. DETECT MODULE from question ────────────────────────────────────────────
function detectModule(question, intent) {
  const q = question.toUpperCase()
  const modulePatterns = [
    { module: 'PM', patterns: ['PM ', 'PLANT MAINT', 'MAINTENANCE ORDER', 'IW31', 'IW32', 'IW33', 'IP10', 'IP11', 'EQUI', 'IFLOT', 'MPLA', 'STRATEGY GROUP', 'MAINTENANCE PLAN', 'FUNCTIONAL LOCATION', 'EQUIPMENT MASTER', 'MEASUREM', 'MEASUR', 'MEASUREMENT POINT', 'COUNTER READING', 'IMRG', 'IMRC', 'IMPT', 'IK01', 'IK11', 'IK21', 'PYEAR'] },
    { module: 'PP', patterns: ['PP ', 'PRODUCTION', 'CO01', 'CO02', 'CO03', 'MD01', 'MD04', 'PRODUCTION ORDER', 'PLANNED ORDER', 'BOM', 'ROUTING', 'WORK CENTER', 'MRP', 'PRODUCTION VERSION'] },
    { module: 'MM', patterns: ['MM ', 'MATERIAL', 'MM01', 'MM02', 'ME21N', 'ME51N', 'MIGO', 'PURCHASE ORDER', 'GOODS RECEIPT', 'MATERIAL MASTER', 'VENDOR', 'PURCHASING'] },
    { module: 'SD', patterns: ['SD ', 'SALES', 'VA01', 'VA02', 'VF01', 'VL01N', 'SALES ORDER', 'DELIVERY', 'BILLING', 'CUSTOMER ORDER'] },
    { module: 'QM', patterns: ['QM ', 'QUALITY', 'QA01', 'QA32', 'MIC', 'INSPECTION LOT', 'INSPECTION POINT', 'CALIBRATION'] },
    { module: 'FI', patterns: ['FI ', 'FINANCE', 'FB01', 'F-02', 'GENERAL LEDGER', 'ACCOUNTS PAYABLE', 'ACCOUNTS RECEIVABLE'] },
    { module: 'CO', patterns: ['CO ', 'CONTROLLING', 'KS01', 'KP26', 'COST CENTER', 'COST ELEMENT', 'SETTLEMENT', 'COSTING'] },
    { module: 'WM', patterns: ['WM ', 'WAREHOUSE', 'LT01', 'LT0A', 'TRANSFER ORDER', 'STORAGE LOCATION'] },
  ]
  for (const { module, patterns } of modulePatterns) {
    if (patterns.some(p => q.includes(p))) return module
  }
  return null
}

// ── 3. CONVERSATION CONTEXT — keep last 12 messages, no compression ──────────
// Compression removed — was causing context loss and wrong answers
function getConversationContext(allMessages) {
  const recentMsgs = allMessages.slice(-12)
  return { recentMsgs, summary: '' }
}

// ── 4. QUERY REWRITING for search — context-aware ────────────────────────────
async function rewriteForSearch(question, conversationSummary) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 80,
        temperature: 0,
        messages: [{
          role: 'system',
          content: `You rewrite SAP questions into optimised search queries for SAP Community and SAP blogs.
Rules:
- Add SAP module prefix (PP/PM/MM/SD/QM etc.)
- Add relevant technical terms the question implies
- Target SAP Community (community.sap.com) and SAP Help (help.sap.com)
- Connect follow-up questions to the conversation context below
- Return ONLY the search query, 5-10 words, nothing else

Conversation context: ${conversationSummary || 'No previous context'}`
        }, {
          role: 'user',
          content: question
        }]
      })
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || question
  } catch { return question }
}

// ── 5. TAVILY SEARCH — SAP-targeted ──────────────────────────────────────────
async function tavilySearch(searchQuery, intent) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) { console.error('[TAVILY] No API key'); return [] }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: searchQuery,
        search_depth: (intent === 'PROBLEM_ANALYSIS' || intent === 'ERROR_ANALYSIS') ? 'advanced' : 'basic',
        max_results: 7,
        include_domains: [
          'community.sap.com',
          'blogs.sap.com',
          'help.sap.com',
          'me.sap.com',
          'support.sap.com',
          'launchpad.support.sap.com'
        ],
        include_answer: false,
        include_raw_content: false,
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[TAVILY] Error:', res.status, err.slice(0, 200))
      return []
    }

    const data = await res.json()
    const results = (data.results || []).map(r => ({
      title:   r.title || '',
      url:     r.url   || '',
      snippet: r.content?.slice(0, 400) || '',
      score:   r.score || 0,
      source:  r.url?.includes('community.sap.com') ? 'SAP Community'
             : r.url?.includes('blogs.sap.com')     ? 'SAP Blog'
             : r.url?.includes('help.sap.com')       ? 'SAP Help'
             : r.url?.includes('me.sap.com')         ? 'SAP Support'
             : 'SAP',
    }))

    console.log('[TAVILY] Results:', results.length)
    return results
  } catch (e) {
    console.error('[TAVILY] Exception:', e.message)
    return []
  }
}

// ── 6. RELEVANCE FILTERING — GPT-4o mini scores Tavily results ───────────────
async function filterRelevantResults(results, originalQuestion) {
  if (results.length === 0) return []
  try {
    const listText = results.map((r, i) =>
      `[${i}] Title: ${r.title}\nSnippet: ${r.snippet?.slice(0, 200)}`
    ).join('\n\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Score each search result for relevance to this SAP question: "${originalQuestion}"

Score 1-5:
5 = directly answers the question with specific SAP details
4 = closely related, useful context
3 = somewhat related, marginally useful
2 = loosely related
1 = irrelevant

Return ONLY a JSON array of scores in order, e.g. [4,2,5,1,3,4,2]
No explanation, just the array.

Results:
${listText}`
        }]
      })
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '[]'
    const scores = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Keep only score >= 3, sorted by score desc, max 3 results
    const scored = results
      .map((r, i) => ({ ...r, relevanceScore: scores[i] || 1 }))
      .filter(r => r.relevanceScore >= 3)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3)

    console.log('[FILTER] Tavily results kept after filtering:', scored.length, '/', results.length)
    return scored
  } catch (e) {
    console.error('[FILTER] Error:', e.message)
    // Fallback: return top 3 by Tavily score
    return results.sort((a, b) => b.score - a.score).slice(0, 3)
  }
}

// ── 7. BOOK RAG — fetch relevant SAP book chunks from pgvector ────────────────
async function fetchBookChunks(question, detectedModule, userToken) {
  try {
    const url    = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey || !userToken) return []

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } }
    })

    // Generate embedding for the question
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: question.slice(0, 8000) })
    })
    const embeddingData = await embeddingRes.json()
    const queryEmbedding = embeddingData.data?.[0]?.embedding
    if (!queryEmbedding) return []

    const { data, error } = await userClient.rpc('match_sap_book_chunks', {
      query_embedding:  queryEmbedding,
      match_threshold:  0.70,
      match_count:      5,
      filter_module:    detectedModule || null,
      filter_version:   null,
    })

    if (error) { console.error('[BOOK RAG] Error:', error.message); return [] }

    console.log('[BOOK RAG] Chunks found:', data?.length || 0, '| module filter:', detectedModule || 'none')
    return data || []
  } catch (e) {
    console.error('[BOOK RAG] Exception:', e.message)
    return []
  }
}

// ── 8. SYNTHESIS — GPT-4o mini merges GPT-4o + Claude answers ────────────────
async function synthesiseAnswers(gptAnswer, claudeAnswer, originalQuestion, onChunk) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 2048,
        temperature: 0.1,
        stream: true,
        messages: [{
          role: 'system',
          content: `You are a synthesis engine for SAP consultant answers. You receive two answers to the same SAP question and merge them into one superior answer.

YOUR READER: A senior SAP consultant who is mid-project and needs the answer in under 60 seconds. They already know SAP basics. They want the key fact first, context second, caveats last. They will stop reading after the third paragraph if nothing new appears.

MERGING RULES — follow strictly:
1. FACTS (T-codes, table names, field names, SPRO paths, transaction codes): Always take from Answer A (GPT-4o). It is more accurate on SAP technical facts.
2. PROCESS EXPLANATION (why something works, business logic, behavioural differences, edge cases, integration points): Enrich with Answer B (Claude) ONLY if it adds genuine insight not already in Answer A.
3. If both say the same thing — say it ONCE. Never repeat a point already made.
4. If they contradict on a FACT — use Answer A's version.
5. If they contradict on PROCESS explanation — use whichever is more specific and nuanced.
6. Do NOT introduce any new information not in either answer.
7. Do NOT mention that two models were used. Write as one expert voice.
8. Preserve all formatting (markdown, bold, tables, bullet points) from the better-formatted answer.
9. Preserve follow-up questions (💡 You may also ask) from Answer A if present.
10. Preserve 📌 Summary from Answer A if present.
11. CRITICAL — CITATIONS: If either answer contains citations like (PM Maintenance Planning, p.45) or [1] [2] source references — ALWAYS preserve them exactly. Never drop a citation. They are the most important part of the answer for verification.

LENGTH RULES — non-negotiable:
- The final merged answer MUST be shorter than Answer A alone. You are cutting and sharpening, not expanding.
- If Answer A already covers the question completely — summarise it tighter, do not add Claude's content on top.
- Never add a section just to look thorough. Never explain what a T-code is. Never add generic SAP background.
- Simple factual questions → answer in 3-5 lines maximum.
- Configuration questions → key steps + T-codes, no preamble.
- Troubleshooting questions → root cause first, then fix steps, then watch-outs. No theory unless it directly explains the fix.
- Write the shortest answer that fully solves the question. If you can say it in 3 lines — say it in 3 lines.`
        }, {
          role: 'user',
          content: `SAP Question: "${originalQuestion}"

Answer A (GPT-4o — trust for facts):
${gptAnswer}

Answer B (Claude Sonnet — use for process enrichment):
${claudeAnswer}

Merge into one expert answer:`
        }]
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[SYNTHESIS] Error:', res.status, err.slice(0, 100))
      // Fallback: return GPT-4o answer as-is
      onChunk && gptAnswer.split(' ').forEach(w => onChunk(w + ' '))
      return gptAnswer
    }

    const reader  = res.body.getReader()
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
          if (delta) { fullText += delta; onChunk && onChunk(delta) }
        } catch {}
      }
    }
    console.log('[SYNTHESIS] Merged answer length:', fullText.length)
    return fullText
  } catch (e) {
    console.error('[SYNTHESIS] Exception:', e.message)
    return gptAnswer // fallback
  }
}

// ── 9. DOCUMENT WIZARD — gather requirements before generating ────────────────
// Stage tracking: 'confirm' → 'gather' → 'generate'
async function buildDocConfirmMessage(intent, conversationHistory) {
  const docNames = {
    FS_SPEC:      'Functional Specification',
    TECH_SPEC:    'Technical Specification',
    TEST_CASES:   'Test Cases',
    WORKSHOP_PPT: 'Workshop Presentation',
    WORKSHOP_PLAN:'Workshop Plan',
    GAP_ANALYSIS: 'Gap Analysis',
    FORMS_SPEC:   'Forms Specification',
  }
  const docName = docNames[intent] || 'Document'
  return `I've understood that you need a **${docName}**. Should I go ahead and create it?`
}

async function gatherDocRequirements(intent, conversationHistory, userConfirmation) {
  try {
    const convText = conversationHistory
      .slice(-10)
      .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 300)}`)
      .join('\n')

    const docNames = {
      FS_SPEC:      'Functional Specification',
      TECH_SPEC:    'Technical Specification',
      TEST_CASES:   'Test Cases',
      WORKSHOP_PPT: 'Workshop Presentation',
      WORKSHOP_PLAN:'Workshop Plan',
      GAP_ANALYSIS: 'Gap Analysis',
    }
    const docName = docNames[intent] || 'Document'

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        temperature: 0.2,
        messages: [{
          role: 'system',
          content: `You help gather requirements for SAP documents before generating them.
Read the conversation and identify what information is ALREADY known vs what is MISSING.
Ask ONLY for what is missing — never ask for things already mentioned in the conversation.
Format your response as a friendly numbered list of specific questions (max 4 questions).
Be specific to the SAP context discussed.`
        }, {
          role: 'user',
          content: `The consultant wants a ${docName}. Based on this conversation, what specific information do I still need?

Conversation:
${convText}

Ask only what's missing. Max 4 questions:`
        }]
      })
    })
    const data = await res.json()
    const questions = data.choices?.[0]?.message?.content?.trim() || ''
    return `Great! To make this **${docName}** complete and accurate, I need a few details:\n\n${questions}`
  } catch (e) {
    console.error('[DOC WIZARD] Requirements error:', e.message)
    return `Great! To create the best possible document, please provide:\n\n1. Which plant / company code scope?\n2. Which SAP version (ECC / S/4HANA)?\n3. Any specific process variants or exceptions?\n4. Should I include integration points with other modules?`
  }
}

// ── 10. GPT-4o streaming ──────────────────────────────────────────────────────
async function streamGPT(systemPrompt, messages, onChunk, model = 'gpt-4o', maxTokens = 4096) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...messages]
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
        const text = JSON.parse(data)?.choices?.[0]?.delta?.content || ''
        if (text) { fullText += text; onChunk && onChunk(text) }
      } catch {}
    }
  }
  return fullText
}

// ── 11. Claude streaming ──────────────────────────────────────────────────────
async function streamClaude(model, systemPrompt, messages, onChunk, maxTokens = 4000) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
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
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const text = json.delta.text || ''
          if (text) { fullText += text; onChunk && onChunk(text) }
        }
      } catch {}
    }
  }
  return fullText
}

// ── 12. MISC HELPERS ──────────────────────────────────────────────────────────
async function embed(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) })
  })
  const data = await res.json()
  return data.data?.[0]?.embedding || null
}

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
    return Array.isArray(data) ? data.map(d => d.fact).filter(f => f && f.length > 10) : []
  } catch { return [] }
}

async function saveMemory(userId, fact) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key || !userId || !fact) return
  try {
    await fetch(`${url}/rest/v1/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify([{ user_id: userId, content: fact, source: 'user_saved', created_at: new Date().toISOString() }])
    })
  } catch(e) { console.error('saveMemory error:', e.message) }
}

async function saveGlobalCorrection(userMsg, assistantMsg, userId) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 150, temperature: 0,
        messages: [{ role: 'user', content: `Extract the corrected SAP fact. Return JSON: {"fact":"clear statement","topic":"1-3 words"} or {"fact":"","topic":""}\nUser: "${userMsg}"\nWrong answer: "${assistantMsg?.slice(0, 300)}"` }]
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
  } catch (err) { console.error('saveCorrection error:', err.message) }
}

async function fetchUserMemories(question, userId) {
  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key || !userId) return []
    const words = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 5)
    if (words.length === 0) return []
    const filters = words.map(w => `content.ilike.*${w}*`).join(',')
    const memUrl = `${url}/rest/v1/memories?user_id=eq.${userId}&or=(${filters})&order=created_at.desc&limit=5`
    const res = await fetch(memUrl, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } })
    if (!res.ok) return []
    return await res.json() || []
  } catch (e) { console.error('fetchUserMemories error:', e.message); return [] }
}

async function fetchRelevantKnowledge(question, userId, userToken) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey || !userToken) return []
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${userToken}` } } })
    const queryEmbedding = await embed(question)
    if (!queryEmbedding) return []
    const { data, error } = await userClient.rpc('match_wani_knowledge', { query_embedding: queryEmbedding, match_threshold: 0.75, match_count: 3 })
    if (error) { console.error('knowledge search error:', error.message); return [] }
    return data || []
  } catch (err) { console.error('fetchRelevantKnowledge error:', err.message); return [] }
}

async function suggestFinding(messages, module) {
  try {
    const conversation = messages.slice(-10).filter(m => m.role && m.content)
      .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 400)}`).join('\n')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 300, temperature: 0,
        messages: [{ role: 'user', content: `Scan this SAP conversation for ONE finding worth saving.\nReturn JSON: {"found":true,"module":"PM","topic":"Migration","object":"MKAL","finding":"specific fact","confidence":"verified"}\nOr: {"found":false}\n\nConversation:\n${conversation}` }]
      })
    })
    const data = await res.json()
    return JSON.parse(data.choices?.[0]?.message?.content?.replace(/```json|```/g, '').trim() || '{}')
  } catch { return { found: false } }
}

async function getAuthenticatedUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new Error('Missing auth token')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id) throw new Error('Invalid auth token')
  return { userId: data.user.id, token, userEmail: data.user.email || '' }
}

// ── 13. SUPPLEMENTAL PILL LINKS from clean query ─────────────────────────────
function buildPillLinks(searchQuery) {
  const raw = searchQuery.replace(/^SAP\s+S\/4HANA\s+|^SAP\s+/i, '').trim()
  const enc = encodeURIComponent(raw)
  return [
    { title: `SAP Community: ${raw.slice(0, 55)}`, url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&q=${enc}`, snippet: 'Questions and answers from SAP consultants worldwide', source: 'SAP Community' },
    { title: `SAP Help: ${raw.slice(0, 60)}`, url: `https://help.sap.com/docs/search?q=${enc}`, snippet: 'Official SAP documentation', source: 'SAP Help' },
    { title: `SAP Blogs: ${raw.slice(0, 60)}`, url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&filter=location&location=category%3Aall-blogs&q=${enc}`, snippet: 'Expert blog posts from the SAP community', source: 'SAP Blog' },
    { title: `Google: ${raw.slice(0, 60)}`, url: `https://www.google.com/search?q=${encodeURIComponent('SAP ' + raw)}`, snippet: 'Google search for this SAP topic', source: 'Google' },
  ]
}

function extractNoteNumbers(results) {
  const notePattern = /\b(?:SAP\s+)?[Nn]ote[s]?\s+#?(\d{6,10})\b|\b(\d{7,10})\b/g
  const found = new Map()
  for (const r of results) {
    const text = `${r.title} ${r.snippet || ''}`
    let match
    while ((match = notePattern.exec(text)) !== null) {
      const num = match[1] || match[2]
      if (num && num.length >= 6 && !found.has(num)) {
        found.set(num, { number: num, url: `https://me.sap.com/notes/${num}`, sourceTitle: r.title })
      }
    }
  }
  return Array.from(found.values()).slice(0, 5)
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body

  // ── EARLY-EXIT: classify_doc — no auth needed ─────────────────────────────
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

  // ── AUTH ──────────────────────────────────────────────────────────────────
  let authUser
  try {
    authUser = await getAuthenticatedUser(req)
  } catch (e) {
    return res.status(401).json({ error: e.message })
  }
  const { userId, token: userToken, userEmail } = authUser

  // ── ADMIN EMAIL CHECK ─────────────────────────────────────────────────────
  const ADMIN_EMAILS = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean)
  const isAdmin = ADMIN_EMAILS.includes(userEmail)

  // ── ACTIONS: store_chunks ─────────────────────────────────────────────────
  if (body.action === 'store_chunks') {
    try {
      const { content, docName, docType } = body
      if (!content) return res.status(400).json({ error: 'Missing content' })
      const supabase = getSupabase()
      await supabase.from('wani_doc_chunks').delete().eq('user_id', userId).eq('doc_name', docName)
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
        await supabase.from('wani_doc_chunks').insert({ user_id: userId, doc_name: docName, doc_type: docType, chunk_index: i, chunk_text: chunks[i], embedding })
        stored++
      }
      return res.status(200).json({ stored, total: chunks.length })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  if (body.action === 'retrieve_chunks') {
    try {
      const { question } = body
      if (!question) return res.status(200).json({ chunks: [] })
      const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
      const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${userToken}` } } })
      const queryEmbedding = await embed(question)
      if (!queryEmbedding) return res.status(200).json({ chunks: [] })
      const { data } = await userClient.rpc('match_wani_chunks', { query_embedding: queryEmbedding, match_threshold: 0.70, match_count: 6 })
      return res.status(200).json({ chunks: (data || []).map(d => d.chunk_text) })
    } catch { return res.status(200).json({ chunks: [] }) }
  }

  if (body.action === 'suggest_finding') {
    try {
      const { messages, module } = body
      return res.status(200).json(await suggestFinding(messages || [], module))
    } catch { return res.status(200).json({ found: false }) }
  }

  if (body.action === 'save_finding') {
    try {
      const { module, topic, object, finding, confidence } = body
      if (!finding) return res.status(400).json({ error: 'Missing finding' })
      const supabase = getSupabase()
      const embedding = await embed(`${module} ${topic} ${object} ${finding}`)
      const { error } = await supabase.from('wani_knowledge').insert({ user_id: userId, module, topic, object, finding, confidence: confidence || 'verified', embedding })
      if (error) throw error
      return res.status(200).json({ saved: true })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  if (body.action === 'load_knowledge') {
    try {
      const supabase = getSupabase()
      const { data } = await supabase.from('wani_knowledge').select('id, module, topic, object, finding, confidence, created_at').eq('user_id', userId).order('created_at', { ascending: false })
      return res.status(200).json({ entries: data || [] })
    } catch { return res.status(200).json({ entries: [] }) }
  }

  if (body.action === 'delete_finding') {
    try {
      const { id } = body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const supabase = getSupabase()
      await supabase.from('wani_knowledge').delete().eq('id', id).eq('user_id', userId)
      return res.status(200).json({ deleted: true })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  if (body.action === 'get_memories') {
    try {
      const supaUrl = process.env.SUPABASE_URL
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
      const r = await fetch(`${supaUrl}/rest/v1/memories?user_id=eq.${userId}&order=created_at.desc&limit=50`, { headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` } })
      return res.status(200).json({ memories: await r.json() || [] })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  if (body.action === 'delete_memory') {
    try {
      const { memoryId } = body
      if (!memoryId) return res.status(400).json({ error: 'Missing memoryId' })
      const supaUrl = process.env.SUPABASE_URL
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
      await fetch(`${supaUrl}/rest/v1/memories?id=eq.${memoryId}&user_id=eq.${userId}`, { method: 'DELETE', headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` } })
      return res.status(200).json({ deleted: true })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  if (body.action === 'save_memory') {
    try {
      const { summary } = body
      if (!summary || !userId) return res.status(400).json({ error: 'Missing data' })
      const supaUrl = process.env.SUPABASE_URL
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
      const bullets = summary.split('\n').filter(l => l.trim().length > 10)
      let savedCount = 0
      for (const bullet of bullets.slice(0, 8)) {
        const fact = bullet.replace(/^[-•*]\s*/, '').trim()
        if (!fact) continue
        const keywords = fact.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4).slice(0, 3)
        if (keywords.length > 0) {
          const filters = keywords.map(w => `content.ilike.*${w}*`).join(',')
          const checkRes = await fetch(`${supaUrl}/rest/v1/memories?user_id=eq.${userId}&or=(${filters})&limit=1`, { headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` } })
          const existing = await checkRes.json()
          if (existing?.length > 0) continue
        }
        await saveMemory(userId, fact)
        savedCount++
      }
      return res.status(200).json({ saved: true, count: savedCount })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  if (body.action === 'save_correction') {
    try {
      const { userMsg, assistantMsg } = body
      if (!userMsg || !assistantMsg) return res.status(400).json({ error: 'Missing messages' })
      await saveGlobalCorrection(userMsg, assistantMsg, userId)
      return res.status(200).json({ saved: true })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // ── STREAMING HANDLER ─────────────────────────────────────────────────────
  const { messages, tone = 'balanced', userName, userRole, userModules = [], docWizardStage } = body
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
  const debugLog = {}  // admin debug info collected throughout

  try {
    // ── DAILY LIMIT CHECK ──────────────────────────────────────────────────
    const UNLIMITED_EMAILS_CHECK = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean)
    if (userId && !UNLIMITED_EMAILS_CHECK.includes(userEmail || '')) {
      try {
        const supaUrl = process.env.SUPABASE_URL
        const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
        const berlinDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
        const countRes = await fetch(
          `${supaUrl}/rest/v1/conversations?user_id=eq.${userId}&updated_at=gte.${berlinDate}T00:00:00&select=messages`,
          { headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` } }
        )
        const convs = await countRes.json()
        const todayStr = berlinDate
        const todayCount = (convs || []).reduce((total, conv) => {
          return total + (conv.messages || []).filter(m => {
            if (m.role !== 'user') return false
            if (m.created_at) return m.created_at.startsWith(todayStr)
            return true
          }).length
        }, 0)
        if (todayCount >= 50) {
          send({ type: 'done', full: `⏳ You've reached your daily limit of 50 messages. Your limit resets at midnight Berlin time.`, messageCount: 50, dailyLimit: 50, isUnlimited: false, deliverableType: 'NONE', model: 'limit' })
          return res.end()
        }
      } catch(e) { console.error('Limit check error:', e.message) }
    }

    const t0 = Date.now()

    // ── STEP 1: Classify + load corrections in parallel ────────────────────
    const [classification, globalCorrections] = await Promise.all([
      groqClassify(lastMsg),
      loadGlobalCorrections().catch(() => []),
    ])

    let { intent, confidence, secondaryIntent, isCorrection, needsSearch, isCode, isError,
          isBapiSearch, isExitSearch, isNoteSearch, isDocConfirm, isDocDeny } = classification

    debugLog.intent     = intent
    debugLog.confidence = confidence
    debugLog.needsSearch = needsSearch

    const isDeliverable = ['FS_SPEC', 'FS_EDIT', 'TECH_SPEC', 'WORKSHOP_PPT'].includes(intent)
    const DELIVERABLE_INTENTS_SET = new Set(['FS_SPEC','FS_EDIT','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','WORKSHOP_PPT'])

    console.log('CLASSIFICATION:', JSON.stringify({ q: lastMsg.slice(0, 60), intent, confidence, needsSearch }))

    // ── STEP 2: DOC WIZARD HANDLING ────────────────────────────────────────
    // Stage 1: Wani detected a doc intent → ask for confirmation
    if (DELIVERABLE_INTENTS_SET.has(intent) && docWizardStage !== 'confirmed' && docWizardStage !== 'gathering' && docWizardStage !== 'generate') {
      const confirmMsg = await buildDocConfirmMessage(intent, messages || [])
      send({ type: 'start', intent })
      send({ type: 'chunk', text: confirmMsg })
      send({ type: 'done', full: confirmMsg, model: 'gpt4o-mini', deliverableType: 'NONE', docWizardStage: 'awaiting_confirm', docIntent: intent, messageCount: 0, dailyLimit: 50, isUnlimited: false })
      return res.end()
    }

    // Stage 2: User said yes → gather requirements
    if (docWizardStage === 'confirmed' && isDocConfirm) {
      const requirementsMsg = await gatherDocRequirements(body.docIntent || intent, messages || [], lastMsg)
      send({ type: 'start', intent })
      send({ type: 'chunk', text: requirementsMsg })
      send({ type: 'done', full: requirementsMsg, model: 'gpt4o-mini', deliverableType: 'NONE', docWizardStage: 'gathering', docIntent: body.docIntent || intent, messageCount: 0, dailyLimit: 50, isUnlimited: false })
      return res.end()
    }

    // Stage 2: User said no → drop back to Q&A
    if (docWizardStage === 'awaiting_confirm' && isDocDeny) {
      const dropMsg = `No problem — let me know what you'd like to discuss.`
      send({ type: 'start', intent: 'GENERAL' })
      send({ type: 'chunk', text: dropMsg })
      send({ type: 'done', full: dropMsg, model: 'gpt4o-mini', deliverableType: 'NONE', docWizardStage: null, messageCount: 0, dailyLimit: 50, isUnlimited: false })
      return res.end()
    }

    // Stage 3: User answered requirements → set intent to generate
    // docWizardStage === 'gathering' means user just answered the requirement questions
    // docWizardStage === 'generate' means we should now generate the document
    const shouldGenerateDoc = docWizardStage === 'generate' || docWizardStage === 'gathering'

    // ── STEP 3: Conversation compression (rolling summary) ─────────────────
    const allMessages = (messages || []).filter(m => m.role && m.content?.trim())
    const { recentMsgs, summary: conversationSummary } = getConversationContext(allMessages)

    
    // ── STEP 4: Detect module for RAG filtering ────────────────────────────
    const detectedModule = detectModule(lastMsg + ' ' + (conversationSummary || ''), intent)
    debugLog.detectedModule = detectedModule

    // ── STEP 5: Fire parallel async operations ─────────────────────────────
    // All kicked off simultaneously — resolve before building system prompt
    const t1 = Date.now()

    // 5a. Book RAG — always fires for SAP Q&A intents, skip for code/deliverables
    const SAP_QA_INTENTS = new Set(['SAP_QA','PROCESS_QA','ERROR_ANALYSIS','PROBLEM_ANALYSIS','CUSTOMIZING','BEST_PRACTICES','FIORI_REC','CODE_ANALYSIS'])
    const bookRagPromise = (!isDeliverable && (SAP_QA_INTENTS.has(intent) || isBapiSearch || isExitSearch))
      ? fetchBookChunks(lastMsg, detectedModule, userToken).catch(() => [])
      : Promise.resolve([])

    // 5b. Search query rewrite (context-aware, uses summary)
    const searchQueryPromise = (!isDeliverable && needsSearch)
      ? rewriteForSearch(lastMsg, conversationSummary).catch(() => lastMsg)
      : Promise.resolve(lastMsg)

    // 5c. User knowledge + memories
    const knowledgePromise = userId ? fetchRelevantKnowledge(lastMsg, userId, userToken).catch(() => []) : Promise.resolve([])
    const memoriesPromise  = userId ? fetchUserMemories(lastMsg, userId).catch(() => []) : Promise.resolve([])

    // 5d. Search (Tavily + OpenAI) — only if needsSearch
    let tavilyResultsPromise  = Promise.resolve([])
    let openAIResultPromise   = Promise.resolve(null)

    if (!isDeliverable && needsSearch) {
      // Tavily fires by default for all SAP questions
      tavilyResultsPromise = searchQueryPromise.then(q => tavilySearch(q, intent).catch(() => []))
      // OpenAI search fires for complex questions and error/note lookups
      if (isNoteSearch || isErrorSearch || intent === 'PROBLEM_ANALYSIS' || intent === 'ERROR_ANALYSIS') {
        openAIResultPromise = callOpenAISearch(lastMsg).catch(() => null)
      }
    }

    // ── STEP 6: Resolve all parallel promises ─────────────────────────────
    const [
      bookChunks,
      searchQuery,
      relevantKnowledge,
      userMemories,
      tavilyRaw,
      openAIResult,
    ] = await Promise.all([
      bookRagPromise,
      searchQueryPromise,
      knowledgePromise,
      memoriesPromise,
      tavilyResultsPromise,
      openAIResultPromise,
    ])

    const t2 = Date.now()
    debugLog.parallelMs = t2 - t1

    // 5e. Filter Tavily results (after resolving)
    const tavilyFiltered = (tavilyRaw.length > 0)
      ? await filterRelevantResults(tavilyRaw, lastMsg).catch(() => tavilyRaw.slice(0, 3))
      : []

    // Combine search sources
    const openAISources = openAIResult?.sources || []
    const geminiSearchText = openAIResult?.text || ''
    const allSearchResults = [...tavilyFiltered, ...openAISources]

    debugLog.tavilyRaw      = tavilyRaw.length
    debugLog.tavilyFiltered = tavilyFiltered.length
    debugLog.openAISources  = openAISources.length
    debugLog.bookChunks     = bookChunks.length
    debugLog.knowledgeChunks = relevantKnowledge.length
    debugLog.searchQuery    = searchQuery

    // Pill links always generated from context-aware query
    const googleLinks = buildPillLinks(searchQuery)
    const noteRefs    = allSearchResults.length > 0 ? extractNoteNumbers(allSearchResults) : []

    // ── STEP 7: Build system prompt ────────────────────────────────────────
    const hasCodeInHistory = allMessages.slice(-12).some(m =>
      /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |FUNCTION /i.test(m.content || '')
    )

    const intentPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS['SAP_QA']
    const toneAddition = TONE_ADDITIONS[tone] || ''
    let systemPrompt = isDeliverable
      ? intentPrompt + toneAddition
      : BASE_SYSTEM_PROMPT + '\n\n' + intentPrompt + toneAddition

    if (intent === 'PROCESS_QA' && secondaryIntent === 'SAP_QA') secondaryIntent = null
    if (secondaryIntent && secondaryIntent !== intent && INTENT_PROMPTS[secondaryIntent]) {
      systemPrompt += `\n\nADDITIONAL REQUEST: After completing the primary task, also provide a ${secondaryIntent.replace(/_/g, ' ')} section. Keep it clearly separated with a "---" divider and heading.`
    }

    const LONG_INTENTS  = new Set(['FS_SPEC','FS_EDIT','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT'])
    const SHORT_INTENTS = new Set(['SAP_QA','PROCESS_QA','ERROR_ANALYSIS','FIORI_REC','GENERAL'])
    if (SHORT_INTENTS.has(intent))  systemPrompt += `\n\nOUTPUT LENGTH: Be concise and direct. Senior SAP consultant audience — they know the basics. Key fact first, then context. No preamble, no generic SAP background. If you can answer in 3-5 lines, do so.`
    if (LONG_INTENTS.has(intent))   systemPrompt += `\n\nOUTPUT LENGTH: This is a deliverable. Be thorough and complete all sections.`
    if (LONG_INTENTS.has(intent))   systemPrompt += `\n\nNever invent SAP T-codes, table names, BAdI names, or Fiori app IDs. Write "verify in your system" when uncertain.`

    // ── Inject conversation summary (rolling memory) ───────────────────────
    if (conversationSummary) {
      systemPrompt += `\n\n📋 CONVERSATION HISTORY (compressed — treat as confirmed context):\n${conversationSummary}\n\nThe recent messages below continue from this context. Never say you cannot access earlier conversation — the summary above contains it.`
    }

    // ── Inject Book RAG chunks ─────────────────────────────────────────────
    if (bookChunks.length > 0) {
      const chunkText = bookChunks.map((c, i) => {
        const versionNote = (c.sap_version && c.sap_version !== 'S4HANA' && c.sap_version !== 'unknown')
          ? ` [${c.sap_version} — verify paths in your S/4HANA system]`
          : ''
        return `[Book ${i+1}] ${c.source_book}, p.${c.page_number}${versionNote}\n${c.lesson_title ? `Topic: ${c.lesson_title}\n` : ''}${c.content}`
      }).join('\n\n---\n\n')
      systemPrompt += `\n\n📚 SAP DOCUMENTATION (from indexed books — use as primary reference):\n${chunkText}\n\nCITATION RULE: When citing book content, mention the book name and page number inline, e.g. "(PM Maintenance Planning, p.45)"`
    }

    // ── Inject verified knowledge ──────────────────────────────────────────
    if (relevantKnowledge.length > 0) {
      systemPrompt += `\n\n📌 VERIFIED FROM REAL PROJECTS (prioritise over generic docs):\n${relevantKnowledge.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object})`).join('\n')}`
    }

    // ── Inject personal memories ───────────────────────────────────────────
    if (userMemories.length > 0) {
      systemPrompt += `\n\n🧠 THIS CONSULTANT'S PERSONAL KNOWLEDGE (always prioritise):\n${userMemories.map(m => `- ${m.content}`).join('\n')}`
    }

    // ── Inject search results ──────────────────────────────────────────────
    if (geminiSearchText) {
      systemPrompt += `\n\nWEB SEARCH RESULTS (from OpenAI search):\n${geminiSearchText.slice(0, 2000)}`
    }

    if (tavilyFiltered.length > 0) {
      const tavilyText = tavilyFiltered.map((r, i) =>
        `[T${i+1}] ${r.source} — ${r.title}\n${r.snippet}`
      ).join('\n\n')
      systemPrompt += `\n\nSAP COMMUNITY & BLOGS (from Tavily — SAP sources only):\n${tavilyText}`
    }

    if (allSearchResults.length > 0) {
      const sourceRef = allSearchResults.map((r, i) => `[${i+1}] ${r.title} — ${r.url}`).join('\n')
      systemPrompt += `\n\nSOURCE REFERENCES:\n${sourceRef}\n\nCITATION RULES: Weave citations INLINE using [1] [2] notation. Do NOT add a Sources section at the end.`
    }

    // ── Document context ───────────────────────────────────────────────────
    const { documentChunks, documentName, documentType } = body
    if (documentChunks?.length > 0) {
      systemPrompt += `\n\n📄 DOCUMENT CONTEXT: User uploaded "${documentName}" (${documentType})\n${documentChunks.map((c, i) => `[${i+1}] ${c}`).join('\n\n')}`
    }

    // ── Anti-hallucination rules ───────────────────────────────────────────
    if (isNoteSearch || intent === 'ERROR_ANALYSIS') {
      systemPrompt += `\n\n⚠️ SAP NOTE RULE: NEVER invent note numbers. Only cite note numbers found in search results above. If none found, tell user to search support.sap.com/notes.`
    }
    if (noteRefs.length > 0) {
      systemPrompt += `\n\n📋 SAP NOTES FOUND:\n${noteRefs.map(n => `- SAP Note ${n.number}: ${n.url}`).join('\n')}`
    }
    if (isBapiSearch) systemPrompt += `\n\n⚠️ BAPI/FM ACCURACY RULE: NEVER invent BAPI or Function Module names. Only state names you are 100% certain exist. Verify in SE37 or https://api.sap.com`
    if (isExitSearch) systemPrompt += `\n\n⚠️ USER EXIT/BAdI RULE: Format as markdown table: Exit/BAdI Name | Type | T-code | What It Controls. Only state exits you are certain exist. Verify in SE84.`

    // ── Global corrections ─────────────────────────────────────────────────
    if (globalCorrections.length > 0) {
      systemPrompt += `\n\n⚠️ VERIFIED CORRECTIONS:\n${globalCorrections.map(c => `- ${c}`).join('\n')}`
    }

    // ── User context ───────────────────────────────────────────────────────
    if (firstName) {
      systemPrompt += `\n\nConsultant: ${firstName}${userRole ? `, ${userRole}` : ''}${userModules?.length ? `, SAP: ${userModules.join('/')}` : ''}.`
    }
    if (isFirstMessage && firstName) {
      systemPrompt += ` Greet with "${timeGreeting}, ${firstName}." then proceed. Only once.`
    }

    // ── Build valid messages ───────────────────────────────────────────────
    const validMessages = recentMsgs
      .filter(m => m.role && m.role !== 'system' && m.content?.trim())
      .map(m => ({
        role: m.role,
        content: String(m.content).trim().slice(0, hasCodeInHistory ? 6000 : 3000)
      }))

    send({ type: 'start', intent })
    let fullAnswer = ''
    let modelUsed  = ''

    const t3 = Date.now()
    debugLog.promptBuildMs = t3 - t2

    // ── STEP 8: MODEL ROUTING ──────────────────────────────────────────────
    //
    // Real ABAP code pasted    → Claude Sonnet only
    // Deliverables (FS/PPT)    → Claude Sonnet only
    // BAPI/FM name questions   → Q&A path (Groq misclassifies as CODE_ANALYSIS)
    // All SAP Q&A              → GPT-4o + Claude Haiku parallel → GPT-4o mini synthesises
    //

    // BAPI/FM question override — names like MEASUREM_POINT_UPD_PYEAR look like
    // code to Groq but are SAP Q&A questions. Override isCode when no code was actually pasted.
    const isBapiFmQuestion = isBapiSearch || isExitSearch ||
      (/\b(function module|bapi|rfc|user exit|badi|enhancement spot)\b/i.test(lastMsg) && !body.attachedCode)
    const isRealCode = isCode && !isBapiFmQuestion

    const isComplexAbap = isRealCode && (
      /\b(CLASS|INTERFACE|BADI|ENHANCEMENT|METHOD\s+\w+|CALL METHOD)\b/i.test(systemPrompt) ||
      /\b(risk|vulnerabilit|impact|performance|optimi[sz]e)\b/i.test(lastMsg)
    )
    const isComplexDeliverable = ['FS_SPEC', 'TECH_SPEC', 'WORKSHOP_PPT'].includes(intent)
    const isMeaningfulQuery = lastMsg.trim().split(/\s+/).length >= 4

    if (isRealCode || isComplexAbap) {
      // Real ABAP code pasted → Claude Sonnet only
      send({ type: 'model_label', label: 'by Claude Sonnet' })
      fullAnswer = await streamClaude('claude-sonnet-4-5', systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 8000)
      modelUsed = 'claude-sonnet'
      debugLog.routing = 'claude-sonnet (code)'

    } else if (isComplexDeliverable || shouldGenerateDoc) {
      // Deliverables → Claude Sonnet only
      send({ type: 'model_label', label: 'by Claude Sonnet' })
      fullAnswer = await streamClaude('claude-sonnet-4-5', systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 16000)
      modelUsed = 'claude-sonnet'
      debugLog.routing = 'claude-sonnet (deliverable)'

    } else if (isMeaningfulQuery && intent !== 'GENERAL') {
      // SAP Q&A + BAPI/FM questions → GPT-4o + Claude Haiku → GPT-4o mini synthesises
      modelUsed = 'synthesised'
      debugLog.routing = 'gpt4o + haiku → mini synthesis'

      let gptAnswer    = ''
      let claudeAnswer = ''

      send({ type: 'model_label', label: 'synthesising...' })

      // Fire both models in parallel — neither streams to UI yet
      const [gptResult, claudeResult] = await Promise.all([
        streamGPT(systemPrompt, validMessages, null, 'gpt-4o', 4096)
          .catch(e => { console.error('[GPT-4o] Error:', e.message); return '' }),
        streamClaude('claude-haiku-4-5-20251001', systemPrompt, validMessages, null, 4000)
          .catch(e => { console.error('[Claude] Error:', e.message); return '' }),
      ])

      gptAnswer    = gptResult
      claudeAnswer = claudeResult

      debugLog.gptAnswerLength    = gptAnswer.length
      debugLog.claudeAnswerLength = claudeAnswer.length

      const t4 = Date.now()
      debugLog.modelsMs = t4 - t3

      // If either model failed, use the other
      if (!gptAnswer && !claudeAnswer) {
        fullAnswer = '⚠️ Both models failed — please try again.'
      } else if (!claudeAnswer || !gptAnswer) {
        fullAnswer = gptAnswer || claudeAnswer
        for (const chunk of fullAnswer.split(' ')) {
          send({ type: 'chunk', text: chunk + ' ' })
        }
      } else {
        // Both answered — synthesise
        fullAnswer = await synthesiseAnswers(gptAnswer, claudeAnswer, lastMsg, chunk => send({ type: 'chunk', text: chunk }))
        debugLog.synthesisMs = Date.now() - t4
      }

      // Store raw answers in debug log for admin inspection
      debugLog.rawGptAnswer    = gptAnswer.slice(0, 500)
      debugLog.rawClaudeAnswer = claudeAnswer.slice(0, 500)

    } else {
      // Short/greeting — GPT-4o only
      send({ type: 'model_label', label: 'by GPT-4o' })
      fullAnswer = await streamGPT(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 'gpt-4o', 1024)
      modelUsed  = 'gpt4o'
      debugLog.routing = 'gpt4o (short)'
    }

    const t5 = Date.now()
    debugLog.totalMs = t5 - t0

    // ── STEP 9: SAVE TO MEMORY ────────────────────────────────────────────
    if (intent === 'SAVE_TO_MEMORY') {
      try {
        const convText = (messages || []).slice(-20)
          .filter(m => m.role && m.content?.trim())
          .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 600)}`)
          .join('\n')

        const summRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile', max_tokens: 400, temperature: 0,
            messages: [{ role: 'user', content: `Extract key SAP findings from this conversation as bullet points (max 8). Each bullet = standalone fact. Include T-codes, table names, decisions, problems solved.\n\nConversation:\n${convText}\n\nKey findings:` }]
          })
        })
        const summData = await summRes.json()
        let summary = summData.choices?.[0]?.message?.content?.trim() || ''
        if (!summary || summary.length < 20) {
          const lastAssistant = (messages || []).slice().reverse().find(m => m.role === 'assistant')
          const lastUser = (messages || []).slice().reverse().find(m => m.role === 'user')
          if (lastAssistant && lastUser) summary = `Q: ${lastUser.content.slice(0, 100)}\nA: ${lastAssistant.content.slice(0, 300)}`
        }
        if (!summary || summary.length < 20) {
          send({ type: 'error', error: 'Could not generate summary' })
          return res.end()
        }
        send({ type: 'save_to_memory_confirm', summary })
        return res.end()
      } catch (e) {
        send({ type: 'error', error: 'Could not summarise conversation' })
        return res.end()
      }
    }

    // ── STEP 10: FS / PPT completion detection ────────────────────────────
    const fsSectionCount = (fullAnswer.match(/---SECTION \d+:/g) || []).length
    const fsComplete = fullAnswer.includes('WANI_FS_COMPLETE') || (intent === 'FS_SPEC' && fsSectionCount >= 6)
    const cleanAnswer = fullAnswer.replace(/WANI_FS_COMPLETE[\s\S]*$/, '').trim()

    const slideBlockCount = (fullAnswer.match(/---SLIDE \d+---/g) || []).length
    const pptComplete = fullAnswer.includes('WANI_PPT_COMPLETE') || (intent === 'WORKSHOP_PPT' && slideBlockCount >= 5)
    const cleanPPTAnswer = fullAnswer.replace(/WANI_PPT_COMPLETE[\s\S]*$/, '').trim()

    let chatAnswer
    if (fsComplete) {
      const fsTitleMatch = cleanAnswer.match(/FS_TITLE:\s*(.+)/i)
      const fsTitle = (fsTitleMatch?.[1]?.trim() || 'Functional Specification').replace(/\*/g, '').trim()
      const sectionCount = (cleanAnswer.match(/---SECTION \d+:/g) || []).length
      chatAnswer = `✅ **Functional Specification generated — ${fsTitle}**\n\n📄 Your Word document has been downloaded automatically. It contains **${sectionCount} sections**.\n\n_If the download didn't start, use the button below to download again._`
    } else if (pptComplete) {
      const slideCount = (cleanPPTAnswer.match(/---SLIDE \d+---/g) || []).length
      chatAnswer = `✅ **Workshop Presentation generated — ${slideCount} slides**\n\n📊 Your PowerPoint file has been downloaded automatically.\n\n_If the download didn't start, use the button below to download again._`
    } else {
      chatAnswer = cleanAnswer
    }

    if (!chatAnswer?.trim()) {
      send({ type: 'error', error: 'Empty response — please try again' })
      return res.end()
    }

    // ── STEP 11: Send search links ────────────────────────────────────────
    if (allSearchResults.length > 0) {
      send({ type: 'search_results', results: allSearchResults })
    }

    const isSubstantialAnswer = /\b(T-code|SPRO|table|BAdI|BAPI|transaction|configuration|SAP|S\/4HANA|ABAP|Fiori|order|material|routing|BOM|settlement|movement|notification|equipment)\b/i.test(fullAnswer || '')
    const allFurtherReading = isSubstantialAnswer ? [...allSearchResults, ...googleLinks].slice(0, 9) : []
    if (allFurtherReading.length > 0) {
      send({ type: 'further_reading', links: allFurtherReading })
    }

    // ── STEP 12: Daily message count ──────────────────────────────────────
    const UNLIMITED_EMAILS = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean)
    const DAILY_LIMIT = 50
    let messageCount = 0

    if (userId && !UNLIMITED_EMAILS.includes(userEmail || '')) {
      try {
        const supaUrl = process.env.SUPABASE_URL
        const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
        const berlinDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
        const countRes = await fetch(
          `${supaUrl}/rest/v1/conversations?user_id=eq.${userId}&updated_at=gte.${berlinDate}T00:00:00&select=messages`,
          { headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` } }
        )
        const convs = await countRes.json()
        messageCount = (convs || []).reduce((total, conv) => {
          return total + (conv.messages || []).filter(m => m.role === 'user').length
        }, 0)
      } catch(e) { console.error('Message count error:', e.message) }
    }

    // ── STEP 13: Admin debug panel ────────────────────────────────────────
    if (isAdmin) {
      send({
        type: 'debug_info',
        data: {
          intent:             debugLog.intent,
          confidence:         debugLog.confidence,
          detectedModule:     debugLog.detectedModule,
          routing:            debugLog.routing,
          needsSearch:        debugLog.needsSearch,
          searchQuery:        debugLog.searchQuery,
          bookChunks:         debugLog.bookChunks,
          tavilyRaw:          debugLog.tavilyRaw,
          tavilyFiltered:     debugLog.tavilyFiltered,
          openAISources:      debugLog.openAISources,
          knowledgeChunks:    debugLog.knowledgeChunks,
          conversationCompressed: debugLog.conversationCompressed,
          summaryLength:      debugLog.summaryLength,
          gptAnswerLength:    debugLog.gptAnswerLength,
          claudeAnswerLength: debugLog.claudeAnswerLength,
          timing: {
            parallelMs:    debugLog.parallelMs,
            promptBuildMs: debugLog.promptBuildMs,
            modelsMs:      debugLog.modelsMs,
            synthesisMs:   debugLog.synthesisMs,
            totalMs:       debugLog.totalMs,
          },
          rawAnswers: {
            gpt:    debugLog.rawGptAnswer,
            claude: debugLog.rawClaudeAnswer,
          }
        }
      })
    }

    // ── STEP 14: Send done ────────────────────────────────────────────────
    const DELIVERABLE_TYPES_FINAL = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','FIORI_REC','WORKSHOP_PPT','CUSTOMIZING','BEST_PRACTICES'])
    const deliverableType = DELIVERABLE_TYPES_FINAL.has(intent) ? intent : 'NONE'

    send({
      type: 'done',
      model: modelUsed,
      full: chatAnswer,
      deliverableType,
      isCorrection,
      messageCount,
      dailyLimit: DAILY_LIMIT,
      isUnlimited: UNLIMITED_EMAILS.includes(userEmail || ''),
      ...(fsComplete  ? { fsComplete:  true, fsText:  cleanAnswer    } : {}),
      ...(pptComplete ? { pptComplete: true, pptText: cleanPPTAnswer } : {}),
      sourceInfo: {
        intent,
        routing:        debugLog.routing      || modelUsed,
        bookChunks:     debugLog.bookChunks   || 0,
        bookSources:    (bookChunks || []).map(c => `${c.source_book}, p.${c.page_number}`),
        tavilyRaw:      debugLog.tavilyRaw    || 0,
        tavilyFiltered: debugLog.tavilyFiltered || 0,
        openAISources:  debugLog.openAISources || 0,
        needsSearch,
        detectedModule: debugLog.detectedModule || null,
        totalMs:        debugLog.totalMs       || null,
      },
    })

  } catch (err) {
    console.error('HANDLER ERROR:', err.message)
    send({ type: 'error', error: err.message })
  } finally {
    res.end()
  }
}
