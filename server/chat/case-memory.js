// Case memory + turn planning for Wani chat.
//
// 1. buildHistory   — keeps as much of the conversation verbatim as a character
//                     budget allows (newest first), instead of a fixed last-12 cut.
// 2. planTurn       — one cheap model call that reads the case and the new message
//                     and decides: what the message really asks (standalone), what to
//                     search for, which answer mode fits, and who the answer is for.
// 3. updateCaseFile — keeps a running, structured case file (facts, objects, findings,
//                     ruled-out ideas, open items, tests) so a long investigation never
//                     loses what was established earlier.
// All decisions are model judgement; there are no keyword rules here.

const SMALL_MODEL = process.env.WANI_SMALL_MODEL || 'claude-haiku-5-5'
const SMALL_FALLBACK = 'claude-haiku-4-5'

export const HISTORY_BUDGET_CHARS = Number(process.env.WANI_HISTORY_BUDGET || 110_000)
const PER_MESSAGE_MAX = 45_000
// The newest message may carry a large program that the model reads in full once.
const NEWEST_MESSAGE_MAX = 450_000

const clip = (s, n) => {
  const t = String(s || '')
  return t.length > n ? t.slice(0, n) + `\n…[${t.length - n} more characters not shown]` : t
}

// Newest messages first until the budget is used. A single very long message
// (a pasted SAP Note or program) is kept up to PER_MESSAGE_MAX.
export function buildHistory(allMessages, budget = HISTORY_BUDGET_CHARS) {
  const out = []
  let used = 0
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const m = allMessages[i]
    const text = clip(String(m.content).trim(), i === allMessages.length - 1 ? NEWEST_MESSAGE_MAX : PER_MESSAGE_MAX)
    if (out.length > 0 && used + text.length > budget) break
    out.unshift({ ...m, content: text })
    used += text.length
  }
  return { recentMsgs: out, dropped: allMessages.length - out.length, usedChars: used }
}

export async function callSmall(system, user, maxTokens, model = SMALL_MODEL) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (model !== SMALL_FALLBACK && [400, 403, 404].includes(r.status)) {
      console.warn('[MODEL_FALLBACK] small', model, '→', SMALL_FALLBACK, data.error?.message)
      return callSmall(system, user, maxTokens, SMALL_FALLBACK)
    }
    throw Error(data.error?.message || `small model ${r.status}`)
  }
  const u = data.usage || {}
  return { text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim(), usage: u, model }
}

export function parseJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '')
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b <= a) throw Error('no JSON')
  return JSON.parse(t.slice(a, b + 1))
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Error('timeout')), ms))])

export function caseFileText(caseFile) {
  if (!caseFile || typeof caseFile !== 'object' || caseFile.is_case === false) return ''
  const sec = (label, arr) => Array.isArray(arr) && arr.length ? `${label}:\n${arr.map(x => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n')}` : ''
  return [
    caseFile.topic && `Case: ${caseFile.topic}`,
    caseFile.goal && `Goal: ${caseFile.goal}`,
    caseFile.system && `System context: ${caseFile.system}`,
    sec('SAP objects involved', caseFile.objects),
    sec('Established facts', caseFile.facts),
    sec('Ruled out / corrected', caseFile.ruled_out),
    sec('Current hypotheses', caseFile.hypotheses),
    sec('Decisions taken', caseFile.decisions),
    sec('Material the consultant shared', caseFile.artifacts),
    sec('Open questions', caseFile.open_items),
    sec('Tests still to run', caseFile.tests),
    sec('How the consultant wants answers', caseFile.preferences),
  ].filter(Boolean).join('\n')
}

