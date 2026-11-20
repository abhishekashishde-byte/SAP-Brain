import { useState } from 'react'

const call = (session, method, query = '', body) => fetch('/api/integration-keys' + query, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
  ...(body ? { body: JSON.stringify(body) } : {}),
}).then(async r => { const data = await r.json().catch(() => ({})); if (!r.ok) throw Error(data.error || 'Request failed'); return data })

const day = v => v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

// Lets the consultant connect Ana, so meeting transcripts arrive here without copy and paste.
export default function AnaConnection({ session }) {
  const [keys, setKeys] = useState(null)
  const [created, setCreated] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (keys) return
    try { setKeys((await call(session, 'GET')).keys) } catch (e) { setError(e.message) }
  }
  async function create() {
    setBusy(true); setError(''); setCopied(false)
    try {
      const data = await call(session, 'POST', '', { label: 'Ana' })
      setCreated(data.key); setKeys(k => [data.record, ...(k || [])])
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function revoke(id) {
    setBusy(true); setError('')
    try {
      await call(session, 'DELETE', '?id=' + encodeURIComponent(id))
      setKeys(k => k.map(x => x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(created); setCopied(true) } catch { setCopied(false) }
  }
  const active = (keys || []).filter(k => !k.revoked_at)

  return (
    <details className="dw-ts-block dw-ts-add" onToggle={e => { if (e.currentTarget.open) load() }}>
      <summary><h3>Send transcripts from Ana</h3></summary>
      <p className="dw-caption">Connect Ana once. Afterwards, “Send to Wani” on an Ana meeting puts its transcript here, ready to analyse. Ana sends the participants’ consent with it.</p>
      {created && <div className="dw-ts-row" role="status">
        <code style={{ wordBreak: 'break-all', flex: 1 }}>{created}</code>
        <button type="button" className="dw-button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>}
      {created && <p className="dw-caption">Paste this key in Ana → Settings → Wani. It is shown only now.</p>}
      <div className="dw-actions">
        <button type="button" className="dw-button dw-primary" disabled={busy} onClick={create}>{active.length ? 'Create another key' : 'Create connection key'}</button>
      </div>
      {active.length > 0 && <ul className="dw-ts-list">
        {active.map(k => <li key={k.id}><div className="dw-ts-item">
          <div className="dw-ts-item-main"><strong>{k.label} · {k.key_prefix}…</strong>
            <small>Created {day(k.created_at)}{k.last_used_at ? ` · last used ${day(k.last_used_at)}` : ' · not used yet'}</small></div>
          <div className="dw-actions"><button type="button" className="dw-button dw-button-quiet" disabled={busy} onClick={() => revoke(k.id)}>Revoke</button></div>
        </div></li>)}
      </ul>}
      {error && <p className="dw-caption dw-ts-result-warn">{error}</p>}
    </details>
  )
}
