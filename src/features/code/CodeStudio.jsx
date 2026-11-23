import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { WaniLogo, WaniWordmark } from '../../pages/Login.jsx'
import PastedFile, { pastedFileName } from '../../components/PastedFile.jsx'
import './CodeStudio.css'

// Code section: paste a program → Wani explains it and checks it against S/4HANA.
// Follow-up questions, documentation and test cases on request. "Save to library"
// stores a reusable, client-neutral summary (full code only if ticked); chat later
// suggests saved solutions when the consultant describes a similar problem.

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
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code>
    : p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>)
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

const COVERAGE = { full: 'Standard can replace it', partial: 'Standard covers part of it', none: 'No standard replacement found' }

function StandardCoverage({ a }) {
  const c = a.standard_coverage
  if (!c || typeof c !== 'object') return null
  const level = COVERAGE[c.level] ? c.level : 'none'
  return (
    <div className={'cs-cover cs-cover-' + level}>
      <div className="cs-cover-head"><h3>Can standard replace it?</h3><span>{COVERAGE[level]}</span></div>
      {c.summary && <p>{inline(c.summary)}</p>}
      {c.options?.length > 0 && (
        <ul className="cs-options">
          {c.options.map((o, i) => (
            <li key={i}>
              <div className="cs-opt-head"><strong>{inline(o.name)}</strong><span className="cs-dim">{[o.kind, o.release].filter(Boolean).join(' · ')}{o.verified === false ? ' · not verified' : ''}</span></div>
              {o.covers && <p><span className="cs-lbl cs-ok">Covers</span>{inline(o.covers)}</p>}
              {o.gaps && <p><span className="cs-lbl cs-gap">Limits</span>{inline(o.gaps)}</p>}
            </li>
          ))}
        </ul>
      )}
      {c.recommendation && <p className="cs-reco"><strong>Recommendation:</strong> {inline(c.recommendation)}</p>}
    </div>
  )
}

function Analysis({ a }) {
  return (
    <section className="cs-card">
      <div className="cs-card-head">
        <div>
          <p className="cs-eyebrow">{a.language || 'Program'}</p>
          <h2>{a.title}</h2>
        </div>
        {a.verdict && <span className={'cs-verdict cs-v-' + a.verdict.replace(/\s+/g, '-')}>{VERDICT[a.verdict] || a.verdict}</span>}
      </div>
      <p className="cs-lead">{a.purpose}</p>
      {a.verdict_reason && <p className="cs-reason">{inline(a.verdict_reason)}</p>}

      <StandardCoverage a={a} />

      {a.how_it_works?.length > 0 && <><h3>How it works</h3><ol className="cs-steps">{a.how_it_works.map((s, i) => <li key={i}>{inline(s)}</li>)}</ol></>}

      {a.s4_findings?.length > 0 && <>
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
        <p className="cs-hint">These are candidates. Confirm with the ATC S/4HANA readiness checks before acting on them.</p>
      </>}

      {!a.standard_coverage && a.standard_alternative && <><h3>Standard alternative</h3><p>{inline(a.standard_alternative)}</p></>}

      {a.objects?.length > 0 && <>
        <h3>SAP objects used</h3>
        <div className="cs-table"><table><tbody>
          {a.objects.map((o, i) => <tr key={i}><td><code>{o.name}</code></td><td className="cs-dim">{o.type}</td><td>{o.role}</td></tr>)}
        </tbody></table></div>
      </>}

      {a.risks?.length > 0 && <><h3>Points to watch</h3><ul>{a.risks.map((r, i) => <li key={i}>{inline(r)}</li>)}</ul></>}
    </section>
  )
}

