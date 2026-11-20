import { useMemo } from 'react'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'
import { SIZING_METRICS } from './firstCallData.js'

export const MARK = { needed: 'Needed', not_needed: 'Not needed', clarify: 'Clarify' }
export const KIND = {
  field_mark: 'Field', answer: 'Answer', decision: 'Decision', process: 'Process', stakeholder: 'Stakeholder',
  driver: 'Pain point / goal', custom_field: 'New field', sizing: 'Sizing', request: 'Request', todo: 'Action item', risk: 'Risk', gap: 'Gap',
}
export const human = s => String(s ?? '').replaceAll('_', ' ')
const CONTEXT_KINDS = new Set(['stakeholder', 'driver', 'sizing', 'request'])

// Catalog lookups so reviewers see names, not internal IDs.
export function useCatalogLookup() {
  return useMemo(() => {
    const item = new Map()
    for (const o of discoveryCatalog.objects) {
      for (const f of o.fields) item.set(f.id, { object: o, label: f.label, kind: 'field' })
      for (const q of o.questions) item.set(q.id, { object: o, label: q.text, kind: 'question', q })
      for (const d of o.decisions) item.set(d.id, { object: o, label: d.text, kind: 'decision', d })
    }
    const process = new Map(processCatalog.processes.map(p => [p.id, p]))
    const object = new Map(discoveryCatalog.objects.map(o => [o.id, o]))
    const metric = new Map(SIZING_METRICS.map(([id, label]) => [id, label]))
    return { item, process, object, metric }
  }, [])
}

export function describeTarget(s, L) {
  const hit = L.item.get(s.target_ref)
  if (hit) return { group: hit.object.title, label: hit.label }
  if (s.kind === 'custom_field') return { group: L.object.get(s.payload?.object_id)?.title || 'New field', label: `New field: ${s.payload?.label || '—'}` }
  if (s.kind === 'process') return { group: 'Processes & jobs', label: L.process.get(s.target_ref)?.title || 'Process' }
  if (CONTEXT_KINDS.has(s.kind)) return { group: 'Customer context', label: KIND[s.kind] }
  const related = L.object.get(s.payload?.related_id || s.payload?.object_id)
  return { group: related ? related.title : 'Actions, risks & gaps', label: KIND[s.kind] || human(s.kind) }
}

export function describeValue(kind, p, L) {
  if (!p || typeof p !== 'object') return '—'
  switch (kind) {
    case 'custom_field': return `Mark as ${MARK[p.mark] || human(p.mark)}${p.note ? ` — ${p.note}` : ''}`
    case 'field_mark': return `Mark as ${MARK[p.mark] || human(p.mark)}${p.note ? ` — ${p.note}` : ''}`
    case 'answer': return Array.isArray(p.answer) ? p.answer.join(', ') : String(p.answer ?? '—')
    case 'decision': return `${p.choice ?? '—'}${p.rationale ? ` — ${p.rationale}` : ''}`
    case 'process': return `${human(p.status)}${p.frequency ? ` · ${p.frequency}` : ''}`
    case 'stakeholder': return `${p.name || '—'}${p.function_role ? `, ${p.function_role}` : ''}${p.organisation ? ` (${p.organisation})` : ''}`
    case 'driver': return `${p.kind === 'goal' ? 'Goal' : 'Pain point'}: ${p.text || '—'}`
    case 'sizing': return `${L.metric.get(p.metric_id) || human(p.metric_id)}: ${p.value ?? '—'}${p.approx ? ' (approx.)' : ''}`
    case 'request': return p.item || '—'
    case 'todo': return `${p.text || '—'}${p.owner ? ` · owner: ${p.owner}` : ''}`
    case 'risk': return `${p.text || '—'}${p.mitigation ? ` — mitigation: ${p.mitigation}` : ''}`
    case 'gap': return `${p.title || '—'}${p.description ? ` — ${p.description}` : ''}`
    default: return Object.entries(p).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${human(k)}: ${v}`).join(' · ')
  }
}

