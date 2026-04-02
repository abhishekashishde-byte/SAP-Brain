import React, { useState, useEffect, useRef } from 'react'
import { supabase, signOut, loadConversations, createConversation, updateConversation, deleteConversation } from '../supabaseClient'
import { TOPICS, MODULE_META, STARTERS } from '../constants'
import { WaniLogo, WaniWordmark } from './Login'

export default function Brain({ session }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeModule, setActiveModule] = useState('PP – Production Planning')
  const [activeTopic, setActiveTopic] = useState('Production Orders')
  const scrollRef = useRef(null)

  // FIX: Smooth Glide Scrolling
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
        body: JSON.stringify({ messages: [...messages, userMsg], module: activeModule, topic: activeTopic })
      })
      const data = await res.json()
      if (data.reply) setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0F172A', color: '#F8FAFC', fontFamily: 'sans-serif' }}>
      {/* MODERN CSS ANIMATIONS */}
      <style>{`
        @keyframes floatUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .msg-animate { animation: floatUp 0.4s ease-out forwards; }
        .sap-card { transition: all 0.2s; border: 1px solid rgba(255,255,255,0.05); }
        .sap-card:hover { border-color: #3B82F6; background: rgba(59, 130, 246, 0.05); }
      `}</style>

      {/* LEFT SIDEBAR */}
      <aside style={{ width: 280, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', background: '#111827' }}>
        <div style={{ padding: 24 }}>
          <WaniWordmark height={18} dark={true} />
          <p style={{ fontSize: 10, color: '#64748B', marginTop: 8, letterSpacing: 1 }}>SAP CONSULTANT AI</p>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {Object.keys(MODULE_META).map(m => (
            <button 
              key={m}
              onClick={() => setActiveModule(m)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 4, borderRadius: 8, border: 'none',
                background: activeModule === m ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: activeModule === m ? '#60A5FA' : '#94A3B8', fontSize: 13, cursor: 'pointer'
              }}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: MODULE_META[m].color, marginRight: 10 }} />
              {MODULE_META[m].label} Module
            </button>
          ))}
        </div>

        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={() => signOut()} style={{ width: '100%', padding: 10, background: 'transparent', border: '1px solid #334155', color: '#94A3B8', borderRadius: 6 }}>Sign Out</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <header style={{ height: 64, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', px: 24, padding: '0 24px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)' }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', color: MODULE_META[activeModule].color }}>{activeModule}</span>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '40px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {messages.length === 0 ? (
              <div className="msg-animate">
                <h1 style={{ fontSize: 32, fontWeight: 300, marginBottom: 8 }}>How can I assist?</h1>
                <p style={{ color: '#64748B', marginBottom: 32 }}>Select a starting point for the {activeModule} module.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {(STARTERS[activeTopic] || STARTERS["Production Orders"]).map(s => (
                    <button key={s} onClick={() => handleSend(s)} className="sap-card" style={{ padding: 16, background: '#1E293B', borderRadius: 12, color: '#CBD5E1', textAlign: 'left', fontSize: 14, cursor: 'pointer' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className="msg-animate" style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ 
                    maxWidth: '85%', padding: '16px 20px', borderRadius: 16, fontSize: 15, lineHeight: 1.6,
                    background: m.role === 'user' ? '#2563EB' : '#1E293B',
                    color: '#FFFFFF',
                    borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                    borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                  }}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {loading && <div style={{ color: '#64748B', fontSize: 12, fontStyle: 'italic' }}>Wani is analyzing...</div>}
            <div ref={scrollRef} />
          </div>
        </div>

        {/* INPUT AREA */}
        <div style={{ padding: '24px 0', background: 'linear-gradient(transparent, #0F172A 20%)' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px' }}>
            <div style={{ background: '#1E293B', borderRadius: 16, padding: '8px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <input 
                value={input} 
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask a technical SAP question..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '12px 0', fontSize: 15, outline: 'none' }}
              />
              <button onClick={() => handleSend()} style={{ background: '#2563EB', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>Send</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
