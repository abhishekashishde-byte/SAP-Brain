// Code section: Wani reads a program the consultant pastes, explains it, checks
// it against S/4HANA, answers follow-ups, writes documentation / test cases on
// request, and prepares a reusable library summary. All judgement is the model's;
// there are no keyword rules here.
import { requireApprovedUser, requireJsonBody, sendAuthError } from '../shared/_auth.js'

const MODEL = process.env.WANI_CODE_MODEL || process.env.WANI_ANSWER_MODEL || 'claude-sonnet-5-5'
const FALLBACK_MODEL = 'claude-sonnet-4-5'
const REPAIR_MODEL = process.env.WANI_SMALL_MODEL || 'claude-haiku-5-5'
const MAX_CODE = 450_000 // ~10,000 lines

const PERSONA = `You are Wani, a senior SAP S/4HANA consultant and ABAP reviewer talking to a senior functional/technical consultant.
Write SAP identifiers (T-codes, tables, fields, BAPIs, BAdIs, function modules, classes, programs) in single backticks.
Only name SAP objects that appear in the code or that you verified with web_search this turn. Never invent object names, note numbers or release numbers.
Be direct and brief. No talk about your own sources or process.`

const ANALYSE = `${PERSONA}
Analyse the program the consultant pasted. Work out what it is for from the code itself.
Then judge it against SAP S/4HANA:
- Objects that changed or are obsolete in S/4HANA (for example tables replaced by MATDOC/ACDOCA, BAPIs or function modules not supported or replaced, compatibility views, removed transactions). Use web_search to check the Simplification List, SAP Notes/KBAs or SAP Help when you are not sure. Each finding is a candidate with evidence, not a proof — the ATC S/4HANA readiness checks remain the final word.
- CAN STANDARD REPLACE IT? This is the most important judgement — consultants rarely ask it about old Z-programs. Look at the business need behind the code, not the code itself, and ask whether today's SAP standard meets that need fully, partly, or not at all. Consider every kind of standard: Fiori apps, transactions, configuration/customizing settings, standard reports and mass-change tools, BRF+/workflow, released BAdIs or extensibility (key-user/in-app) that would shrink the custom part, and functions added in newer S/4HANA releases. Use web_search to confirm apps, features and the release they arrived in. For each realistic option, say what it covers and — just as important — what it does NOT cover (limitations, missing fields, different behaviour, needs a newer release, licence or extra configuration). Then give a clear recommendation. If nothing in standard fits, say so plainly rather than stretching a weak match.
Return ONLY strictly valid JSON. Inside JSON strings escape every double quote as \\" — ABAP comments start with " — or describe code instead of quoting it.
{"title":"short name for what the program does",
 "language":"ABAP|CDS|SQL|JavaScript|other",
 "purpose":"2-3 sentences, plain words",
 "how_it_works":["short step", "..."],
 "objects":[{"name":"exact object","type":"table|BAPI|BAdI|function module|class|transaction|CDS view|other","role":"what the program uses it for"}],
 "s4_findings":[{"object":"exact object or area","finding":"what changed or why it matters","severity":"high|medium|low","evidence":"SAP Note/KBA/Simplification item/help page you found, or 'not verified'"}],
 "standard_coverage":{"level":"full|partial|none","summary":"one or two sentences: can standard replace this program, and how much of it",
   "options":[{"name":"exact app/transaction/setting/feature","kind":"Fiori app|transaction|configuration|report/tool|BAdI/extensibility|workflow/BRF+|other","release":"release or edition it needs, or empty","covers":"what of the program's job it handles","gaps":"what it does not handle or does differently — be specific","verified":true}],
   "recommendation":"what to do: retire and use X / use X plus a small extension for Y / keep the Z-program because ..."},
 "standard_alternative":"one-line version of the best standard option with release, or empty string if none",
 "verdict":"keep|adapt|replace with standard|retire",
 "verdict_reason":"one sentence",
 "risks":["short risk or code issue worth knowing", "..."]}`

