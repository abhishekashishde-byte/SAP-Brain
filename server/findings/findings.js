// Findings: solved investigations the consultant keeps as numbered cases (10000001, …).
// Wani structures what was found (judgement by the model, no keyword rules), the
// consultant reviews it, and it is saved with an embedding so later questions find it.
// Everything runs with the consultant's own session, so row-level security applies.
import { createClient } from '@supabase/supabase-js'
import { requireApprovedUser, requireJsonBody, sendAuthError } from '../shared/_auth.js'

const MODEL = process.env.WANI_FINDINGS_MODEL || process.env.WANI_ANSWER_MODEL || 'claude-sonnet-5-5'
const FALLBACK_MODEL = 'claude-sonnet-4-5'
const STATUSES = new Set(['solved', 'root_cause_found', 'open'])
const str = (v, n) => String(v ?? '').slice(0, n)

const STRUCTURE = `You turn an SAP investigation into a finding the consultant can reuse on a later ticket.
Use ONLY what the text says. Never add facts, objects, notes or fixes that are not in it.
Return ONLY strictly valid JSON:
{"title":"short name of the problem, e.g. 'Equipment value help in Manage Maintenance Plans ignores plant authorization'",
 "module":"PM|PP|MM|QM|WM|EWM|SD|FI|CO|Basis|Security|ABAP|Fiori|other",
 "problem":"what the user saw — symptom, app or transaction, conditions (2-4 sentences)",
 "investigation":"the investigation steps exactly as written in the text — keep the user's numbering, wording, object names, URLs and code; only drop chat noise. Empty string if there are no steps",
 "root_cause":"why it happens, as found in the text; empty string if not found",
 "solution":"the fix or workaround ONLY if the text states one; otherwise empty string",
 "sap_objects":["every concrete SAP object named: apps (with ID), OData services, CDS views, access controls, authorization objects/fields, T-codes, tables/views, BAdIs, notes"],
 "status":"solved if a fix/workaround is stated, root_cause_found if the cause is known but no fix, open otherwise"}`

async function callModel(system, user, maxTokens = 6000) {
  for (const model of [MODEL, FALLBACK_MODEL]) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok) return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
    if (r.status !== 404 && !/model/i.test(data?.error?.message || '')) throw Error(data?.error?.message || `Model error ${r.status}`)
  }
  throw Error('No model available')
}

function parseJson(text) {
  const clean = String(text || '').replace(/```(?:json)?/gi, '')
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}')
  if (s < 0 || e <= s) throw Error('Wani returned an unreadable result. Try again.')
  return JSON.parse(clean.slice(s, e + 1))
}

export async function embedText(text) {
  if (!process.env.OPENAI_API_KEY) return null
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: String(text).slice(0, 8000) }),
  })
  const data = await r.json().catch(() => ({}))
  return data?.data?.[0]?.embedding || null
}

// What gets embedded: the parts a later question will resemble (symptom, objects, cause, fix).
const embedSource = f => [f.title, f.problem, f.root_cause, f.solution, (f.sap_objects || []).join(', '), f.module].filter(Boolean).join('\n')

export function cleanFinding(input) {
  const f = input && typeof input === 'object' ? input : {}
  const objects = Array.isArray(f.sap_objects) ? f.sap_objects : String(f.sap_objects || '').split(/[,;\n]/)
  return {
    title: str(f.title, 200).trim(),
    module: str(f.module, 40).trim() || null,
    ticket_ref: str(f.ticket_ref, 80).trim() || null,
    found_on: /^\d{4}-\d{2}-\d{2}$/.test(String(f.found_on || '')) ? f.found_on : undefined,
    problem: str(f.problem, 4000).trim(),
    investigation: str(f.investigation, 30000).trim(),
    root_cause: str(f.root_cause, 6000).trim(),
    solution: str(f.solution, 6000).trim(),
    sap_objects: [...new Set(objects.map(o => str(o, 120).trim()).filter(Boolean))].slice(0, 40),
    status: STATUSES.has(f.status) ? f.status : 'solved',
  }
}

const userDb = token => createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
)
const COLS = 'id,number,found_on,ticket_ref,title,module,problem,investigation,root_cause,solution,sap_objects,status,source,created_at,updated_at'

// Used by chat: the consultant's findings closest to the question (owner only, via RLS).
export async function fetchRelevantFindings(question, userToken, { count = 3, threshold = 0.42 } = {}) {
  try {
    if (!userToken || !question) return []
    const emb = await embedText(question)
    if (!emb) return []
    const { data, error } = await userDb(userToken).rpc('match_wani_findings', { query_embedding: emb, match_count: count })
    if (error) { if (!/does not exist|schema cache/i.test(error.message)) console.error('[findings] search:', error.message); return [] }
    return (data || []).filter(f => f.similarity >= threshold)
  } catch (e) {
    console.error('[findings] search error:', e.message)
    return []
  }
}

export const findingLabel = f => `Finding ${f.number}${f.found_on ? ` (${String(f.found_on).split('-').reverse().join('.')})` : ''}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
  if (!requireJsonBody(req, res, 400_000)) return
  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)
  const { action } = req.body || {}
  const db = userDb(auth.token)

  try {
    if (action === 'structure') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is not configured' })
      const text = str(req.body.text, 120_000).trim()
      if (text.length < 20) return res.status(400).json({ error: 'Paste or select what was found first' })
      const draft = cleanFinding(parseJson(await callModel(STRUCTURE, text)))
      return res.status(200).json({ finding: draft })
    }

    if (action === 'save' || action === 'update') {
      const f = cleanFinding(req.body.finding)
      if (!f.title) return res.status(400).json({ error: 'A finding needs a title' })
      const row = { ...f, embedding: await embedText(embedSource(f)) }
      if (row.found_on === undefined) delete row.found_on
      if (action === 'save') {
        row.source = req.body.source === 'manual' ? 'manual' : 'chat'
        const { data, error } = await db.from('wani_findings').insert(row).select(COLS).single()
        if (error) throw error
        console.log('[findings] saved', data.number)
        return res.status(200).json({ finding: data })
      }
      const id = str(req.body.id, 40)
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Missing finding id' })
      const { data, error } = await db.from('wani_findings').update(row).eq('id', id).select(COLS).single()
      if (error) throw error
      return res.status(200).json({ finding: data })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    const msg = /does not exist|schema cache/i.test(e.message || '') ? 'The findings table is not set up yet (run migration 025).' : (e.message || 'Could not process the finding')
    console.error('[findings]', action, e.message)
    return res.status(/not set up/.test(msg) ? 503 : 502).json({ error: msg })
  }
}
