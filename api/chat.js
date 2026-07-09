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
FS_SPEC        = generate functional specification document (for a development requirement/Z-program)
TECH_SPEC      = generate technical/developer specification
TEST_CASES     = generate test cases or test script
GAP_ANALYSIS   = find gaps, missing items
WORKSHOP_PLAN  = create workshop plan or agenda
WORKSHOP_TOPICS= what topics to cover for a module/phase
WORKSHOP_PPT   = create PowerPoint for a workshop
FORMS_SPEC     = SAP output/print forms specification (Smart Forms/Adobe Forms development — NOT a general write-up)
GENERAL_DOC    = user wants the conversation/technical content discussed so far compiled into a document, with no specific structured type requested (not a dev spec, not test cases, not a workshop deck, not a print form). Use this whenever the request is just "write this up", "create a document with what we discussed", "put this in a Word doc" — do NOT default to FS_SPEC or FORMS_SPEC just because the word "document" or "specification" appears loosely.
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
    // Generic "turn what we discussed into a document" request — has no natural home in the
    // specific deliverable types below (FS_SPEC is for dev requirements, FORMS_SPEC is for SAP
    // print/output form development, TECH_SPEC is a developer handoff doc, etc.). Without this,
    // the LLM classifier has to force-fit a generic doc request into the closest wrong bucket.
    const isGeneralDocKeyword = /\b(create a document|make (me )?a document|put (this|it|everything) (in|into) a (word|doc)|write (this |it |everything )?up (as|into) a doc|compile (this|everything|it) into|document (this|the above|everything|what we)|turn this into a document|save this as a document)\b/i.test(question)
    const isTestKeyword  = /\b(test case|test script|test scenario|UAT|SIT|generate.*test|write.*test)\b/i.test(question)
    const isFioriKeyword = /\b(fiori|app.*recommendation|recommend.*app|which.*app|tile)\b/i.test(question)
    const isWorkshopPPT  = /\b(workshop.*ppt|workshop.*presentation|workshop.*slides|ppt.*workshop)\b/i.test(question)
    const isCustomizing  = /\b(spro|customiz|IMG|where.*config|config.*where|how.*config|configure.*path|where.*set up|where.*maintain)\b/i.test(question)
    const isBestPractice = /\b(best practice|sap activate|fit.to.standard|scope item|standard process|activate methodology)\b/i.test(question)
    const isNoteSearch   = /\b(sap note|oss note|correction note|note\s*\d{5,}|known issue|patch)\b/i.test(question) ||
      /\bnotes?\b/i.test(question) && /\b(find|search|any|look up|look for|check|got|is there|which|show)\b/i.test(question)
    // General explicit lookup/search intent — independent of topic (blogs, release notes, latest updates, etc.)
    // Without this, a request like "find me a blog about X" or "latest PP notes" could fall through
    // intent classification as GENERAL and never trigger search at all (needsSearch=false).
    const isExplicitSearchRequest = /\b(search for|find (me|a|any)|look up|look for|any (blog|note|article|post)|latest|recent|show me (a|any))\b/i.test(question)
    const isErrorSearch  = /\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW)\b/i.test(question)
    const isNewFeature   = /\b(2024|2025|2026|S\/4HANA 2|latest|new in|what changed|release note)\b/i.test(question)
    const isTroubleshoot = /\b(not working|doesn't work|missing|error|wrong|incorrect|failed|why is|why does|not found|not appearing|problem|issue)\b/i.test(question)
    const isVersionSpecific = /\b(s\/4hana \d|ecc|r\/3|vs\.|versus|difference between.*version|upgrade|migration)\b/i.test(question)
    const isBapiSearch   = /\b(bapi|function module|fm|rfc|which.*bapi|bapi.*for|function.*module|module.*function)\b/i.test(question)
    const isExitSearch   = /\b(user exit|badi|enhancement spot|which.*exit|exit.*for)\b/i.test(question)
    // Signals that the conversation MIGHT be heading toward a tabular/Excel deliverable —
    // triggers Stage 2 nuanced check via GPT-4o mini. Intentionally broad; Stage 2 filters precision.
    const hasTabularSignal = /\b(compare|comparison|validate|validation|reconcil|mapping|map.*field|migrat|table.*by.*table|field.*by.*field|discrepanc|gap list|cross.?reference|two systems|source.*target|before.*after)\b/i.test(question)

    // Signal that the question uses a WORD that is genuinely overloaded in SAP-consultant
    // speech — most commonly "code", which can mean T-code (transaction) or ABAP/BAPI code.
    // Broad and cheap on purpose; Stage 2 (classifyAmbiguity, GPT-4o mini) makes the real call.
    // Only fires when the question gives NO disambiguating context either way.
    const hasBareCodeWord = /\bcode\b/i.test(question)
    const hasAbapContext  = /\b(abap|bapi|function module|f(?:unction)? ?module|class |report |program|badi|z-?program|rfc\b)\b/i.test(question)
    const hasTcodeContext = /\b(t-?code|tcode|transaction)\b/i.test(question)
    const hasOverloadedTermSignal = hasBareCodeWord && !hasAbapContext && !hasTcodeContext

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
    // Only applies when nothing more specific matched — a generic "write this up as a document"
    // request should not be force-fit into FS_SPEC/FORMS_SPEC/TECH_SPEC.
    if (isGeneralDocKeyword && !isCode && !isError && !isFsKeyword && !isTestKeyword && !isWorkshopPPT) { intent = 'GENERAL_DOC'; confidence = 0.9 }

    const DELIVERABLE_INTENTS_SET = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','WORKSHOP_PPT','GENERAL_DOC'])
    if (DELIVERABLE_INTENTS_SET.has(intent) && confidence < 0.75) {
      intent = 'SAP_QA'
      secondaryIntent = null
    }

    // Tavily fires by default for all SAP questions
    // Only skip for pure conversational messages and memory saves
    const isNonSAPMessage = intent === 'GENERAL' && !isBapiSearch && !isExitSearch && !isNoteSearch && !isExplicitSearchRequest
    const needsSearch = (!isNonSAPMessage || isExplicitSearchRequest) && intent !== 'SAVE_TO_MEMORY'

    return {
      intent, confidence, secondaryIntent,
      isCode, isError, isCorrection, needsSearch,
      isDocConfirm, isDocDeny,
      isTroubleshoot, isVersionSpecific,
      isBapiSearch, isExitSearch, isNoteSearch, isErrorSearch, isExplicitSearchRequest,
      hasTabularSignal, hasOverloadedTermSignal,
    }
  } catch {
    return {
      intent: 'SAP_QA', confidence: 0.5, secondaryIntent: null,
      isCode: false, isError: false, isCorrection: false, needsSearch: false,
      isDocConfirm: false, isDocDeny: false,
      isTroubleshoot: false, isVersionSpecific: false,
      isBapiSearch: false, isExitSearch: false, isNoteSearch: false, isErrorSearch: false, isExplicitSearchRequest: false,
      hasTabularSignal: false, hasOverloadedTermSignal: false,
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

// ── 3b. EXCEL/VALIDATION CLASSIFIER — Stage 2 nuanced check via GPT-4o mini ──
// Only fires when Groq flags possible deliverable ambiguity.
// Separates "what type of deliverable" from "is the user ready to generate"
async function classifyExcelIntent(lastMsg, conversationHistory) {
  try {
    const convText = (conversationHistory || [])
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 300)}`)
      .join('\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Read this SAP consultant conversation and answer two separate questions.

QUESTION 1 — isExcelIntent: Is this conversation about comparing, validating, or tracking MULTIPLE records/fields against each other in a way that would naturally live in rows and columns (a spreadsheet)? Examples: data migration validation, table-by-table comparison, field mapping, gap lists, reconciliation. NOT excel: narrative documents, single explanations, process descriptions, conceptual questions.

QUESTION 2 — readyToGenerate: Has the user given an EXPLICIT instruction to create/generate/build the file NOW? Examples of ready: "create it", "generate the file", "make this for me", "build the macro", "yes go ahead". 
NOT ready: questions like "what will it look like", "how should I structure this", "can we do X", "what format" — these are still clarifying/discussing, even if document-shaped. Asking ABOUT the output is not the same as asking FOR the output.

Conversation:
${convText}

Latest message: "${lastMsg}"

Return ONLY valid JSON: {"isExcelIntent": true/false, "readyToGenerate": true/false, "reasoning": "one short sentence"}`
        }]
      })
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      isExcelIntent: parsed.isExcelIntent === true,
      readyToGenerate: parsed.readyToGenerate === true,
      reasoning: parsed.reasoning || '',
    }
  } catch (e) {
    console.error('[EXCEL CLASSIFY] Error:', e.message)
    return { isExcelIntent: false, readyToGenerate: false, reasoning: '' }
  }
}

