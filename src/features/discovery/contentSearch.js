import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'

// Everything the consultant has written in a workshop, as searchable rows.
// Each row knows where it lives (go), what it says (text) and how to change it (rec.patch).
// Rows that belong to the same record share rec, so several changes to one record are saved together.

const OBJ = new Map(discoveryCatalog.objects.map(o => [o.id, o]))
const AREA = new Map(discoveryCatalog.areas.map(a => [a.id, a]))
const PROC = new Map(processCatalog.processes.map(p => [p.id, p]))
const ITEM = new Map()
for (const o of discoveryCatalog.objects) {
  for (const f of o.fields) ITEM.set(o.id + ':field:' + f.id, { label: f.label, optional: f.tier === 'optional' })
  for (const q of o.questions) ITEM.set(o.id + ':question:' + q.id, { label: q.text })
  for (const d of o.decisions) ITEM.set(o.id + ':decision:' + d.id, { label: d.text })
}

const KEY_LABEL = { text: 'Text', note: 'Note', answer: 'Answer', other: 'Other answer', rationale: 'Rationale', label: 'Name', name: 'Name', function_role: 'Role', kpi: 'KPI', baseline: 'Baseline', custom_label: 'Label', item: 'Request', title: 'Title', description: 'Description', solution_idea: 'Solution idea', partner_system: 'Partner system', data_text: 'Data', volume: 'Volume', used_by: 'Used by', today_in: 'Today in', mitigation: 'Mitigation', source_field: 'Source field', meaning: 'Meaning', used_today: 'Used today', sap_target: 'SAP target', version: 'Version', owner: 'Owner', notes: 'Notes', today: 'Today', responsible: 'Responsible', run_window: 'Run window', legacy_feature: 'Legacy feature', hint: 'Hint', client_name: 'Customer', project_name: 'Project', consultant_name: 'Consultant', participants: 'Participants', legacy_system: 'Legacy system' }

const FIRST_KEYS = { stakeholders: ['name', 'function_role', 'note'], drivers: ['text', 'kpi', 'baseline', 'note'], sizing: ['custom_label', 'note'], requests: ['item', 'note'], parking: ['text', 'note'] }
const FIRST_TITLE = { stakeholders: 'Stakeholders', drivers: 'Pain points & goals', sizing: 'Sizing & volumes', requests: 'Requests', parking: 'Parking lot' }
const INV_KEYS = { interfaces: ['name', 'partner_system', 'data_text', 'volume', 'note'], forms_reports: ['name', 'used_by', 'today_in', 'note'], raid: ['text', 'mitigation', 'note'] }
const INV_TITLE = { interfaces: 'Interfaces', forms_reports: 'Forms & reports', raid: 'Risks & assumptions' }

function entryPlace(e, scopedFirstInArea) {
  const o = OBJ.get(e.object_id)
  if (o) {
    const item = ITEM.get(o.id + ':' + e.item_type + ':' + e.item_id)
    const what = {
      field: 'Field: ' + (item?.label || e.item_id),
      question: 'Question: ' + (item?.label || e.item_id),
      decision: 'Decision: ' + (item?.label || e.item_id),
      custom_field: 'Custom field',
      custom_question: 'Custom question: ' + (e.value?.text || ''),
      note: 'Object notes',
      legacy_today: 'Current legacy process',
    }[e.item_type]
    if (!what) return null
    const go = ['field', 'question', 'decision'].includes(e.item_type)
      ? { type: e.item_type, id: e.item_id, objectId: o.id, optional: item?.optional }
      : { type: 'anchor', objectId: o.id, anchor: { custom_field: 'dw-fields', custom_question: 'dw-questions', note: 'dw-actions', legacy_today: 'dw-legacy-today' }[e.item_type] }
    return { where: o.title + ' · ' + what, go }
  }
  if (e.object_id === 'workshop' && e.item_type === 'workshop_note') return { where: 'Workshop details · General notes', go: { type: 'section', id: 'details' } }
  if (e.item_type === 'area_note' && AREA.has(e.object_id)) {
    const first = scopedFirstInArea(e.object_id)
    return first ? { where: 'Area notes · ' + AREA.get(e.object_id).title, go: { type: 'anchor', objectId: first, anchor: 'dw-area-notes' } } : null
  }
  if (e.item_type === 'area_note' && String(e.object_id).startsWith('process:')) return { where: 'Processes & jobs · category notes', go: { type: 'section', id: 'processes' } }
  return null
}

