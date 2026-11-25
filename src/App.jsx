import { useState, useEffect, createContext, useContext, lazy, Suspense, Component } from 'react'
import { supabase, signOut } from './supabaseClient'
import Login from './pages/Login.jsx'
import { WaniLogo, WaniWordmark } from './pages/Login.jsx'
import Brain from './pages/Brain.jsx'
const DiscoveryWorkshop = lazy(() => import('./features/discovery/DiscoveryWorkshop.jsx'))
const ImplementationHub = lazy(() => import('./features/implementation/ImplementationHub.jsx'))
const CodeStudio = lazy(() => import('./features/code/CodeStudio.jsx'))
const FindingsPage = lazy(() => import('./features/findings/FindingsPage.jsx'))
import AdminDashboard from './pages/AdminDashboard.jsx'


// Discovery is isolated so an unexpected catalog/rendering error cannot blank Wani chat.
class DiscoveryErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) { console.error('Discovery UI error', error, info) }
  render() {
    if (this.state.failed) return (
      <main role="alert" style={{ minHeight:'100dvh',background:'#0d0d0d',color:'#eceef1',padding:'max(48px,8vh) 20px',fontFamily:'Inter,system-ui,sans-serif',textAlign:'center' }}>
        <h1 style={{ fontSize:24 }}>Discovery could not open</h1>
        <p style={{ maxWidth:520,margin:'16px auto',lineHeight:1.6,color:'#a3a8b1' }}>The workshop encountered an error. Your Wani chat is unaffected. Please report this screen so we can fix the workshop.</p>
        <a href="/" style={{ display:'inline-block',padding:'12px 18px',borderRadius:10,background:'#eceef1',color:'#0d0d0d',textDecoration:'none',fontWeight:700 }}>Return to Wani</a>
      </main>
    )
    return this.props.children
  }
}