const ASK = `${PERSONA}
The consultant is asking a follow-up about the program below. You also have your earlier analysis and the conversation so far.
Answer the question asked, at the depth asked. Identification questions get the object(s) and one or two lines each; detail only when asked.
Use web_search when the question depends on SAP release behaviour you are not sure of.
Reply in Markdown (not JSON).`

const DOCUMENT = `${PERSONA}
Write program documentation for the program below, for a consultant handover. Markdown with these sections:
## Purpose
## Where it is used (business process, trigger, users)
## How it works
## SAP objects used
## Inputs and outputs
## S/4HANA considerations
## Limitations and risks
Base everything on the code and the analysis provided. Keep it tight.`

const TESTS = `${PERSONA}
Write functional test cases for the program below, covering normal flow, edge cases, authorisations and error handling where the code shows them.
Return ONLY JSON: {"test_cases":[{"id":"TC01","title":"...","preconditions":"...","steps":["..."],"expected":"...","type":"positive|negative|edge"}]}`

const LIBRARY = `${PERSONA}
Prepare a reusable library entry from this program, its analysis and the conversation about it. The entry must help a consultant who later faces a SIMILAR problem in a different project.
Do not include customer, company, plant or person names, system IDs or anything that identifies a client — generalise them.
Return ONLY JSON:
{"title":"short reusable title",
 "problem":"the business/technical problem this solves, in general terms",
 "approach":"how the program solves it, 2-4 sentences",
 "objects":["exact SAP objects that matter for reuse"],
 "when_to_use":"situations where this is a good fit",
 "when_not_to_use":"situations where standard or another approach is better",
 "standard_alternative":"standard SAP option and release with its main limitation, or empty string",
 "standard_coverage":"full|partial|none — how far standard can replace this",
 "s4_notes":"S/4HANA points to remember, or empty string",
 "tags":["module or topic tags, e.g. PM, MM, BAdI, output"]}`

export async function callModel(system, user, { search = false, maxTokens = 6000, model = MODEL, cachedContext = '' } = {}) {
  // The program is sent as a cached system block: follow-up questions, documentation
  // and test cases on the same program reread it at ~10× lower cost.
  const body = {
    model, max_tokens: maxTokens,
    system: cachedContext
      ? [{ type: 'text', text: cachedContext, cache_control: { type: 'ephemeral' } }, { type: 'text', text: system }]
      : [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: user }],
  }
  if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4, allowed_domains: ['help.sap.com', 'me.sap.com', 'userapps.support.sap.com', 'community.sap.com', 'blogs.sap.com', 'api.sap.com', 'learning.sap.com', 'support.sap.com'] }]
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  const data = await r.json()
  if (!r.ok) {
    if ([400, 403, 404].includes(r.status) && model !== FALLBACK_MODEL && /model/i.test(data.error?.message || '')) {
      console.warn('[MODEL_FALLBACK] code', model, '→', FALLBACK_MODEL, data.error?.message)
      return callModel(system, user, { search, maxTokens, model: FALLBACK_MODEL, cachedContext })
    }
    throw Error(data.error?.message || 'Wani could not analyse the code')
  }
  const u = data.usage || {}
  console.log(`[code-ai] model=${model} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens || 0} cache_write=${u.cache_creation_input_tokens || 0} out=${u.output_tokens} searches=${u.server_tool_use?.web_search_requests || 0}`)
  // With web search the reply has several text blocks; the answer is the final stretch of text.
  if (data.stop_reason === 'max_tokens') console.warn('[code-ai] hit max_tokens', maxTokens)
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
}

