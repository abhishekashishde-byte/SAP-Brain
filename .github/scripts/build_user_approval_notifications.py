from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'Anchor not found in {path}: {old[:140]!r}')
    p.write_text(s.replace(old, new, count))


# 1) Authentication-only verifier for login notifications. This is additive and
# deliberately leaves requireApprovedUser() unchanged.
p = Path('api/_auth.js')
s = p.read_text()
anchor = "export async function requireApprovedUser(req) {\n"
helper = '''export async function requireAuthenticatedUser(req) {
  const token = getBearerToken(req)
  if (!token) return { ok: false, status: 401, error: 'Authentication required' }

  try {
    const { url, anonKey, serviceKey } = getConfig()
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data, error } = await authClient.auth.getUser(token)
    const user = data?.user
    if (error || !user?.id || !user?.email) {
      return { ok: false, status: 401, error: 'Invalid or expired session' }
    }
    const sessionId = getJwtSessionId(token)
    if (!sessionId) return { ok: false, status: 401, error: 'Session identifier is missing' }
    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return { ok: true, user, token, sessionId, serviceClient }
  } catch (error) {
    console.error('[auth] identity guard failed:', error.message)
    return { ok: false, status: 503, error: 'Authentication service unavailable' }
  }
}

'''
if 'export async function requireAuthenticatedUser(req)' not in s:
    if anchor not in s:
        raise SystemExit('approved-user anchor missing')
    p.write_text(s.replace(anchor, helper + anchor, 1))


# 2) Recall route: pre-approval signup/login notification hooks and admin approval.
replace(
    'api/recall.js',
    "import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'\nimport { handleAdminDashboard } from '../lib/adminDashboard.js'\n",
    "import { createClient } from '@supabase/supabase-js'\nimport { requireApprovedUser, requireAuthenticatedUser, requireJsonBody, sendAuthError } from './_auth.js'\nimport { handleAdminDashboard } from '../lib/adminDashboard.js'\nimport { notifySignup, notifyLogin, notifyApprovalToUser, emailNotificationsConfigured } from '../lib/emailNotifications.js'\n",
)
replace(
    'api/recall.js',
    "  if (!requireJsonBody(req, res, 40_000)) return\n\n  const auth = await requireApprovedUser(req)\n  if (!auth.ok) return sendAuthError(res, auth)\n\n  const action = typeof req.body.action === 'string' ? req.body.action : 'recall'\n",
    """  if (!requireJsonBody(req, res, 40_000)) return

  const action = typeof req.body.action === 'string' ? req.body.action : 'recall'

  // These happen before approval. Signup resolves to a real Supabase Auth user;
  // login requires a valid Supabase JWT. Neither grants access to Wani.
  if (action === 'notify_signup') return await handleSignupNotification(req, res)
  if (action === 'notify_login') return await handleLoginNotification(req, res)

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)
""",
)
replace(
    'api/recall.js',
    "    if (action === 'admin_dashboard') {\n      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })\n      return await handleAdminDashboard(res, auth)\n    }\n",
    """    if (action === 'admin_dashboard') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleAdminDashboard(res, auth)
    }

    if (action === 'admin_approve_user') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleAdminApproveUsers(req, res, auth, [req.body.userId])
    }

    if (action === 'admin_approve_users') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      const ids = Array.isArray(req.body.userIds) ? req.body.userIds.slice(0, 50) : []
      return await handleAdminApproveUsers(req, res, auth, ids)
    }
""",
)

