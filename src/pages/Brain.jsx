import { useState, useEffect, useRef } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import { WaniLogo, WaniWordmark } from './Login.jsx'
import { useTheme } from '../App.jsx'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
  getProfile, upsertProfile,
} from '../supabaseClient'

// ─── Your Original Theme Tokens ───────────────────────────────────────────
const T = {
  light: {
    bg: '#FAFAF8', surface: '#FFFFFF', surface2: '#F5F0FA', border: '#EDEDE8', border2: '#D8D0E8',
    text: '#1C1C1E', text2: '#3A3A3C', text3: '#8A8A8E', text4: '#AEAEB2',
    sidebar: 'linear-gradient(180deg,#FFFFFF 0%,#FDF8FF 100%)', topbar: 'rgba(255,255,255,0.9)',
    inputBg: '#FAFAF8', msgUser: '#FDF4FF', msgUserBdr: '#E8C8F0', msgAI: '#FFFFFF', msgAIBdr: '#EDEDED',
    blob1: 'rgba(200,80,192,0.06)', blob2: 'rgba(255,107,53,0.04)',
    bgGrad: 'linear-gradient(160deg, #FDF8FF 0%, #FFF5F0 40%, #FFFBF0 100%)',
  },
  dark: {
    bg: '#0A0A12', surface: '#12101E', surface2: '#1A1530', border: '#2A2440', border2: '#3A3450',
    text: '#F0EEF8', text2: '#CBC8DA', text3: '#8E8AAB', text4: '#5E5A7B',
    sidebar: 'linear-gradient(180deg,#12101E 0%,#0E0C1E 100%)', topbar: 'rgba(10,10,18,0.85)',
    inputBg: '#0A0A12', msgUser: '#1E1535', msgUserBdr: '#4A2060', msgAI: '#16132A', msgAIBdr: '#2A2440',
    blob1: 'rgba(200,80,192,0.12)', blob2: 'rgba(255,107,53,0.08)',
    bgGrad: 'linear-gradient(160deg, #0E0C1E 0%, #120A18 40%, #0C0E18 100%)',
  }
}
const goldGrad = 'linear-gradient(135deg, #C850C0, #FF6B35, #FFCC70)'

export default function Brain({ session }) {
  const { dark } = useTheme()
  const t = dark ? T.dark : T.light
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeModule, setActiveModule] = useState('PP – Production Planning')
  const scrollRef = useRef(null)

  // FIX: Liquid Smooth Scrolling
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], module: activeModule })
      })
      const data = await res.json()
      if (data.reply) setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e) { console.error(e) } finally { setIsLoading(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: t.bg, color: t.text, fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', position: 'relative' }}>
      
      {/* ANIMATION STYLES */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-msg { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .sidebar-btn { transition: all 0.2s ease; }
        .sidebar-btn:hover { background: ${t.surface2} !important; transform: translateX(4px); }
      `}</style>

      {/* SIDEBAR */}
      <aside style={{ width: 280, background: t.sidebar, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: '32px 24px' }}>
          <WaniWordmark height={20} dark={dark} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {Object.keys(MODULE_META).map(m => (
            <button key={m} onClick={() => setActiveModule(m)} className="sidebar-btn"
              style={{
                width: '100%', textAlign: 'left', padding: '12px 16px', marginBottom: 6, borderRadius: 14, border: 'none',
                background: activeModule === m ? t.surface2 : 'transparent',
                color: activeModule === m ? t.text : t.text3, cursor: 'pointer', fontSize: 13, fontWeight: activeModule === m ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 12
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: MODULE_META[m].color }} />
              {MODULE_META[m].label}
            </button>
          ))}
        </div>
        <div style={{ padding: 20, borderTop: `1px solid ${t.border}` }}>
          <button onClick={() => signOut()} style={{ width: '100%', padding: '12px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'transparent', color: t.text3, fontSize: 13, cursor: 'pointer' }}>Sign Out</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bgGrad, position: 'relative' }}>
        {/* TOPBAR */}
        <header style={{ height: 72, background: t.topbar, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: '4px 10px', borderRadius: 8, background: MODULE_META[activeModule].bg, border: `1px solid ${MODULE_META[activeModule].border}`, color: MODULE_META[activeModule].color, fontSize: 11, fontWeight: 700 }}>{MODULE_META[activeModule].label}</div>
            <span style={{ fontSize: 14, fontWeight: 500, color: t.text2 }}>Technical Workspace</span>
          </div>
        </header>

        {/* CHAT FEED */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {messages.length === 0 ? (
              <div className="animate-msg" style={{ marginTop: '10vh', textAlign: 'center' }}>
                <WaniLogo size={64} dark={dark} />
                <h1 style={{ fontSize: 32, fontWeight: 700, margin: '24px 0 8px', letterSpacing: '-0.5px' }}>Consulting Assistant</h1>
                <p style={{ color: t.text3, fontSize: 16, marginBottom: 40 }}>How can I help with your SAP {activeModule.split(' ')[0]} tasks today?</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                  {STARTERS["Production Orders"].map(s => (
                    <button key={s} onClick={() => handleSend(s)} style={{ padding: '20px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 20, textAlign: 'left', cursor: 'pointer', fontSize: 14, color: t.text2, transition: 'all 0.2s' }}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className="animate-msg" style={{ marginBottom: 32, display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 16 }}>
                  <div style={{ 
                    maxWidth: '80%', padding: '16px 22px', borderRadius: 24, fontSize: 15, lineHeight: 1.6,
                    background: m.role === 'user' ? t.msgUser : t.msgAI,
                    border: `1px solid ${m.role === 'user' ? t.msgUserBdr : t.msgAIBdr}`,
                    color: t.text, boxShadow: '0 4px 15px rgba(0,0,0,0.02)',
                    borderBottomRightRadius: m.role === 'user' ? 4 : 24, borderBottomLeftRadius: m.role === 'user' ? 24 : 4
                  }}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {isLoading && <div style={{ color: t.text4, fontSize: 13, marginLeft: 8, fontStyle: 'italic' }}>Consultant is typing...</div>}
            <div ref={scrollRef} style={{ height: 20 }} />
          </div>
        </div>

        {/* INPUT BOX */}
        <div style={{ padding: '24px 0 40px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px' }}>
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 22, padding: '8px 10px 8px 24px', display: 'flex', alignItems: 'center', boxShadow: '0 12px 30px rgba(0,0,0,0.06)', gap: 12 }}>
              <input 
                value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask about T-codes, tables, or logic..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: t.text, fontSize: 15, outline: 'none', padding: '12px 0' }}
              />
              <button onClick={handleSend} style={{ width: 44, height: 44, borderRadius: 16, border: 'none', background: goldGrad, color: 'white', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>→</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
