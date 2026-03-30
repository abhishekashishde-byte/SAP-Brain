import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login.jsx'
import { WaniLogo } from './pages/Login.jsx'
import Brain from './pages/Brain.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FAFAF8' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <WaniLogo size={52}/>
        <div style={{ width:28, height:28, border:'2px solid #E8E3D5', borderTopColor:'#C850C0', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <span style={{
          fontFamily:"'Playfair Display',serif", color:'transparent', fontSize:14, letterSpacing:2,
          background:'linear-gradient(135deg,#C850C0,#FF6B35,#FFCC70)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        }}>WANI</span>
      </div>
    </div>
  )

  return session ? <Brain session={session} /> : <Login />
}
