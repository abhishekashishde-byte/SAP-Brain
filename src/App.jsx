import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login.jsx'
import { WaniLogo, WaniWordmark } from './pages/Login.jsx'
import Brain from './pages/Brain.jsx'

export const ThemeContext = createContext({ dark: false, toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('wani-theme') === 'dark' } catch { return false }
  })

  const toggle = () => setDark(d => {
    const next = !d
    try { localStorage.setItem('wani-theme', next ? 'dark' : 'light') } catch {}
    return next
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: dark ? '#0A0A12' : '#FAFAF8' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ width:24, height:24, border:`2px solid ${dark?'#333':'#E8E3D5'}`, borderTopColor:'#C850C0', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <WaniWordmark height={16} dark={dark}/>
      </div>
    </div>
  )

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {session ? <Brain session={session}/> : <Login/>}
    </ThemeContext.Provider>
  )
}
