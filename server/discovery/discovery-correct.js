// Re-maps one transcript finding after the consultant explains, in their own words, what it
// really is ("not equipment object type — this is the asset master inventory number").
// The model decides the new target using SAP judgement over the catalog; no keyword rules.
import { requireApprovedUser, requireJsonBody, sendAuthError } from '../shared/_auth.js'
import { callClaude, KINDS } from './discovery-transcript.js'
import { MODULES } from './modules.js'

const CATALOG_KINDS = new Set(['field_mark', 'answer', 'decision', 'process'])

const SYSTEM = `You are a senior SAP consultant. A transcript analysis proposed a finding; the consultant says it is wrong or incomplete and explains in their own words what it really is. Produce the corrected finding.
Use the consultant's explanation as the truth. Keep the customer's facts from the quote and original payload; change where it belongs and how it is described.
Targets:
- A catalog item: kind field_mark/answer/decision/process with the exact target_ref from the catalog (payload formats: field_mark {"mark","note"}, answer {"answer"}, decision {"choice","rationale","status"}, process {"status","frequency"}).
- If no catalog item fits, kind "custom_field" with target_ref "" and payload {"object_id":"<catalog object id>","label":"<SAP-style field name, e.g. Inventory number (asset master)>","mark":"needed|not_needed|clarify","note":"..."}.
- Or one of: stakeholder, driver, sizing, request, todo, risk, gap (target_ref "").
Write notes in English, one or two short sentences that combine what the customer said with the consultant's correction.
Return ONLY JSON {"kind":"...","target_ref":"...","payload":{},"explanation":"one sentence telling the consultant what you changed and why"}.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
  if (!requireJsonBody(req, res, 8000)) return
  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)
  const { suggestion, correction, module } = req.body || {}
  const mod = MODULES[module] || MODULES.pm
  const text = String(correction || '').trim().slice(0, 1200)
  if (!suggestion || typeof suggestion !== 'object' || text.length < 3) return res.status(400).json({ error: 'Describe what should change' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI correction is not configured' })

  const finding = {
    kind: String(suggestion.kind || ''), target_ref: String(suggestion.target_ref || ''),
    payload: suggestion.payload && typeof suggestion.payload === 'object' ? suggestion.payload : {},
    quote: String(suggestion.quote || '').slice(0, 600),
  }
  try {
    const out = await callClaude(SYSTEM.replace('a senior SAP consultant', 'a senior ' + mod.label + ' (' + mod.name + ') consultant'), { catalog: mod.brief, finding, consultant_correction: text })
    const kind = String(out?.kind || '')
    const target_ref = String(out?.target_ref || '')
    const payload = out?.payload && typeof out.payload === 'object' && !Array.isArray(out.payload) ? out.payload : null
    if (!payload) throw Error('The AI did not return a usable correction')
    if (kind === 'custom_field') {
      if (!mod.catalog.objects.some(o => o.id === payload.object_id) || !String(payload.label || '').trim()) throw Error('The AI proposed a new field without a valid object')
      if (!['needed', 'not_needed', 'clarify'].includes(payload.mark)) payload.mark = 'needed'
    } else if (!KINDS.has(kind)) throw Error('The AI proposed an unknown finding type')
    else if (CATALOG_KINDS.has(kind) && !mod.allowed.has(target_ref)) throw Error('The AI proposed a place that is not in the catalog')
    return res.status(200).json({ kind, target_ref: CATALOG_KINDS.has(kind) ? target_ref : null, payload, explanation: String(out.explanation || '').slice(0, 300) })
  } catch (e) {
    console.error('[discovery-correct]', e.message)
    return res.status(502).json({ error: 'Wani could not work out the correction. Try rephrasing, or change it manually.' })
  }
}