function Tests({ tests }) {
  return (
    <div className="cs-tests">
      {tests.map(t => (
        <details key={t.id}>
          <summary><span className="cs-tid">{t.id}</span>{t.title}<span className={'cs-ttype cs-t-' + t.type}>{t.type}</span></summary>
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

function SaveDialog({ draft, setDraft, keepCode, setKeepCode, onSave, onCancel, saving, error }) {
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const ref = useRef(null)
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  const actions = (
    <div className="cs-row cs-save-actions">
      <button className="cs-btn cs-primary" disabled={saving || !draft.title?.trim()} onClick={onSave}>{saving ? 'Saving…' : 'Save to library'}</button>
      <button className="cs-btn" onClick={onCancel}>Cancel</button>
    </div>
  )
  return (
    <section className="cs-card cs-save" ref={ref}>
      <div className="cs-card-head">
        <div>
          <h3>Save to library</h3>
          <p className="cs-hint">Wani wrote a reusable summary without client names. Edit anything, then save.</p>
        </div>
        {actions}
      </div>
      {error && <div className="cs-error" role="alert">Not saved: {error}</div>}
      <label>Title<input value={draft.title || ''} onChange={e => set('title', e.target.value)} /></label>
      {SUMMARY_FIELDS.map(([k, label]) => (
        <label key={k}>{label}<textarea rows={k === 'approach' ? 3 : 2} value={draft[k] || ''} onChange={e => set(k, e.target.value)} /></label>
      ))}
      <label>SAP objects<input value={(draft.objects || []).join(', ')} onChange={e => set('objects', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></label>
      <label>Tags<input value={(draft.tags || []).join(', ')} onChange={e => set('tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></label>
      <label className="cs-check"><input type="checkbox" checked={keepCode} onChange={e => setKeepCode(e.target.checked)} />
        <span>Also keep the full code<small>Only if you are allowed to keep it. Client code is usually the client's property.</small></span></label>
      {error && <div className="cs-error" role="alert">Not saved: {error}</div>}
      {actions}
    </section>
  )
}

function Analyse({ session, onSaved, onOpenLibrary, initial }) {
  const [code, setCode] = useState(initial?.code || '')
  const [fileName, setFileName] = useState(initial?.code ? pastedFileName(initial.code) : '')
  const tooLong = text => {
    const n = text.split('\n').length
    if (n > 10000) { setError(`This program has ${n.toLocaleString()} lines. Wani accepts up to 10,000 lines — paste the relevant part (e.g. the includes or methods in question).`); return true }
    return false
  }
  const asFile = text => { if (tooLong(text)) return; setError(''); setCode(text); setFileName(pastedFileName(text)) }
  const onPaste = e => {
    const text = e.clipboardData?.getData('text') || ''
    if (text.split('\n').length >= 8 || text.length >= 400) { e.preventDefault(); asFile(text) }
  }
  const onUpload = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 900_000) { setError('That file is too large (max ~900 KB).'); return }
    const text = await f.text(); if (tooLong(text)) return; setError(''); setCode(text); setFileName(f.name.replace(/\.[^.]+$/, '') + '.txt')
  }
  const clearFile = () => { setCode(''); setFileName('') }
  const [note, setNote] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [thread, setThread] = useState([])
  const [question, setQuestion] = useState('')
  const [doc, setDoc] = useState('')
  const [tests, setTests] = useState(null)
  const [draft, setDraft] = useState(null)
  const [keepCode, setKeepCode] = useState(false)
  const [savedId, setSavedId] = useState(null)

  const run = async (label, fn) => {
    setBusy(label); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const analyse = () => run('Reading the code and checking it against S/4HANA…', async () => {
    setThread([]); setDoc(''); setTests(null); setDraft(null); setSavedId(null)
    const r = await callCode(session, { action: 'analyse', code, note })
    setAnalysis(r.analysis)
  })
  const ask = () => {
    const q = question.trim(); if (!q) return
    const history = thread
    setThread(t => [...t, { role: 'user', text: q }]); setQuestion('')
    run('Thinking…', async () => {
      const r = await callCode(session, { action: 'ask', code, analysis, question: q, history })
      setThread(t => [...t, { role: 'wani', text: r.answer }])
    })
  }
  const writeDoc = () => run('Writing the documentation…', async () => {
    const r = await callCode(session, { action: 'document', code, analysis }); setDoc(r.documentation)
  })
  const makeTests = () => run('Writing test cases…', async () => {
    const r = await callCode(session, { action: 'tests', code, analysis }); setTests(r.test_cases)
  })
  const prepareSave = () => run('Preparing a reusable summary…', async () => {
    const r = await callCode(session, { action: 'library', code, analysis, history: thread })
    setDraft(r.summary); setKeepCode(false)
  })
  const save = () => run('Saving…', async () => {
    const { title, ...summary } = draft
    const row = {
      title: title.trim(), language: analysis?.language || 'ABAP',
      summary: { ...summary, verdict: analysis?.verdict, analysis },
      documentation: doc || null, test_cases: tests || null, code: keepCode ? code : null,
    }
    const { data, error: e } = await supabase.from('code_library').insert(row).select('id').single()
    if (e) {
      console.error('[code library] save failed', e)
      throw Error(/does not exist|schema cache/i.test(e.message) ? 'the library table is not available yet — run the setup SQL in Supabase, then reload this page.' : e.message)
    }
    setSavedId(data.id); setDraft(null); onSaved?.()
  })

  return (
    <div className="cs-analyse">
      {!analysis && (
        <section className="cs-card">
          <h2 className="cs-title">Paste a program</h2>
          <p className="cs-lead">Wani explains what it does, checks it against S/4HANA and tells you whether standard now covers it.</p>
          {fileName ? (
            <div className="cs-file"><PastedFile content={code} name={fileName} onRemove={clearFile} /></div>
          ) : (
            <textarea className="cs-code" spellCheck={false} wrap="off" value={code} onChange={e => setCode(e.target.value)} onPaste={onPaste}
              placeholder={'Paste the program here — long code becomes a .txt file you can open any time.\n\nREPORT zpm_order_check.'} />
          )}
          <label className="cs-upload">or upload a file<input type="file" accept=".txt,.abap,.sql,.js,.ts,.cds,.xml,.json,text/*" onChange={onUpload} /></label>
          <input className="cs-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional: what you already know about it (where it runs, what it should do)" />
          <div className="cs-row">
            <button className="cs-btn cs-primary" disabled={!!busy || code.trim().length < 20} onClick={analyse}>Analyse</button>
            <span className="cs-dim">{!fileName && code.length ? `${code.split('\n').length} lines` : ''}</span>
          </div>
        </section>
      )}

      {analysis && <>
        <div className="cs-row cs-toolbar">
          <button className="cs-btn" onClick={() => { setAnalysis(null); setSavedId(null); clearFile() }}>← New program</button>
          <PastedFile content={code} name={fileName || pastedFileName(code)} compact />
          <span className="cs-spacer" />
          <button className="cs-btn" disabled={!!busy} onClick={writeDoc}>Write documentation</button>
          <button className="cs-btn" disabled={!!busy} onClick={makeTests}>Create test cases</button>
          {savedId
            ? <button className="cs-btn cs-primary" onClick={onOpenLibrary}>Saved ✓ — open Library</button>
            : <button className="cs-btn cs-primary" disabled={!!busy} onClick={prepareSave}>Save to library</button>}
        </div>
        {draft && <SaveDialog draft={draft} setDraft={setDraft} keepCode={keepCode} setKeepCode={setKeepCode} onSave={save} onCancel={() => { setDraft(null); setError('') }} saving={busy === 'Saving…'} error={error} />}
        <Analysis a={analysis} />

        {doc && (
          <section className="cs-card">
            <div className="cs-card-head"><h2>Documentation</h2>
              <div className="cs-row"><button className="cs-btn" onClick={() => navigator.clipboard?.writeText(doc)}>Copy</button>
                <button className="cs-btn" onClick={() => download((analysis.title || 'program').replace(/[^\w-]+/g, '_') + '.md', doc, 'text/markdown')}>Download</button></div></div>
            <Markdown text={doc} />
          </section>
        )}
        {tests && (
          <section className="cs-card">
            <div className="cs-card-head"><h2>Test cases <span className="cs-dim">({tests.length})</span></h2>
              <button className="cs-btn" onClick={() => download((analysis.title || 'program').replace(/[^\w-]+/g, '_') + '_tests.csv', '﻿' + testsCsv(tests), 'text/csv')}>Download for Excel</button></div>
            <Tests tests={tests} />
          </section>
        )}

        <section className="cs-card">
          <h2>Ask about this code</h2>
          {thread.map((m, i) => <div key={i} className={'cs-msg cs-' + m.role}>{m.role === 'user' ? m.text : <Markdown text={m.text} />}</div>)}
          <div className="cs-ask">
            <textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
              placeholder="e.g. Which BAdI could replace the user exit? Is this BAPI still released in S/4?" />
            <button className="cs-btn cs-primary" disabled={!!busy || !question.trim()} onClick={ask}>Ask</button>
          </div>
        </section>
      </>}

      {busy && <div className="cs-busy" role="status"><span className="cs-spin" />{busy}</div>}
      {error && !draft && <div className="cs-error cs-toast" role="alert">{error}<button aria-label="Dismiss" onClick={() => setError('')}>✕</button></div>}
    </div>
  )
}

function Library({ entries, loading, error, onDelete, onOpenCode }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return entries
    return entries.filter(e => (e.title + ' ' + JSON.stringify(e.summary || {})).toLowerCase().includes(t))
  }, [entries, q])
  if (loading) return <p className="cs-dim">Loading library…</p>
  if (error) return <div className="cs-error">{error}</div>
  if (!entries.length) return (
    <section className="cs-card cs-empty">
      <h2>Your library is empty</h2>
      <p className="cs-lead">Analyse a program and click "Save to library". When you later describe a similar problem in chat, Wani points you to standard first, then to your saved solution.</p>
    </section>
  )
  return (
    <div>
      <input className="cs-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your library" />
      <ul className="cs-lib">
        {list.map(e => {
          const s = e.summary || {}
          const isOpen = open === e.id
          return (
            <li key={e.id} className={isOpen ? 'cs-open' : ''}>
              <button className="cs-lib-head" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                <strong>{e.title}</strong>
                <span className="cs-tags">{(s.tags || []).slice(0, 4).map(t => <span key={t}>{t}</span>)}{e.code && <span className="cs-tag-code">code</span>}</span>
                <span className="cs-dim">{s.problem}</span>
              </button>
              {isOpen && (
                <div className="cs-lib-body">
                  {SUMMARY_FIELDS.map(([k, label]) => s[k] ? <p key={k}><strong>{label}:</strong> {inline(s[k])}</p> : null)}
                  {s.objects?.length > 0 && <p><strong>SAP objects:</strong> {s.objects.map(o => <code key={o}>{o}</code>)}</p>}
                  {s.analysis && <details><summary>Full analysis</summary><Analysis a={s.analysis} /></details>}
                  {e.documentation && <details><summary>Documentation</summary><Markdown text={e.documentation} /></details>}
                  {Array.isArray(e.test_cases) && e.test_cases.length > 0 && <details><summary>Test cases ({e.test_cases.length})</summary><Tests tests={e.test_cases} /></details>}
                  {e.code && <div className="cs-file"><PastedFile content={e.code} name={pastedFileName(e.code, e.title.replace(/[^\w-]+/g, '_'))} /></div>}
                  <div className="cs-row">
                    {e.code && <button className="cs-btn" onClick={() => onOpenCode(e)}>Analyse again</button>}
                    <button className="cs-btn cs-danger" onClick={() => { if (window.confirm(`Delete "${e.title}" from your library?`)) onDelete(e.id) }}>Delete</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function CodeStudio({ session }) {
  const [tab, setTab] = useState('analyse')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [libError, setLibError] = useState('')
  const [reopen, setReopen] = useState(null)

  const load = async () => {
    setLoading(true); setLibError('')
    const { data, error } = await supabase.from('code_library').select('*').order('created_at', { ascending: false })
    if (error) setLibError(/does not exist|schema cache/i.test(error.message) ? 'The library table is not set up yet.' : error.message)
    setEntries(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const remove = async id => {
    const { error } = await supabase.from('code_library').delete().eq('id', id)
    if (error) setLibError(error.message); else setEntries(es => es.filter(e => e.id !== id))
  }

  return (
    <div className="cs">
      <header className="cs-top">
        <a href="/" className="cs-brand" aria-label="Back to Wani chat"><WaniLogo size={22} dark /><WaniWordmark height={13} dark /></a>
        <nav className="cs-crumbs"><a href="/">Chat</a><span>/</span><span aria-current="page">Code</span></nav>
      </header>
      <div className="cs-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'analyse'} onClick={() => setTab('analyse')}>Analyse</button>
        <button role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}>Library{entries.length ? ` (${entries.length})` : ''}</button>
      </div>
      <div hidden={tab !== 'analyse'}><Analyse key={reopen?.id || 'new'} initial={reopen} session={session} onSaved={load} onOpenLibrary={() => setTab('library')} /></div>
      {tab === 'library' && <Library entries={entries} loading={loading} error={libError} onDelete={remove}
        onOpenCode={e => { setReopen(e); setTab('analyse') }} />}
    </div>
  )
}
