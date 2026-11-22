// TEMPORARY — preview-only replay endpoint for testing case mode. Never merged to main.
// Requires CASE_TEST_TOKEN, which exists only on the preview version.
import { BASE_SYSTEM_PROMPT } from '../shared/_shared.js'
import { INTENT_PROMPTS } from '../shared/intent-prompts.js'
import { buildHistory, planTurn, updateCaseFile, caseFileText, modePrompt } from './case-memory.js'

export default async function handler(req, res) {
  const token = process.env.CASE_TEST_TOKEN
  if (!token || req.headers['x-case-test'] !== token) return res.status(404).json({ error: 'not found' })
  const { messages = [], caseFile = null, caseAt = 0, answer = true } = req.body || {}
  const allMessages = messages.filter(m => m.role && m.content?.trim())
  const lastMsg = allMessages[allMessages.length - 1]?.content || ''
  const history = buildHistory(allMessages)
  const t0 = Date.now()
  const [plan, caseUpdate] = await Promise.all([
    planTurn({ caseFile, recentMsgs: history.recentMsgs, lastMsg }).catch(e => ({ error: e.message })),
    updateCaseFile({ caseFile, newMessages: allMessages.slice(Math.min(caseAt, allMessages.length - 1)) }).catch(e => ({ error: e.message })),
  ])
  const tPrep = Date.now() - t0
  const activeCase = caseUpdate?.caseFile || caseFile
  let system = BASE_SYSTEM_PROMPT + '\n\n' + INTENT_PROMPTS.SAP_QA
  const ct = caseFileText(activeCase)
  if (ct) system += `\n\n🗂️ CASE FILE — running memory of this conversation. Use it to stay on the case. If it conflicts with the messages themselves, the messages win.\n${ct}`
  const mt = modePrompt(plan?.error ? null : plan)
  if (mt) system += `\n\n${mt}`
  if (plan?.standalone && plan.standalone !== lastMsg) system += `\n\nWHAT THE LATEST MESSAGE ASKS (resolved against the conversation): ${plan.standalone}`
  let out = null
  if (answer) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.WANI_ANSWER_MODEL || 'claude-sonnet-5-5', max_tokens: 4096, system,
        messages: history.recentMsgs.map(m => ({ role: m.role, content: m.content })),
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      }),
    })
    const d = await r.json()
    out = { status: r.status, text: (d.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), usage: d.usage, error: d.error }
  }
  return res.status(200).json({ plan, caseFile: activeCase, caseModel: caseUpdate?.model, caseUsage: caseUpdate?.usage, caseError: caseUpdate?.error, prepMs: tPrep, answer: out })
}
