import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login.jsx'
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
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <div style={{ width:40, height:40, border:'2px solid #E8E3D5', borderTopColor:'#B8960C', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ fontFamily:"'Playfair Display',serif", color:'#B8960C', fontSize:14, letterSpacing:2 }}>WANI</span>
      </div>
    </div>
  )

  return session ? <Brain session={session} /> : <Login />
}
