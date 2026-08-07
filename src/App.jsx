import { useState, useEffect, createContext, useContext } from 'react'
import { supabase, signOut } from './supabaseClient'
import Login from './pages/Login.jsx'
import { WaniLogo, WaniWordmark } from './pages/Login.jsx'
import AdminPortal from './pages/AdminPortal.jsx'

export const ThemeContext = createContext({ dark: false, toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

function AdminDenied({ email, onSignOut }) {
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0A0A12', padding:24, fontFamily:"'Inter',sans-serif" }}>
      <div style={{ maxWidth:430, width:'100%', textAlign:'center', background:'#12121A', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'40px 32px' }}>
        <WaniLogo size={48} dark />
        <div style={{ fontSize:30, margin:'20px 0 8px' }}>🔒</div>
        <h2 style={{ margin:'0 0 12px', color:'#fff', fontSize:20, fontWeight:700 }}>Administrator access only</h2>
        <p style={{ color:'#94A3B8', fontSize:13, lineHeight:1.6, margin:'0 0 24px' }}>
          {email || 'This account'} is not configured as a Wani administrator. Use the normal Wani product for approved user access.
        </p>
        <button onClick={onSignOut} style={{ padding:'10px 24px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#A8A3B8', cursor:'pointer', fontSize:13 }}>
          Log out
        </button>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0A0A12' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <WaniLogo size={48} dark />
        <div style={{ width:24, height:24, border:'2px solid #333', borderTopColor:'#4F46E5', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <WaniWordmark height={16} dark />
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adminStatus, setAdminStatus] = useState(null)
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

  useEffect(() => {
    if (!session) {
      setAdminStatus(null)
      return
    }

    let cancelled = false
    setAdminStatus(null)

    fetch('/api/recall', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'admin_dashboard' }),
    })
      .then(res => {
        if (!cancelled) setAdminStatus(res.ok)
      })
      .catch(() => {
        if (!cancelled) setAdminStatus(false)
      })

    return () => { cancelled = true }
  }, [sessionUserId])

  const handleSignOut = async () => {
    await signOut()
    setAdminStatus(null)
  }

  if (loading || (session && adminStatus === null)) return <Loading />

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {!session
        ? <Login />
        : adminStatus
          ? <AdminPortal session={session} />
          : <AdminDenied email={session.user.email} onSignOut={handleSignOut} />
      }
    </ThemeContext.Provider>
  )
}