recall = Path('api/recall.js')
s = recall.read_text()
insert_anchor = "async function handleKnowledgeSnapshot(res, auth) {\n"
handlers = '''function serviceClientForAuthEvents() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function handleSignupNotification(req, res) {
  const userId = parseUuid(req.body.userId)
  if (!userId) return res.status(400).json({ error: 'Invalid user' })
  const client = serviceClientForAuthEvents()
  if (!client) return res.status(503).json({ error: 'Notification service unavailable' })
  const { data, error } = await client.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) return res.status(404).json({ error: 'User not found' })
  const notification = await notifySignup(client, data.user)
  return res.status(200).json({ ok: true, notification, emailConfigured: emailNotificationsConfigured() })
}

async function handleLoginNotification(req, res) {
  const identity = await requireAuthenticatedUser(req)
  if (!identity.ok) return sendAuthError(res, identity)

  const loginNotification = await notifyLogin(identity.serviceClient, identity.user, identity.sessionId)

  // Google OAuth creates the user and signs in in one step. If still unapproved,
  // make sure the signup/approval notification is generated too.
  const email = String(identity.user.email || '').trim().toLowerCase()
  const { data: approval } = await identity.serviceClient
    .from('approved_emails').select('email').eq('email', email).maybeSingle()
  const signupNotification = approval ? null : await notifySignup(identity.serviceClient, identity.user)

  return res.status(200).json({
    ok: true,
    loginNotification,
    signupNotification,
    emailConfigured: emailNotificationsConfigured(),
  })
}

async function handleAdminApproveUsers(req, res, auth, rawIds) {
  const ids = [...new Set((rawIds || []).map(parseUuid).filter(Boolean))]
  if (ids.length === 0) return res.status(400).json({ error: 'No valid users selected' })

  const approved = []
  const failed = []
  for (const id of ids) {
    const { data, error } = await auth.serviceClient.auth.admin.getUserById(id)
    const user = data?.user
    if (error || !user?.email) {
      failed.push({ id, error: 'User not found' })
      continue
    }

    const email = String(user.email).trim().toLowerCase()
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0]
    const { error: approveError } = await auth.serviceClient.from('approved_emails').upsert({
      email,
      full_name: fullName,
      approved_at: new Date().toISOString(),
    }, { onConflict: 'email' })

    if (approveError) {
      failed.push({ id, error: approveError.message })
      continue
    }

    approved.push({ id, email })
    await notifyApprovalToUser(auth.serviceClient, user)
  }

  return res.status(failed.length && !approved.length ? 500 : 200).json({
    approved,
    failed,
    emailConfigured: emailNotificationsConfigured(),
  })
}

'''
if 'async function handleSignupNotification(req, res)' not in s:
    if insert_anchor not in s:
        raise SystemExit('recall insertion anchor missing')
    recall.write_text(s.replace(insert_anchor, handlers + insert_anchor, 1))


# 3) Quota limit notification. The helper deduplicates per user/day or month.
replace(
    'api/reference-search.js',
    "} from './_quota.js'\n",
    "} from './_quota.js'\nimport { notifyQuotaReached } from '../lib/emailNotifications.js'\n",
)
replace(
    'api/reference-search.js',
    "    if (!quota.allowed) return sendQuotaStream(res, quota)\n",
    """    if (!quota.allowed) {
      await notifyQuotaReached(auth.serviceClient, auth.user, quota).catch(error => {
        console.error('[email] quota notification failed:', error.message)
      })
      return sendQuotaStream(res, quota)
    }
""",
)


# 4) Admin data: explicit pending/approved state and signup/email-confirmed details.
replace(
    'lib/adminDashboard.js',
    "      approvedAt: approvedEntry?.approved_at || null,\n      createdAt: user.created_at || null,\n      lastSignInAt: user.last_sign_in_at || null,\n",
    """      approvedAt: approvedEntry?.approved_at || null,
      status: approvedEntry ? 'approved' : 'pending',
      createdAt: user.created_at || null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      emailConfirmedAt: user.email_confirmed_at || null,
      provider: user.app_metadata?.provider || user.identities?.[0]?.provider || 'email',
      lastSignInAt: user.last_sign_in_at || null,
""",
)
replace(
    'lib/adminDashboard.js',
    "  }).sort((a, b) => {\n    const av = a.lastOnlineAt ? new Date(a.lastOnlineAt).getTime() : 0\n    const bv = b.lastOnlineAt ? new Date(b.lastOnlineAt).getTime() : 0\n    return bv - av\n  })\n",
    """  }).sort((a, b) => {
    if (a.approved !== b.approved) return a.approved ? 1 : -1
    const av = a.lastOnlineAt ? new Date(a.lastOnlineAt).getTime() : 0
    const bv = b.lastOnlineAt ? new Date(b.lastOnlineAt).getTime() : 0
    return bv - av
  })
""",
)
replace(
    'lib/adminDashboard.js',
    "      approvedUsers: rows.filter(user => user.approved).length,\n",
    "      approvedUsers: rows.filter(user => user.approved).length,\n      pendingUsers: rows.filter(user => !user.approved).length,\n",
)


