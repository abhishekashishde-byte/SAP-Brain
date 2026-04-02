import { useState, useEffect, useRef } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import { WaniLogo, WaniWordmark } from './Login.jsx'
import { useTheme } from '../App.jsx'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
  getProfile, upsertProfile,
} from '../supabaseClient'

// ─── Theme tokens (KEEPING YOUR EXACT DESIGN) ────────────────────────────────
const T = {
  light: {
    bg: '#FAFAF8', surface: '#FFFFFF', surface2: '#F5F0FA', border: '#EDEDE8', text: '#1C1C1E',
    msgUser: '#FDF4FF', msgUserBdr: '#E8C8F0', msgAI: '#FFFFFF', msgAIBdr: '#EDEDED',
    bgGrad: 'linear-gradient(160deg,#FDF8FF 0%,#FFF5F0 40%,#FFFBF0 100%)',
  },
  dark: {
    bg: '#0A0A12', surface: '#12101E', surface2: '#1A1530', border: '#2A2440', text: '#F0EEF8',
    msgUser: '#1E1535', msgUserBdr: '#4A2060', msgAI: '#16132A', msgAIBdr: '#2A2440',
    bgGrad: 'linear-gradient(160deg,#0E0C1E 0%,#120A18 40%,#0C0E18 100%)',
  }
}

const goldGrad = 'linear-gradient(135deg,#C850C0,#FF6B35,#FFCC70)'

export default function Brain({ session }) {
  const { dark } = useTheme()
  const t = dark ? T.dark : T.light
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeModule, setActiveModule] = useState('PP – Production Planning')
  const scrollRef = useRef(null)

  // FIX 1: Smooth Auto-Scroll (No jumping)
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async (text = input) => {
    if (!text.trim() || loading) return
    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], module: activeModule })
      })
      const data = await res.json()
      if (data.reply) setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: t.bg, color: t.text, overflow: 'hidden' }}>
      
      {/* FIX 2: Modern Animation Keyframes */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .message-entry { animation: slideIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .sidebar-item { transition: all 0.2s ease; }
        .sidebar-item:hover { transform: translateX(4px); }
      `}</style>

      {/* SIDEBAR (Your Original Style) */}
      <aside style={{ width: 280, borderRight: `1px solid ${t.border}`, background: t.surface, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px' }}>
          <WaniWordmark height={18} dark={dark} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {Object.keys(MODULE_META).map(m => (
            <button key={m} onClick={() => setActiveModule(m)} className="sidebar-item"
              style={{
                width: '100%', textAlign: 'left', padding: '12px', marginBottom: 6, borderRadius: 12, border: 'none',
                background: activeModule === m ? t.surface2 : 'transparent',
                color: activeModule === m ? t.text : t.text3, cursor: 'pointer', fontSize: 13, fontWeight: activeModule === m ? 600 : 400
              }}>
              <span style={{ color: MODULE_META[m].color, marginRight: 10 }}>●</span>
              {MODULE_META[m].label}
            </button>
          ))}
        </div>
      </aside>

      {/* CHAT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.bgGrad }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px 20px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            {messages.length === 0 ? (
              <div className="message-entry">
                <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Ready for SAP {activeModule.split(' ')[0]}?</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {STARTERS["Production Orders"].map(s => (
                    <button key={s} onClick={() => handleSend(s)} style={{ padding: 16, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, textAlign: 'left', cursor: 'pointer', fontSize: 14 }}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className="message-entry" style={{ marginBottom: 24, display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 12 }}>
                  <div style={{ 
                    maxWidth: '80%', padding: '14px 18px', borderRadius: 18, fontSize: 15,
                    background: m.role === 'user' ? t.msgUser : t.msgAI,
                    border: `1px solid ${m.role === 'user' ? t.msgUserBdr : t.msgAIBdr}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                  }}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        {/* INPUT BOX */}
        <div style={{ padding: '20px 0', borderTop: `1px solid ${t.border}`, background: t.surface }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 12 }}>
            <input 
              value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Query SAP database..."
              style={{ flex: 1, padding: '14px 20px', borderRadius: 14, border: `1px solid ${t.border}`, background: t.bg, outline: 'none', color: t.text }}
            />
            <button onClick={() => handleSend()} style={{ background: goldGrad, color: 'white', border: 'none', padding: '0 24px', borderRadius: 14, fontWeight: 700, cursor: 'pointer' }}>Send</button>
          </div>
        </div>
      </main>
    </div>
  )
}
