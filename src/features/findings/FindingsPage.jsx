import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { WaniLogo, WaniWordmark } from '../../pages/Login.jsx'
import './Findings.css'

// Findings: solved investigations kept as numbered cases (10000001, …) with a date.
// Wani structures what was found; the consultant reviews and saves it. Chat later
// brings up a matching finding by number when a similar problem comes back.

export async function callFindings(session, payload) {
  const r = await fetch('/api/findings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
    body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Error(data.error || 'Request failed')
  return data
}

export const fmtDate = d => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '')
const today = () => new Date().toISOString().slice(0, 10)
const STATUS = { solved: 'Solved', root_cause_found: 'Root cause found', open: 'Open' }
const COLS = 'id,number,found_on,ticket_ref,title,module,problem,investigation,root_cause,solution,sap_objects,status,source,created_at,updated_at'

// Review / edit form. `initial` is a draft (new) or a saved finding (edit).
export function FindingForm({ session, initial, source = 'chat', onSaved, onCancel }) {
  const [f, setF] = useState(() => ({ found_on: today(), ticket_ref: '', title: '', module: '', status: 'solved', problem: '', investigation: '', root_cause: '', solution: '', ...initial, sap_objects: (initial?.sap_objects || []).join(', ') }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const save = async () => {
    if (!f.title.trim()) { setError('Give the finding a title.'); return }
    setBusy(true); setError('')
    try {
      const payload = { ...f, sap_objects: f.sap_objects.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) }
      const { finding } = initial?.id
        ? await callFindings(session, { action: 'update', id: initial.id, finding: payload })
        : await callFindings(session, { action: 'save', source, finding: payload })
      onSaved?.(finding)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="fd-form">
      <div className="fd-grid">
        <label>Date<input type="date" value={f.found_on || ''} onChange={set('found_on')} /></label>
        <label>Customer ticket <small>(optional)</small><input value={f.ticket_ref || ''} onChange={set('ticket_ref')} placeholder="e.g. INC0012345" /></label>
        <label>Module<input value={f.module || ''} onChange={set('module')} placeholder="PM" /></label>
        <label>Status<select value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <label>Title<input value={f.title} onChange={set('title')} placeholder="Short name of the problem" /></label>
      <label>Problem<textarea rows={3} value={f.problem || ''} onChange={set('problem')} /></label>
      <label>Investigation steps<textarea rows={10} value={f.investigation || ''} onChange={set('investigation')} /></label>
      <label>Root cause<textarea rows={3} value={f.root_cause || ''} onChange={set('root_cause')} /></label>
      <label>Solution / workaround <small>(leave empty if not found yet)</small><textarea rows={3} value={f.solution || ''} onChange={set('solution')} /></label>
      <label>SAP objects <small>(comma separated)</small><input value={f.sap_objects} onChange={set('sap_objects')} /></label>
      {error && <p className="fd-error" role="alert">{error}</p>}
      <div className="fd-row">
        <button className="fd-btn fd-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : initial?.id ? 'Save changes' : 'Save finding'}</button>
        {onCancel && <button className="fd-btn" onClick={onCancel} disabled={busy}>Cancel</button>}
        <span className="fd-dim">{initial?.number ? `Finding ${initial.number}` : 'Gets the next number when saved'}</span>
      </div>
    </div>
  )
}

// Dialog used from chat: Wani structures the selected conversation, the consultant reviews and saves.
export function FindingDialog({ session, text, onClose, onSaved }) {
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  useEffect(() => {
    let live = true
    callFindings(session, { action: 'structure', text })
      .then(d => live && setDraft(d.finding))
      .catch(e => live && setError(e.message))
    return () => { live = false }
  }, [session, text])
  return (
    <div className="fd-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fd fd-dialog" role="dialog" aria-modal="true" aria-label="Save as finding">
        <div className="fd-dialog-head">
          <div><div className="fd-eyebrow">Save as finding</div><h2>{saved ? `Finding ${saved.number} saved` : draft ? 'Check and save' : 'Wani is structuring what you found…'}</h2></div>
          <button className="fd-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {saved ? <div className="fd-saved">
          <p>Saved as <strong>Finding {saved.number}</strong> on {fmtDate(saved.found_on)}. Wani will bring it up when a similar problem comes back.</p>
          <div className="fd-row"><a className="fd-btn fd-primary" href={`/findings?n=${saved.number}`}>Open in Findings</a><button className="fd-btn" onClick={onClose}>Done</button></div>
        </div>
          : error ? <p className="fd-error" role="alert">{error}</p>
          : !draft ? <div className="fd-loading" role="status"><span className="fd-spin" /> Reading the conversation…</div>
          : <FindingForm session={session} initial={draft} onCancel={onClose} onSaved={f => { setSaved(f); onSaved?.(f) }} />}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  if (!children || (typeof children === 'string' && !children.trim())) return null
  return <section className="fd-sec"><h3>{title}</h3>{typeof children === 'string' ? <div className="fd-text">{children}</div> : children}</section>
}

function FindingCard({ f, open, onToggle, onEdit, onDelete }) {
  return (
    <article className={'fd-card' + (open ? ' is-open' : '')} id={'finding-' + f.number}>
      <button className="fd-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="fd-num">{f.number}</span>
        <span className="fd-card-title"><strong>{f.title}</strong>
          <small>{fmtDate(f.found_on)}{f.module ? ` · ${f.module}` : ''}{f.ticket_ref ? ` · ticket ${f.ticket_ref}` : ''}</small></span>
        <span className={'fd-status fd-s-' + f.status}>{STATUS[f.status] || f.status}</span>
      </button>
      {open && <div className="fd-card-body">
        <Section title="Problem">{f.problem}</Section>
        <Section title="Investigation">{f.investigation}</Section>
        <Section title="Root cause">{f.root_cause}</Section>
        <Section title="Solution">{f.solution || (f.status !== 'solved' ? '' : null)}</Section>
        {f.sap_objects?.length > 0 && <Section title="SAP objects"><div className="fd-objs">{f.sap_objects.map(o => <code key={o}>{o}</code>)}</div></Section>}
        <div className="fd-row">
          <button className="fd-btn" onClick={onEdit}>Edit</button>
          <button className="fd-btn" onClick={() => navigator.clipboard?.writeText(`Finding ${f.number} (${fmtDate(f.found_on)}) — ${f.title}`)}>Copy reference</button>
          <span className="fd-spacer" />
          <button className="fd-btn fd-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>}
    </article>
  )
}

export default function FindingsPage({ session }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [mode, setMode] = useState('list') // list | new
  const [paste, setPaste] = useState('')
  const [draft, setDraft] = useState(null)
  const [structuring, setStructuring] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('wani_findings').select(COLS).order('number', { ascending: false })
    if (error) setError(/does not exist|schema cache/i.test(error.message) ? 'The findings table is not set up yet — run migration 025 in Supabase.' : error.message)
    else { setItems(data || []); setError('') }
    setLoading(false)
    const n = new URLSearchParams(location.search).get('n')
    if (n) { const hit = (data || []).find(x => String(x.number) === n); if (hit) { setOpenId(hit.id); setTimeout(() => document.getElementById('finding-' + n)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 100) } }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return items
    return items.filter(f => {
      const hay = [f.number, f.ticket_ref, f.title, f.module, f.problem, f.investigation, f.root_cause, f.solution, ...(f.sap_objects || []), fmtDate(f.found_on)].join(' ').toLowerCase()
      return words.every(w => hay.includes(w))
    })
  }, [items, query])

  const structure = async () => {
    setStructuring(true); setError('')
    try { setDraft((await callFindings(session, { action: 'structure', text: paste })).finding) } catch (e) { setError(e.message) } finally { setStructuring(false) }
  }
  const remove = async f => {
    if (!window.confirm(`Delete Finding ${f.number}? This cannot be undone.`)) return
    const { error } = await supabase.from('wani_findings').delete().eq('id', f.id)
    if (error) setError(error.message); else setItems(xs => xs.filter(x => x.id !== f.id))
  }

  return (
    <div className="fd fd-page">
      <header className="fd-top">
        <a href="/" className="fd-brand" aria-label="Back to Wani chat"><WaniLogo size={22} dark /><WaniWordmark height={13} dark /></a>
        <nav className="fd-crumbs"><a href="/">Chat</a><span>/</span><span aria-current="page">Findings</span></nav>
      </header>
      <div className="fd-head">
        <div><h1>Findings</h1><p className="fd-lead">Solved investigations, numbered like tickets. Wani reuses them when a similar problem comes back.</p></div>
        {mode === 'list' ? <button className="fd-btn fd-primary" onClick={() => { setMode('new'); setDraft(null); setPaste('') }}>+ New finding</button>
          : <button className="fd-btn" onClick={() => setMode('list')}>Back to list</button>}
      </div>
      {error && <p className="fd-error" role="alert">{error}</p>}

      {mode === 'new' && <div className="fd-card fd-pad">
        {!draft ? <>
          <label className="fd-label">Paste what you found — steps, root cause, fix, notes. Wani structures it; you check it before saving.
            <textarea rows={14} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'1. Reproduce the issue…\n2. Identify the OData service…'} />
          </label>
          <div className="fd-row"><button className="fd-btn fd-primary" onClick={structure} disabled={structuring || paste.trim().length < 20}>{structuring ? 'Structuring…' : 'Structure with Wani'}</button>
            <button className="fd-btn" onClick={() => setDraft({})}>Fill in by hand</button></div>
        </> : <FindingForm session={session} initial={draft} source={paste ? 'chat' : 'manual'} onCancel={() => setMode('list')}
          onSaved={f => { setItems(xs => [f, ...xs]); setMode('list'); setOpenId(f.id) }} />}
      </div>}

      {mode === 'list' && <>
        <input className="fd-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by number, title, app, CDS view, T-code, ticket…" aria-label="Search findings" />
        {loading ? <p className="fd-dim" role="status">Loading…</p>
          : !items.length ? <div className="fd-empty"><p>No findings yet.</p><p className="fd-dim">Under any answer in chat, click <strong>Save as finding</strong> — or add one here.</p></div>
          : !shown.length ? <p className="fd-dim">No finding matches “{query}”.</p>
          : shown.map(f => editing === f.id
            ? <div key={f.id} className="fd-card fd-pad"><FindingForm session={session} initial={f} onCancel={() => setEditing(null)} onSaved={u => { setItems(xs => xs.map(x => x.id === u.id ? u : x)); setEditing(null) }} /></div>
            : <FindingCard key={f.id} f={f} open={openId === f.id} onToggle={() => setOpenId(openId === f.id ? null : f.id)} onEdit={() => setEditing(f.id)} onDelete={() => remove(f)} />)}
      </>}
    </div>
  )
}
