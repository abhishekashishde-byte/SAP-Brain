import { useState, useEffect, useRef } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import { WaniLogo, WaniWordmark } from './Login.jsx'
import { useTheme } from '../App.jsx'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
  getProfile, upsertProfile,
} from '../supabaseClient'

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const T = {
  light: {
    bg:         '#FAFAF8',
    surface:    '#FFFFFF',
    surface2:   '#F5F0FA',
    border:     '#EDEDE8',
    border2:    '#D8D0E8',
    text:       '#1C1C1E',
    text2:      '#3A3A3C',
    text3:      '#8A8A8E',
    text4:      '#AEAEB2',
    sidebar:    'linear-gradient(180deg,#FFFFFF 0%,#FDF8FF 100%)',
    topbar:     'rgba(255,255,255,0.9)',
    inputBg:    '#FAFAF8',
    msgUser:    '#FDF4FF',
    msgUserBdr: '#E8C8F0',
    msgAI:      '#FFFFFF',
    msgAIBdr:   '#EDEDED',
    blob1:      'rgba(200,80,192,0.06)',
    blob2:      'rgba(255,107,53,0.04)',
    bgGrad:     'linear-gradient(160deg, #FDF8FF 0%, #FFF5F0 40%, #FFFBF0 100%)',
  },
  dark: {
    bg:         '#0A0A12',
    surface:    '#12101E',
    surface2:   '#1A1530',
    border:     '#2A2440',
    border2:    '#3A3450',
    text:       '#F0EEF8',
    text2:      '#CBC8DA',
    text3:      '#8E8AAB',
    text4:      '#5E5A7B',
    sidebar:    'linear-gradient(180deg,#12101E 0%,#0E0C1E 100%)',
    topbar:     'rgba(10,10,18,0.85)',
    inputBg:    '#0A0A12',
    msgUser:    '#1E1535',
    msgUserBdr: '#4A2060',
    msgAI:      '#16132A',
    msgAIBdr:   '#2A2440',
    blob1:      'rgba(200,80,192,0.12)',
    blob2:      'rgba(255,107,53,0.08)',
    bgGrad:     'linear-gradient(160deg, #0E0C1E 0%, #120A18 40%, #0C0E18 100%)',
  }
}

const goldGrad = 'linear-gradient(135deg, #C850C0, #FF6B35, #FFCC70)'

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Brain({ session }) {
  const { dark, toggle } = useTheme()
  const t = dark ? T.dark : T.light

  const [profile, setProfile] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [browseModule, setBrowseModule] = useState('PP – Production Planning')

  const scrollRef = useRef(null)

  useEffect(() => {
    if (session?.user?.id) {
      getProfile(session.user.id).then(setProfile)
      loadConversations(session.user.id).then(setConversations)
    }
  }, [session])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView()
  }, [messages, isLoading, isStreaming])

  const handleSend = async () => {
    if (!input.trim() || isLoading || isStreaming) return
    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], module: browseModule })
      })
      const data = await res.json()
      if (data.reply) setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:t.bg, color:t.text, fontFamily:\"'DM Sans', sans-serif\", overflow:'hidden', position:'relative' }}>
      {/* Decorative Blobs */}
      <div style={{ position:'absolute', top:'-10%', left:'-5%', width:'40%', height:'40%', background:t.blob1, filter:'blur(100px)', borderRadius:'50%', zIndex:0 }} />
      <div style={{ position:'absolute', bottom:'-10%', right:'-5%', width:'40%', height:'40%', background:t.blob2, filter:'blur(100px)', borderRadius:'50%', zIndex:0 }} />

      {/* Sidebar */}
      <aside style={{ width:280, background:t.sidebar, borderRight:`1px solid ${t.border}`, display:'flex', flexDirection:'column', zIndex:10 }}>
        <div style={{ padding:'32px 24px' }}>
          <WaniWordmark height={20} dark={dark} />
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 12px' }}>
          {Object.keys(MODULE_META).map(m => (
            <button key={m} onClick={()=>setBrowseModule(m)} style={{ width:'100%', textAlign:'left', padding:'12px 16px', marginBottom:6, borderRadius:14, border:'none', background:browseModule===m?t.surface2:'transparent', color:browseModule===m?t.text:t.text3, cursor:'pointer', fontSize:13, fontWeight:browseModule===m?600:400, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:MODULE_META[m].color }} />
              {MODULE_META[m].label}
            </button>
          ))}
        </div>
        <div style={{ padding:20, borderTop:`1px solid ${t.border}` }}>
          <button onClick={signOut} style={{ width:'100%', padding:'12px', borderRadius:12, border:`1px solid ${t.border}`, background:'transparent', color:t.text3, fontSize:13 }}>Sign Out</button>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:t.bgGrad, position:'relative', zIndex:5 }}>
        <header style={{ height:72, background:t.topbar, backdropFilter:'blur(12px)', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px' }}>
           <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ padding:'4px 10px', borderRadius:8, background:MODULE_META[browseModule].bg, border:`1px solid ${MODULE_META[browseModule].border}`, color:MODULE_META[browseModule].color, fontSize:11, fontWeight:700 }}>{MODULE_META[browseModule].label}</div>
           </div>
        </header>

        <main style={{ flex:1, overflowY:'auto', padding:'40px 0' }}>
          <div style={{ maxWidth:760, margin:'0 auto', padding:'0 24px' }}>
            {messages.length === 0 ? (
              <div style={{ marginTop:'10vh', textAlign:'center' }}>
                <h1 style={{ fontSize:32, fontWeight:700 }}>Consulting Assistant</h1>
                <p style={{ color:t.text3 }}>Select a topic for {browseModule}</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12, marginTop:32 }}>
                  {STARTERS[\"Production Orders\"].map(s => (
                    <button key={s} onClick={()=>handleSend(s)} style={{ padding:20, background:t.surface, border:`1px solid ${t.border}`, borderRadius:20, textAlign:'left', cursor:'pointer' }}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m,i) => (
                <div key={i} style={{ marginBottom:32, display:'flex', flexDirection:m.role==='user'?'row-reverse':'row', gap:16 }}>
                  <div style={{ maxWidth:'80%', padding:'16px 22px', borderRadius:24, background:m.role==='user'?t.msgUser:t.msgAI, border:`1px solid ${m.role==='user'?t.msgUserBdr:t.msgAIBdr}`, color:t.text }}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            <div ref={scrollRef} style={{ height:20 }} />
          </div>
        </main>

        <div style={{ padding:'24px 0 40px' }}>
          <div style={{ maxWidth:760, margin:'0 auto', padding:'0 24px' }}>
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:22, padding:'8px 10px 8px 24px', display:'flex', alignItems:'center', boxShadow:'0 12px 30px rgba(0,0,0,0.06)' }}>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSend()} placeholder=\"Ask a question...\" style={{ flex:1, background:'transparent', border:'none', outline:'none', color:t.text, padding:'12px 0' }} />
              <button onClick={handleSend} style={{ width:44, height:44, borderRadius:16, border:'none', background:goldGrad, color:'white', cursor:'pointer' }}>→</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