# 5) Admin UI: authenticated calls, explicit signup status, one-click approval.
replace(
    'src/pages/AdminDashboard.jsx',
    "export default function AdminDashboard({ onClose }) {\n  const [data, setData] = useState(null)\n  const [error, setError] = useState('')\n  const [loading, setLoading] = useState(true)\n  const [query, setQuery] = useState('')\n",
    """export default function AdminDashboard({ onClose, session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('pending') || '')
  const [approving, setApproving] = useState(null)

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  })
""",
)
replace(
    'src/pages/AdminDashboard.jsx',
    "        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ action: 'admin_dashboard' }),\n",
    "        headers: authHeaders(),\n        body: JSON.stringify({ action: 'admin_dashboard' }),\n",
)
replace(
    'src/pages/AdminDashboard.jsx',
    "  useEffect(() => {\n    load()\n    const id = setInterval(load, 60_000)\n    return () => clearInterval(id)\n  }, [])\n",
    """  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [session?.access_token])

  const approveUser = async (user) => {
    if (!user?.id || approving) return
    setApproving(user.id); setError('')
    try {
      const res = await fetch('/api/recall', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'admin_approve_user', userId: user.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || body.failed?.[0]?.error || 'Could not approve user')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setApproving(null)
    }
  }
""",
)
replace(
    'src/pages/AdminDashboard.jsx',
    "      u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)\n",
    "      u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.id?.toLowerCase().includes(q)\n",
)
replace(
    'src/pages/AdminDashboard.jsx',
    '              <Metric label="Approved" value={data.summary.approvedUsers} />\n',
    '              <Metric label="Approved" value={data.summary.approvedUsers} />\n              <Metric label="Pending approval" value={data.summary.pendingUsers || 0} />\n',
)
replace(
    'src/pages/AdminDashboard.jsx',
    "                      {['User','Status','Last online','Today','Month','Customer briefs','Consultant notes','Images','Credits left','Joined'].map(h => (\n",
    "                      {['User','Access status','Last online','Today','Month','Customer briefs','Consultant notes','Images','Credits left','Joined','Action'].map(h => (\n",
)
replace(
    'src/pages/AdminDashboard.jsx',
    "                          <div style={{ fontSize: 11, color: '#77718B', marginTop: 2 }}>{u.email}</div>\n",
    "                          <div style={{ fontSize: 11, color: '#77718B', marginTop: 2 }}>{u.email}</div>\n                          <div style={{ fontSize: 9, color: '#555064', marginTop: 2 }}>{u.id}</div>\n",
)
replace(
    'src/pages/AdminDashboard.jsx',
    "                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.online ? '#22C55E' : '#4B5563', boxShadow: u.online ? '0 0 0 3px rgba(34,197,94,.12)' : 'none' }}/>\n                            {u.online ? 'Online' : (u.approved ? 'Approved' : 'Pending')}\n",
    """                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.approved ? '#22C55E' : '#F59E0B', boxShadow: u.online ? '0 0 0 3px rgba(34,197,94,.12)' : 'none' }}/>
                            <div>
                              <div style={{ color: u.approved ? '#86EFAC' : '#FCD34D', fontWeight: 650 }}>{u.approved ? 'Approved' : 'Pending approval'}</div>
                              <div style={{ color:'#77718B', fontSize:10, marginTop:2 }}>{u.emailConfirmed ? 'Email confirmed' : 'Email not confirmed'} · {u.provider || 'email'}{u.online ? ' · Online' : ''}</div>
                            </div>
""",
)
replace(
    'src/pages/AdminDashboard.jsx',
    "                        <td style={{ padding: '13px 14px', fontSize: 12, color: '#A9A4BA' }}>\n                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}\n                        </td>\n",
    """                        <td style={{ padding: '13px 14px', fontSize: 12, color: '#A9A4BA' }}>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          {u.approved
                            ? <span style={{ color:'#6B7280', fontSize:11 }}>Approved</span>
                            : <button onClick={() => approveUser(u)} disabled={approving === u.id} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #4F46E5', background:'#4F46E5', color:'#fff', cursor:approving === u.id ? 'wait' : 'pointer', fontWeight:650, fontSize:11, opacity:approving === u.id ? .65 : 1 }}>{approving === u.id ? 'Approving…' : 'Approve'}</button>}
                        </td>
""",
)
replace('src/pages/AdminDashboard.jsx', '<tr><td colSpan="10"', '<tr><td colSpan="11"')


