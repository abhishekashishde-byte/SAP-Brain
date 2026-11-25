import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { WaniLogo, WaniWordmark } from '../../pages/Login.jsx'
import { downloadFsDocx, downloadTestDocx } from './changesWord.js'
import '../findings/Findings.css'
import './Changes.css'

// Changes / Z-developments: one record per change, numbered from 20000001.
// Requirement → Standard & design → FS → Code check → Tests & test document.
// Wani drafts each step from the earlier ones; the consultant edits and decides.

async function callChanges(session, payload) {
  const r = await fetch('/api/changes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
    body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Error(data.error || 'Request failed')
  return data
}

const fmtDate = d => (d ? new Date(d).toLocaleDateString('de-DE') : '')
const STEPS = [
  { id: 'requirement', label: 'Requirement' },
  { id: 'standard', label: 'Standard & design' },
  { id: 'fs', label: 'Functional spec' },
  { id: 'code', label: 'Code check' },
  { id: 'tests', label: 'Tests & document' },
]
const STEP_LABEL = { ...Object.fromEntries(STEPS.map(s => [s.id, s.label])), done: 'Done' }
const COLS = 'id,number,title,module,ticket_ref,step,requirement,standard,fs,code,code_check,tests,created_at,updated_at'

// Inline text: `code` and **bold** only.
function Inline({ text }) {
  return String(text ?? '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i}>{p.slice(1, -1)}</code>
      : p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : p)
}
function Prose({ text }) {
  return <div className="ch-prose">{String(text || '').split('\n').map((l, i) => {
    if (/^\s*[-•]\s+/.test(l)) return <div key={i} className="ch-li">• <Inline text={l.replace(/^\s*[-•]\s+/, '')} /></div>
    if (/^⚠/.test(l.trim())) return <div key={i} className="ch-open"><Inline text={l} /></div>
    return l.trim() ? <p key={i}><Inline text={l} /></p> : null
  })}</div>
}
const Busy = ({ label }) => <div className="fd-loading" role="status"><span className="fd-spin" /> {label}</div>

// ── Step 1: requirement conversation + summary ───────────────────────────────
const SUMMARY_FIELDS = [
  ['business_need', 'Business need'], ['users', 'Users'], ['trigger_frequency', 'Trigger & frequency'], ['inputs', 'Input / selection'],
  ['outputs', 'Output'], ['rules', 'Business rules'], ['volumes', 'Volumes'], ['exceptions', 'Exceptions'],
  ['authorization', 'Authorization'], ['integration', 'Integration'], ['open_questions', 'Open questions'],
]
function SummaryEditor({ summary, onChange }) {
  return <div className="ch-summary">
    {SUMMARY_FIELDS.map(([k, label]) => {
      const v = Array.isArray(summary[k]) ? summary[k].join('\n') : summary[k] || ''
      return <label key={k}>{label}<textarea rows={Math.min(6, Math.max(1, Math.ceil(v.length / 90) + (v.match(/\n/g) || []).length))} value={v}
        onChange={e => onChange({ ...summary, [k]: Array.isArray(summary[k]) || ['rules', 'exceptions', 'open_questions'].includes(k) ? e.target.value.split('\n').filter(x => x.trim()) : e.target.value })} /></label>
    })}
  </div>
}

function RequirementStep({ ch, session, save, setError }) {
  const conv = ch.requirement?.conversation || []
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [conv.length])
  const send = async () => {
    const text = msg.trim(); if (!text) return
    const next = [...conv, { role: 'user', text }]
    setMsg(''); setBusy('ask'); setError('')
    await save({ requirement: { ...ch.requirement, conversation: next } })
    try {
      const { answer } = await callChanges(session, { action: 'ask', conversation: conv, summary: ch.requirement?.summary, message: text })
      await save({ requirement: { ...ch.requirement, conversation: [...next, { role: 'wani', text: answer }] } })
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const summarise = async () => {
    setBusy('summary'); setError('')
    try {
      const { summary } = await callChanges(session, { action: 'summary', conversation: conv })
      await save({ requirement: { ...ch.requirement, summary }, ...(ch.title === 'New change' && summary.title ? { title: summary.title } : {}), ...(!ch.module && summary.module ? { module: summary.module } : {}) })
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  return <div className="ch-step">
    <p className="fd-lead">Describe what is needed. Wani asks what's missing for an FS, then summarises the requirement.</p>
    <div className="ch-chat">
      {!conv.length && <p className="fd-dim">e.g. “Planners need a list of maintenance orders whose components are not yet available, per work centre, with the expected delivery date.”</p>}
      {conv.map((m, i) => <div key={i} className={'ch-msg ch-' + (m.role === 'user' ? 'me' : 'wani')}><span>{m.role === 'user' ? 'You' : 'Wani'}</span><Prose text={m.text} /></div>)}
      {busy === 'ask' && <Busy label="Wani is thinking…" />}
      <div ref={endRef} />
    </div>
    <div className="ch-compose">
      <textarea rows={3} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Describe the requirement or answer Wani's questions…"
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} />
      <div className="fd-row"><button className="fd-btn fd-primary" onClick={send} disabled={!!busy || !msg.trim()}>Send</button>
        <span className="fd-dim">Ctrl+Enter</span><span className="fd-spacer" />
        <button className="fd-btn" onClick={summarise} disabled={!!busy || !conv.length}>{busy === 'summary' ? 'Summarising…' : ch.requirement?.summary ? 'Summarise again' : 'Summarise requirement'}</button></div>
    </div>
    {ch.requirement?.summary && <div className="fd-card fd-pad">
      <h3 className="ch-h">Requirement summary <small>— edit anything that's wrong; the next steps use this</small></h3>
      <SummaryEditor summary={ch.requirement.summary} onChange={s => save({ requirement: { ...ch.requirement, summary: s } }, { debounce: true })} />
      <div className="fd-row"><button className="fd-btn fd-primary" onClick={() => save({ step: 'standard' })}>Next: standard check →</button></div>
    </div>}
  </div>
}

// ── Step 2: standard check & design ──────────────────────────────────────────
function StandardStep({ ch, session, save, setError }) {
  const [busy, setBusy] = useState(false)
  const st = ch.standard || {}
  const run = async () => {
    setBusy(true); setError('')
    try {
      const { standard } = await callChanges(session, { action: 'standard', summary: ch.requirement?.summary, conversation: ch.requirement?.conversation })
      await save({ standard: { ...standard, decision: st.decision || '', decision_note: st.decision_note || '' } })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const cov = st.coverage, d = st.design
  return <div className="ch-step">
    <p className="fd-lead">Standard first: Wani checks apps, reports, CDS views and settings before anything is built.</p>
    <div className="fd-row"><button className="fd-btn fd-primary" onClick={run} disabled={busy || (!ch.requirement?.summary && !ch.requirement?.conversation?.length)}>{busy ? 'Checking…' : cov ? 'Check again' : 'Run standard check'}</button>
      {!ch.requirement?.summary && <span className="fd-dim">Tip: summarise the requirement first for a sharper check.</span>}</div>
    {busy && <Busy label="Checking SAP standard (with SAP Help / Fiori apps library)…" />}
    {cov && <div className="fd-card fd-pad">
      <div className="ch-head-row"><h3 className="ch-h">Standard coverage</h3><span className={'ch-level ch-level-' + cov.level}>{cov.level === 'full' ? 'Standard covers it' : cov.level === 'partial' ? 'Partly covered' : 'Not covered'}</span></div>
      <p><Inline text={cov.summary} /></p>
      {(cov.options || []).map((o, i) => <div key={i} className="ch-option"><strong><Inline text={o.name} /></strong> <span className="fd-dim">{o.kind}{o.release ? ' · ' + o.release : ''}</span>
        <div><span className="ch-tag ch-ok">Covers</span> <Inline text={o.covers} /></div>{o.limits && <div><span className="ch-tag ch-no">Limits</span> <Inline text={o.limits} /></div>}</div>)}
      {cov.recommendation && <p className="ch-reco"><Inline text={cov.recommendation} /></p>}
    </div>}
    {d && <div className="fd-card fd-pad">
      <div className="ch-head-row"><h3 className="ch-h">Proposed design</h3><span className="ch-level">{d.solution_type}{d.effort ? ` · effort ${d.effort}` : ''}</span></div>
      {d.why_custom && <p><strong>Why custom: </strong><Inline text={d.why_custom} /></p>}
      <Prose text={d.approach} />
      {d.objects?.length > 0 && <table className="ch-table"><thead><tr><th>Object</th><th>Type</th><th>Role</th></tr></thead><tbody>{d.objects.map((o, i) => <tr key={i}><td><code>{o.name}</code></td><td>{o.type}</td><td>{o.role}</td></tr>)}</tbody></table>}
      {d.risks?.length > 0 && <><h4 className="ch-sub">Risks & dependencies</h4>{d.risks.map((r, i) => <div key={i} className="ch-li">• <Inline text={r} /></div>)}</>}
    </div>}
    {cov && <div className="fd-card fd-pad">
      <h3 className="ch-h">Decision</h3>
      <div className="ch-radios">
        {[['standard', 'Use standard (no development)'], ['custom', 'Custom development']].map(([k, l]) =>
          <label key={k} className={st.decision === k ? 'is-on' : ''}><input type="radio" name="decision" checked={st.decision === k} onChange={() => save({ standard: { ...st, decision: k } })} />{l}</label>)}
      </div>
      <label className="fd-label">Reason / note<textarea rows={2} value={st.decision_note || ''} onChange={e => save({ standard: { ...st, decision_note: e.target.value } }, { debounce: true })} placeholder="e.g. Customer needs the delivery date per component, which the standard app does not show." /></label>
      <div className="fd-row">{st.decision === 'custom' && <button className="fd-btn fd-primary" onClick={() => save({ step: 'fs' })}>Next: functional spec →</button>}
        {st.decision === 'standard' && <button className="fd-btn" onClick={() => save({ step: 'done' })}>Close change (standard used)</button>}</div>
    </div>}
  </div>
}

// ── Step 3: functional specification ─────────────────────────────────────────
function FsStep({ ch, session, save, setError }) {
  const [busy, setBusy] = useState(false)
  const fs = ch.fs || {}
  const sections = fs.sections || []
  const gen = async () => {
    if (sections.length && !window.confirm('Write the FS again? Your edits to the current FS will be replaced.')) return
    setBusy(true); setError('')
    try {
      const { fs: out } = await callChanges(session, { action: 'fs', summary: ch.requirement?.summary, conversation: ch.requirement?.conversation, standard: ch.standard })
      await save({ fs: { ...out, version: fs.version || '0.1' } })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const setSection = (i, patch) => save({ fs: { ...fs, sections: sections.map((s, j) => j === i ? { ...s, ...patch } : s) } }, { debounce: true })
  const openCount = sections.reduce((n, s) => n + (String(s.body).match(/⚠ ?Open/g) || []).length, 0)
  return <div className="ch-step">
    <p className="fd-lead">Wani writes the FS from the requirement, the standard check and the design. Edit any section; lines starting with ⚠ Open are gaps to close with the customer.</p>
    <div className="fd-row">
      <button className="fd-btn fd-primary" onClick={gen} disabled={busy || !ch.requirement?.summary}>{busy ? 'Writing…' : sections.length ? 'Write again' : 'Write FS'}</button>
      {sections.length > 0 && <>
        <label className="ch-inline">Version<input value={fs.version || '0.1'} onChange={e => save({ fs: { ...fs, version: e.target.value } }, { debounce: true })} /></label>
        <button className="fd-btn" onClick={() => downloadFsDocx(ch).catch(e => setError('Word file could not be created: ' + e.message))}>Download Word</button>
        {openCount > 0 && <span className="ch-open-count">⚠ {openCount} open point{openCount === 1 ? '' : 's'}</span>}
      </>}
      {!ch.requirement?.summary && <span className="fd-dim">Summarise the requirement first.</span>}
    </div>
    {busy && <Busy label="Writing the functional specification…" />}
    {sections.map((s, i) => <div key={i} className="fd-card fd-pad ch-fs-sec">
      <div className="ch-head-row"><input className="ch-sec-title" value={s.title} onChange={e => setSection(i, { title: e.target.value })} aria-label="Section title" />
        <button className="fd-btn fd-danger ch-small" onClick={() => window.confirm(`Remove section "${s.title}"?`) && save({ fs: { ...fs, sections: sections.filter((_, j) => j !== i) } })}>Remove</button></div>
      <textarea rows={Math.min(18, Math.max(4, String(s.body).split('\n').length + 1))} value={s.body} onChange={e => setSection(i, { body: e.target.value })} />
    </div>)}
    {sections.length > 0 && <div className="fd-row">
      <button className="fd-btn" onClick={() => save({ fs: { ...fs, sections: [...sections, { title: 'New section', body: '' }] } })}>+ Add section</button>
      <span className="fd-spacer" /><button className="fd-btn fd-primary" onClick={() => save({ step: 'code' })}>Next: code check →</button></div>}
  </div>
}

// ── Step 4: code check against the FS ────────────────────────────────────────
const STATUS_CLS = { covered: 'ch-ok', partial: 'ch-warn', missing: 'ch-no' }
function CodeStep({ ch, session, save, setError }) {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(ch.code || '')
  const cc = ch.code_check || {}
  const lines = code ? code.split('\n').length : 0
  const run = async () => {
    setBusy(true); setError('')
    try {
      await save({ code })
      const { codeCheck } = await callChanges(session, { action: 'code_check', code, summary: ch.requirement?.summary, fs: ch.fs })
      await save({ code_check: codeCheck })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const upload = async e => { const f = e.target.files?.[0]; if (f) setCode(await f.text()); e.target.value = '' }
  return <div className="ch-step">
    <p className="fd-lead">Paste or upload the program. Wani checks it requirement by requirement against the FS, and against S/4HANA.</p>
    <textarea className="ch-code" rows={14} value={code} onChange={e => setCode(e.target.value)} placeholder="REPORT zpm_…" spellCheck={false} />
    <div className="fd-row">
      <button className="fd-btn fd-primary" onClick={run} disabled={busy || code.trim().length < 20 || !ch.fs?.sections?.length || lines > 10000}>{busy ? 'Checking…' : cc.verdict ? 'Check again' : 'Check code against FS'}</button>
      <label className="fd-btn ch-upload">Upload file<input type="file" accept=".abap,.txt,.cds,.js,.sql,.xml,text/plain" onChange={upload} hidden /></label>
      <span className="fd-dim">{lines ? `${lines} lines` : ''}{lines > 10000 ? ' — limit is 10,000 lines' : ''}</span>
      {!ch.fs?.sections?.length && <span className="fd-dim">Write the FS first — the check compares the code with it.</span>}
    </div>
    {busy && <Busy label="Reading the program and checking it against the FS…" />}
    {cc.verdict && <div className="fd-card fd-pad">
      <div className="ch-head-row"><h3 className="ch-h">Result</h3><span className={'ch-level ' + (cc.verdict === 'ready' ? 'ch-level-full' : cc.verdict === 'needs changes' ? 'ch-level-partial' : 'ch-level-none')}>{cc.verdict}</span></div>
      <p><Inline text={cc.summary} /></p>
      {cc.coverage?.length > 0 && <table className="ch-table"><thead><tr><th>FS requirement</th><th>Status</th><th>Where / note</th></tr></thead><tbody>
        {cc.coverage.map((r, i) => <tr key={i}><td><Inline text={r.requirement} /></td><td><span className={'ch-tag ' + (STATUS_CLS[r.status] || '')}>{r.status}</span></td><td>{r.where && <code>{r.where}</code>} <Inline text={r.note} /></td></tr>)}</tbody></table>}
      {cc.s4_findings?.length > 0 && <><h4 className="ch-sub">S/4HANA</h4>{cc.s4_findings.map((f, i) => <div key={i} className="ch-li"><span className={'ch-sev ch-sev-' + f.severity}>{f.severity}</span> <code>{f.object}</code> <Inline text={f.finding} /></div>)}</>}
      {cc.issues?.length > 0 && <><h4 className="ch-sub">Code issues</h4>{cc.issues.map((f, i) => <div key={i} className="ch-li"><span className={'ch-sev ch-sev-' + f.severity}>{f.severity}</span> {f.where && <code>{f.where}</code>} <Inline text={f.issue} />{f.fix && <> — <em><Inline text={f.fix} /></em></>}</div>)}</>}
      <div className="fd-row"><span className="fd-spacer" /><button className="fd-btn fd-primary" onClick={() => save({ step: 'tests' })}>Next: tests →</button></div>
    </div>}
  </div>
}

// ── Step 5: tests, regression scope, results, test document ──────────────────
const RESULTS = ['not run', 'pass', 'fail', 'blocked']
function TestsStep({ ch, session, save, setError }) {
  const [busy, setBusy] = useState(false)
  const t = ch.tests || {}
  const cases = t.cases || []
  const gen = async () => {
    if (cases.some(c => c.result && c.result !== 'not run') && !window.confirm('Write the test plan again? Recorded results will be lost.')) return
    setBusy(true); setError('')
    try {
      const { tests } = await callChanges(session, { action: 'tests', summary: ch.requirement?.summary, standard: ch.standard, fs: ch.fs, codeCheck: ch.code_check?.verdict ? ch.code_check : null, code: ch.code || '' })
      await save({ tests: { ...tests, cases: tests.cases.map(c => ({ ...c, result: 'not run', remarks: '' })) } })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const setCase = (i, patch, debounce) => save({ tests: { ...t, cases: cases.map((c, j) => j === i ? { ...c, ...patch } : c) } }, { debounce })
  const counts = RESULTS.map(r => [r, cases.filter(c => (c.result || 'not run') === r).length])
  return <div className="ch-step">
    <p className="fd-lead">Wani writes unit, negative, authorization and integration tests from the FS, plus the regression scope. Record results as you test, then download the test document.</p>
    <div className="fd-row">
      <button className="fd-btn fd-primary" onClick={gen} disabled={busy || (!ch.fs?.sections?.length && !ch.requirement?.summary)}>{busy ? 'Writing…' : cases.length ? 'Write again' : 'Write test plan'}</button>
      {cases.length > 0 && <>
        <button className="fd-btn" onClick={() => downloadTestDocx(ch).catch(e => setError('Word file could not be created: ' + e.message))}>Download test document</button>
        <span className="fd-dim">{counts.filter(([, n]) => n).map(([r, n]) => `${n} ${r}`).join(' · ')}</span>
      </>}
    </div>
    {busy && <Busy label="Writing the test plan and regression scope…" />}
    {t.regression_scope?.length > 0 && <div className="fd-card fd-pad">
      <h3 className="ch-h">Regression scope</h3>
      <table className="ch-table"><thead><tr><th>Area</th><th>Why it could be affected</th><th>What to retest</th></tr></thead><tbody>
        {t.regression_scope.map((r, i) => <tr key={i}><td><Inline text={r.area} /></td><td><Inline text={r.why} /></td><td><Inline text={r.retest} /></td></tr>)}</tbody></table>
    </div>}
    {cases.map((c, i) => <div key={i} className={'fd-card fd-pad ch-case ch-res-' + (c.result || 'not run').replace(' ', '-')}>
      <div className="ch-head-row"><div><span className="fd-num">{c.id}</span> <span className="ch-type">{c.type}</span> <strong><Inline text={c.title} /></strong></div>
        <select value={c.result || 'not run'} onChange={e => setCase(i, { result: e.target.value })} aria-label={'Result ' + c.id}>{RESULTS.map(r => <option key={r}>{r}</option>)}</select></div>
      {c.preconditions && <div className="fd-dim">Preconditions: <Inline text={c.preconditions} /></div>}
      <ol className="ch-steps">{(c.steps || []).map((s, j) => <li key={j}><Inline text={s} /></li>)}</ol>
      <div><strong>Expected: </strong><Inline text={c.expected} /></div>
      {c.data && <div className="fd-dim">Test data: <Inline text={c.data} /></div>}
      <input className="ch-remarks" value={c.remarks || ''} onChange={e => setCase(i, { remarks: e.target.value }, true)} placeholder="Remarks / evidence (document no., screenshot ref, defect…)" />
    </div>)}
    {cases.length > 0 && <div className="fd-row"><span className="fd-spacer" />
      <button className="fd-btn" onClick={() => save({ step: 'done' })} disabled={ch.step === 'done'}>{ch.step === 'done' ? 'Change closed' : 'Close change'}</button></div>}
  </div>
}

// ── One change ───────────────────────────────────────────────────────────────
function ChangeView({ initial, session, onBack, onUpdated }) {
  const [ch, setCh] = useState(initial)
  const [tab, setTab] = useState(initial.step === 'done' ? 'tests' : initial.step)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)
  const pending = useRef({})
  const chRef = useRef(ch)
  chRef.current = ch

  const flush = async () => {
    const patch = pending.current; pending.current = {}
    if (!Object.keys(patch).length) return
    setSaving(true)
    const { data, error } = await supabase.from('wani_changes').update(patch).eq('id', chRef.current.id).select(COLS).single()
    setSaving(false)
    if (error) setError('Could not save: ' + error.message)
    else onUpdated?.(data)
  }
  // Every edit updates the screen at once; typing is saved after a short pause.
  const save = async (patch, { debounce = false } = {}) => {
    setCh(c => ({ ...c, ...patch }))
    pending.current = { ...pending.current, ...patch }
    if (patch.step && patch.step !== 'done') setTab(patch.step)
    clearTimeout(timer.current)
    if (debounce) { timer.current = setTimeout(flush, 700); return }
    await flush()
  }
  useEffect(() => () => { clearTimeout(timer.current); flush() }, [])

  const props = { ch, session, save, setError }
  const reached = s => STEPS.findIndex(x => x.id === s.id) <= Math.max(0, STEPS.findIndex(x => x.id === (ch.step === 'done' ? 'tests' : ch.step)))
  return <>
    <div className="ch-top">
      <button className="fd-btn" onClick={onBack}>← All changes</button>
      <span className="fd-num">{ch.number}</span>
      <input className="ch-title" value={ch.title} onChange={e => save({ title: e.target.value || 'Untitled' }, { debounce: true })} aria-label="Change title" />
      <input className="ch-meta" value={ch.module || ''} onChange={e => save({ module: e.target.value }, { debounce: true })} placeholder="Module" aria-label="Module" />
      <input className="ch-meta" value={ch.ticket_ref || ''} onChange={e => save({ ticket_ref: e.target.value }, { debounce: true })} placeholder="Ticket / CR no." aria-label="Customer ticket" />
      <span className="fd-dim ch-saved" aria-live="polite">{saving ? 'Saving…' : 'Saved'}</span>
    </div>
    <nav className="ch-steps-nav" aria-label="Steps">
      {STEPS.map((s, i) => <button key={s.id} aria-current={tab === s.id ? 'step' : undefined} className={(tab === s.id ? 'is-on ' : '') + (reached(s) ? 'is-reached' : '')} onClick={() => setTab(s.id)}>
        <span>{i + 1}</span>{s.label}</button>)}
      {ch.step === 'done' && <span className="ch-done">✓ Closed</span>}
    </nav>
    {error && <p className="fd-error" role="alert">{error}</p>}
    {tab === 'requirement' && <RequirementStep {...props} />}
    {tab === 'standard' && <StandardStep {...props} />}
    {tab === 'fs' && <FsStep {...props} />}
    {tab === 'code' && <CodeStep {...props} />}
    {tab === 'tests' && <TestsStep {...props} />}
  </>
}

export default function ChangesPage({ session }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('wani_changes').select(COLS).order('number', { ascending: false })
    if (error) setError(/does not exist|schema cache/i.test(error.message) ? 'The changes table is not set up yet — run migration 026 in Supabase.' : error.message)
    else {
      setItems(data || []); setError('')
      const n = new URLSearchParams(location.search).get('n')
      const hit = n && (data || []).find(x => String(x.number) === n)
      if (hit) setOpen(hit)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    const { data, error } = await supabase.from('wani_changes').insert({}).select(COLS).single()
    if (error) { setError(/does not exist|schema cache/i.test(error.message) ? 'The changes table is not set up yet — run migration 026 in Supabase.' : error.message); return }
    setItems(xs => [data, ...xs]); setOpen(data)
  }
  const remove = async c => {
    if (!window.confirm(`Delete change ${c.number} — ${c.title}? This cannot be undone.`)) return
    const { error } = await supabase.from('wani_changes').delete().eq('id', c.id)
    if (error) setError(error.message); else setItems(xs => xs.filter(x => x.id !== c.id))
  }
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = words.length ? items.filter(c => words.every(w => [c.number, c.title, c.module, c.ticket_ref].join(' ').toLowerCase().includes(w))) : items

  return (
    <div className="fd fd-page ch">
      <header className="fd-top">
        <a href="/" className="fd-brand" aria-label="Back to Wani chat"><WaniLogo size={22} dark /><WaniWordmark height={13} dark /></a>
        <nav className="fd-crumbs"><a href="/">Chat</a><span>/</span>{open ? <><a href="/changes" onClick={e => { e.preventDefault(); setOpen(null); load() }}>Changes</a><span>/</span><span aria-current="page">{open.number}</span></> : <span aria-current="page">Changes</span>}</nav>
      </header>
      {open ? <ChangeView key={open.id} initial={open} session={session} onBack={() => { setOpen(null); load() }} onUpdated={u => setItems(xs => xs.map(x => x.id === u.id ? u : x))} />
        : <>
          <div className="fd-head">
            <div><h1>Changes</h1><p className="fd-lead">Change requests and Z-developments: requirement → standard check → FS → code check → tests and test document.</p></div>
            <button className="fd-btn fd-primary" onClick={create}>+ New change</button>
          </div>
          {error && <p className="fd-error" role="alert">{error}</p>}
          {items.length > 3 && <input className="fd-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by number, title, module, ticket…" aria-label="Search changes" />}
          {loading ? <p className="fd-dim" role="status">Loading…</p>
            : !items.length ? !error && <div className="fd-empty"><p>No changes yet.</p><p className="fd-dim">Click <strong>+ New change</strong> and describe what the customer needs.</p></div>
            : shown.map(c => <article key={c.id} className="fd-card">
              <div className="fd-card-head ch-row" role="button" tabIndex={0} onClick={() => setOpen(c)} onKeyDown={e => e.key === 'Enter' && setOpen(c)}>
                <span className="fd-num">{c.number}</span>
                <span className="fd-card-title"><strong>{c.title}</strong><small>{fmtDate(c.created_at)}{c.module ? ` · ${c.module}` : ''}{c.ticket_ref ? ` · ${c.ticket_ref}` : ''}</small></span>
                <span className={'fd-status ' + (c.step === 'done' ? 'fd-s-solved' : 'fd-s-open')}>{STEP_LABEL[c.step] || c.step}</span>
                <button className="fd-btn fd-danger ch-small" onClick={e => { e.stopPropagation(); remove(c) }} aria-label={'Delete change ' + c.number}>Delete</button>
              </div>
            </article>)}
        </>}
    </div>
  )
}