// ── PLANNER ────────────────────────────────────────────────────────────────
const PLANNER_SYSTEM = `You prepare the next reply of Wani, an AI assistant for senior SAP consultants.
Read the case so far and the consultant's NEW message. Decide what the reply needs. Return ONLY JSON:
{"standalone_question": "...", "search_query": "...", "mode": "quick|investigation|review|rewrite", "register": "expert|plain|tech_team|ticket|customer", "needs_web": true|false, "code_sections": [{"program": 1, "start": 120, "end": 180}], "reason": "..."}

standalone_question: the new message rewritten so it is fully understandable WITHOUT the conversation. Resolve every reference ("this", "that BAdI", "does this make sense", "the note above") to the concrete SAP objects, plants, documents and findings involved. Keep SAP identifiers exactly as written. If the message pastes material (an SAP Note, code, a debugger result, another person's or AI's answer), say in one or two sentences what the consultant wants done with it and name the key objects it contains.

search_query: 3–12 words a consultant would type into SAP Help / SAP Community / SAP Notes search to get the facts this reply depends on. Use exact object names. Empty string when no search would help (for example a pure rewrite).

mode — judge from the whole conversation, not keywords:
- quick: a self-contained question wanting a direct answer (what is / which app / how to / where to configure).
- investigation: the consultant is working through a concrete problem in THEIR system across turns — a defect, unexpected behaviour, debugging, analysing their own code or configuration, or reporting what they found in the system.
- review: they share an answer, code, plan or text (from a colleague, another AI, a document, or Wani earlier) and want to know whether it is right or what is wrong with it.
- rewrite: they want something already discussed expressed differently — simpler, shorter, for the ABAP/technical team, as ticket text, for the customer, more natural / less AI-sounding.

register — who the reply is for: expert (default, consultant to consultant), plain (explain like to a normal person), tech_team (developers/ABAP team), ticket (formal ticket or defect text), customer (business users).

needs_web: true when checking SAP sources online would make the reply more reliable (release behaviour, notes, object existence, standard functionality); false for rewrites and for questions fully answered by material already in the conversation.

code_sections: only when PROGRAM MAPS are given. Large programs pasted earlier are no longer shown in full to the answering model — only the line ranges you list here. Pick the blocks the reply needs to be correct (the block asked about, the blocks it calls or that set the data it uses, declarations when types matter). Up to ~900 lines in total; prefer whole blocks. Empty list when no code is needed.

reason: one short sentence explaining the mode choice.`

export async function planTurn({ caseFile, recentMsgs, lastMsg, programMaps = '' }) {
  const caseText = caseFileText(caseFile)
  const turns = recentMsgs.slice(-7, -1)
    .map(m => `${m.role === 'user' ? 'CONSULTANT' : 'WANI'}: ${clip(m.content, 1800)}`).join('\n\n')
  const user = `${caseText ? `CASE FILE:\n${caseText}\n\n` : ''}${programMaps ? `PROGRAM MAPS:\n${programMaps}\n\n` : ''}${turns ? `RECENT CONVERSATION:\n${turns}\n\n` : ''}NEW MESSAGE FROM THE CONSULTANT:\n${clip(lastMsg, 6000)}`
  const r = await withTimeout(callSmall(PLANNER_SYSTEM, user, 900), 8000)
  const p = parseJson(r.text)
  const modes = ['quick', 'investigation', 'review', 'rewrite']
  const registers = ['expert', 'plain', 'tech_team', 'ticket', 'customer']
  return {
    standalone: String(p.standalone_question || '').slice(0, 1500),
    searchQuery: String(p.search_query || '').slice(0, 200),
    mode: modes.includes(p.mode) ? p.mode : 'quick',
    register: registers.includes(p.register) ? p.register : 'expert',
    needsWeb: p.needs_web !== false,
    codeSections: Array.isArray(p.code_sections) ? p.code_sections.slice(0, 20) : [],
    reason: String(p.reason || '').slice(0, 300),
    model: r.model, usage: r.usage,
  }
}

// ── CASE FILE ──────────────────────────────────────────────────────────────
const CASE_SYSTEM = `You keep the case file for an ongoing conversation between an SAP consultant and Wani (an AI assistant).
The case file is Wani's memory of the conversation: whatever is in it stays available even when old messages are no longer shown. Update the previous case file with the NEW MESSAGES. Return ONLY JSON:
{"is_case": true|false,
 "topic": "short title of what this conversation is about",
 "goal": "what the consultant is trying to achieve",
 "system": "release, plants, company/system context that matters (generalise nothing — keep the consultant's identifiers)",
 "objects": ["exact SAP objects that matter: transactions, BAdIs + methods, implementations, tables-fields, notes, transports, documents, plants, values like DELKZ codes"],
 "facts": ["established facts, each with its basis in brackets: (consultant saw in system) / (SAP Note 1234) / (debugging) / (Wani, not yet verified)"],
 "ruled_out": ["ideas or earlier statements that turned out wrong, and why — include Wani's own corrected mistakes"],
 "hypotheses": ["open explanations still being tested"],
 "decisions": ["what the consultant decided or implemented"],
 "artifacts": ["material the consultant pasted: what it is and its key content in one line each (e.g. 'SAP Note 190298 — release reqs of STOs are MRP-relevant by design; BAdI not called in S/4')"],
 "open_items": ["questions still open"],
 "tests": ["tests still to run, and results once known"],
 "preferences": ["how the consultant asked Wani to explain or write (e.g. '2–3 sentence summaries', 'plain language for ABAP team', 'ticket text must not sound like AI')"]}

Rules:
- is_case is false when the conversation is just unrelated one-off questions; then fill only topic.
- Record only what the conversation shows. Never invent facts, numbers, notes or names.
- When new evidence contradicts an earlier fact, move the old one to ruled_out with the reason.
- Keep exact identifiers. Be terse: one line per item, at most ~700 words in total. Drop items that no longer matter.`

