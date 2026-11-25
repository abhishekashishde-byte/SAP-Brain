// Changes / Z-developments: requirement → standard check & design → FS → code check → tests.
// Each action takes what the earlier steps produced and returns the next step's draft.
// All judgement is the model's (no keyword rules); the consultant edits every draft.
import { requireApprovedUser, requireJsonBody, sendAuthError } from '../shared/_auth.js'
import { callModel, parseJson } from '../code/code-ai.js'

const MAX_CODE = 450_000
const str = (v, n) => String(v ?? '').slice(0, n)
const json = v => JSON.stringify(v ?? {}, null, 1)

const PERSONA = `You are Wani, a senior SAP S/4HANA consultant (functional and technical) working with a consultant on a change request / custom development.
Write SAP identifiers (apps with ID, T-codes, tables, CDS views, BAdIs, classes, function modules, auth objects) in single backticks.
Name only SAP objects you are sure of or verified with web_search this turn; never invent apps, notes, releases or object names. Mark anything unsure as "verify".
Standard SAP always comes first; a custom development needs a reason.`

const REQ_CHAT = `${PERSONA}
The consultant is describing a requirement. Help them make it complete enough for a functional specification.
- Understand the business need first, then ask what is still missing: who uses it, trigger and frequency, input / selection, output, business rules, volumes, exceptions, authorizations, integration with other processes.
- Ask at most three short questions at a time, the most important first.
- If a standard SAP app, report, CDS view or setting obviously covers it, say so briefly — the full standard check comes in the next step.
- When enough is known for an FS, say so in one line and suggest running the standard check.
Be brief and concrete.`

const SUMMARY = `${PERSONA}
Summarise the requirement from the conversation. Use only what was said; put gaps in open_questions.
Return ONLY JSON:
{"title":"short name of the change","module":"PM|PP|MM|QM|WM|EWM|SD|FI|CO|Basis|other","business_need":"2-4 sentences",
 "users":"who uses it","trigger_frequency":"when / how often","inputs":"selection or input","outputs":"what comes out",
 "rules":["business rule"],"volumes":"data volumes or empty","exceptions":["exception / special case"],
 "authorization":"who may do what, or empty","integration":"other processes / systems touched, or empty","open_questions":["what is still unclear"]}`

const STANDARD = `${PERSONA}
Judge whether standard SAP S/4HANA covers this requirement, and if not, propose the custom solution.
Use web_search (SAP Help, Fiori apps library, SAP Community) to verify apps, CDS views and releases you name.
Return ONLY JSON:
{"coverage":{"level":"full|partial|none","summary":"1-2 sentences",
   "options":[{"name":"exact app (with ID) / transaction / CDS view / setting","kind":"Fiori app|transaction|CDS view / analytical query|configuration|BAdI/extensibility|workflow/BRF+|other","release":"release / edition it needs or 'verify'","covers":"what it covers","limits":"what it does not cover"}],
   "recommendation":"use standard X / standard X plus small extension for Y / custom development because …"},
 "design":{"solution_type":"Fiori elements app on CDS|Analytical CDS query|ALV report|BAdI / enhancement|Key-user extensibility|Workflow|Form / output|Interface|Other",
   "approach":"how the custom part should be built, 3-6 sentences",
   "objects":[{"name":"SAP object to read, call or extend","type":"table|CDS view|BAdI|class|BAPI|app|auth object|other","role":"why it is needed"}],
   "why_custom":"why standard is not enough, or empty if standard is enough",
   "effort":"S|M|L","risks":["risk or dependency"]}}`

const FS = `${PERSONA}
Write the functional specification for this change from the requirement, the standard check and the agreed design.
Choose the sections that fit the solution type (a Fiori app needs UI and navigation, an interface needs mapping and error handling, a report needs selection and output, an enhancement needs the exit point and conditions). Typical sections:
Business background & requirement · Scope (in / out) · Standard check and reason for development · Solution overview · Process / user flow · Input / selection / UI · Output · Data sources (tables, CDS views, fields) · Logic & business rules (step by step) · Error handling & messages · Authorization · Performance & volumes · Integration & dependencies · Test considerations · Open points & assumptions.
Write each section so a developer can build from it. Use only what is known; where something is missing write a line starting with "⚠ Open:" instead of inventing it.
Body text: short paragraphs, "- " bullets, numbered steps "1. ", and tables as lines "| col | col |" (first line = header).
Return ONLY JSON: {"meta":{"title":"…","module":"…","solution_type":"…"},"sections":[{"title":"section title","body":"text"}]}`

const CODE_CHECK = `${PERSONA}
Check the program against the functional specification and against S/4HANA.
1. Go through the FS requirements and rules one by one: covered, partly covered or missing in the code, with where in the code (FORM / method / line area).
2. S/4HANA issues (obsolete tables or BAPIs, compatibility views, missing authority checks, performance on large tables).
3. Code issues that would hurt in production (unhandled errors, hard-coded values, SELECT in loops, missing COMMIT/locks).
Use web_search only when unsure about S/4HANA behaviour.
Return ONLY strictly valid JSON (escape quotes inside strings):
{"verdict":"ready|needs changes|major gaps","summary":"2-3 sentences",
 "coverage":[{"requirement":"FS requirement / rule","status":"covered|partial|missing","where":"code location or empty","note":"short"}],
 "s4_findings":[{"object":"…","finding":"…","severity":"high|medium|low"}],
 "issues":[{"severity":"high|medium|low","where":"…","issue":"…","fix":"…"}]}`

