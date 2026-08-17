import { useState, useEffect, createContext, useContext } from 'react'
import { supabase, signOut } from './supabaseClient'
import Login from './pages/Login.jsx'
import { WaniLogo, WaniWordmark } from './pages/Login.jsx'
import Brain from './pages/Brain.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'

export const ThemeContext = createContext({ dark: false, toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

function PendingApproval({ dark, email, onSignOut }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#0A0A12' : '#FAFAF8', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', background: dark ? '#12121A' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 20, padding: '40px 32px' }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ fontSize: 32, margin: '20px 0 8px' }}>⏳</div>
        <h2 style={{ margin: '0 0 12px', color: dark ? '#fff' : '#111', fontSize: 20, fontWeight: 700 }}>Application Pending</h2>
        <p style={{ color: dark ? '#94A3B8' : '#666', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          Thanks for applying. We're reviewing your application personally and will send access to <strong>{email}</strong> shortly.
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
      .then(res => res.ok ? res.json() : Promise.reject(new Error('admin status failed')))
      .then(data => {
        if (!cancelled) setAdminAvailable(data?.isAdmin === true)
      })
      .catch(() => {
        if (!cancelled) setAdminAvailable(false)
      })
    return () => { cancelled = true }
  }, [sessionUserId, approved])

  const handleSignOut = async () => {
    await signOut()
    setApproved(null)
    setAdminAvailable(false)
    setAdminView(false)
  }

  if (loading || (session && approved === null)) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#0A0A12' : '#FAFAF8' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ width: 24, height: 24, border: `2px solid ${dark ? '#333' : '#E8E3D5'}`, borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
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
            ? <AdminDashboard onClose={() => setAdminView(false)} />
            : <>
                <Brain session={session}/>
                {adminAvailable && (
                  <button
                    onClick={() => setAdminView(true)}
                    title="Open Wani admin dashboard"
                    style={{
                      position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000,
                      border: '1px solid rgba(167,139,250,.55)', borderRadius: 999,
                      padding: '9px 14px', background: 'rgba(17,17,27,.94)', color: '#C4B5FD',
                      boxShadow: '0 10px 30px rgba(0,0,0,.35)', cursor: 'pointer',
                      font: "650 12px/1 'Inter',sans-serif", backdropFilter: 'blur(12px)',
                    }}
                  >
                    Admin
                  </button>
                )}
              </>
          : <PendingApproval dark={dark} email={session.user.email} onSignOut={handleSignOut}/>
      }
    </ThemeContext.Provider>
  )
}