// ── 3c. AMBIGUITY CLASSIFIER — Stage 2 nuanced check for overloaded terms ────
// Only fires when Groq flags a bare overloaded term (e.g. "code") with no
// disambiguating context. Mirrors classifyExcelIntent — cheap Stage 1 signal,
// then GPT-4o mini makes the actual judgment call so cost stays low on the
// vast majority of questions that were never ambiguous to begin with.
async function classifyAmbiguity(lastMsg, conversationHistory) {
  try {
    const convText = (conversationHistory || [])
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 300)}`)
      .join('\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `An SAP consultant sent a message containing a word that is genuinely overloaded in SAP-consultant speech — most commonly "code", which can mean either:
(a) a T-code / transaction code (e.g. "what's the code for X" → MD50, ME21N, etc.), or
(b) actual ABAP/BAPI program code to do something programmatically.
These two interpretations require completely different answers, so guessing wrong wastes the consultant's time or produces a fabricated answer.

Read the conversation and the latest message. Decide:
1. isAmbiguous: Is it genuinely unclear which meaning is intended? Answer false if the conversation already disambiguates — e.g. the user pasted ABAP earlier, explicitly said "transaction"/"tcode"/"program"/"BAPI", or the context otherwise makes only one reading plausible.
2. clarifyingQuestion: If ambiguous, write ONE short, friendly, specific clarifying question that names the two likely interpretations in plain terms (not just "can you clarify?"). If not ambiguous, return an empty string.

Conversation:
${convText}

Latest message: "${lastMsg}"

Return ONLY valid JSON: {"isAmbiguous": true/false, "clarifyingQuestion": "...", "reasoning": "one short sentence"}`
        }]
      })
    })
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      isAmbiguous: parsed.isAmbiguous === true,
      clarifyingQuestion: parsed.clarifyingQuestion || '',
      reasoning: parsed.reasoning || '',
    }
  } catch (e) {
    console.error('[AMBIGUITY CLASSIFY] Error:', e.message)
    return { isAmbiguous: false, clarifyingQuestion: '', reasoning: '' }
  }
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
        include_answer: false,
        include_raw_content: false,
        prefer_domains: [
          'community.sap.com',
          'blogs.sap.com',
          'help.sap.com',
          'me.sap.com',
          'ganeshsapscm.com',
          'saplearninghub.plateau.com'
        ],
        max_tokens_per_result: 1000,
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
      snippet: r.content?.slice(0, 1000) || '',
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
// ── WEB FETCH — get full content from top Tavily URLs ────────────────────────
// Tavily snippets are short — fetch the actual page for richer content
async function fetchUrlContent(url, maxChars = 3000) {
  try {
    // Only fetch from known safe SAP sources — avoid fetching arbitrary sites
    const safeDomains = [
      'community.sap.com', 'blogs.sap.com', 'help.sap.com',
      'me.sap.com', 'ganeshsapscm.com', 'saplearninghub.plateau.com',
      'sap-press.com', 'sapgurus.com', 'erpgreat.com', 'sapcommunity.com'
    ]
    const isSafe = safeDomains.some(d => url.includes(d))
    if (!isSafe) {
      console.log(`[FETCH] Skipping non-SAP URL: ${url.slice(0, 60)}`)
      return ''
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WaniBot/1.0; SAP research)',
        'Accept': 'text/html,application/xhtml+xml',
      }
    })
    clearTimeout(timeout)

    if (!res.ok) return ''

    const html = await res.text()

    // Extract text content from HTML — remove tags, scripts, styles
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
      .slice(0, maxChars)

    console.log(`[FETCH] ${url.slice(0, 60)} → ${text.length} chars`)
    return text
  } catch (e) {
    console.log(`[FETCH] Failed: ${url.slice(0, 60)} — ${e.message}`)
    return ''
  }
}

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
      match_threshold:  0.55,
      match_count:      8,
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

// ── 8. SYNTHESIS — Claude Sonnet merges GPT-4o + its own answer ──────────────
// Mini removed — it was introducing hallucinated table names and technical terms
// Sonnet merges because: better instruction following, less hallucination risk,
// already produced the best standalone answers in testing
async function synthesiseAnswers(sonnetAnswer, geminiAns, originalQuestion, bookChunksText, tavilyText, onChunk) {
  try {
    // Build the analyst prompt with all 4 sources
    const sourcesBlock = []

    if (bookChunksText) {
      sourcesBlock.push(`📚 SAP BOOK DOCUMENTATION (highest authority — always cite with page numbers):
