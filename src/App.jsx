import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login.jsx'
import { WaniLogo, WaniWordmark } from './pages/Login.jsx'
import Brain from './pages/Brain.jsx'

export const ThemeContext = createContext({ dark: false, toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

// ── PENDING APPROVAL SCREEN ───────────────────────────────────────────────────
function PendingApproval({ dark, email, onSignOut }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: dark ? '#0A0A12' : '#FAFAF8', padding: 24,
    }}>
      <div style={{
        maxWidth: 420, width: '100%', textAlign: 'center',
        background: dark ? '#12121A' : '#fff',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: 20, padding: '40px 32px',
      }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ fontSize: 32, margin: '20px 0 8px' }}>⏳</div>
        <h2 style={{ margin: '0 0 12px', color: dark ? '#fff' : '#111', fontSize: 20, fontWeight: 700 }}>
          Application Pending
        </h2>
        <p style={{ color: dark ? '#94A3B8' : '#666', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          Thanks for applying. We're reviewing your application personally and will send access to <strong>{email}</strong> shortly.
        </p>
        <button onClick={onSignOut} style={{
          padding: '10px 24px', borderRadius: 8, border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
          background: 'transparent', color: dark ? '#94A3B8' : '#666',
          cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif",
        }}>
          Sign out
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [approved, setApproved]     = useState(null) // null=checking, true=approved, false=pending
  // Light/dark mode toggle removed — Wani is dark-mode only now (the profile
  // background theme picker replaces it). `dark` and `toggle` are kept as a
  // constant + no-op so useTheme() consumers elsewhere don't need changes.
  const dark = true
  const toggle = () => {}

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  // Check approval status whenever session changes
  useEffect(() => {
    if (!session?.user?.email) { setApproved(null); return }
    const email = session.user.email

    // Check if email is in approved_emails table
    supabase
      .from('approved_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Approval check error:', error)
          setApproved(true) // fail open — don't block on DB error
        } else {
          setApproved(!!data)
        }
      })
  }, [session])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setApproved(null)
  }

  // Loading
  if (loading || (session && approved === null)) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: dark ? '#0A0A12' : '#FAFAF8' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ width:24, height:24, border:`2px solid ${dark?'#333':'#E8E3D5'}`, borderTopColor:'#4F46E5', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <WaniWordmark height={16} dark={dark}/>
      </div>
    </div>
  )

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {!session
        ? <Login/>
        : approved
          ? <Brain session={session}/>
          : <PendingApproval dark={dark} email={session.user.email} onSignOut={handleSignOut}/>
      }
    </ThemeContext.Provider>
  )
}
