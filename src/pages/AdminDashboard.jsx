import { useEffect, useMemo, useState } from 'react'

const cardStyle = {
  background: '#12121A', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16, padding: 18,
}

function formatRelative(iso) {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'Unknown'
  if (ms < 60_000) return 'Just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function Metric({ label, value, hint }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: '#8A849E', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 750, color: '#F4F1FF' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: '#69647C', marginTop: 6 }}>{hint}</div>}
    </div>
  )
}

export default function AdminDashboard({ onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_dashboard' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not load dashboard')
      setData(body)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const users = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data?.users || []
    return (data?.users || []).filter(u =>
      u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    )
  }, [data, query])

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0A12', color: '#F4F1FF', fontFamily: "'Inter',sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 1250, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: '#7F78A7', fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase' }}>Wani Admin</div>
            <h1 style={{ margin: '6px 0 0', fontSize: 28 }}>Usage Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={load} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #343044', background: '#171522', color: '#D8D3EA', cursor: 'pointer' }}>Refresh</button>
            <button onClick={onClose} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #4F46E5', background: '#4F46E5', color: '#fff', cursor: 'pointer' }}>Back to Wani</button>
          </div>
        </div>

        {error && <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,.4)', color: '#FCA5A5', marginBottom: 18 }}>{error}</div>}

        {loading && !data ? (
          <div style={{ color: '#8A849E', padding: 20 }}>Loading admin data…</div>
        ) : data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
              <Metric label="Total users" value={data.summary.totalUsers} />
              <Metric label="Approved" value={data.summary.approvedUsers} />
              <Metric label="Online now" value={data.summary.onlineNow} hint="Activity in last 90 seconds" />
              <Metric label="Active today" value={data.summary.activeToday} />
              <Metric label="Questions today" value={data.summary.questionsToday} hint="Metered non-admin questions" />
              <Metric label="Questions this month" value={data.summary.questionsMonth} />
            </div>

            <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search user or email…"
                style={{ flex: 1, minWidth: 220, background: '#0E0D15', color: '#F4F1FF', border: '1px solid #302C40', borderRadius: 10, padding: '10px 12px', outline: 'none' }}
              />
              <div style={{ fontSize: 12, color: '#8A849E' }}>
                Free limit: {data.limits.daily}/day · {data.limits.monthly}/month
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
                  <thead>
                    <tr style={{ background: '#171522' }}>
                      {['User','Status','Last online','Today','Month','Credits left','Joined'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .6, color: '#8A849E', borderBottom: '1px solid #2A2736' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,.055)' }}>
                        <td style={{ padding: '13px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 650 }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: '#77718B', marginTop: 2 }}>{u.email}</div>
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.online ? '#22C55E' : '#4B5563', boxShadow: u.online ? '0 0 0 3px rgba(34,197,94,.12)' : 'none' }}/>
                            {u.online ? 'Online' : (u.approved ? 'Approved' : 'Pending')}
                          </div>
                        </td>
                        <td style={{ padding: '13px 14px', fontSize: 12 }} title={u.lastOnlineAt ? new Date(u.lastOnlineAt).toLocaleString() : ''}>
                          {formatRelative(u.lastOnlineAt)}
                        </td>
                        <td style={{ padding: '13px 14px', fontSize: 13 }}>{u.questionsToday}</td>
                        <td style={{ padding: '13px 14px', fontSize: 13 }}>{u.questionsMonth}</td>
                        <td style={{ padding: '13px 14px', fontSize: 12 }}>
                          {u.unlimited ? <span style={{ color: '#A78BFA' }}>Unlimited</span> : `${u.dailyRemaining} today · ${u.monthlyRemaining} month`}
                        </td>
                        <td style={{ padding: '13px 14px', fontSize: 12, color: '#A9A4BA' }}>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center', color: '#77718B' }}>No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginTop: 14, fontSize: 11, color: '#5E596C', lineHeight: 1.5 }}>
              Cost, model usage, failures and average response time are intentionally not shown yet because the main chat does not persist reliable per-request telemetry. The dashboard will not invent those values.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