export function buildContentRows(ctx) {
  const { workshop, entries, todos, firstCall, gaps, inventories, legacyFields, sourceSystems, processEntries, legacyHints, scoped, api } = ctx
  const rows = []
  const scopedFirstInArea = areaId => scoped.find(o => o.area === areaId)?.id
  const add = (rec, where, go, obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k]
      if (typeof v !== 'string' || !v.trim()) continue
      rows.push({ id: rec.key + '|' + k, rec, key: k, text: v, where: where + ' · ' + (KEY_LABEL[k] || k), go })
    }
  }

  // Workshop details
  add({ key: 'ws', patch: api.workshop }, 'Workshop details', { type: 'section', id: 'details' }, workshop, ['client_name', 'title', 'project_name', 'consultant_name', 'participants', 'legacy_system'])

  // Entries: answers, notes, rationales, custom fields/questions
  for (const e of Object.values(entries)) {
    if (!e?.value || typeof e.value !== 'object' || e.item_type === 'object_status') continue
    const place = entryPlace(e, scopedFirstInArea)
    if (!place) continue
    const rec = { key: 'e:' + e.object_id + ':' + e.item_type + ':' + e.item_id, patch: changes => api.entry(e, changes) }
    const keys = ['text', 'note', 'other', 'rationale', 'label']
    // Free-text answers only; chosen catalog options are not text the consultant wrote.
    if (e.item_type === 'custom_question' || (e.item_type === 'question' && typeof e.value.answer === 'string')) keys.unshift('answer')
    add(rec, place.where, place.go, e.value, keys)
  }

  for (const t of todos) add({ key: 't:' + t.id, patch: c => api.todo(t, c) }, (OBJ.get(t.object_id)?.title || 'Workshop') + ' · Action item', t.object_id && OBJ.has(t.object_id) ? { type: 'anchor', objectId: t.object_id, anchor: 'dw-actions' } : { type: 'section', id: 'summary' }, t, ['text', 'owner'])

  for (const [kind, keys] of Object.entries(FIRST_KEYS)) for (const r of firstCall[kind] || []) add({ key: 'f:' + kind + ':' + (r.id || r.metric_id), patch: c => api.first(kind, r, c) }, FIRST_TITLE[kind], { type: 'section', id: kind }, r, keys)

  for (const g of gaps) add({ key: 'g:' + g.id, patch: c => api.gap(g, c) }, 'Fit-gap' + (g.seq ? ' G-' + String(g.seq).padStart(3, '0') : ''), { type: 'section', id: 'gaps' }, g, ['title', 'description', 'solution_idea', 'note'])

  for (const [kind, keys] of Object.entries(INV_KEYS)) for (const r of inventories[kind] || []) add({ key: 'i:' + kind + ':' + r.id, patch: c => api.inventory(kind, r, c) }, INV_TITLE[kind], { type: 'section', id: kind }, r, keys)

  for (const f of legacyFields) add({ key: 'l:' + f.id, patch: c => api.legacyField(f, c) }, (OBJ.get(f.object_id)?.title || f.object_id) + ' · Legacy field ' + (f.source_field || ''), OBJ.has(f.object_id) ? { type: 'anchor', objectId: f.object_id, anchor: 'dw-legacy' } : { type: 'section', id: 'details' }, f, ['source_field', 'meaning', 'used_today', 'sap_target', 'note'])

  for (const s of sourceSystems) add({ key: 's:' + s.id, patch: c => api.source(s, c) }, 'Source system ' + (s.name || ''), { type: 'section', id: 'details' }, s, ['name', 'version', 'owner', 'notes'])

  for (const [pid, p] of Object.entries(processEntries)) add({ key: 'p:' + pid, patch: c => api.process(pid, p, c) }, (PROC.get(pid)?.title || p.custom?.title || 'Process') + ' · Process', { type: 'process', id: pid }, p, ['today', 'responsible', 'run_window', 'volume', 'note'])

  for (const h of legacyHints) if (h.accepted !== false) add({ key: 'h:' + h.id, patch: c => api.hint(h, c) }, (OBJ.get(h.object_id)?.title || 'Legacy') + ' · Legacy manual hint', OBJ.has(h.object_id) ? { type: 'anchor', objectId: h.object_id, anchor: 'dw-legacy' } : { type: 'section', id: 'details' }, h, ['legacy_feature', 'hint'])

  return rows
}

export const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function matchRows(rows, query) {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const words = q.split(/\s+/).filter(Boolean)
  return rows.filter(r => { const t = r.text.toLowerCase(); return t.includes(q) || words.every(w => t.includes(w) || r.where.toLowerCase().includes(w)) && words.some(w => t.includes(w)) })
}

// Rows containing the exact phrase (case-insensitive) — the ones "Replace everywhere" would change.
export function phraseRows(rows, phrase) {
  const p = phrase.trim().toLowerCase()
  return p.length < 2 ? [] : rows.filter(r => r.text.toLowerCase().includes(p))
}

// Apply one text change per row, grouped so each record is saved once with all its changed keys.
export function applyRowChanges(changes) {
  const byRec = new Map()
  for (const { row, text } of changes) {
    if (text === row.text) continue
    const g = byRec.get(row.rec.key) || { rec: row.rec, patch: {} }
    g.patch[row.key] = text
    byRec.set(row.rec.key, g)
  }
  for (const { rec, patch } of byRec.values()) rec.patch(patch)
  return byRec.size
}

export function replaceInRows(rows, find, replacement) {
  const re = new RegExp(escapeRe(find.trim()), 'gi')
  return applyRowChanges(phraseRows(rows, find).map(row => ({ row, text: row.text.replace(re, replacement) })))
}

export function snippet(text, query, radius = 70) {
  const t = text.replace(/\s+/g, ' ')
  const q = query.trim().toLowerCase()
  let i = t.toLowerCase().indexOf(q)
  if (i < 0) { const w = q.split(/\s+/).find(w => t.toLowerCase().includes(w)); i = w ? t.toLowerCase().indexOf(w) : 0 }
  const start = Math.max(0, i - radius), end = Math.min(t.length, i + q.length + radius)
  return (start ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '')
}