export async function updateCaseFile({ caseFile, newMessages }) {
  const prev = caseFile && typeof caseFile === 'object' ? JSON.stringify(caseFile) : '(none yet)'
  let budget = 40_000
  const parts = []
  for (let i = newMessages.length - 1; i >= 0 && budget > 0; i--) {
    const m = newMessages[i]
    const t = clip(m.content, Math.min(budget, 16_000))
    parts.unshift(`${m.role === 'user' ? 'CONSULTANT' : 'WANI'}: ${t}`)
    budget -= t.length
  }
  const r = await withTimeout(callSmall(CASE_SYSTEM, `PREVIOUS CASE FILE:\n${prev}\n\nNEW MESSAGES:\n${parts.join('\n\n')}`, 1800), 15000)
  const next = parseJson(r.text)
  next.updated_at = new Date().toISOString()
  return { caseFile: next, model: r.model, usage: r.usage }
}

// ── ANSWER MODES ───────────────────────────────────────────────────────────
const REGISTER = {
  expert: '',
  plain: 'AUDIENCE: explain it the way you would to a capable person who is not an SAP specialist — everyday words, short sentences, name SAP objects only where they need them.',
  tech_team: 'AUDIENCE: the developers / ABAP team. Lead with what to change and where (object, method, condition), then why in two or three sentences. No functional background they do not need.',
  ticket: 'AUDIENCE: formal ticket or defect text. Factual, compact, natural wording a consultant would actually write — no AI phrasing, no headings unless the ticket needs them, no emojis, no filler.',
  customer: 'AUDIENCE: business users of the customer. Business impact and what changes for them; avoid technical detail unless it is needed for a decision.',
}

const MODE_BLOCKS = {
  investigation: `ANSWER MODE — INVESTIGATION (this overrides earlier structure rules: no opening reaction sentence, no follow-up questions section, no fixed answer template).
You are working through a concrete problem in the consultant's system with them, like an experienced colleague sitting next to them.
- Stay on the case. Use the case file and every earlier message: identifiers, findings, pasted notes, debugging results.
- Reason from the evidence. Separate what is established from what you infer, and say how sure you are where it matters.
- When new evidence (an SAP Note, a debugger value, a screenshot, a test result) contradicts something said earlier — including by you — say so plainly ("I had that wrong: …") and correct course.
- Give the ONE next most useful check when the case needs one: exact transaction or menu path, what to enter, what to look for and what each outcome would mean.
- When code is involved, review it as code: will it compile, does it do what is intended, edge cases, what else it affects.
- Length follows need: a short reply when a short reply settles it.`,
  review: `ANSWER MODE — REVIEW (this overrides earlier structure rules: no opening reaction sentence, no follow-up questions section).
The consultant wants to know whether shared material (an answer, code, plan or text) is right.
- Start with the verdict in one line: right / partly right / wrong.
- Then what is right, what is wrong or missing, and why — with evidence (SAP Notes, documentation, how the system really behaves). Check uncertain claims with web_search before judging them.
- For code: whether it compiles, whether it does the intended thing, and the corrected version of only the parts that need changing.
- If the shared material came from Wani earlier and was wrong, say so directly.`,
  rewrite: `ANSWER MODE — REWRITE (this overrides earlier structure rules: no opening reaction sentence, no follow-up questions, no references section).
Rewrite what was already established in this conversation for the requested reader and length. Do not add new technical content or new claims. Output only the rewritten text, ready to paste — no preamble such as "Here is…".`,
}

export function modePrompt(plan) {
  if (!plan) return ''
  const parts = []
  if (plan.mode && MODE_BLOCKS[plan.mode]) parts.push(MODE_BLOCKS[plan.mode])
  if (REGISTER[plan.register]) parts.push(REGISTER[plan.register])
  return parts.join('\n\n')
}