# 6) App: one notification per real login session, pending auto-refresh, email deep-link.
replace(
    'src/App.jsx',
    "export const useTheme = () => useContext(ThemeContext)\n\n",
    """export const useTheme = () => useContext(ThemeContext)

function jwtSessionId(token) {
  try {
    const payload = token?.split('.')?.[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return decoded?.session_id || null
  } catch { return null }
}

""",
)
replace(
    'src/App.jsx',
    "  const sessionUserId = session?.user?.id || null\n  const sessionEmail = session?.user?.email?.trim().toLowerCase() || ''\n\n",
    """  const sessionUserId = session?.user?.id || null
  const sessionEmail = session?.user?.email?.trim().toLowerCase() || ''

  // Notify once per real Supabase session. TOKEN_REFRESHED keeps the same
  // session_id, so background refreshes do not generate duplicate login emails.
  useEffect(() => {
    if (!session?.access_token || !sessionUserId) return
    const sid = jwtSessionId(session.access_token)
    if (!sid) return
    const key = `wani-login-notified:${sid}`
    try { if (localStorage.getItem(key) === '1') return } catch {}

    fetch('/api/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'notify_login' }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('login notification failed')))
      .then(result => {
        const n = result?.loginNotification
        if (n?.sent || n?.skipped === 'duplicate') {
          try { localStorage.setItem(key, '1') } catch {}
        }
      })
      .catch(() => {})
  }, [sessionUserId, session?.access_token])

""",
)
replace(
    'src/App.jsx',
    "  // Ask the server whether this verified user is an administrator. Do NOT load\n",
    """  // Pending users re-check approval while the page is open, so they do not need
  // to keep signing out/in after the administrator approves them.
  useEffect(() => {
    if (!sessionEmail || approved !== false) return
    const check = () => supabase.from('approved_emails').select('email').eq('email', sessionEmail).maybeSingle()
      .then(({ data }) => { if (data) setApproved(true) }).catch(() => {})
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [sessionEmail, approved])

  // Ask the server whether this verified user is an administrator. Do NOT load
""",
)
replace(
    'src/App.jsx',
    "  const handleSignOut = async () => {\n",
    """  useEffect(() => {
    if (!adminAvailable) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('admin') === 'users') setAdminView(true)
  }, [adminAvailable])

  const handleSignOut = async () => {
""",
)
replace(
    'src/App.jsx',
    '? <AdminDashboard onClose={() => setAdminView(false)} />',
    '? <AdminDashboard session={session} onClose={() => setAdminView(false)} />',
)


# 7) Email/password signup requests an approval email immediately. The server resolves
# the supplied UUID against Auth; it never trusts an email address from the browser.
replace(
    'src/pages/Login.jsx',
    """    const { error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { name: name.trim() } }
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSuccess('Account created! Check your email to confirm, then sign in.')
""",
    """    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { name: name.trim() } }
    })
    setLoading(false)
    if (error) setError(error.message)
    else {
      setSuccess('Account created! Your Wani access request is now pending approval. Check your email to confirm your address.')
      if (data?.user?.id) {
        fetch('/api/recall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'notify_signup', userId: data.user.id }),
        }).catch(() => {})
      }
    }
""",
)

print('Wani user approval + notification patch applied successfully')