const TESTS = `${PERSONA}
Write the test plan for this change from the FS, the design and (if given) the code and code check.
Include unit tests for each rule, negative tests (wrong input, missing data, exceptions), an authorization test, and integration tests where other processes are touched.
Then define the regression scope: which existing standard processes, apps, reports or interfaces could be affected by this change (same tables, BAdIs, user exits, outputs, number ranges, authorizations) and what to retest there.
Return ONLY JSON:
{"regression_scope":[{"area":"process / app / interface","why":"how this change could affect it","retest":"what to retest"}],
 "cases":[{"id":"UT-01","type":"unit|negative|authorization|integration|regression","title":"…","preconditions":"…","steps":["…"],"expected":"…","data":"test data or empty"}]}`

const ctxBlock = c => [
  c.summary && `REQUIREMENT SUMMARY:\n${json(c.summary)}`,
  c.conversation?.length && `REQUIREMENT CONVERSATION:\n${c.conversation.slice(-30).map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${str(m.text, 4000)}`).join('\n')}`,
  c.standard && `STANDARD CHECK & DESIGN:\n${json(c.standard)}`,
  c.fs && `FUNCTIONAL SPECIFICATION:\n${(c.fs.sections || []).map(s => `## ${s.title}\n${s.body}`).join('\n\n')}`,
  c.codeCheck && `CODE CHECK:\n${json(c.codeCheck)}`,
].filter(Boolean).join('\n\n')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
  if (!requireJsonBody(req, res, 1_000_000)) return
  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is not configured' })

  const b = req.body || {}
  const c = {
    conversation: Array.isArray(b.conversation) ? b.conversation.slice(-40).map(m => ({ role: m.role === 'user' ? 'user' : 'wani', text: str(m.text, 6000) })) : [],
    summary: b.summary && typeof b.summary === 'object' ? b.summary : null,
    standard: b.standard && typeof b.standard === 'object' ? b.standard : null,
    fs: b.fs && typeof b.fs === 'object' && Array.isArray(b.fs.sections) ? b.fs : null,
    codeCheck: b.codeCheck && typeof b.codeCheck === 'object' ? b.codeCheck : null,
  }
  const code = str(b.code, MAX_CODE)
  const codeContext = code.trim() ? `PROGRAM:\n\`\`\`\n${code}\n\`\`\`` : ''

  try {
    switch (b.action) {
      case 'ask': {
        const message = str(b.message, 6000).trim()
        if (!message) return res.status(400).json({ error: 'Write a message' })
        const answer = await callModel(REQ_CHAT, `${ctxBlock({ ...c, standard: null, fs: null })}\n\nCONSULTANT: ${message}`.trim(), { search: true, maxTokens: 2500 })
        return res.status(200).json({ answer })
      }
      case 'summary': {
        if (!c.conversation.length) return res.status(400).json({ error: 'Describe the requirement first' })
        return res.status(200).json({ summary: await parseJson(await callModel(SUMMARY, ctxBlock({ conversation: c.conversation }), { maxTokens: 2500 })) })
      }
      case 'standard': {
        if (!c.summary && !c.conversation.length) return res.status(400).json({ error: 'Describe the requirement first' })
        return res.status(200).json({ standard: await parseJson(await callModel(STANDARD, ctxBlock({ summary: c.summary, conversation: c.conversation }), { search: true, maxTokens: 6000 })) })
      }
      case 'fs': {
        if (!c.summary) return res.status(400).json({ error: 'Summarise the requirement first' })
        const out = await parseJson(await callModel(FS, ctxBlock({ summary: c.summary, conversation: c.conversation, standard: c.standard }), { maxTokens: 12000 }))
        return res.status(200).json({ fs: { meta: out.meta || {}, sections: Array.isArray(out.sections) ? out.sections.filter(s => s?.title) : [] } })
      }
      case 'code_check': {
        if (code.trim().length < 20) return res.status(400).json({ error: 'Paste the program first' })
        if (!c.fs) return res.status(400).json({ error: 'The FS is needed to check the code against it' })
        const out = await parseJson(await callModel(CODE_CHECK, ctxBlock({ summary: c.summary, fs: c.fs }) + '\n\nCheck the program.', { search: true, maxTokens: 10000, cachedContext: codeContext }))
        return res.status(200).json({ codeCheck: out })
      }
      case 'tests': {
        if (!c.fs && !c.summary) return res.status(400).json({ error: 'The requirement or FS is needed for tests' })
        const out = await parseJson(await callModel(TESTS, ctxBlock({ summary: c.summary, standard: c.standard, fs: c.fs, codeCheck: c.codeCheck }) + '\n\nWrite the test plan.', { maxTokens: 10000, cachedContext: codeContext }))
        return res.status(200).json({ tests: { regression_scope: Array.isArray(out.regression_scope) ? out.regression_scope : [], cases: Array.isArray(out.cases) ? out.cases : [] } })
      }
      default:
        return res.status(400).json({ error: 'Unknown action' })
    }
  } catch (e) {
    console.error('[changes-ai]', b.action, e.message)
    return res.status(502).json({ error: e.message || 'Wani could not process this step' })
  }
}
