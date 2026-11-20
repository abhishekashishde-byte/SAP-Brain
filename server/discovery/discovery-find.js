// "Find or ask" for the Discovery workshop: maps a consultant's free-text request
// ("where do I capture who approves orders?") to places in the workshop, using a
// small, cheap LLM's judgement over the catalog index. No keyword rules.
import { requireApprovedUser, requireJsonBody, sendAuthError } from '../shared/_auth.js'
import { discoveryCatalog } from '../../src/features/discovery/catalog.js'
import { processCatalog } from '../../src/features/discovery/processCatalog.js'

const MODEL = process.env.DISCOVERY_FIND_MODEL || 'openai/gpt-oss-20b'

// Workshop pages that are not catalog items. Keep ids in sync with the frontend finder.
export const FIND_SECTIONS = [
  ['transcripts', 'Transcript analysis: paste or upload a meeting transcript and let AI suggest field updates'],
  ['stakeholders', 'Stakeholders: customer people, roles, decision makers, process owners'],
  ['drivers', 'Pain points & goals: business problems and objectives'],
  ['sizing', 'Sizing & volumes: number of plants, equipment, orders, users'],
  ['requests', 'Requests: documents or data the customer must send'],
  ['parking', 'Parking lot: topics postponed during the call'],
  ['processes', 'Processes & jobs: background jobs and business processes in scope'],
  ['gaps', 'Fit-gap: gaps, developments, RICEFW objects, estimates'],
  ['interfaces', 'Interfaces: integrations with other systems'],
  ['forms_reports', 'Forms & reports: print forms, reports, layouts'],
  ['raid', 'Risks, assumptions, issues and dependencies'],
  ['summary', 'Summary & export: Excel, PDF, scope pack'],
  ['details', 'Workshop details: customer, date, participants, legacy source systems, general notes, legacy manual import'],
  ['presenter', 'Presenter mode: clean view to share the screen with the customer'],
]

let cachedIndex = null
function buildIndex() {
  if (cachedIndex) return cachedIndex
  const lines = []
  const ids = new Map()
  const add = (type, id, text, objectId = null) => { lines.push(`${type}|${id}|${text}`); ids.set(type + ':' + id, objectId) }
  for (const [id, text] of FIND_SECTIONS) add('section', id, text)
  for (const o of discoveryCatalog.objects) {
    add('object', o.id, `${o.title} (${o.tcodes.join(' ')}) — ${o.plain}`, o.id)
    for (const f of o.fields) add('field', f.id, `${o.title} › field: ${f.label}`, o.id)
    for (const q of o.questions) add('question', q.id, `${o.title} › question: ${q.text}`, o.id)
    for (const d of o.decisions) add('decision', d.id, `${o.title} › decision: ${d.text}`, o.id)
  }
  for (const p of processCatalog.processes) add('process', p.id, `Process: ${p.title} — ${p.plain}`)
  cachedIndex = { text: lines.join('\n'), ids }
  return cachedIndex
}

const SYSTEM = `You help an SAP Plant Maintenance consultant find the right place in a discovery-workshop app.
You get an index (one line per place: type|id|description) and the consultant's request, which may be in English, German or Hinglish and may be phrased as a question.
Pick the places that best answer where to look or where to record it. Prefer the most specific place (a field, question or decision) when one clearly fits; otherwise the object or section.
Return ONLY JSON: {"results":[{"type":"section|object|field|question|decision|process","id":"<exact id from the index>","reason":"<max 15 words, why this place fits>"}]}
Return 1 to 4 results, best first. Use only ids that appear in the index. If nothing fits, return {"results":[]}.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
  if (!requireJsonBody(req, res, 4000)) return
  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const query = String(req.body?.query || '').trim().slice(0, 300)
  if (query.length < 2) return res.status(400).json({ error: 'Type what you are looking for' })
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'AI search is not configured' })

  const index = buildIndex()
  const context = typeof req.body?.currentObject === 'string' ? `\nThe consultant currently has object "${req.body.currentObject.slice(0, 80)}" open.` : ''
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 1200,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `INDEX:\n${index.text}\n\nREQUEST: ${query}${context}` },
        ],
      }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data?.error?.message || 'AI search failed')
    const raw = data.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    const seen = new Set()
    const results = (Array.isArray(parsed.results) ? parsed.results : [])
      .filter(x => x && typeof x.type === 'string' && typeof x.id === 'string' && index.ids.has(x.type + ':' + x.id))
      .filter(x => { const k = x.type + ':' + x.id; if (seen.has(k)) return false; seen.add(k); return true })
      .slice(0, 4)
      .map(x => ({ type: x.type, id: x.id, objectId: index.ids.get(x.type + ':' + x.id), reason: String(x.reason || '').slice(0, 140) }))
    return res.status(200).json({ results, model: MODEL })
  } catch (e) {
    console.error('[discovery-find]', e.message)
    return res.status(502).json({ error: 'AI search is unavailable right now. Try the instant results above.' })
  }
}
