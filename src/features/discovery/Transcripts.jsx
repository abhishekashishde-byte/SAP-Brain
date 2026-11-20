import { useMemo, useState } from 'react'
import { uploadTranscript, deleteTranscript, updateTranscriptSuggestion } from './transcriptData.js'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'
import { SIZING_METRICS } from './firstCallData.js'

const consentText = 'All participants agreed to recording/transcription'
const MARK = { needed: 'Needed', not_needed: 'Not needed', clarify: 'Clarify' }
const KIND = {
  field_mark: 'Field', answer: 'Answer', decision: 'Decision', process: 'Process', stakeholder: 'Stakeholder',
  driver: 'Pain point / goal', sizing: 'Sizing', request: 'Request', todo: 'Action item', risk: 'Risk', gap: 'Gap',
}
const human = s => String(s ?? '').replaceAll('_', ' ')
const CONTEXT_KINDS = new Set(['stakeholder', 'driver', 'sizing', 'request'])

// Catalog lookups so reviewers see names, not internal IDs.
function useCatalogLookup() {
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

function describeTarget(s, L) {
  const hit = L.item.get(s.target_ref)
  if (hit) return { group: hit.object.title, label: hit.label }
  if (s.kind === 'process') return { group: 'Processes & jobs', label: L.process.get(s.target_ref)?.title || 'Process' }
  if (CONTEXT_KINDS.has(s.kind)) return { group: 'Customer context', label: KIND[s.kind] }
  const related = L.object.get(s.payload?.related_id || s.payload?.object_id)
  return { group: related ? related.title : 'Actions, risks & gaps', label: KIND[s.kind] || human(s.kind) }
}

export function describeValue(kind, p, L) {
  if (!p || typeof p !== 'object') return '—'
  switch (kind) {
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
    default: return Object.entries(p).map(([k, v]) => `${human(k)}: ${v}`).join(' · ')
  }
}

// Form-based editor: choices come from the catalog, so nobody edits raw JSON.
function SuggestionEditor({ s, L, onSave, onCancel }) {
  const [p, setP] = useState({ ...(s.payload || {}) })
  const set = (k, v) => setP(x => ({ ...x, [k]: v }))
  const hit = L.item.get(s.target_ref)
  const field = (k, label, el) => <label className="dw-ts-edit-field" key={k}><span>{label}</span>{el}</label>
  const text = (k, label, area) => field(k, label, area
    ? <textarea rows="2" value={p[k] ?? ''} onChange={e => set(k, e.target.value)} />
    : <input value={p[k] ?? ''} onChange={e => set(k, e.target.value)} />)
  const select = (k, label, options) => field(k, label, <select value={p[k] ?? ''} onChange={e => set(k, e.target.value)}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>)
  let body
  if (s.kind === 'field_mark') body = [select('mark', 'Mark', Object.entries(MARK)), text('note', 'Note')]
  else if (s.kind === 'answer') {
    const q = hit?.q
    body = q?.type === 'single' || q?.type === 'yesno'
      ? [select('answer', 'Answer', (q.type === 'yesno' ? ['Yes', 'No', 'Unsure'] : q.options).map(o => [o, o]))]
      : [field('answer', 'Answer', <input type={q?.type === 'number' ? 'number' : 'text'} value={Array.isArray(p.answer) ? p.answer.join(', ') : p.answer ?? ''}
          onChange={e => set('answer', q?.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : q?.type === 'multi' ? e.target.value.split(',').map(x => x.trim()).filter(Boolean) : e.target.value)} />)]
  } else if (s.kind === 'decision') body = [select('choice', 'Decision', (hit?.d?.options || [p.choice]).map(o => [o, o])), text('rationale', 'Rationale', true)]
  else if (s.kind === 'process') body = [select('status', 'Status', processCatalog.statuses.map(x => [x, human(x)])), select('frequency', 'Frequency', [['', '—'], ...processCatalog.frequencies.map(x => [x, x])])]
  else if (s.kind === 'driver') body = [select('kind', 'Type', [['pain', 'Pain point'], ['goal', 'Goal']]), text('text', 'Description', true)]
  else if (s.kind === 'sizing') body = [select('metric_id', 'Metric', SIZING_METRICS.map(([id, label]) => [id, label])), field('value', 'Value', <input type="number" value={p.value ?? ''} onChange={e => set('value', e.target.value === '' ? '' : Number(e.target.value))} />)]
  else body = Object.keys(p).filter(k => typeof p[k] === 'string' || typeof p[k] === 'number').map(k => text(k, human(k), String(p[k]).length > 60))
  return <div className="dw-ts-editor">{body}<div className="dw-actions"><button type="button" className="dw-button dw-primary" onClick={() => onSave(p)}>Save changes</button><button type="button" className="dw-button" onClick={onCancel}>Cancel</button></div></div>
}

function AnalysisPanel({ run, L, onClose, onReview }) {
  const r = run.result
  const pct = run.total ? Math.min(100, Math.round((Math.max(run.part, 0) / run.total) * 100)) : 0
  return (
    <section className={`dw-ts-run ${run.error ? 'is-failed' : r ? 'is-done' : 'is-busy'}`} aria-live="polite">
      <header>
        <strong>{run.error ? 'Analysis stopped' : r ? 'Analysis complete' : 'Wani is analysing this transcript…'}</strong>
        {(r || run.error) && <button type="button" className="dw-button dw-button-quiet" onClick={onClose}>Close</button>}
      </header>
      <ol className="dw-ts-run-steps">
        {run.stages.map(st => (
          <li key={st.key} className={`is-${st.state}`}>
            <span className="dw-ts-run-icon" aria-hidden="true">{st.state === 'done' ? '✓' : st.state === 'failed' ? '!' : ''}</span>
            <span>{st.label}
              {st.key === 'analyse' && st.state === 'active' && run.total > 0 && <small> · part {Math.min(run.part + 1, run.total)} of {run.total} · {run.found} finding{run.found === 1 ? '' : 's'} so far</small>}
              {st.key === 'apply' && st.state === 'active' && run.applying && <small> · {run.applying.done} of {run.applying.total}</small>}
            </span>
          </li>
        ))}
      </ol>
      {!r && !run.error && run.total > 0 && <div className="dw-progress-bar dw-ts-run-bar"><span style={{ width: pct + '%' }} /></div>}
      {run.topics?.length > 0 && <div className="dw-ts-topics"><span>Topics recognised</span>{run.topics.map(x => <em key={x}>{x}</em>)}</div>}
      {run.error && <div className="dw-ts-error"><strong>The analysis could not finish.</strong> Your transcript is saved — try again in a moment.<details><summary>Technical details</summary><code>{run.error}</code></details></div>}
      {r && <div className="dw-ts-result">
        <div className="dw-ts-result-col">
          <h4>Updated automatically <span>{r.applied.length}</span></h4>
          {r.applied.length ? <ul>{r.applied.map(x => { const t = describeTarget(x, L); return <li key={x.id}><strong>{t.group === t.label ? t.label : `${t.group} › ${t.label}`}</strong><span>{describeValue(x.kind, x.payload, L)}</span></li> })}</ul>
            : <p className="dw-caption">No high-confidence findings to apply.</p>}
          {r.applied.length > 0 && <p className="dw-caption">Each updated item is noted “Updated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} via transcript”.</p>}
        </div>
        <div className="dw-ts-result-col">
          <h4>Needs your approval <span>{r.waiting.length}</span></h4>
          {r.waiting.length ? <><p className="dw-caption">{r.waiting.filter(x => x.confidence === 'medium').length} medium · {r.waiting.filter(x => x.confidence === 'low').length} low confidence{r.conflicts.length ? ` · ${r.conflicts.length} would change a value you already saved` : ''}</p>
            <button type="button" className="dw-button dw-primary" onClick={onReview}>Review {r.waiting.length} suggestion{r.waiting.length === 1 ? '' : 's'}</button></>
            : <p className="dw-caption">Nothing left to review.</p>}
        </div>
        {r.warnings.length > 0 && <p className="dw-caption dw-ts-result-warn">{r.warnings.join(' ')}</p>}
      </div>}
    </section>
  )
}