${bookChunksText}`)
    }

    if (tavilyText) {
      sourcesBlock.push(`🔍 WEB SEARCH RESULTS (SAP Community, SAP Help, blogs):
${tavilyText}`)
    }

    if (sonnetAnswer) {
      sourcesBlock.push(`🧠 EXPERT ANSWER 1:\n`
      + sonnetAnswer)
    }

    if (geminiAns) {
      sourcesBlock.push(`🤖 EXPERT ANSWER 2:
${geminiAns}`)
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2048,
        temperature: 0.1,
        stream: true,
        messages: [{
          role: 'system',
          content: `You are an expert SAP analyst. You receive a question and multiple sources. Your job is to produce one clean, expert answer using ALL provided sources.

RULES — non-negotiable:
1. USE ALL SOURCES: Use content from ALL sources provided. Do not ignore any source unless it is completely off-topic (different SAP module entirely, completely unrelated process). If a web result touches the topic even partially — cite it.
2. NO OWN KNOWLEDGE: Do not add anything from your own training. Only use what is in the provided sources.
3. BOOK CHUNKS = HIGHEST AUTHORITY: If book documentation covers the topic — cite it with page numbers inline e.g. (Production Planning, p.27). It overrides other sources.
4. CONSULTANT ANSWERS = PRIMARY CONTENT: Use the consultant answers as the main content. They contain the key insights, gotchas, and mechanisms. PRESERVE ALL unique insights — especially gotchas, edge cases, table names, program names, and warnings. Do not drop any point that adds value.
5. WEB RESULTS = ALWAYS CITE: For every Tavily/web result provided — always include at least one reference to it in the answer. Add the URL as an inline citation [Source Title](URL). Even if the web result only partially addresses the question — cite it for further reading.
6. NO GREETINGS: Start directly with the answer. No "Good morning", "Let's dive into", or preamble.
7. NO STEP-BY-STEP FOR CONSULTANTS: Write in consultant prose. Not numbered documentation steps.
8. CONCISE BUT COMPLETE: Remove duplicates. Say each point once. But never drop a unique insight just to be shorter.
9. CITATIONS: Weave citations inline — (Book, p.XX) for books, [Title](URL) for web results.
10. NEVER write model names or source labels in the output. Never write [Claude Sonnet], [Gemini], [Expert Answer 1] or any attribution. Write as one seamless expert voice.`
        }, {
          role: 'user',
          content: 'SAP Question: ' + originalQuestion + '\n\n' + sourcesBlock.join('\n\n---\n\n') + '\n\nProduce one clean expert answer using only the relevant content above:'
        }]
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[SYNTHESIS] Error:', res.status, err.slice(0, 100))
      onChunk && sonnetAnswer.split(' ').forEach(w => onChunk(w + ' '))
      return sonnetAnswer
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
    console.log('[SYNTHESIS] Final answer length:', fullText.length)
    return fullText
  } catch (e) {
    console.error('[SYNTHESIS] Exception:', e.message)
    return sonnetAnswer
  }
}


// ── 8b. GEMINI — parallel answerer ───────────────────────────────────────────
async function geminiAnswer(question) {
  try {
    const key = process.env.GEMINI_API_KEY
    if (!key) { console.error('[GEMINI] No API key'); return '' }

    // Only pass the question — NOT the full system prompt
    // systemPrompt is too large (books + Tavily + history) and causes Gemini to return empty
    // Gemini answers independently — GPT-4o analyst combines all sources
    const prompt = `You are a senior SAP consultant with deep expertise across all SAP modules.
Answer the following question directly and concisely. 
No greetings. No preamble. Start immediately with the answer.
Write in consultant-to-consultant tone — skip basics, focus on mechanisms, gotchas, and edge cases.