function extractJson(text) {
  const clean = String(text || '').replace(/```(?:json)?/gi, '')
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return clean.slice(start, end + 1)
}

// Large analyses sometimes come back as almost-valid JSON (typically an unescaped
// quote from an ABAP comment inside a string). Rather than failing the whole — often
// expensive — analysis, a small model repairs the syntax without changing content.
export async function parseJson(text) {
  const raw = extractJson(text)
  if (!raw) throw Error('Wani returned an unreadable result. Try again.')
  try { return JSON.parse(raw) } catch (firstError) {
    console.warn('[code-ai] JSON invalid, repairing:', firstError.message)
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: REPAIR_MODEL, max_tokens: 16000,
        system: 'You repair JSON syntax. Return the same data as strictly valid JSON: escape quotes and control characters inside strings, fix missing commas or brackets. Do not add, remove, shorten or reword any content. Output only the JSON.',
        messages: [{ role: 'user', content: `Parser error: ${firstError.message}\n\n${raw}` }],
      }),
    })
    const data = await r.json().catch(() => ({}))
    const fixed = extractJson((data.content || []).filter(b => b.type === 'text').map(b => b.text).join(''))
    if (!r.ok || !fixed) throw Error('Wani returned an unreadable result. Try again.')
    try { return JSON.parse(fixed) } catch { throw Error('Wani returned an unreadable result. Try again.') }
  }
}

const str = (v, n) => String(v ?? '').slice(0, n)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
  if (!requireJsonBody(req, res, 1_000_000)) return
  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is not configured' })

  const { action } = req.body || {}
  const code = str(req.body.code, MAX_CODE)
  const analysis = req.body.analysis && typeof req.body.analysis === 'object' ? req.body.analysis : null
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-12).map(m => ({ role: m.role === 'user' ? 'consultant' : 'wani', text: str(m.text, 4000) })) : []
  // A saved library entry may have only its summary and analysis (code not kept): questions still work from those.
  const saved = req.body.summary && typeof req.body.summary === 'object' ? req.body.summary : null
  const summaryOnly = action === 'ask' && code.trim().length < 20 && (analysis || saved)
  if (code.trim().length < 20 && !summaryOnly) return res.status(400).json({ error: 'Paste the program code first' })
  const context = summaryOnly
    ? 'PROGRAM: the code itself was not kept in the library — only the saved summary and analysis below are available. If the answer needs exact code positions, say what you can from the summary and ask the consultant to paste the relevant part.'
    : `PROGRAM:\n\`\`\`\n${code}\n\`\`\``
  const cached = { cachedContext: context }
  const withAnalysis = (saved ? `\n\nSAVED LIBRARY SUMMARY:\n${JSON.stringify(saved)}` : '') + (analysis ? `\n\nEARLIER ANALYSIS:\n${JSON.stringify(analysis)}` : '')

  try {
    if (action === 'analyse') {
      const note = str(req.body.note, 1500)
      const out = await parseJson(await callModel(ANALYSE, note ? `CONSULTANT NOTE: ${note}\n\nAnalyse the program.` : 'Analyse the program.', { search: true, maxTokens: 14000, ...cached }))
      return res.status(200).json({ analysis: out })
    }
    if (action === 'ask') {
      const question = str(req.body.question, 3000).trim()
      if (!question) return res.status(400).json({ error: 'Ask a question' })
      const convo = history.length ? `\n\nCONVERSATION SO FAR:\n${history.map(m => `${m.role}: ${m.text}`).join('\n')}` : ''
      const answer = await callModel(ASK, `${withAnalysis}${convo}\n\nQUESTION: ${question}`.trim(), { search: true, maxTokens: 4000, ...cached })
      return res.status(200).json({ answer })
    }
    if (action === 'document') {
      const doc = await callModel(DOCUMENT, (withAnalysis || 'Document the program.').trim(), { maxTokens: 5000, ...cached })
      return res.status(200).json({ documentation: doc })
    }
    if (action === 'tests') {
      const out = await parseJson(await callModel(TESTS, (withAnalysis || 'Write the test cases.').trim(), { maxTokens: 6000, ...cached }))
      return res.status(200).json({ test_cases: Array.isArray(out.test_cases) ? out.test_cases : [] })
    }
    if (action === 'library') {
      const convo = history.length ? `\n\nCONVERSATION:\n${history.map(m => `${m.role}: ${m.text}`).join('\n')}` : ''
      const out = await parseJson(await callModel(LIBRARY, (withAnalysis + convo || 'Prepare the library entry.').trim(), { maxTokens: 2500, ...cached }))
      return res.status(200).json({ summary: out })
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    console.error('[code-ai]', action, e.message)
    return res.status(502).json({ error: e.message || 'Wani could not process the code' })
  }
}
