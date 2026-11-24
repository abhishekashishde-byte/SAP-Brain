import { activeModuleKey } from './catalog.js'
import { useMemo, useState } from 'react'
import { discoveryCatalog } from './catalog.js'
import { updateTranscriptSuggestion } from './transcriptData.js'
import { MARK, useCatalogLookup, describeTarget, describeValue } from './txDescribe.js'

// Correct a transcript finding instead of only accepting or rejecting it:
// either explain it to Wani in plain words, or re-point it manually.
export default function Correction({ s, session, onSaved, onCancel }) {
  const L = useCatalogLookup()
  const [mode, setMode] = useState('ai')
  const [text, setText] = useState('')
  const [state, setState] = useState({ busy: false, error: '', proposal: null })
  const original = { kind: s.kind, target_ref: s.target_ref }

  // Manual mode starts from the finding's current place.
  const startObject = L.item.get(s.target_ref)?.object.id || s.payload?.object_id || discoveryCatalog.objects[0].id
  const [objectId, setObjectId] = useState(startObject)
  const [itemId, setItemId] = useState(L.item.get(s.target_ref) ? s.target_ref : '__new')
  const [label, setLabel] = useState(s.payload?.label || '')
  const [mark, setMark] = useState(s.payload?.mark || 'needed')
  const [note, setNote] = useState(s.payload?.note || s.payload?.rationale || '')
  const [answer, setAnswer] = useState(Array.isArray(s.payload?.answer) ? s.payload.answer.join(', ') : s.payload?.answer ?? '')
  const [choice, setChoice] = useState(s.payload?.choice || '')
  const object = useMemo(() => discoveryCatalog.objects.find(o => o.id === objectId), [objectId])
  const item = L.item.get(itemId)

  async function askWani() {
    setState({ busy: true, error: '', proposal: null })
    try {
      const r = await fetch('/api/discovery-correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ suggestion: { kind: s.kind, target_ref: s.target_ref, payload: s.payload, quote: s.quote }, correction: text, module: activeModuleKey }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw Error(data.error || 'Correction failed')
      setState({ busy: false, error: '', proposal: data })
    } catch (e) { setState({ busy: false, error: e.message, proposal: null }) }
  }

  function manualProposal() {
    if (itemId === '__new') return { kind: 'custom_field', target_ref: null, payload: { object_id: objectId, label: label.trim(), mark, note } }
    if (item?.kind === 'field') return { kind: 'field_mark', target_ref: itemId, payload: { mark, note } }
    if (item?.kind === 'question') {
      const q = item.q
      const value = q.type === 'number' ? Number(answer) : q.type === 'multi' ? String(answer).split(',').map(x => x.trim()).filter(Boolean) : answer
      return { kind: 'answer', target_ref: itemId, payload: { answer: value, note } }
    }
    return { kind: 'decision', target_ref: itemId, payload: { choice, rationale: note, status: 'open' } }
  }

  async function save(p, applyNow, how) {
    setState(x => ({ ...x, busy: true, error: '' }))
    try {
      const updated = await updateTranscriptSuggestion(s.id, {
        kind: p.kind, target_ref: p.target_ref,
        payload: { ...p.payload, _correction: { text: how === 'ai' ? text.trim() : 'Changed manually', from: original, at: new Date().toISOString() } },
        status: 'edited',
      })
      await onSaved(updated, applyNow)
    } catch (e) { setState(x => ({ ...x, busy: false, error: e.message })) }
  }

  const preview = p => { const t = describeTarget(p, L); return <><strong>{t.group === t.label ? t.label : `${t.group} › ${t.label}`}</strong><span>{describeValue(p.kind, p.payload, L)}</span></> }
  const manualValid = itemId === '__new' ? !!label.trim() : item?.kind === 'decision' ? !!choice : item?.kind === 'question' ? String(answer).trim() !== '' : true

  return (
    <div className="dw-correct">
      <div className="dw-segmented" role="tablist">
        <button role="tab" aria-selected={mode === 'ai'} className={mode === 'ai' ? 'is-on' : ''} onClick={() => setMode('ai')}>Tell Wani</button>
        <button role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'is-on' : ''} onClick={() => setMode('manual')}>Change manually</button>
      </div>

      {mode === 'ai' && <>
        <textarea rows="3" value={text} onChange={e => setText(e.target.value)} aria-label="Your correction"
          placeholder="What is it really? e.g. “Not the equipment object type — this is the inventory number in the asset master data.”" />
        {!state.proposal && <div className="dw-actions">
          <button type="button" className="dw-button dw-primary" disabled={state.busy || text.trim().length < 3} onClick={askWani}>{state.busy ? 'Wani is re-mapping…' : 'Correct with Wani'}</button>
          <button type="button" className="dw-button dw-button-quiet" onClick={onCancel}>Cancel</button>
        </div>}
        {state.proposal && <div className="dw-correct-proposal">
          <span className="dw-tx-label">Wani’s correction</span>
          <div className="dw-correct-what">{preview(state.proposal)}</div>
          {state.proposal.explanation && <p className="dw-caption">{state.proposal.explanation}</p>}
          <div className="dw-actions">
            <button type="button" className="dw-button dw-primary" disabled={state.busy} onClick={() => save(state.proposal, true, 'ai')}>Apply corrected</button>
            <button type="button" className="dw-button" disabled={state.busy} onClick={() => save(state.proposal, false, 'ai')}>Save for later</button>
            <button type="button" className="dw-button dw-button-quiet" disabled={state.busy} onClick={() => setState({ busy: false, error: '', proposal: null })}>Try again</button>
          </div>
        </div>}
      </>}

      {mode === 'manual' && <div className="dw-correct-manual">
        <label><span>Object</span><select value={objectId} onChange={e => { setObjectId(e.target.value); setItemId('__new') }}>
          {discoveryCatalog.objects.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label>
        <label><span>Where</span><select value={itemId} onChange={e => setItemId(e.target.value)}>
          <option value="__new">＋ New field on this object…</option>
          <optgroup label="Fields">{object.fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>
          <optgroup label="Questions">{object.questions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}</optgroup>
          <optgroup label="Decisions">{object.decisions.map(d => <option key={d.id} value={d.id}>{d.text}</option>)}</optgroup>
        </select></label>
        {itemId === '__new' && <label><span>Field name</span><input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Inventory number (asset master)" /></label>}
        {(itemId === '__new' || item?.kind === 'field') && <label><span>Mark</span><select value={mark} onChange={e => setMark(e.target.value)}>{Object.entries(MARK).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {item?.kind === 'question' && <label><span>Answer</span>{item.q.type === 'single' || item.q.type === 'yesno'
          ? <select value={answer} onChange={e => setAnswer(e.target.value)}><option value="">—</option>{(item.q.type === 'yesno' ? ['Yes', 'No', 'Unsure'] : item.q.options).map(o => <option key={o}>{o}</option>)}</select>
          : <input type={item.q.type === 'number' ? 'number' : 'text'} value={answer} onChange={e => setAnswer(e.target.value)} />}</label>}
        {item?.kind === 'decision' && <label><span>Decision</span><select value={choice} onChange={e => setChoice(e.target.value)}><option value="">—</option>{item.d.options.map(o => <option key={o}>{o}</option>)}</select></label>}
        <label className="dw-correct-note"><span>Comment</span><textarea rows="2" value={note} onChange={e => setNote(e.target.value)} placeholder="What the customer said, corrected" /></label>
        <div className="dw-actions">
          <button type="button" className="dw-button dw-primary" disabled={state.busy || !manualValid} onClick={() => save(manualProposal(), true, 'manual')}>Apply corrected</button>
          <button type="button" className="dw-button" disabled={state.busy || !manualValid} onClick={() => save(manualProposal(), false, 'manual')}>Save for later</button>
          <button type="button" className="dw-button dw-button-quiet" onClick={onCancel}>Cancel</button>
        </div>
      </div>}

      {state.error && <p className="dw-correct-error" role="alert">{state.error}</p>}
      <p className="dw-caption">“{s.quote}”</p>
    </div>
  )
}
