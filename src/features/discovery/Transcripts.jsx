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

function describeValue(kind, p, L) {
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

function when(t) {
  const d = new Date(t.created_at || t.consent_given_at || Date.now())
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Transcripts({ workshop, session, transcripts, suggestions, onRefresh, onAccept, onExisting, presenter }) {
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
    setBusy(true); setAnalysingId(t.id); setFailures(f => ({ ...f, [t.id]: null })); setNotice('')
    try {
      const response = await fetch('/api/discovery-transcript', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ workshopId: workshop.id, transcriptId: t.id }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw Error(data.error || 'The analysis service returned an error (' + response.status + ')')
      await onRefresh()
      setFilter('pending')
      setNotice(`${data.count || 0} suggestions found. Review them below — nothing changes in the workshop until you accept.${(data.warnings || []).length ? ' ' + data.warnings.join(' ') : ''}`)
    } catch (e) { setFailures(f => ({ ...f, [t.id]: e.message })); await onRefresh() } finally { setBusy(false); setAnalysingId(null) }
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
  function conflict(s) { const existing = onExisting(s); return existing !== undefined && existing !== null && existing !== '' && JSON.stringify(existing) !== JSON.stringify(s.payload) }
  async function accept(s, { batch = false } = {}) {
    if (batch && conflict(s)) return false
    if (!batch && conflict(s) && !window.confirm('This replaces a value already saved in the workshop. Apply it anyway?')) return false
    setProcessing(s.id)
    try { await onAccept(s); await review(s, 'accepted'); return true }
    catch (e) { setNotice('Could not apply the suggestion: ' + e.message); return false } finally { setProcessing(null) }
  }
  async function acceptMany(list) {
    let n = 0, skipped = 0
    for (const s of list) { if (await accept(s, { batch: true })) n++; else skipped++ }
    setNotice(`${n} applied.${skipped ? ` ${skipped} skipped because they would overwrite saved values — review those one by one.` : ''}`)
  }

  const accepted = suggestions.filter(s => s.status === 'accepted')
  const rejected = suggestions.filter(s => s.status === 'rejected')
  const pending = suggestions.filter(s => s.status === 'pending' || s.status === 'edited')
  const shown = filter === 'pending' ? pending : filter === 'accepted' ? accepted : rejected
  const groups = shown.reduce((acc, s) => { const g = describeTarget(s, L).group; (acc[g] ??= []).push(s); return acc }, {})
  const step = pending.length ? 3 : transcripts.length ? 2 : 1

  return (
    <div className="dw-card dw-transcripts">
      <div className="dw-kicker">AI capture</div>
      <h2>Transcript analysis</h2>
      <p className="dw-caption dw-ts-intro">Paste or upload the meeting transcript. Wani reads it and proposes updates to fields, answers and decisions, each with the quote it is based on. Nothing changes in the workshop until you accept.</p>

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
              const state = analysingId === t.id ? ['busy', 'Analysing…'] : failed ? ['bad', 'Failed'] : t.status === 'analysed' ? ['ok', 'Analysed'] : ['idle', 'Not analysed']
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
                  {failed && <div className="dw-ts-error" role="alert"><strong>The analysis could not finish.</strong> Your transcript is saved — try again in a moment. <details><summary>Technical details</summary><code>{failed}</code></details></div>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {notice && <p role="status" className="dw-ts-notice">{notice}</p>}

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