export const ThemeContext = createContext({ dark: false, toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

function jwtSessionId(token) {
  try {
    const payload = token?.split('.')?.[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return decoded?.session_id || null
  } catch { return null }
}

function PendingApproval({ dark, email, onSignOut, locked = false }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#0e0e0e' : '#FAFAF8', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', background: dark ? '#161616' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 20, padding: '40px 32px' }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ fontSize: 32, margin: '20px 0 8px' }}>⏳</div>
        <h2 style={{ margin: '0 0 12px', color: dark ? '#fff' : '#111', fontSize: 20, fontWeight: 700 }}>{locked ? 'Wani is not available right now' : 'Application Pending'}</h2>
        <p style={{ color: dark ? '#94A3B8' : '#666', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          {locked
            ? <>Wani is currently available to the administrator only. Access for <strong>{email}</strong> will return when it reopens.</>
            : <>Thanks for applying. We're reviewing your application personally and will send access to <strong>{email}</strong> shortly.</>}
        </p>
        <button onClick={onSignOut} style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`, background: 'transparent', color: dark ? '#94A3B8' : '#666', cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
          Log out
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [approved, setApproved] = useState(null)
  const [lockedOut, setLockedOut] = useState(false)
  const [adminAvailable, setAdminAvailable] = useState(false)
  const [adminView, setAdminView] = useState(false)
  const dark = true
  const toggle = () => {}

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  const sessionUserId = session?.user?.id || null
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

  useEffect(() => {
    if (!sessionEmail) {
      setApproved(null)
      setAdminAvailable(false)
      setAdminView(false)
      return
    }

    // Supabase emits TOKEN_REFRESHED when a hidden tab or backgrounded app
    // becomes active again. The session object changes, but the user does not.
    // Keying this check to user identity keeps Brain mounted during token
    // refreshes, so an in-progress chat draft is not lost.
    setApproved(null)
    supabase
      .from('approved_emails')
      .select('email')
      .eq('email', sessionEmail)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Approval check error:', error)
          setApproved(false) // Fail closed. The API performs the authoritative check too.
          return
        }
        setApproved(Boolean(data))
      })
  }, [sessionUserId, sessionEmail])

  // Pending users re-check approval while the page is open, so they do not need
  // to keep signing out/in after the administrator approves them.
  useEffect(() => {
    if (!sessionEmail || approved !== false || lockedOut) return
    const check = () => supabase.from('approved_emails').select('email').eq('email', sessionEmail).maybeSingle()
      .then(({ data }) => { if (data) setApproved(true) }).catch(() => {})
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [sessionEmail, approved, lockedOut])

  // Ask the server whether this verified user is an administrator. Do NOT load
  // the full admin dashboard just to answer this boolean; that made the Admin control
  // depend on a much heavier request and could leave it missing on a slow login.
  useEffect(() => {
    if (!session || approved !== true) {
      setAdminAvailable(false)
      return
    }
    let cancelled = false
    const token = session.access_token
    fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: 'admin_status' }),
    })
      .then(async res => {
        if (res.ok) return res.json()
        // The server refuses non-admin accounts while Wani is locked to the administrator.
        const body = await res.json().catch(() => ({}))
        if (res.status === 403 && body?.code === 'locked' && !cancelled) { setLockedOut(true); setApproved(false) }
        throw new Error('admin status failed')
      })
      .then(data => {
        if (!cancelled) setAdminAvailable(data?.isAdmin === true)
      })
      .catch(() => {
        if (!cancelled) setAdminAvailable(false)
      })
    return () => { cancelled = true }
  }, [sessionUserId, approved])

  useEffect(() => {
    if (!adminAvailable) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('admin') === 'users') setAdminView(true)
  }, [adminAvailable])

  const handleSignOut = async () => {
    await signOut()
    setApproved(null)
    setAdminAvailable(false)
    setAdminView(false)
  }

  if (loading || (session && approved === null)) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#0e0e0e' : '#FAFAF8' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ width: 24, height: 24, border: `2px solid ${dark ? '#333' : '#E8E3D5'}`, borderTopColor: '#90949b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <WaniWordmark height={16} dark={dark}/>
      </div>
    </div>
  )

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {!session
        ? <Login/>
        : approved
          ? adminView
            ? <AdminDashboard session={session} onClose={() => setAdminView(false)} />
            : <>
                {window.location.pathname.startsWith('/findings')
                  ? <Suspense fallback={<div role="status" style={{background:'#000',color:'#a1a1aa',minHeight:'100dvh',display:'grid',placeItems:'center',fontFamily:'Inter,sans-serif'}}>Loading…</div>}><FindingsPage session={session}/></Suspense>
                  : window.location.pathname.startsWith('/code')
                  ? <Suspense fallback={<div role="status" style={{background:'#000',color:'#a1a1aa',minHeight:'100dvh',display:'grid',placeItems:'center',fontFamily:'Inter,sans-serif'}}>Loading…</div>}><CodeStudio session={session}/></Suspense>
                  : window.location.pathname.startsWith('/implementation')
                  ? <Suspense fallback={<div role="status" style={{background:'#0d0d0d',color:'#a3a8b1',minHeight:'100dvh',display:'grid',placeItems:'center',fontFamily:'Inter,sans-serif'}}>Loading…</div>}><ImplementationHub session={session}/></Suspense>
                  : window.location.pathname.startsWith('/discovery')
                  ? <DiscoveryErrorBoundary><Suspense fallback={<div role="status" style={{background:'#0d0d0d',color:'#a3a8b1',minHeight:'100dvh',display:'grid',placeItems:'center',fontFamily:'Inter,sans-serif'}}>Loading Discovery Workshop…</div>}><DiscoveryWorkshop session={session}/></Suspense></DiscoveryErrorBoundary>
                  : <>
                  <Brain session={session}/>
                </>}
                {adminAvailable && !window.location.pathname.startsWith('/discovery') && !window.location.pathname.startsWith('/implementation') && !window.location.pathname.startsWith('/code') && !window.location.pathname.startsWith('/findings') && (
                  <button
                    onClick={() => setAdminView(true)}
                    title="Open Wani admin dashboard"
                    style={{
                      position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000,
                      border: '1px solid rgba(191,193,198,.55)', borderRadius: 999,
                      padding: '9px 14px', background: 'rgba(21,22,23,.94)', color: '#d7d8db',
                      boxShadow: '0 10px 30px rgba(0,0,0,.35)', cursor: 'pointer',
                      font: "650 12px/1 'Inter',sans-serif", backdropFilter: 'blur(12px)',
                    }}
                  >
                    Admin
                  </button>
                )}
              </>
          : <PendingApproval dark={dark} email={session.user.email} onSignOut={handleSignOut} locked={lockedOut}/>
      }
    </ThemeContext.Provider>
  )
}
