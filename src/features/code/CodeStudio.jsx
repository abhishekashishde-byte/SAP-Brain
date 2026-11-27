import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { WaniLogo, WaniWordmark } from '../../pages/Login.jsx'
import { pastedFileName, downloadText } from '../../components/PastedFile.jsx'
import './CodeStudio.css'

// Code workspace. Left: every program you analysed (search, delete). Middle: the selected
// program — analysis, documentation, test cases, the code itself. Right: one place to ask
// about that program; the conversation is kept with it.
// Every analysed program is kept privately (code_library, in_library = false). "Add to
// library" writes a client-neutral summary and sets in_library — only those reach chat.

async function callCode(session, payload) {
  const r = await fetch('/api/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
    body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Error(data.error || 'Request failed')
  return data
}

// Minimal Markdown: headings, bullets, numbered lists, bold, inline code, code blocks.
function inline(text) {
  const parts = String(text ?? '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => p.startsWith('`') && p.endsWith('`') && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code>
    : p.startsWith('**') && p.endsWith('**') && p.length > 3 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>)
}
function Markdown({ text }) {
  const blocks = []
  const lines = String(text || '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('```')) {
      const buf = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      blocks.push(<pre key={i}>{buf.join('\n')}</pre>)
    } else if (/^#{1,4}\s/.test(l)) {
      const level = l.match(/^#+/)[0].length
      const H = level <= 2 ? 'h3' : 'h4'
      blocks.push(<H key={i}>{inline(l.replace(/^#+\s/, ''))}</H>)
    } else if (/^\s*([-*•]|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\.\s/.test(l)
      const items = []
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+\.)\s/, ''))
      i--
      const L = ordered ? 'ol' : 'ul'
      blocks.push(<L key={i}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</L>)
    } else if (l.trim()) blocks.push(<p key={i}>{inline(l)}</p>)
  }
  return <div className="cs-md">{blocks}</div>
}

const VERDICT = { keep: 'Keep', adapt: 'Adapt', 'replace with standard': 'Replace with standard', retire: 'Retire' }
const verdictKey = v => (VERDICT[v] ? v.replace(/\s+/g, '-') : 'none')

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
function testsCsv(tests) {
  const head = ['ID', 'Title', 'Type', 'Preconditions', 'Steps', 'Expected result']
  return [head, ...tests.map(t => [t.id, t.title, t.type, t.preconditions, (t.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n'), t.expected])]
    .map(r => r.map(csvCell).join(',')).join('\r\n')
}
const fileBase = t => (t || 'program').replace(/[^\w-]+/g, '_')
const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const lineCount = code => code ? code.split('\n').length : 0

const COVERAGE = { full: 'Standard can replace it', partial: 'Standard covers part of it', none: 'No standard replacement found' }

function StandardCoverage({ a }) {
  const c = a.standard_coverage
  if (!c || typeof c !== 'object') return null
  const level = COVERAGE[c.level] ? c.level : 'none'
  return (
    <section className={'cs-sec cs-cover cs-cover-' + level}>
      <div className="cs-sec-head"><h3>Can standard replace it?</h3><span className="cs-cover-level">{COVERAGE[level]}</span></div>
      {c.summary && <p>{inline(c.summary)}</p>}
      {c.options?.length > 0 && (
        <ul className="cs-options">
          {c.options.map((o, i) => (
            <li key={i}>
              <div className="cs-opt-head"><strong>{inline(o.name)}</strong>
                <span className="cs-dim">{[o.kind, o.release].filter(Boolean).join(', ')}{o.verified === false ? ' (not verified)' : ''}</span></div>
              {o.covers && <p><span className="cs-lbl cs-ok">Covers</span>{inline(o.covers)}</p>}
              {o.gaps && <p><span className="cs-lbl cs-gap">Limits</span>{inline(o.gaps)}</p>}
            </li>
          ))}
        </ul>
      )}
      {c.recommendation && <p className="cs-reco"><strong>Recommendation:</strong> {inline(c.recommendation)}</p>}
    </section>
  )
}

function Analysis({ a }) {
  if (!a) return <p className="cs-dim">No analysis stored for this program.</p>
  return (
    <div className="cs-analysis">
      {a.purpose && <p className="cs-purpose">{inline(a.purpose)}</p>}
      {a.verdict_reason && <p className="cs-reason">{inline(a.verdict_reason)}</p>}
      <StandardCoverage a={a} />
      {a.how_it_works?.length > 0 && <section className="cs-sec"><h3>How it works</h3><ol className="cs-steps">{a.how_it_works.map((s, i) => <li key={i}>{inline(s)}</li>)}</ol></section>}
      {a.s4_findings?.length > 0 && (
        <section className="cs-sec">
          <h3>S/4HANA check</h3>
          <ul className="cs-findings">
            {a.s4_findings.map((f, i) => (
              <li key={i} className={'cs-sev-' + (f.severity || 'low')}>
                <div><code>{f.object}</code><span className="cs-sev">{f.severity}</span></div>
                <p>{inline(f.finding)}</p>
                {f.evidence && <small>Evidence: {f.evidence}</small>}
              </li>
            ))}
          </ul>
          <p className="cs-hint">Candidates only. Confirm with the ATC S/4HANA readiness checks before acting.</p>
        </section>
      )}
      {!a.standard_coverage && a.standard_alternative && <section className="cs-sec"><h3>Standard alternative</h3><p>{inline(a.standard_alternative)}</p></section>}
      {a.objects?.length > 0 && (
        <section className="cs-sec">
          <h3>SAP objects used</h3>
          <div className="cs-table"><table><tbody>
            {a.objects.map((o, i) => <tr key={i}><td><code>{o.name}</code></td><td className="cs-dim">{o.type}</td><td>{o.role}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
      {a.risks?.length > 0 && <section className="cs-sec"><h3>Points to watch</h3><ul>{a.risks.map((r, i) => <li key={i}>{inline(r)}</li>)}</ul></section>}
    </div>
  )
}

function Tests({ tests }) {
  return (
    <div className="cs-tests">
      {tests.map(t => (
        <details key={t.id}>
          <summary><span className="cs-tid">{t.id}</span><span className="cs-ttitle">{t.title}</span><span className={'cs-ttype cs-t-' + t.type}>{t.type}</span></summary>
          {t.preconditions && <p><strong>Preconditions:</strong> {t.preconditions}</p>}
          <ol>{(t.steps || []).map((s, i) => <li key={i}>{s}</li>)}</ol>
          <p><strong>Expected:</strong> {t.expected}</p>
        </details>
      ))}
    </div>
  )
}

const SUMMARY_FIELDS = [
  ['problem', 'Problem it solves'], ['approach', 'Approach'], ['when_to_use', 'Use when'],
  ['when_not_to_use', 'Not when'], ['standard_alternative', 'Standard alternative'], ['standard_coverage', 'Standard coverage'], ['s4_notes', 'S/4HANA notes'],
]

// ---------- search across everything you wrote or pasted ----------

const terms = q => q.toLowerCase().split(/\s+/).filter(Boolean)
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function Mark({ text, words }) {
  if (!words.length) return text
  const parts = String(text).split(new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi'))
  return parts.map((p, i) => i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>)
}
function clip(raw, at, len = 90) {
  const text = raw.replace(/\*\*|`/g, '')
  at = Math.max(0, at - (raw.slice(0, at).length - raw.slice(0, at).replace(/\*\*|`/g, '').length))
  const start = Math.max(0, at - 30)
  return (start ? '…' : '') + text.slice(start, start + len).replace(/\s+/g, ' ').trim() + (start + len < text.length ? '…' : '')
}
// Where does the first search word occur? Returns a short hint so you see why a program matched.
function whereMatched(e, words) {
  const w = words[0]
  const s = e.summary || {}
  const fields = [
    ['Title', e.title], ['Purpose', s.analysis?.purpose], ['Problem', s.problem], ['Approach', s.approach],
    ['Objects', [...(s.objects || []), ...(s.analysis?.objects || []).map(o => o.name)].join(' ')], ['Tags', (s.tags || []).join(' ')],
  ]
  for (const [label, t] of fields) { const i = String(t || '').toLowerCase().indexOf(w); if (i >= 0) return label === 'Title' ? null : { label, text: clip(String(t), i) } }
  for (const m of s.qa || []) { const i = String(m.text).toLowerCase().indexOf(w); if (i >= 0) return { label: m.role === 'user' ? 'Your question' : 'Answer', text: clip(m.text, i) } }
  if (e.code) {
    const lines = e.code.split('\n')
    const n = lines.findIndex(l => l.toLowerCase().includes(w))
    if (n >= 0) return { label: `Code line ${n + 1}`, text: lines[n].trim().slice(0, 90), line: n + 1 }
  }
  for (const [label, t] of [['Documentation', e.documentation], ['Analysis', JSON.stringify(s.analysis || {})], ['Test cases', JSON.stringify(e.test_cases || [])]]) {
    const i = String(t || '').toLowerCase().indexOf(w); if (i >= 0) return { label, text: clip(String(t), i) }
  }
  return null
}
const haystack = e => [e.title, JSON.stringify(e.summary || {}), e.documentation, JSON.stringify(e.test_cases || []), e.code].join('\n').toLowerCase()

function Rail({ entries, loading, selected, onSelect, onNew, onDelete, query, setQuery, filter, setFilter, searchRef }) {
  const words = terms(query)
  const counts = { all: entries.length, library: entries.filter(e => e.in_library !== false).length }
  counts.history = counts.all - counts.library
  const list = useMemo(() => entries
    .filter(e => filter === 'all' || (filter === 'library') === (e.in_library !== false))
    .filter(e => { if (!words.length) return true; const h = haystack(e); return words.every(w => h.includes(w)) }),
  [entries, filter, query]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className="cs-rail" aria-label="Your programs">
      <button className="cs-new" onClick={onNew} aria-pressed={selected === 'new'}>
        <span aria-hidden="true">+</span> New program
      </button>
      <div className="cs-find">
        <input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search titles, code, questions…" aria-label="Search your programs" />
        <kbd aria-hidden="true">/</kbd>
      </div>
      <div className="cs-filter" role="radiogroup" aria-label="Show">
        {[['all', 'All'], ['library', 'Library'], ['history', 'Not in library']].map(([k, l]) => (
          <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}>{l} <span>{counts[k]}</span></button>
        ))}
      </div>
      {loading ? <p className="cs-rail-note">Loading…</p>
        : !list.length ? <p className="cs-rail-note">{entries.length ? 'Nothing matches. Search also looks inside the code and your questions.' : 'Programs you analyse appear here.'}</p>
        : (
          <ul className="cs-list">
            {list.map(e => {
              const s = e.summary || {}
              const v = s.verdict || s.analysis?.verdict
              const hit = words.length ? whereMatched(e, words) : null
              return (
                <li key={e.id} className={'cs-item cs-vk-' + verdictKey(v) + (selected === e.id ? ' is-on' : '')}>
                  <button className="cs-item-main" onClick={() => onSelect(e.id, hit?.line)} aria-current={selected === e.id ? 'true' : undefined}>
                    <strong><Mark text={e.title} words={words} /></strong>
                    {hit ? <span className="cs-hit"><em>{hit.label}</em> <Mark text={hit.text} words={words} /></span>
                      : <span className="cs-item-sub">{s.problem || s.analysis?.purpose || ''}</span>}
                    <span className="cs-item-meta">
                      {fmtDate(e.updated_at || e.created_at)}
                      {e.in_library !== false && <span className="cs-badge">Library</span>}
                      {!e.code && <span className="cs-badge cs-badge-dim">No code</span>}
                      {(s.qa?.length || 0) > 0 && <span className="cs-badge cs-badge-dim">{Math.ceil(s.qa.length / 2)} Q</span>}
                    </span>
                  </button>
                  <button className="cs-item-del" aria-label={`Delete ${e.title}`} title="Delete"
                    onClick={() => { if (window.confirm(`Delete "${e.title}"? The analysis, questions, documentation and test cases are removed for good.`)) onDelete(e.id) }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
    </aside>
  )
}

// ---------- new program ----------

const MAX_LINES = 10000
function NewProgram({ session, onCreated }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const n = lineCount(code)
  const onUpload = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 900_000) { setError('That file is too large (max about 900 KB). Upload the relevant includes instead.'); return }
    setCode(await f.text()); setName(f.name); setError('')
  }
  const analyse = async () => {
    if (n > MAX_LINES) return
    setBusy(true); setError('')
    try {
      const r = await callCode(session, { action: 'analyse', code, note })
      const a = r.analysis || {}
      const row = { title: (a.title || pastedFileName(code).replace(/\.txt$/, '')).slice(0, 200), language: a.language || 'ABAP',
        summary: { analysis: a, verdict: a.verdict, qa: [], note: note || undefined }, code, in_library: false }
      const { data, error: e } = await supabase.from('code_library').insert(row).select('*').single()
      if (e) throw Error(/in_library/.test(e.message) ? 'The analysis worked, but it could not be kept: run migration 027_code_workspace.sql in Supabase, then analyse again.' : e.message)
      onCreated(data)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="cs-newprog">
      <h1>Paste a program</h1>
      <p className="cs-lede">Wani explains what it does, checks it against S/4HANA and says whether standard covers it now. The program is kept in your list so you can come back and ask about it. Delete it any time.</p>
      <div className="cs-editor">
        <div className="cs-editor-bar">
          <span>{name || (code ? pastedFileName(code) : 'Untitled')}</span>
          <span className={n > MAX_LINES ? 'cs-over' : ''}>{n ? `${n.toLocaleString()} lines` : ''}{n > MAX_LINES ? ` (limit ${MAX_LINES.toLocaleString()})` : ''}</span>
        </div>
        <textarea spellCheck={false} wrap="off" value={code} onChange={e => setCode(e.target.value)} aria-label="Program code"
          placeholder={'REPORT zpm_order_check.\n\n* Paste the main program and the includes you want checked.'} />
      </div>
      <div className="cs-newprog-row">
        <label className="cs-btn cs-upload">Upload a file<input type="file" accept=".txt,.abap,.sql,.js,.ts,.cds,.xml,.json,text/*" onChange={onUpload} /></label>
        {code && <button className="cs-btn cs-ghost" onClick={() => { setCode(''); setName('') }}>Clear</button>}
      </div>
      <label className="cs-field">What you already know <span className="cs-dim">(optional)</span>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Where it runs, who uses it, what it should do" />
      </label>
      {error && <div className="cs-error" role="alert">{error}</div>}
      <button className="cs-btn cs-primary cs-go" disabled={busy || code.trim().length < 20 || n > MAX_LINES} onClick={analyse}>
        {busy ? <><span className="cs-spin" /> Reading the code and checking S/4HANA…</> : 'Analyse program'}
      </button>
    </div>
  )
}

// ---------- the selected program ----------

function CodeView({ code, focusLine }) {
  const lines = useMemo(() => code.split('\n'), [code])
  const [find, setFind] = useState('')
  const box = useRef(null)
  const f = find.trim().toLowerCase()
  const hits = useMemo(() => f ? lines.reduce((a, l, i) => (l.toLowerCase().includes(f) ? [...a, i + 1] : a), []) : [], [f, lines])
  const [cur, setCur] = useState(0)
  const go = n => box.current?.querySelector(`[data-ln="${n}"]`)?.scrollIntoView({ block: 'center' })
  useEffect(() => { if (focusLine) setTimeout(() => go(focusLine), 30) }, [focusLine])
  useEffect(() => { setCur(0); if (hits[0]) go(hits[0]) }, [hits])
  const step = d => { if (!hits.length) return; const k = (cur + d + hits.length) % hits.length; setCur(k); go(hits[k]) }
  const w = String(lines.length).length
  return (
    <div className="cs-codeview">
      <div className="cs-codeview-bar">
        <input type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="Find in code"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1) } }} aria-label="Find in code" />
        <span className="cs-dim">{f ? (hits.length ? `${cur + 1} of ${hits.length}` : 'No match') : `${lines.length.toLocaleString()} lines`}</span>
        {hits.length > 1 && <><button className="cs-btn cs-small" onClick={() => step(-1)} aria-label="Previous match">↑</button><button className="cs-btn cs-small" onClick={() => step(1)} aria-label="Next match">↓</button></>}
        <span className="cs-spacer" />
        <button className="cs-btn cs-small" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>
        <button className="cs-btn cs-small" onClick={() => downloadText(pastedFileName(code), code)}>Download</button>
      </div>
      <div className="cs-codeview-body" ref={box}>
        {lines.map((l, i) => {
          const ln = i + 1
          const on = ln === focusLine || (f && hits[cur] === ln)
          return <div key={i} data-ln={ln} className={'cs-ln' + (on ? ' is-on' : f && l.toLowerCase().includes(f) ? ' is-hit' : '')}>
            <span style={{ width: w + 'ch' }}>{ln}</span><code>{l || ' '}</code></div>
        })}
      </div>
    </div>
  )
}

function AddCode({ entry, patch }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const n = lineCount(code)
  const save = async () => { setBusy(true); await patch({ code }); setBusy(false); setOpen(false) }
  const upload = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCode(await f.text()) }
  if (!open) return (
    <div className="cs-addcode">
      <p>Only the summary of this program was kept, so Wani cannot point to places in the code.</p>
      <button className="cs-btn cs-small cs-primary" onClick={() => setOpen(true)}>Add the code</button>
    </div>
  )
  return (
    <div className="cs-addcode is-open">
      <textarea spellCheck={false} wrap="off" rows={8} value={code} onChange={e => setCode(e.target.value)} placeholder={`Paste the code of ${entry.title}…`} aria-label="Program code" />
      <div className="cs-row">
        <button className="cs-btn cs-small cs-primary" disabled={busy || code.trim().length < 20 || n > MAX_LINES} onClick={save}>{busy ? 'Saving…' : 'Keep code with this program'}</button>
        <label className="cs-btn cs-small cs-upload">Upload<input type="file" accept=".txt,.abap,.sql,.js,.ts,.cds,.xml,text/*" onChange={upload} /></label>
        <button className="cs-btn cs-small cs-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <span className="cs-dim">{n ? `${n.toLocaleString()} lines` : ''}</span>
      </div>
    </div>
  )
}

// The one place to ask. Each question and its answer can be removed; the thread is kept with the program.
function AskPanel({ entry, session, patch }) {
  const s = entry.summary || {}
  const thread = Array.isArray(s.qa) ? s.qa : []
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const body = useRef(null)
  // Scroll only the panel itself (never the page) to the newest answer.
  useEffect(() => { const b = body.current; if (b) b.scrollTop = b.scrollHeight }, [thread.length, pending])
  useEffect(() => { setQuestion(''); setError(''); setPending('') }, [entry.id])
  const ask = async () => {
    const q = question.trim(); if (!q || pending) return
    setPending(q); setQuestion(''); setError('')
    try {
      const { analysis, qa, ...summary } = s
      const r = await callCode(session, { action: 'ask', code: entry.code || '', analysis: analysis || null, summary: { title: entry.title, ...summary }, question: q, history: thread })
      await patch({ summary: { ...s, qa: [...thread, { role: 'user', text: q }, { role: 'wani', text: r.answer, at: new Date().toISOString() }] } })
    } catch (e) { setQuestion(q); setError(e.message) } finally { setPending('') }
  }
  const removePair = i => patch({ summary: { ...s, qa: thread.filter((_, k) => k !== i && !(k === i + 1 && thread[k].role === 'wani')) } })
  const clear = () => { if (window.confirm('Remove all questions and answers for this program?')) patch({ summary: { ...s, qa: [] } }) }
  return (
    <aside className="cs-ask" aria-label="Ask about this program">
      <div className="cs-ask-head">
        <h2>Ask about <span>{entry.title}</span></h2>
        {thread.length > 0 && <button className="cs-btn cs-small cs-ghost" onClick={clear}>Clear all</button>}
      </div>
      <div className="cs-ask-body" ref={body}>
        {!entry.code && <AddCode entry={entry} patch={patch} />}
        {!thread.length && !pending && <p className="cs-ask-empty">Questions here are answered from this program’s code, with line numbers. For example: where should the texts be translated, which BAdI replaces this user exit, is this BAPI still released?</p>}
        {thread.map((m, i) => m.role === 'user' ? (
          <div key={i} className="cs-q">
            <p>{m.text}</p>
            <button className="cs-q-del" onClick={() => removePair(i)} aria-label="Remove this question and its answer" title="Remove question and answer">✕</button>
          </div>
        ) : <div key={i} className="cs-a"><Markdown text={m.text} /></div>)}
        {pending && <><div className="cs-q"><p>{pending}</p></div><div className="cs-a cs-dim" role="status"><span className="cs-spin" /> Reading the code…</div></>}
        {error && <div className="cs-error" role="alert">{error}</div>}
      </div>
      <div className="cs-ask-input">
        <textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} aria-label="Your question"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
          placeholder="Ask about this program" />
        <button className="cs-btn cs-primary" disabled={!!pending || !question.trim()} onClick={ask}>Ask</button>
      </div>
    </aside>
  )
}

function LibraryDialog({ entry, session, patch, onClose }) {
  const s = entry.summary || {}
  const existing = entry.in_library !== false && s.problem
  const [draft, setDraft] = useState(existing ? { title: entry.title, ...Object.fromEntries(SUMMARY_FIELDS.map(([k]) => [k, s[k] || ''])), objects: s.objects || [], tags: s.tags || [] } : null)
  const [keepCode, setKeepCode] = useState(!!entry.code)
  const [busy, setBusy] = useState(existing ? '' : 'Writing a reusable summary without client names…')
  const [error, setError] = useState('')
  useEffect(() => {
    if (draft) return
    callCode(session, { action: 'library', code: entry.code || '', analysis: s.analysis || null, summary: entry.code ? undefined : { title: entry.title }, history: s.qa || [] })
      .then(r => setDraft({ title: entry.title, ...r.summary, title_suggested: r.summary?.title }))
      .catch(e => setError(e.message)).finally(() => setBusy(''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const save = async () => {
    setBusy('Saving…'); setError('')
    const { title, title_suggested, ...fields } = draft
    const ok = await patch({ title: title.trim(), in_library: true, summary: { ...s, ...fields }, ...(keepCode ? {} : { code: null }) })
    setBusy(''); if (ok) onClose()
  }
  return (
    <div className="cs-dialog-wrap" role="dialog" aria-modal="true" aria-label="Add to library" onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="cs-dialog">
        <div className="cs-dialog-head">
          <h2>{existing ? 'Library summary' : 'Add to library'}</h2>
          <button className="cs-btn cs-small cs-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="cs-hint">When you later describe a similar problem in chat, Wani points to standard first, then to this. Keep it free of client names.</p>
        {!draft && busy && <p className="cs-dim" role="status"><span className="cs-spin" /> {busy}</p>}
        {error && <div className="cs-error" role="alert">{error}</div>}
        {draft && <>
          <label className="cs-field">Title<input value={draft.title || ''} onChange={e => set('title', e.target.value)} /></label>
          {draft.title_suggested && draft.title_suggested !== draft.title && <button className="cs-linkbtn" onClick={() => set('title', draft.title_suggested)}>Use suggested title: {draft.title_suggested}</button>}
          {SUMMARY_FIELDS.map(([k, label]) => (
            <label className="cs-field" key={k}>{label}<textarea rows={k === 'approach' ? 3 : 2} value={draft[k] || ''} onChange={e => set(k, e.target.value)} /></label>
          ))}
          <label className="cs-field">SAP objects<input value={(draft.objects || []).join(', ')} onChange={e => set('objects', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} /></label>
          <label className="cs-field">Tags<input value={(draft.tags || []).join(', ')} onChange={e => set('tags', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} /></label>
          {entry.code && <label className="cs-check"><input type="checkbox" checked={keepCode} onChange={e => setKeepCode(e.target.checked)} />
            <span>Keep the code with it<small>Needed for exact answers later. Untick if you may not keep the client’s code — the summary and analysis stay.</small></span></label>}
          <div className="cs-row">
            <button className="cs-btn cs-primary" disabled={!!busy || !draft.title?.trim()} onClick={save}>{busy === 'Saving…' ? 'Saving…' : existing ? 'Save summary' : 'Add to library'}</button>
            <button className="cs-btn cs-ghost" onClick={onClose}>Cancel</button>
          </div>
        </>}
      </div>
    </div>
  )
}

function Program({ entry, session, patch, onDelete, focusLine, tab, setTab }) {
  const s = entry.summary || {}
  const a = s.analysis
  const v = s.verdict || a?.verdict
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState(entry.title)
  const [libOpen, setLibOpen] = useState(false)
  useEffect(() => { setTitle(entry.title); setError(''); setBusy('') }, [entry.id, entry.title])
  const run = async (label, fn) => { setBusy(label); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }
  const ctx = { code: entry.code || '', analysis: a || null, summary: entry.code ? undefined : { title: entry.title } }
  const writeDoc = () => run('doc', async () => { const r = await callCode(session, { action: 'document', ...ctx }); await patch({ documentation: r.documentation }) })
  const makeTests = () => run('tests', async () => { const r = await callCode(session, { action: 'tests', ...ctx }); await patch({ test_cases: r.test_cases }) })
  const reanalyse = () => run('analyse', async () => {
    const r = await callCode(session, { action: 'analyse', code: entry.code, note: s.note || '' })
    await patch({ summary: { ...s, analysis: r.analysis, verdict: r.analysis?.verdict } })
  })
  const rename = () => { const t = title.trim(); if (t && t !== entry.title) patch({ title: t }); else setTitle(entry.title) }
  const tests = Array.isArray(entry.test_cases) ? entry.test_cases : []
  const TABS = [['analysis', 'Analysis'], ['docs', 'Documentation'], ['tests', `Test cases${tests.length ? ` (${tests.length})` : ''}`], ['code', 'Code']]
  if (entry.in_library !== false && s.problem) TABS.push(['library', 'Library summary'])
  const t = TABS.some(([k]) => k === tab) ? tab : 'analysis'
  const needsCode = !entry.code && !a

  return (
    <div className={'cs-prog cs-vk-' + verdictKey(v)}>
      <header className="cs-prog-head">
        <div className="cs-verdict-band">
          <span className="cs-verdict-word">{VERDICT[v] || 'Not judged'}</span>
          <span className="cs-verdict-sub">{a?.language || entry.language || 'ABAP'}{entry.code ? `, ${lineCount(entry.code).toLocaleString()} lines` : ', code not kept'}</span>
        </div>
        <div className="cs-prog-title">
          <input value={title} onChange={e => setTitle(e.target.value)} onBlur={rename}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTitle(entry.title); e.currentTarget.blur() } }}
            aria-label="Program title (click to rename)" title="Click to rename" />
          <p className="cs-prog-meta">
            Analysed {fmtDate(entry.created_at)}
            {entry.in_library !== false ? <> <span className="cs-badge">In library</span></> : null}
          </p>
          <div className="cs-prog-actions">
          {entry.in_library !== false
            ? <button className="cs-btn" onClick={() => { if (window.confirm('Take this program out of the library? It stays in your list.')) patch({ in_library: false }) }}>Remove from library</button>
            : <button className="cs-btn cs-primary" onClick={() => setLibOpen(true)}>Add to library</button>}
          {entry.code && <button className="cs-btn" disabled={!!busy} onClick={reanalyse}>{busy === 'analyse' ? 'Analysing…' : 'Analyse again'}</button>}
          <button className="cs-btn cs-danger" onClick={() => { if (window.confirm(`Delete "${entry.title}"? The analysis, questions, documentation and test cases are removed for good.`)) onDelete(entry.id) }}>Delete</button>
          </div>
        </div>
      </header>

      <nav className="cs-tabs" role="tablist" aria-label="Program sections">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={t === k} onClick={() => setTab(k)}>{l}</button>)}
      </nav>
      {error && <div className="cs-error" role="alert">{error}<button className="cs-linkbtn" onClick={() => setError('')}>Dismiss</button></div>}

      <div className="cs-pane" role="tabpanel">
        {t === 'analysis' && (busy === 'analyse' ? <p className="cs-dim" role="status"><span className="cs-spin" /> Reading the code and checking S/4HANA…</p> : <Analysis a={a} />)}
        {t === 'docs' && (entry.documentation ? <>
          <div className="cs-pane-bar">
            <button className="cs-btn cs-small" onClick={() => navigator.clipboard?.writeText(entry.documentation)}>Copy</button>
            <button className="cs-btn cs-small" onClick={() => download(fileBase(entry.title) + '.md', entry.documentation, 'text/markdown')}>Download</button>
            <button className="cs-btn cs-small cs-ghost" disabled={!!busy} onClick={writeDoc}>{busy === 'doc' ? 'Writing…' : 'Write again'}</button>
          </div>
          <Markdown text={entry.documentation} />
        </> : <Empty busy={busy === 'doc'} disabled={needsCode} label="Write documentation" busyLabel="Writing the documentation…" onClick={writeDoc}
          text="A handover document: purpose, where it is used, how it works, objects, inputs and outputs, S/4HANA points, risks." />)}
        {t === 'tests' && (tests.length ? <>
          <div className="cs-pane-bar">
            <button className="cs-btn cs-small" onClick={() => download(fileBase(entry.title) + '_tests.csv', '﻿' + testsCsv(tests), 'text/csv')}>Download for Excel</button>
            <button className="cs-btn cs-small cs-ghost" disabled={!!busy} onClick={makeTests}>{busy === 'tests' ? 'Writing…' : 'Write again'}</button>
          </div>
          <Tests tests={tests} />
        </> : <Empty busy={busy === 'tests'} disabled={needsCode} label="Create test cases" busyLabel="Writing test cases…" onClick={makeTests}
          text="Functional test cases from the code: normal flow, edge cases, authorisations and error handling." />)}
        {t === 'code' && (entry.code ? <CodeView code={entry.code} focusLine={focusLine} /> : <AddCode entry={entry} patch={patch} />)}
        {t === 'library' && (
          <div className="cs-libsum">
            {SUMMARY_FIELDS.map(([k, label]) => s[k] ? <div key={k}><h3>{label}</h3><p>{inline(s[k])}</p></div> : null)}
            {s.objects?.length > 0 && <div><h3>SAP objects</h3><p>{s.objects.map(o => <code key={o}>{o}</code>)}</p></div>}
            <button className="cs-btn" onClick={() => setLibOpen(true)}>Edit summary</button>
          </div>
        )}
      </div>
      {libOpen && <LibraryDialog entry={entry} session={session} patch={patch} onClose={() => setLibOpen(false)} />}
    </div>
  )
}

function Empty({ text, label, busyLabel, busy, disabled, onClick }) {
  return (
    <div className="cs-empty">
      <p>{text}</p>
      {busy ? <p className="cs-dim" role="status"><span className="cs-spin" /> {busyLabel}</p>
        : <button className="cs-btn cs-primary" disabled={disabled} onClick={onClick}>{label}</button>}
      {disabled && <p className="cs-hint">Add the code first (Code tab).</p>}
    </div>
  )
}

export default function CodeStudio({ session }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('p') || 'new')
  const [focusLine, setFocusLine] = useState(null)
  const [tab, setTab] = useState('analysis')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const searchRef = useRef(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('code_library').select('*').order('updated_at', { ascending: false })
      if (error) setLoadError(/does not exist|schema cache/i.test(error.message) ? 'The code tables are not set up yet.' : error.message)
      setEntries(data || []); setLoading(false)
    })()
  }, [])
  useEffect(() => {
    const onKey = e => {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const u = new URL(window.location.href)
    if (selected === 'new') u.searchParams.delete('p'); else u.searchParams.set('p', selected)
    window.history.replaceState(null, '', u)
  }, [selected])

  const select = (id, line) => { setSelected(id); setFocusLine(line || null); setTab(line ? 'code' : t => t) }
  const entry = entries.find(e => e.id === selected)

  const patch = useCallback(async (id, changes) => {
    const at = new Date().toISOString()
    const before = entriesRef.current.find(e => e.id === id)
    setEntries(es => es.map(e => e.id === id ? { ...e, ...changes, updated_at: at } : e))
    const { error } = await supabase.from('code_library').update({ ...changes, updated_at: at }).eq('id', id)
    if (error) {
      if (before) setEntries(es => es.map(e => e.id === id ? before : e))
      setNotice('Not saved: ' + (/in_library/.test(error.message) ? 'run migration 027_code_workspace.sql in Supabase first.' : error.message))
      return false
    }
    return true
  }, [])
  const remove = async id => {
    const { error } = await supabase.from('code_library').delete().eq('id', id)
    if (error) { setNotice('Not deleted: ' + error.message); return }
    setEntries(es => es.filter(e => e.id !== id))
    if (selected === id) setSelected('new')
  }

  return (
    <div className="cs">
      <header className="cs-top">
        <a href="/" className="cs-brand" aria-label="Back to Wani chat"><WaniLogo size={22} dark /><WaniWordmark height={13} dark /></a>
        <nav className="cs-crumbs" aria-label="Breadcrumb"><a href="/">Chat</a><span aria-hidden="true">/</span><span aria-current="page">Code</span></nav>
      </header>
      {loadError && <div className="cs-error cs-banner" role="alert">{loadError}</div>}
      <div className={'cs-work' + (entry ? '' : ' is-new')}>
        <Rail entries={entries} loading={loading} selected={selected} onSelect={select} onNew={() => setSelected('new')} onDelete={remove}
          query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} searchRef={searchRef} />
        <main className="cs-main">
          {entry
            ? <Program key={entry.id} entry={entry} session={session} patch={c => patch(entry.id, c)} onDelete={remove} focusLine={focusLine} tab={tab} setTab={setTab} />
            : !loading && selected !== 'new' ? <div className="cs-empty"><p>This program is no longer in your list.</p><button className="cs-btn" onClick={() => setSelected('new')}>New program</button></div>
            : <NewProgram session={session} onCreated={row => { setEntries(es => [row, ...es]); setSelected(row.id); setTab('analysis') }} />}
        </main>
        {entry && <AskPanel entry={entry} session={session} patch={c => patch(entry.id, c)} />}
      </div>
      {notice && <div className="cs-error cs-toast" role="alert">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}>✕</button></div>}
    </div>
  )
}