Question: ${question}`

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,  // Must be high — thinking tokens consume this budget
          thinkingConfig: {
            thinkingBudget: 0     // Disable thinking — we need fast answers not deep reasoning
          }
        }
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[GEMINI] Error:', res.status, errText.slice(0, 300))
      return ''
    }

    const data = await res.json()
    
    // Log full response for debugging
    if (data.promptFeedback?.blockReason) {
      console.error('[GEMINI] Blocked:', data.promptFeedback.blockReason)
      return ''
    }
    
    // Gemini 2.5 Flash uses thinking mode — response has multiple parts
    // parts[0] may be the thinking part (thought: true), parts[1] is the actual answer
    const parts = data.candidates?.[0]?.content?.parts || []
    const answer = parts
      .filter(p => !p.thought)  // skip thinking parts
      .map(p => p.text || '')
      .join('')
      .trim()
    
    console.log('[GEMINI] Parts count:', parts.length, '| Answer length:', answer.length)
    if (!answer) {
      console.error('[GEMINI] Empty answer. Finish reason:', data.candidates?.[0]?.finishReason)
      console.error('[GEMINI] Full response:', JSON.stringify(data).slice(0, 500))
    }
    return answer
  } catch (e) {
    console.error('[GEMINI] Exception:', e.message)
    return ''
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
    EXCEL_VALIDATION: 'Excel validation/comparison file',
    GENERAL_DOC:  'Document summarizing what we discussed',
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
      EXCEL_VALIDATION: 'Excel validation/comparison file',
      GENERAL_DOC:  'Document summarizing what we discussed',
    }
    const docName = docNames[intent] || 'Document'

    const isExcel = intent === 'EXCEL_VALIDATION'
    const excelGuidance = isExcel ? `\n\nFor an Excel validation file specifically, you need to know: exact table/field names being compared, the key/mapping field that links source to target records, sample data format if available, and whether the user wants a macro (VBA) or formula-based (VLOOKUP/Power Query) approach.` : ''

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
Be specific to the SAP context discussed.${excelGuidance}`
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
      const { question, docName } = body
      if (!question) return res.status(200).json({ chunks: [] })
      const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
      const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${userToken}` } } })

      // Broad/summary questions ("what is this about", "summarize this") don't map well
      // to semantic similarity against any single chunk — go straight to ordered fallback.
      const isBroadSummaryQuestion = /\b(what is this (document|file)?\s*about|summar(y|ize|ise)|overview|what does this (document|file) (say|cover|contain)|main (points|topics)|tell me about this)\b/i.test(question)

      let chunks = []
      if (!isBroadSummaryQuestion) {
        const queryEmbedding = await embed(question)
        if (queryEmbedding) {
          const { data } = await userClient.rpc('match_wani_chunks', { query_embedding: queryEmbedding, match_threshold: 0.70, match_count: 6 })
          chunks = (data || []).map(d => d.chunk_text)
        }
      }

      // Fallback: broad question OR semantic search found nothing — pull the first
      // several chunks in document order instead of leaving the model with nothing.
      if (chunks.length === 0 && docName) {
        const { data: orderedData } = await userClient
          .from('wani_doc_chunks')
          .select('chunk_text')
          .eq('doc_name', docName)
          .order('chunk_index', { ascending: true })
          .limit(6)
        chunks = (orderedData || []).map(d => d.chunk_text)
      }

      return res.status(200).json({ chunks, fallbackUsed: chunks.length > 0 && (isBroadSummaryQuestion || chunks.length === 6) })
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
      // Embed the finding text alone — module/topic/object come from an automatic,
      // sometimes-wrong classification (e.g. a routing/MAPL fact mistagged as "Migration").
      // Prefixing the embedding with those labels pulls the vector away from what a future
      // question will actually look like, and can push real matches below match_threshold.
      const embedding = await embed(finding)
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
  let todayTopicHint = null // e.g. { module: 'PM', count: 6, totalToday: 8 } — used for occasional light callback

  try {
    // ── DAILY LIMIT CHECK ──────────────────────────────────────────────────
    const UNLIMITED_EMAILS_CHECK = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean)
    if (userId && !UNLIMITED_EMAILS_CHECK.includes(userEmail || '')) {
      try {
        const supaUrl = process.env.SUPABASE_URL
        const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
        const berlinDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
        const countRes = await fetch(
          `${supaUrl}/rest/v1/conversations?user_id=eq.${userId}&updated_at=gte.${berlinDate}T00:00:00&select=messages,module,topic`,
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

        // Same-day module pattern — only surfaced if there's a genuinely dominant theme
        // today (a real observation, not something to force every conversation).
        const moduleCounts = {}
        for (const conv of (convs || [])) {
          if (!conv.module) continue
          moduleCounts[conv.module] = (moduleCounts[conv.module] || 0) + 1
        }
        const sortedModules = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])
        if (sortedModules.length > 0 && todayCount >= 4) {
          const [topModule, topCount] = sortedModules[0]
          if (topCount >= 3 && topCount / sortedModules.reduce((s, [, c]) => s + c, 0) >= 0.6) {
            todayTopicHint = { module: topModule, count: topCount, totalToday: todayCount }
          }
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
          isBapiSearch, isExitSearch, isNoteSearch, isErrorSearch, isExplicitSearchRequest, isDocConfirm, isDocDeny,
          hasTabularSignal, hasOverloadedTermSignal } = classification

    debugLog.intent     = intent
    debugLog.confidence = confidence
    debugLog.needsSearch = needsSearch

    // ── STEP 1b: Stage 2 Excel/validation classifier ────────────────────────
    // Only fires when Groq flags possible tabular/comparison signal — keeps cost low
    let excelClassification = { isExcelIntent: false, readyToGenerate: false }
    if (hasTabularSignal && !isCode && intent !== 'SAVE_TO_MEMORY') {
      excelClassification = await classifyExcelIntent(lastMsg, messages || []).catch(() => excelClassification)
      debugLog.excelClassify = excelClassification
      if (excelClassification.isExcelIntent) {
        intent = 'EXCEL_VALIDATION'
        confidence = 0.9
      }
    }

    // ── STEP 1c: Stage 2 ambiguity classifier ───────────────────────────────
    // Only fires when Groq flags a bare overloaded term (e.g. "code" with no
    // ABAP/BAPI or T-code context) — keeps cost low on the vast majority of
    // unambiguous questions. If genuinely ambiguous, ask rather than guess —
    // skips the entire RAG/search/synthesis pipeline for a cheap one-line reply.
    let ambiguityClassification = { isAmbiguous: false, clarifyingQuestion: '' }
    if (hasOverloadedTermSignal && !isCode && intent !== 'SAVE_TO_MEMORY' && !isDocConfirm && !isDocDeny
        && docWizardStage !== 'confirmed' && docWizardStage !== 'gathering' && docWizardStage !== 'generate') {
      ambiguityClassification = await classifyAmbiguity(lastMsg, messages || []).catch(() => ambiguityClassification)
      debugLog.ambiguityClassify = ambiguityClassification
      if (ambiguityClassification.isAmbiguous && ambiguityClassification.clarifyingQuestion) {
        send({ type: 'start', intent: 'CLARIFY' })
        send({ type: 'chunk', text: ambiguityClassification.clarifyingQuestion })
        send({ type: 'done', full: ambiguityClassification.clarifyingQuestion, model: 'gpt4o-mini', deliverableType: 'NONE', docWizardStage: null, messageCount: 0, dailyLimit: 50, isUnlimited: false })
        return res.end()
      }
    }

    const isDeliverable = ['FS_SPEC', 'FS_EDIT', 'TECH_SPEC', 'WORKSHOP_PPT', 'EXCEL_VALIDATION', 'GENERAL_DOC'].includes(intent)
    const DELIVERABLE_INTENTS_SET = new Set(['FS_SPEC','FS_EDIT','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','WORKSHOP_PPT','EXCEL_VALIDATION','GENERAL_DOC'])

    console.log('CLASSIFICATION:', JSON.stringify({ q: lastMsg.slice(0, 60), intent, confidence, needsSearch }))

    // ── STEP 2: DOC WIZARD HANDLING ────────────────────────────────────────
    // Stage 1: Wani detected a doc intent → ask for confirmation
    // EXCEL_VALIDATION has an extra gate: only trigger the wizard if Stage 2
    // classifier confirmed the user is actually ready to generate — never on
    // a clarifying question like "what will the format look like".
    const excelNotReady = intent === 'EXCEL_VALIDATION' && !excelClassification.readyToGenerate
      && docWizardStage !== 'confirmed' && docWizardStage !== 'gathering' && docWizardStage !== 'generate'

    if (DELIVERABLE_INTENTS_SET.has(intent) && !excelNotReady && docWizardStage !== 'confirmed' && docWizardStage !== 'gathering' && docWizardStage !== 'generate') {
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
      if (isNoteSearch || isErrorSearch || isExplicitSearchRequest || intent === 'PROBLEM_ANALYSIS' || intent === 'ERROR_ANALYSIS') {
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

    // Deduplicate book chunks by source_book + page_number
    const seenChunkKeys = new Set()
    const dedupedBookChunks = bookChunks.filter(c => {
      const key = `${c.source_book}-${c.page_number}`
      if (seenChunkKeys.has(key)) return false
      seenChunkKeys.add(key)
      return true
    })
    // Replace bookChunks with deduped version for all downstream use
    bookChunks.splice(0, bookChunks.length, ...dedupedBookChunks)

    // 5e. Filter Tavily results (after resolving)
    const tavilyFiltered = (tavilyRaw.length > 0)
      ? await filterRelevantResults(tavilyRaw, lastMsg).catch(() => tavilyRaw.slice(0, 3))
      : []

    // 5f. Web fetch top 2 Tavily URLs for full content
    // Runs in parallel for speed — enriches snippets significantly
    if (tavilyFiltered.length > 0) {
      const fetchPromises = tavilyFiltered.slice(0, 2).map(async (r, i) => {
        const fullContent = await fetchUrlContent(r.url).catch(() => '')
        if (fullContent && fullContent.length > r.snippet.length) {
          tavilyFiltered[i].snippet = fullContent  // Replace short snippet with full content
          console.log(`[FETCH] Enriched result ${i+1}: ${fullContent.length} chars`)
        }
      })
      await Promise.all(fetchPromises)
    }

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

    if (todayTopicHint && !isDeliverable) {
      systemPrompt += `\n\n📅 TODAY'S PATTERN (background only): This user has asked ${todayTopicHint.count} of their ${todayTopicHint.totalToday} questions today about ${todayTopicHint.module}. You MAY make ONE brief, light, natural callback to this if it genuinely fits the moment — e.g. noticing it's been a real ${todayTopicHint.module} kind of day. Keep it to a single short aside, never a recurring habit — do NOT mention this in every answer, only when it would land naturally, and never force it if the current question doesn't call for it. If in doubt, skip it and just answer.`
    }

    if (intent === 'PROCESS_QA' && secondaryIntent === 'SAP_QA') secondaryIntent = null
    if (secondaryIntent && secondaryIntent !== intent && INTENT_PROMPTS[secondaryIntent]) {
      systemPrompt += `\n\nADDITIONAL REQUEST: After completing the primary task, also provide a ${secondaryIntent.replace(/_/g, ' ')} section. Keep it clearly separated with a "---" divider and heading.`
    }

    const LONG_INTENTS  = new Set(['FS_SPEC','FS_EDIT','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','EXCEL_VALIDATION','GENERAL_DOC'])
    const SHORT_INTENTS = new Set(['SAP_QA','PROCESS_QA','ERROR_ANALYSIS','FIORI_REC','GENERAL'])
    if (SHORT_INTENTS.has(intent))  systemPrompt += `\n\nAUDIENCE AND TONE: You are speaking to a senior SAP consultant with 10+ years experience. They are mid-project and need the insight, not the manual.
- Skip obvious steps like "enter material number" or "go to transaction"
- Open with the mechanism, the gotcha, or the version-specific behaviour — not a definition
- Write like a colleague who has done this 50 times talking to someone who has done it 20 times
- Never explain what a T-code is. Never add generic SAP background.
- The non-obvious insight is worth 10x more than the obvious step
- If you are uncertain about a T-code or technical term — say "verify in your system" rather than guessing`
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
      systemPrompt += `\n\n📚 SAP DOCUMENTATION (from indexed books — use as primary reference):\n${chunkText}\n\nCITATION RULES — MANDATORY:\n- You MUST cite book chunks when they cover the topic. Never state a fact from your own training when the book covers it.\n- Every fact derived from a book chunk MUST include an inline citation: (Book Title, p.XX)\n- If multiple chunks are relevant, cite each one where used\n- Book citations are not optional — they are the primary value Wani provides\n- Example: "The call horizon is configured in IP10 (PM Maintenance Planning, p.129)"`
    }

    // ── Inject verified knowledge ──────────────────────────────────────────
    // These are findings THIS consultant previously confirmed as correct (via the
    // Knowledge Base save flow) — not generic training data or search results.
    // Wani must surface that provenance explicitly rather than blending it in silently.
    if (relevantKnowledge.length > 0) {
      systemPrompt += `\n\n📌 VERIFIED FROM REAL PROJECTS — CONFIRMED BY THIS CONSULTANT EARLIER:\n${relevantKnowledge.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object})`).join('\n')}\n\nATTRIBUTION RULE — MANDATORY: These findings came from this consultant's own earlier confirmed discussion, not from books, web search, or your training. Treat them as the highest-priority, authoritative source — they override generic documentation or training knowledge on the same topic. When you use one, say so explicitly and naturally, e.g. "Based on our earlier discussion, this is correct: ..." or "You confirmed this before — ...". Do not present it as if it were a fresh answer or a generic citation.`
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
    } else if (documentName) {
      // A document was uploaded but no chunks came back for this question — say so
      // explicitly instead of leaving the model with zero signal a document exists
      // (which previously led it to silently fabricate an answer).
      systemPrompt += `\n\n📄 DOCUMENT STATUS: User uploaded "${documentName}" but no relevant sections could be retrieved for this question. Do NOT guess or invent what the document contains. Tell the user plainly that you couldn't retrieve relevant content from the document for this question, and ask them to paste the relevant section or rephrase.`
    }

    // ── Anti-hallucination rules ───────────────────────────────────────────
    if (isNoteSearch || intent === 'ERROR_ANALYSIS') {
      systemPrompt += `\n\n⚠️ SAP NOTE RULE: NEVER invent note numbers. Only cite note numbers found in search results above. If none found, tell user to search support.sap.com/notes.`
    }
    if (isExplicitSearchRequest) {
      systemPrompt += `\n\n⚠️ SEARCH RESULT RULE: The user explicitly asked you to find/search for something. Only report items (notes, blogs, articles, links) that actually appear in the search results injected above. Do NOT invent or guess plausible-sounding results dressed up as matches (no "the timing and context match" type hedges). If the search results above are empty or don't contain a real match, say plainly that the search didn't return a relevant result — don't substitute your own guess.`
    }
    if (noteRefs.length > 0) {
      systemPrompt += `\n\n📋 SAP NOTES FOUND:\n${noteRefs.map(n => `- SAP Note ${n.number}: ${n.url}`).join('\n')}`
    }
    if (isBapiSearch) systemPrompt += `\n\n⚠️ BAPI/FM ACCURACY RULE: NEVER invent BAPI or Function Module names. Only state names you are 100% certain exist. Verify in SE37 or https://api.sap.com`
    if (isExitSearch) systemPrompt += `\n\n⚠️ USER EXIT/BAdI RULE: Format as markdown table: Exit/BAdI Name | Type | T-code | What It Controls. Only state exits you are certain exist. Verify in SE84.`

    // ── Permanent hardcoded corrections ────────────────────────────────────────
    systemPrompt += `\n\n⚠️ PERMANENT CORRECTIONS — ALWAYS APPLY:\n- MRP Area exists indicator field is MARC-DIBER (NOT MARC-KZAUN — KZAUN is unrelated to MRP Areas)\n- MDMA table stores MRP Area data for materials\n- Standard SAP report for mass update of MRP area indicator contains DIBER in its name`

    // ── Global corrections ─────────────────────────────────────────────────
    if (globalCorrections.length > 0) {
      systemPrompt += `\n\n⚠️ VERIFIED CORRECTIONS:\n${globalCorrections.map(c => `- ${c}`).join('\n')}`
    }

    // ── User context ───────────────────────────────────────────────────────
    if (firstName) {
      systemPrompt += `\n\nConsultant: ${firstName}${userRole ? `, ${userRole}` : ''}${userModules?.length ? `, SAP: ${userModules.join('/')}` : ''}.`
    }
    // Note: no scripted greeting injected here — see NO SCRIPTED GREETING /
    // REACT LIKE A COLLEAGUE rules in BASE_SYSTEM_PROMPT (_shared.js).
    // timeGreeting is retained only in case other logic references it.

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
      (/\b(function module|bapi|rfc|user exit|badi|enhancement spot|custom logic|custom code|z-program|z program|abap program)\b/i.test(lastMsg) && !body.attachedCode && !/(SELECT |DATA:|LOOP AT|ENDLOOP|METHOD |CLASS |FORM |PERFORM )/i.test(lastMsg))
    const isRealCode = isCode && !isBapiFmQuestion

    const isComplexAbap = isRealCode && (
      /\b(CLASS|INTERFACE|BADI|ENHANCEMENT|METHOD\s+\w+|CALL METHOD)\b/i.test(systemPrompt) ||
      /\b(risk|vulnerabilit|impact|performance|optimi[sz]e)\b/i.test(lastMsg)
    )
    const isComplexDeliverable = ['FS_SPEC', 'TECH_SPEC', 'WORKSHOP_PPT', 'GENERAL_DOC'].includes(intent)
    const isMeaningfulQuery = lastMsg.trim().split(/\s+/).length >= 4

    if (isRealCode || isComplexAbap) {
      // Real ABAP code pasted → Claude Sonnet only
      send({ type: 'model_label', label: 'by Claude Sonnet' })
      fullAnswer = await streamClaude('claude-sonnet-4-5', systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 8000)
      modelUsed = 'claude-sonnet'
      debugLog.routing = 'claude-sonnet (code)'
      debugLog.rawClaudeAnswer = fullAnswer
      debugLog.enrichedPromptSnippet = systemPrompt.slice(0, 2000)

    } else if (intent === 'EXCEL_VALIDATION' && shouldGenerateDoc) {
      // Excel/macro/VBA generation → GPT-4o only (better at formulas, VBA syntax, tabular logic)
      send({ type: 'model_label', label: 'by GPT-4o' })
      fullAnswer = await streamGPT(systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 'gpt-4o', 16000)
      modelUsed = 'gpt4o'
      debugLog.routing = 'gpt4o (excel/macro)'

    } else if (isComplexDeliverable || shouldGenerateDoc) {
      // Deliverables → Claude Sonnet only
      send({ type: 'model_label', label: 'by Claude Sonnet' })
      fullAnswer = await streamClaude('claude-sonnet-4-5', systemPrompt, validMessages, chunk => send({ type: 'chunk', text: chunk }), 16000)
      modelUsed = 'claude-sonnet'
      debugLog.routing = 'claude-sonnet (deliverable)'
      debugLog.rawClaudeAnswer = fullAnswer
      debugLog.rawMergedAnswer = fullAnswer
      debugLog.enrichedPromptSnippet = systemPrompt.slice(0, 2000)
      debugLog.geminiNotCalled = true // this route is Sonnet-only by design — Gemini is never invoked here

    } else if (isMeaningfulQuery) {
      // ALL SAP Q&A → Sonnet answers directly with books + Tavily injected
      // No merger. No GPT-4o. Sonnet IS the final answer.
      modelUsed = 'sonnet-direct'
      debugLog.routing = 'sonnet-direct (books + tavily injected)'

      // Build enriched system prompt with books and Tavily baked in
      let enrichedSystemPrompt = systemPrompt

      // Inject book chunks directly into Sonnet's prompt
      if ((bookChunks || []).length > 0) {
        const bookText = bookChunks.map((c, i) =>
          `[Book ${i+1}] ${c.source_book}, p.${c.page_number}${c.lesson_title ? ` — ${c.lesson_title}` : ''}\n${c.content}`
        ).join('\n\n')
        enrichedSystemPrompt += `\n\n📚 SAP BOOK DOCUMENTATION — cite these with page numbers inline:\n${bookText}\n\nWhen using book content, cite it as: (${bookChunks[0]?.source_book || 'Book'}, p.XX)`
      }

      // Inject Tavily results directly into Sonnet's prompt
      if (tavilyFiltered.length > 0) {
        const tavilyText = tavilyFiltered.map((r, i) =>
          `[Web ${i+1}] ${r.title}\nURL: ${r.url}\n${(r.snippet || '').slice(0, 1000)}`
        ).join('\n\n')
        enrichedSystemPrompt += `\n\n🔍 WEB SEARCH RESULTS — cite relevant ones with URL inline:\n${tavilyText}\n\nWhen using web content, cite it as: [Title](URL)`
      }

      // Fire Gemini first (non-streaming, runs while we build Sonnet prompt)
      send({ type: 'model_label', label: '' })

      // Start Gemini immediately in parallel
      const geminiPromise = geminiAnswer(lastMsg).catch(e => {
        console.error('[GEMINI] Exception:', e.message)
        return ''
      })

      // Wait for Gemini to complete (usually 3-6s, same as Sonnet setup time)
      const geminiAns = await geminiPromise
      console.log('[GEMINI] Answer length for injection:', geminiAns.length)

      // Inject Gemini answer into Sonnet prompt as additional expert perspective
      let finalEnrichedPrompt = enrichedSystemPrompt
      if (geminiAns && geminiAns.length > 100) {
        finalEnrichedPrompt += `\n\n🤖 ADDITIONAL EXPERT PERSPECTIVE (use insights not already in your answer, do not repeat yourself, do not mention this is from another model):\n${geminiAns.slice(0, 2000)}`
      }

      // Sonnet answers directly — streaming to user — THIS is the final answer
      fullAnswer = await streamClaude(
        'claude-sonnet-4-5',
        finalEnrichedPrompt,
        validMessages,
        chunk => send({ type: 'chunk', text: chunk }),
        4096
      )

      debugLog.rawClaudeAnswer = fullAnswer
      debugLog.rawMergedAnswer = fullAnswer
      debugLog.geminiRawAnswer = geminiAns || ''
      console.log('[GEMINI] Stored in pipeline:', (geminiAns || '').length, 'chars')
      debugLog.rawGptAnswer    = ''

      const t4 = Date.now()
      debugLog.modelsMs    = t4 - t3
      debugLog.synthesisMs = 0
      debugLog.geminiCorrections = 0
      debugLog.enrichedPromptSnippet = finalEnrichedPrompt.slice(0, 4000)
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
          timing: {
            parallelMs:    debugLog.parallelMs,
            promptBuildMs: debugLog.promptBuildMs,
            modelsMs:      debugLog.modelsMs,
            synthesisMs:   debugLog.synthesisMs,
            geminiMs:      debugLog.geminiMs,
            totalMs:       debugLog.totalMs,
          },
          // Full pipeline data for answer pipeline debugger
          pipeline: {
            bookChunkDetails: (bookChunks || []).map(c => ({
              book:    c.source_book,
              page:    c.page_number,
              title:   c.lesson_title || '',
              content: c.content?.slice(0, 300) || '',
            })),
            tavilyResults: (tavilyFiltered || []).map(r => ({
              source:  r.source,
              title:   r.title?.slice(0, 80) || '',
              url:     r.url || '',
              snippet: r.snippet?.slice(0, 200) || '',
            })),
            openAISnippet: geminiSearchText?.slice(0, 400) || '',
            gptAnswer:     '',  // GPT-4o is now analyst not answerer
            geminiAnswer:  debugLog.geminiRawAnswer || '',
            claudeAnswer:  debugLog.rawClaudeAnswer || '',
            mergedAnswer:  debugLog.rawMergedAnswer || '',
            geminiCorrections: debugLog.geminiCorrections || 0,
            geminiDetails: debugLog.geminiDetails   || [],
          }
        }
      })
    }

    // ── STEP 14: Send done ────────────────────────────────────────────────
    const DELIVERABLE_TYPES_FINAL = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','FIORI_REC','WORKSHOP_PPT','CUSTOMIZING','BEST_PRACTICES','EXCEL_VALIDATION','GENERAL_DOC'])
    const deliverableType = DELIVERABLE_TYPES_FINAL.has(intent) ? intent : 'NONE'

    // ── Build full debug document ─────────────────────────────────────────
    const debugDoc = [
      '═══════════════════════════════════════════════════════════',
      'WANI DEBUG DOCUMENT',
      `Generated: ${new Date().toISOString()}`,
      `Total time: ${debugLog.totalMs}ms`,
      '═══════════════════════════════════════════════════════════',
      '',
      '1. QUESTION',
      '─────────────────────────────────────────────────────────',
      lastMsg,
      '',
      '2. CLASSIFICATION (Groq)',
      '─────────────────────────────────────────────────────────',
      `Intent: ${intent} (confidence: ${debugLog.confidence})`,
      `Module detected: ${debugLog.detectedModule || 'none'}`,
      `needsSearch: ${needsSearch}`,
      `Routing: ${debugLog.routing}`,
      '',
      '3. BOOK RAG',
      '─────────────────────────────────────────────────────────',
      `Chunks found: ${debugLog.bookChunks || 0}`,
      ...(bookChunks || []).map((c, i) =>
        `[${i+1}] ${c.source_book}, p.${c.page_number}\n    Title: ${c.lesson_title || 'n/a'}\n    Content: ${c.content?.slice(0, 300) || ''}`
      ),
      '',
      '3b. CONSULTANT KNOWLEDGE BASE (wani_knowledge — your saved/verified findings)',
      '─────────────────────────────────────────────────────────',
      `Entries matched: ${debugLog.knowledgeChunks || 0} (match_threshold 0.75)`,
      ...(relevantKnowledge || []).map((k, i) =>
        `[K${i+1}] ${k.module} > ${k.topic} > ${k.object}\n    Finding: ${k.finding}`
      ),
      (relevantKnowledge || []).length === 0
        ? '(No saved findings matched this question — if you expected one to fire, check match_threshold or how it was tagged/embedded when saved.)'
        : '',
      '',
      '4. TAVILY SEARCH',
      '─────────────────────────────────────────────────────────',
      `Search query sent: ${debugLog.searchQuery || lastMsg}`,
      `Raw results: ${debugLog.tavilyRaw || 0} | After filtering: ${debugLog.tavilyFiltered || 0}`,
      ...(tavilyFiltered || []).map((r, i) =>
        `[T${i+1}] ${r.source} — ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.snippet?.slice(0, 400) || ''}`
      ),
      '',
      '5. CLAUDE SONNET (PRIMARY ANSWERER — FINAL ANSWER)',
      '─────────────────────────────────────────────────────────',
      '→ FULL ENRICHED PROMPT SENT TO SONNET (includes books + Tavily):',
      (debugLog.enrichedPromptSnippet || systemPrompt || '').slice(0, 4000),
      '',
      '← ANSWER RECEIVED:',
      debugLog.rawClaudeAnswer || 'No answer',
      '',
      '6. GEMINI 2.5 FLASH',
      '─────────────────────────────────────────────────────────',
      '→ PROMPT SENT:',
      `You are a senior SAP consultant. Answer: ${lastMsg}`,
      '',
      '← ANSWER RECEIVED:',
      debugLog.geminiRawAnswer || (debugLog.geminiNotCalled ? 'N/A — Gemini is not called on this routing path (Sonnet-only route)' : 'No answer (check Vercel logs for [GEMINI] error)'),
      '',
      '7. GPT-4o ANALYST (removed from Q&A pipeline)',
      '─────────────────────────────────────────────────────────',
      '→ NOT USED — Sonnet answers directly. GPT-4o only used for short greetings.',
      `  Book chunks: ${(bookChunks || []).length}`,
      `  Tavily results: ${(tavilyFiltered || []).length}`,
      `  Expert Answer 1 (Sonnet): ${(debugLog.rawClaudeAnswer || '').length} chars`,
      `  Expert Answer 2 (Gemini): ${(debugLog.geminiRawAnswer || '').length} chars`,
      '',
      '← FINAL ANSWER RECEIVED:',
      debugLog.rawMergedAnswer || fullAnswer || '',
      '',
      '8. FINAL OUTPUT TO USER',
      '─────────────────────────────────────────────────────────',
      chatAnswer || fullAnswer || '',
      '',
      '═══════════════════════════════════════════════════════════',
      'END OF DEBUG DOCUMENT',
      '═══════════════════════════════════════════════════════════',
    ].join('\n')

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
      debugDoc,
      sourceInfo: {
        intent,
        routing:        debugLog.routing      || modelUsed,
        bookChunks:     debugLog.bookChunks   || 0,
        bookSources:    (bookChunks || []).map(c => `${c.source_book}, p.${c.page_number}`),
        tavilyRaw:      debugLog.tavilyRaw    || 0,
        tavilyFiltered: debugLog.tavilyFiltered || 0,
        openAISources:  debugLog.openAISources || 0,
        needsSearch,
        detectedModule:      debugLog.detectedModule || null,
        totalMs:             debugLog.totalMs || null,
        geminiCorrections:   debugLog.geminiCorrections || 0,
        // Full pipeline — always sent, collapsed by default in UI
        pipeline: {
          bookChunkDetails: (bookChunks || []).map(c => ({
            book:    c.source_book,
            page:    c.page_number,
            title:   c.lesson_title || '',
            content: c.content?.slice(0, 400) || '',
          })),
          tavilyResults: (tavilyFiltered || []).map(r => ({
            source:  r.source,
            title:   r.title?.slice(0, 80) || '',
            url:     r.url || '',
            snippet: r.snippet?.slice(0, 300) || '',
          })),
          openAISnippet:     geminiSearchText?.slice(0, 500) || '',
          gptAnswer:         debugLog.rawGptAnswer    || '',
          claudeAnswer:      debugLog.rawClaudeAnswer || '',
          mergedAnswer:      debugLog.rawMergedAnswer || '',
          geminiCorrections: debugLog.geminiCorrections || 0,
          geminiDetails:     debugLog.geminiDetails   || [],
        },
      },
    })

  } catch (err) {
    console.error('HANDLER ERROR:', err.message)
    send({ type: 'error', error: err.message })
  } finally {
    res.end()
  }
}
