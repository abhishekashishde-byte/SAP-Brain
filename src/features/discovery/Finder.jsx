import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'

// Places that are not catalog items. Keep ids in sync with server/discovery/discovery-find.js.
export const FINDER_SECTIONS = [
  ['transcripts', 'Transcript analysis', 'Paste or upload a meeting transcript; AI suggests updates'],
  ['stakeholders', 'Stakeholders', 'People, roles, decision makers'],
  ['drivers', 'Pain points & goals', 'Business problems and objectives'],
  ['sizing', 'Sizing & volumes', 'Plants, equipment, order volumes'],
  ['requests', 'Requests', 'Documents or data the customer will send'],
  ['parking', 'Parking lot', 'Topics postponed during the call'],
  ['processes', 'Processes & jobs', 'Background jobs and business processes'],
  ['gaps', 'Fit-gap', 'Gaps, developments, estimates'],
  ['interfaces', 'Interfaces', 'Integrations with other systems'],
  ['forms_reports', 'Forms & reports', 'Print forms and reports'],
  ['raid', 'Risks & assumptions', 'Risks, assumptions, issues, dependencies'],
  ['summary', 'Summary & export', 'Excel, PDF, scope pack, AI minutes'],
  ['details', 'Workshop details', 'Customer, date, sources, general notes'],
  ['presenter', 'Presenter mode', 'Clean view for screen sharing'],
]

const TYPE_LABEL = { section: 'Section', object: 'Object', field: 'Field', question: 'Question', decision: 'Decision', process: 'Process' }

function buildIndex() {
  const rows = FINDER_SECTIONS.map(([id, title, sub]) => ({ type: 'section', id, title, sub }))
  for (const o of discoveryCatalog.objects) {
    rows.push({ type: 'object', id: o.id, objectId: o.id, title: o.title, sub: o.tcodes.join(' · '), extra: o.plain })
    for (const f of o.fields) rows.push({ type: 'field', id: f.id, objectId: o.id, title: f.label, sub: o.title, optional: f.tier === 'optional' })
    for (const q of o.questions) rows.push({ type: 'question', id: q.id, objectId: o.id, title: q.text, sub: o.title })
    for (const d of o.decisions) rows.push({ type: 'decision', id: d.id, objectId: o.id, title: d.text, sub: o.title })
  }
  for (const p of processCatalog.processes) rows.push({ type: 'process', id: p.id, title: p.title, sub: 'Processes & jobs' })
  return rows
}

export default function Finder({ open, onClose, onGo, session, workshopId, currentObject }) {
  const index = useMemo(buildIndex, [])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [ai, setAi] = useState({ state: 'idle', results: [], error: '' })
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery(''); setActive(0); setAi({ state: 'idle', results: [], error: '' })
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  // Instant results: plain text search over names, so exact terms (T-codes, field names) are found without waiting.
  const instant = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return index.filter(r => r.type === 'section').slice(0, 8)
    const words = q.split(/\s+/).filter(Boolean)
    const hay = r => (r.title + ' ' + (r.sub || '') + ' ' + (r.extra || '')).toLowerCase()
    return index.filter(r => words.every(w => hay(r).includes(w))).slice(0, 8)
  }, [index, query])

  const aiRows = ai.results.map(r => {
    const row = index.find(x => x.type === r.type && x.id === r.id)
    return row ? { ...row, reason: r.reason } : null
  }).filter(Boolean)

  const items = [...aiRows.map(r => ({ ...r, ai: true })), ...instant]
  const askRowIndex = query.trim().length >= 2 ? items.length : -1

  async function askAI() {
    const q = query.trim()
    if (q.length < 2 || ai.state === 'loading') return
    setAi({ state: 'loading', results: [], error: '' })
    try {
      const res = await fetch('/api/discovery-find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
        body: JSON.stringify({ query: q, workshopId, currentObject }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI search failed')
      setAi({ state: 'done', results: data.results || [], error: data.results?.length ? '' : 'No matching place found. Try other words.' })
      setActive(0)
    } catch (e) {
      setAi({ state: 'error', results: [], error: e.message })
    }
  }

  function choose(i) {
    if (i === askRowIndex) return askAI()
    const row = items[i]
    if (!row) return
    onGo(row)
    onClose()
  }

  function onKey(e) {
    const max = askRowIndex >= 0 ? askRowIndex : items.length - 1
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, max)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); choose(items.length && active < items.length ? active : askRowIndex) }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  if (!open) return null
  return (
    <div className="dw-finder-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dw-finder" role="dialog" aria-modal="true" aria-label="Find or ask">
        <div className="dw-finder-input">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setActive(0); if (ai.state !== 'idle') setAi({ state: 'idle', results: [], error: '' }) }} onKeyDown={onKey}
            placeholder="Find a field, question, T-code… or ask “where do I note who approves orders?”" aria-label="Find or ask" />
          <kbd>Esc</kbd>
        </div>
        <div className="dw-finder-list" role="listbox">
          {aiRows.length > 0 && <div className="dw-finder-group">Wani suggests</div>}
          {items.map((r, i) => (
            <Fragment key={r.type + r.id + (r.ai ? 'ai' : '')}>
              {i === aiRows.length && <div className="dw-finder-group">{query.trim() ? 'Matches' : 'Jump to'}</div>}
              <button role="option" aria-selected={active === i} className={`dw-finder-row ${active === i ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
                <span className={`dw-finder-type dw-finder-type-${r.type}`}>{TYPE_LABEL[r.type]}</span>
                <span className="dw-finder-text"><strong>{r.title}</strong><small>{r.ai && r.reason ? r.reason : r.sub}</small></span>
                {r.ai && <span className="dw-finder-ai">AI</span>}
              </button>
            </Fragment>
          ))}
          {query.trim() && !instant.length && !aiRows.length && ai.state === 'idle' && <p className="dw-finder-empty">No direct match. Ask Wani below — it understands plain language.</p>}
          {askRowIndex >= 0 && (
            <button className={`dw-finder-row dw-finder-ask ${active === askRowIndex ? 'is-active' : ''}`} onMouseEnter={() => setActive(askRowIndex)} onClick={askAI} disabled={ai.state === 'loading'}>
              <span className="dw-finder-type dw-finder-type-ai">Ask</span>
              <span className="dw-finder-text"><strong>{ai.state === 'loading' ? 'Wani is looking…' : `Ask Wani: “${query.trim()}”`}</strong><small>{ai.error || 'Finds the right place even if you don’t know the exact name'}</small></span>
              <kbd>↵</kbd>
            </button>
          )}
        </div>
        <div className="dw-finder-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> anytime</span></div>
      </div>
    </div>
  )
}