function when(t) {
  const d = new Date(t.created_at || t.consent_given_at || Date.now())
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Transcripts({ workshop, session, transcripts, suggestions, onRefresh, onAccept, onExisting, presenter, onOpenObject }) {
  const L = useCatalogLookup()
  const [consent, setConsent] = useState(false)
  const [source, setSource] = useState('paste')
  const [file, setFile] = useState(null)
  const [pastedText, setPastedText] = useState('')
  const [retention, setRetention] = useState('30')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [editId, setEditId] = useState(null)
  const [processing, setProcessing] = useState(null)
  const [analysingId, setAnalysingId] = useState(null)
  const [failures, setFailures] = useState({})
  const [filter, setFilter] = useState('pending')
  const [run, setRun] = useState(null) // live analysis: {id, stages:[], part, total, found, applying, result}
  if (presenter) return <p className="dw-caption">Transcript controls are hidden in presenter mode.</p>

  const hasInput = source === 'paste' ? !!pastedText.trim() : !!file
  async function upload(analyseAfter = false) {
    if (!consent || !hasInput) return
    setBusy(true); setNotice('')
    try {
      const src = source === 'paste' ? new File([pastedText], 'workshop-transcript-' + Date.now() + '.txt', { type: 'text/plain' }) : file
      const saved = await uploadTranscript(workshop, session.user, src, Number(retention) || null, consentText)
      await onRefresh(); setConsent(false); setFile(null); setPastedText('')
      if (analyseAfter) await analyse(saved)
      else setNotice('Transcript saved. Run the analysis whenever you are ready.')
    } catch (e) { setNotice('Could not save the transcript: ' + e.message) } finally { setBusy(false) }
  }
  async function analyse(t) {
    const stages = []
    const push = (key, label, state = 'done') => {
      const i = stages.findIndex(x => x.key === key)
      if (i >= 0) stages[i] = { key, label, state }; else stages.push({ key, label, state })
    }
    const update = patch => setRun(r => ({ ...(r || {}), id: t.id, stages: [...stages], ...patch }))
    setBusy(true); setAnalysingId(t.id); setFailures(f => ({ ...f, [t.id]: null })); setNotice('')
    push('prep', 'Preparing the transcript', 'active'); update({ part: 0, total: 0, found: 0, topics: [], result: null, error: null })
    try {
      const response = await fetch('/api/discovery-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ workshopId: workshop.id, transcriptId: t.id, stream: true, reanalyse: t.status === 'analysed' }),
      })
      let final = null
      if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
        const reader = response.body.getReader(); const dec = new TextDecoder(); let buf = ''
        for (;;) {
          const { value, done } = await reader.read(); if (done) break
          buf += dec.decode(value, { stream: true })
          let cut
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const line = buf.slice(0, cut); buf = buf.slice(cut + 2)
            if (!line.startsWith('data:')) continue
            const e = JSON.parse(line.slice(5))
            if (e.type === 'stage' && e.stage === 'reading') { push('prep', e.message === 'Transcribing audio' ? 'Transcribing the recording' : 'Preparing the transcript', 'active'); update({}) }
            if (e.type === 'stage' && e.stage === 'read') { push('prep', `Transcript ready · ${e.chars.toLocaleString()} characters`); update({}) }
            if (e.type === 'plan') { push('analyse', 'Understanding the conversation', 'active'); update({ total: e.total }) }
            if (e.type === 'segment') setRun(r => ({ ...(r || {}), id: t.id, stages: [...stages], part: e.state === 'done' ? e.index : e.index - 1, total: e.total, found: e.found, topics: [...new Set([...(r?.topics || []), ...(e.topics || [])])] }))
            if (e.type === 'stage' && e.stage === 'saving') { push('analyse', `Conversation understood · ${e.found} finding${e.found === 1 ? '' : 's'}`); push('save', 'Recording the findings', 'active'); update({ found: e.found }) }
            if (e.type === 'done' || e.type === 'error') final = e
          }
        }
      } else {
        const data = await response.json().catch(() => ({}))
        final = response.ok ? { type: 'done', ...data } : { type: 'error', error: data.error || 'The analysis service returned an error (' + response.status + ')' }
      }
      if (!final) throw Error('The connection closed before the analysis finished.')
      if (final.type === 'error') throw Error(final.error)
      push('save', 'Findings recorded')
      push('apply', 'Updating your workshop with high-confidence findings', 'active'); update({})

      // High confidence → applied automatically (never overwriting a different saved value). Medium/low → your approval.
      const fresh = await onRefresh()
      const mine = (fresh?.suggestions || []).filter(x => x.transcript_id === t.id && (x.status === 'pending' || x.status === 'edited'))
      const auto = mine.filter(x => x.confidence === 'high' && !conflict(x))
      const applied = []
      for (const [i, x] of auto.entries()) {
        update({ applying: { done: i, total: auto.length } })
        if (await accept(x, { batch: true, quiet: true })) applied.push(x)
      }
      await onRefresh()
      const waiting = mine.filter(x => !applied.includes(x))
      push('apply', `Workshop updated · ${applied.length} change${applied.length === 1 ? '' : 's'} applied`)
      push('done', waiting.length ? `${waiting.length} need${waiting.length === 1 ? 's' : ''} your approval` : 'Done — nothing left to review')
      update({ applying: null, result: { applied, waiting, conflicts: mine.filter(x => x.confidence === 'high' && conflict(x)), warnings: final.warnings || [] } })
      setFilter('pending')
    } catch (e) {
      const i = stages.findIndex(x => x.state === 'active'); if (i >= 0) stages[i] = { ...stages[i], state: 'failed' }
      update({ error: e.message })
      setFailures(f => ({ ...f, [t.id]: e.message })); await onRefresh()
    } finally { setBusy(false); setAnalysingId(null) }
  }
  async function remove(t) {
    if (!window.confirm('Delete this transcript, its file and all its suggestions permanently?')) return
    setBusy(true)
    try { await deleteTranscript(t); await onRefresh(); setNotice('Transcript and its suggestions deleted.') } catch (e) { setNotice('Deletion failed: ' + e.message) } finally { setBusy(false) }
  }
  async function review(s, status, payload) {
    setProcessing(s.id)
    try { const updated = await updateTranscriptSuggestion(s.id, { status, ...(payload ? { payload } : {}) }); await onRefresh(); return updated }
    catch (e) { setNotice('Could not update the suggestion: ' + e.message); throw e } finally { setProcessing(null) }
  }
  function conflict(s) {
    const e = onExisting(s), p = s.payload || {}
    if (e === undefined || e === null || e === '') return false
    if (s.kind === 'field_mark') return !!e.mark && e.mark !== p.mark
    if (s.kind === 'answer') return JSON.stringify(e.answer) !== JSON.stringify(p.answer)
    if (s.kind === 'decision') return !!e.choice && e.choice !== p.choice
    if (s.kind === 'process') return !!e.status && e.status !== p.status
    return false
  }
  async function accept(s, { batch = false, quiet = false } = {}) {
    if (batch && conflict(s)) return false
    if (!batch && conflict(s) && !window.confirm('This replaces a value already saved in the workshop. Apply it anyway?')) return false
    setProcessing(s.id)
    try { await onAccept(s); await updateTranscriptSuggestion(s.id, { status: 'accepted' }); if (!quiet) await onRefresh(); return true }
    catch (e) { setNotice('Could not apply the suggestion: ' + e.message); return false } finally { setProcessing(null) }
  }
  async function acceptMany(list) {
    let n = 0, skipped = 0
    for (const s of list) { if (await accept(s, { batch: true, quiet: true })) n++; else skipped++ }
    await onRefresh()
    setNotice(`${n} applied.${skipped ? ` ${skipped} skipped because they would overwrite saved values — review those one by one.` : ''}`)
  }

  const accepted = suggestions.filter(s => s.status === 'accepted')
  const rejected = suggestions.filter(s => s.status === 'rejected')
  const pending = suggestions.filter(s => s.status === 'pending' || s.status === 'edited')
  const shown = filter === 'pending' ? pending : filter === 'accepted' ? accepted : rejected
  const groups = shown.reduce((acc, s) => { const g = describeTarget(s, L).group; (acc[g] ??= []).push(s); return acc }, {})
  const step = pending.length ? 3 : transcripts.length ? 2 : 1
  // Coverage: which SAP objects the transcripts touched, and where each stands.
  const coverage = discoveryCatalog.objects.map(o => {
    const mine = suggestions.filter(x => (L.item.get(x.target_ref)?.object.id || x.payload?.related_id || x.payload?.object_id) === o.id)
    return { o, total: mine.length, applied: mine.filter(x => x.status === 'accepted').length, waiting: mine.filter(x => x.status === 'pending' || x.status === 'edited').length }
  }).filter(c => c.total)

  return (
    <div className="dw-card dw-transcripts">
      <div className="dw-kicker">AI capture</div>
      <h2>Transcript analysis</h2>
      <p className="dw-caption dw-ts-intro">Paste or upload the meeting transcript. Wani reads it and fills in fields, answers and decisions. High-confidence findings are applied automatically and marked “Updated … via transcript”; medium and low ones wait for your approval.</p>

      <ol className="dw-ts-steps" aria-label="Progress">
        {['Add transcript', 'Analyse', 'Review suggestions'].map((label, i) => (
          <li key={label} className={step === i + 1 ? 'is-current' : step > i + 1 ? 'is-done' : ''}><span>{step > i + 1 ? '✓' : i + 1}</span>{label}</li>
        ))}
      </ol>

      <details className="dw-ts-block dw-ts-add" open={!transcripts.length} key={transcripts.length ? 'has' : 'none'}>
        <summary><h3 id="ts-add">{transcripts.length ? '1 · Add another transcript' : '1 · Add transcript'}</h3></summary>
        <div className="dw-segmented" role="tablist">
          <button role="tab" aria-selected={source === 'paste'} className={source === 'paste' ? 'is-on' : ''} onClick={() => setSource('paste')}>Paste text</button>
          <button role="tab" aria-selected={source === 'file'} className={source === 'file' ? 'is-on' : ''} onClick={() => setSource('file')}>Upload file</button>
        </div>
        {source === 'paste'
          ? <><textarea className="dw-ts-paste" aria-label="Workshop transcript" rows="9" placeholder="Paste the full conversation — English, German or Hinglish all work. SAP terms and T-codes (IW31, IL01…) are understood." value={pastedText} onChange={e => setPastedText(e.target.value)} />
              <p className="dw-caption">{pastedText.length.toLocaleString()} characters</p></>
          : <label className="dw-ts-drop"><input type="file" accept=".txt,.vtt,.docx,.mp3,.m4a,.wav" onChange={e => setFile(e.target.files?.[0] || null)} />
              <strong>{file ? file.name : 'Choose a file'}</strong><small>{file ? `${(file.size / 1024).toFixed(0)} KB` : 'TXT, VTT, DOCX, or audio (MP3, M4A, WAV) up to 20 MB'}</small></label>}
        <div className="dw-ts-row">
          <label className="dw-mini-checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />All participants agreed to recording / transcription</label>
          <label className="dw-ts-retention">Delete after <select value={retention} onChange={e => setRetention(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="0">Keep until I delete</option></select></label>
        </div>
        <div className="dw-actions">
          <button className="dw-button dw-primary" onClick={() => upload(true)} disabled={!consent || !hasInput || busy}>{busy && analysingId ? 'Analysing…' : 'Save & analyse with AI'}</button>
          <button type="button" className="dw-button" onClick={() => upload(false)} disabled={!consent || !hasInput || busy}>Save only</button>
          {!consent && hasInput && <span className="dw-caption">Confirm participant consent to continue.</span>}
        </div>
      </details>

      {transcripts.length > 0 && (
        <section className="dw-ts-block" aria-labelledby="ts-saved">
          <h3 id="ts-saved">2 · Saved transcripts</h3>
          <ul className="dw-ts-list">
            {transcripts.map(t => {
              const count = suggestions.filter(s => s.transcript_id === t.id).length
              const applied = suggestions.filter(s => s.transcript_id === t.id && s.status === 'accepted').length
              const failed = failures[t.id] || (t.status === 'failed' ? 'The last analysis did not finish.' : null)
              const state = analysingId === t.id ? ['busy', 'Analysing…'] : run?.id === t.id && run.result ? ['ok', 'Analysed'] : failed ? ['bad', 'Failed'] : t.status === 'analysed' ? ['ok', 'Analysed'] : ['idle', 'Not analysed']
              return (
                <li key={t.id}>
                  <div className="dw-ts-item">
                    <div className="dw-ts-item-main">
                      <strong>Transcript · {when(t)}</strong>
                      <small>{(t.audio_path ? 'Audio' : (t.file_path || '').split('.').at(-1)?.toUpperCase() || 'Text')}{t.transcript_text ? ` · ${t.transcript_text.length.toLocaleString()} characters` : ''} · {count} suggestions · {applied} applied · {t.delete_after ? `deletes ${t.delete_after}` : 'kept until deleted'}</small>
                    </div>
                    <span className={`dw-ts-state dw-ts-state-${state[0]}`}>{state[1]}</span>
                    <div className="dw-actions">
                      <button className="dw-button" disabled={busy} onClick={() => analyse(t)}>{t.status === 'analysed' ? 'Re-analyse' : failed ? 'Retry' : 'Analyse'}</button>
                      <button className="dw-button dw-button-quiet" disabled={busy} onClick={() => remove(t)} aria-label="Delete transcript">Delete</button>
                    </div>
                  </div>
                  {run?.id === t.id && <div className="dw-ts-row-run"><AnalysisPanel run={run} L={L} onClose={() => setRun(null)} onReview={() => { setRun(null); document.getElementById('ts-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} /></div>}
                  {failed && run?.id !== t.id && <div className="dw-ts-error" role="alert"><strong>The analysis could not finish.</strong> Your transcript is saved — try again in a moment. <details><summary>Technical details</summary><code>{failed}</code></details></div>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {notice && <p role="status" className="dw-ts-notice">{notice}</p>}

      {coverage.length > 0 && (
        <section className="dw-ts-block" aria-labelledby="ts-cover">
          <h3 id="ts-cover">What the transcripts covered</h3>
          <p className="dw-caption">{coverage.length} of {discoveryCatalog.objects.length} SAP PM objects discussed. Open one to see the findings right at its fields.</p>
          <div className="dw-ts-cover">
            {coverage.map(c => (
              <button type="button" key={c.o.id} className={`dw-ts-cover-row ${c.waiting ? 'is-wait' : 'is-ok'}`} onClick={() => onOpenObject?.(c.o.id)}>
                <span className="dw-ts-cover-name">{c.o.title}</span>
                <span className="dw-ts-cover-bar" aria-hidden="true"><i style={{ width: (c.applied * 100 / c.total) + '%' }} /></span>
                <span className="dw-ts-cover-num">{c.applied} applied</span>
                <span className={`dw-ts-cover-wait ${c.waiting ? '' : 'is-zero'}`}>{c.waiting ? `${c.waiting} to review` : 'done'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="dw-ts-block" aria-labelledby="ts-review">
          <div className="dw-ts-review-head">
            <h3 id="ts-review">3 · Review suggestions</h3>
            <div className="dw-segmented" role="tablist">
              {[['pending', 'To review', pending.length], ['accepted', 'Applied', accepted.length], ['rejected', 'Rejected', rejected.length]].map(([id, label, n]) =>
                <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label} <span>{n}</span></button>)}
            </div>
          </div>
          {filter === 'pending' && pending.some(s => s.confidence === 'high') && (
            <div className="dw-ts-bulk"><span>{pending.filter(s => s.confidence === 'high').length} high-confidence suggestions</span>
              <button className="dw-button" disabled={busy || !!processing} onClick={() => acceptMany(pending.filter(s => s.confidence === 'high'))}>Apply all high-confidence</button></div>
          )}
          {!shown.length && <p className="dw-caption">{filter === 'pending' ? 'All suggestions reviewed.' : 'Nothing here yet.'}</p>}
          {Object.entries(groups).map(([group, items]) => (
            <section className="dw-ts-group" key={group}>
              <header><h4>{group}</h4><span>{items.length}</span>
                {filter === 'pending' && items.length > 1 && <button type="button" className="dw-inline-button" disabled={!!processing} onClick={() => acceptMany(items)}>Apply all in group</button>}</header>
              {items.map(s => {
                const t = describeTarget(s, L)
                const c = filter === 'pending' && conflict(s)
                return (
                  <article className={`dw-ts-card ${c ? 'has-conflict' : ''}`} key={s.id}>
                    <div className="dw-ts-card-top">
                      <span className="dw-ts-kind">{KIND[s.kind] || human(s.kind)}</span>
                      <strong className="dw-ts-target">{t.label}</strong>
                      <span className={`dw-ts-conf dw-ts-conf-${s.confidence}`} title={`${s.confidence} confidence`}><i />{s.confidence}</span>
                    </div>
                    <div className="dw-ts-change">
                      {c && <div className="dw-ts-was"><span>Now</span>{describeValue(s.kind, onExisting(s), L)}</div>}
                      <div className="dw-ts-new">{c ? <span>Proposed</span> : <span className="dw-ts-arrow" aria-hidden="true">→</span>}{describeValue(s.kind, s.payload, L)}</div>
                    </div>
                    <blockquote>“{s.quote || 'No quote captured'}”{s.ts ? <cite> · {s.ts}</cite> : null}</blockquote>
                    {editId === s.id
                      ? <SuggestionEditor s={s} L={L} onCancel={() => setEditId(null)} onSave={async p => { try { await review(s, 'edited', p); setEditId(null) } catch {} }} />
                      : filter === 'pending' && <div className="dw-actions">
                          <button className="dw-button dw-primary" disabled={processing === s.id} onClick={() => accept(s)}>{c ? 'Replace' : 'Apply'}</button>
                          <button className="dw-button" onClick={() => setEditId(s.id)}>Edit</button>
                          <button className="dw-button dw-button-quiet" onClick={() => review(s, 'rejected')}>Reject</button>
                          {s.status === 'edited' && <span className="dw-caption">Edited</span>}
                        </div>}
                  </article>
                )
              })}
            </section>
          ))}
        </section>
      )}
    </div>
  )
}
