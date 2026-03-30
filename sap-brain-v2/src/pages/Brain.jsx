import { useState, useEffect, useRef, useCallback } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
  getProfile, upsertProfile,
} from '../supabaseClient'

// ─── Helpers ────────────────────────────────────────────────────────────────

const gold = '#B8960C'
const goldGrad = 'linear-gradient(135deg,#C9A84C,#8B6F09)'

const simulateTyping = async (text, setDisplay, signal) => {
  let current = ''
  for (let i = 0; i < text.length; i++) {
    if (signal?.aborted) break
    current += text[i]
    setDisplay(current)
    const c = text[i]
    const delay = '.!?'.includes(c) ? 55 : ',;:'.includes(c) ? 22 : c === '\n' ? 35 : 9
    await new Promise(r => setTimeout(r, delay))
  }
}

const groupConversations = (conversations) => {
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1)
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate()-7)
  const groups = { Today:[], Yesterday:[], 'This Week':[], Earlier:[] }
  conversations.forEach(c => {
    const d = new Date(c.updated_at)
    if (d >= today) groups.Today.push(c)
    else if (d >= yesterday) groups.Yesterday.push(c)
    else if (d >= weekAgo) groups['This Week'].push(c)
    else groups.Earlier.push(c)
  })
  return groups
}

const getInitials = (name, email) => {
  if (name) return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return (email || 'AB')[0].toUpperCase()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ModuleBadge({ module, small }) {
  const meta = MODULE_META[module]
  if (!meta) return null
  return (
    <span style={{
      display:'inline-flex', alignItems:'center',
      padding: small ? '2px 7px' : '3px 9px',
      background: meta.bg, color: meta.color,
      border:`1px solid ${meta.border}`,
      borderRadius:20, fontSize: small ? 10 : 11,
      fontWeight:600, letterSpacing:0.3, flexShrink:0,
    }}>{meta.label}</span>
  )
}

function ConversationItem({ conv, isActive, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const meta = MODULE_META[conv.module]
  return (
    <div
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
      onClick={onClick}
      style={{
        padding:'10px 14px', borderRadius:10, cursor:'pointer',
        background: isActive ? '#FFF8E7' : hovered ? '#FAF8F3' : 'transparent',
        borderLeft: isActive ? `3px solid ${gold}` : '3px solid transparent',
        marginBottom:2, transition:'all 0.15s', position:'relative',
      }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
        {conv.module && <ModuleBadge module={conv.module} small />}
        {conv.is_summarised && (
          <span style={{ fontSize:9, color:'#AEAEB2', background:'#F2F2F7', padding:'1px 5px', borderRadius:10 }}>summarised</span>
        )}
      </div>
      <div style={{
        fontSize:13, fontWeight: isActive ? 600 : 400,
        color: isActive ? '#1C1C1E' : '#3A3A3C',
        lineHeight:1.4,
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        paddingRight: hovered ? 24 : 0,
      }}>{conv.title}</div>
      <div style={{ fontSize:11, color:'#AEAEB2', marginTop:2 }}>
        {conv.topic} · {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
      </div>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(conv.id) }}
          style={{
            position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', cursor:'pointer',
            color:'#AEAEB2', fontSize:16, padding:4, lineHeight:1,
            ':hover':{ color:'#EF4444' }
          }}
        >×</button>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display:'flex', gap:5, alignItems:'center', padding:'14px 18px' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width:7, height:7, borderRadius:'50%', background:gold,
          animation:'typingBounce 1.2s infinite', animationDelay:`${i*0.18}s`, opacity:0.6,
        }}/>
      ))}
    </div>
  )
}

function MessageBubble({ msg, isStreaming, streamingText }) {
  const isUser = msg.role === 'user'
  const content = isStreaming ? streamingText : msg.content

  // Simple inline code highlighting
  const renderContent = (text) => {
    const parts = text.split(/(`[^`]+`)/g)
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} style={{ fontFamily:"'IBM Plex Mono',monospace", background:'rgba(0,0,0,0.06)', padding:'1px 5px', borderRadius:4, fontSize:'0.9em' }}>{part.slice(1,-1)}</code>
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div style={{
      display:'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap:10, alignItems:'flex-start', marginBottom:20,
      animation:'msgSlide 0.25s ease forwards',
    }}>
      {!isUser && (
        <div style={{
          width:32, height:32, borderRadius:10, flexShrink:0,
          background:goldGrad, display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff',
          boxShadow:'0 2px 8px rgba(184,150,12,0.25)', marginTop:2,
        }}>W</div>
      )}
      <div style={{
        maxWidth:'70%',
        background: isUser ? '#FFF8E7' : '#FFFFFF',
        border: isUser ? '1px solid #E8D9A0' : '1px solid #EDEDED',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding:'12px 16px',
        color:'#1C1C1E', fontSize:14, lineHeight:1.7,
        whiteSpace:'pre-wrap', wordBreak:'break-word',
        boxShadow: isUser ? '0 1px 4px rgba(184,150,12,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {renderContent(content)}
        {isStreaming && <span style={{ display:'inline-block', width:2, height:'1em', background:gold, marginLeft:2, animation:'cursorBlink 0.8s infinite', verticalAlign:'middle' }}/>}
      </div>
      {isUser && (
        <div style={{
          width:32, height:32, borderRadius:10, flexShrink:0,
          background:'linear-gradient(135deg,#1E3A5F,#2563EB)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:12, fontWeight:700, color:'#fff', marginTop:2,
        }}>A</div>
      )}
    </div>
  )
}

function NewChatModal({ onClose, onPickTopic, onFreeChat }) {
  const [step, setStep] = useState('choose') // choose | module | topic
  const [selectedModule, setSelectedModule] = useState(null)

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:100,
      animation:'fadeIn 0.2s ease',
    }} onClick={onClose}>
      <div style={{
        background:'#fff', borderRadius:20, padding:32, width:520, maxWidth:'90vw',
        boxShadow:'0 24px 64px rgba(0,0,0,0.12)',
        animation:'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
      }} onClick={e=>e.stopPropagation()}>

        {step === 'choose' && (
          <>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#1C1C1E', marginBottom:6 }}>New Conversation</div>
            <p style={{ fontSize:14, color:'#8A8A8E', marginBottom:24 }}>How would you like to start?</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div onClick={()=>setStep('module')} style={{
                padding:20, borderRadius:14, border:'1.5px solid #E8E3D5',
                cursor:'pointer', transition:'all 0.2s',
                ':hover':{ borderColor:gold }
              }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=gold}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#E8E3D5'}
              >
                <div style={{ fontSize:24, marginBottom:10 }}>🗂</div>
                <div style={{ fontWeight:600, fontSize:14, color:'#1C1C1E', marginBottom:4 }}>Pick a Topic</div>
                <div style={{ fontSize:12, color:'#8A8A8E', lineHeight:1.5 }}>Choose module and topic manually</div>
              </div>
              <div onClick={()=>{ onFreeChat(); onClose() }} style={{
                padding:20, borderRadius:14, border:'1.5px solid #E8E3D5',
                cursor:'pointer', transition:'all 0.2s', background:'#FFFDF5',
              }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=gold; e.currentTarget.style.background='#FFF8E7' }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='#E8E3D5'; e.currentTarget.style.background='#FFFDF5' }}
              >
                <div style={{ fontSize:24, marginBottom:10 }}>✨</div>
                <div style={{ fontWeight:600, fontSize:14, color:'#1C1C1E', marginBottom:4 }}>Ask Freely</div>
                <div style={{ fontSize:12, color:'#8A8A8E', lineHeight:1.5 }}>AI detects module automatically</div>
              </div>
            </div>
          </>
        )}

        {step === 'module' && (
          <>
            <button onClick={()=>setStep('choose')} style={{ background:'none', border:'none', cursor:'pointer', color:'#8A8A8E', fontSize:13, marginBottom:16, display:'flex', alignItems:'center', gap:4, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:600, marginBottom:16 }}>Select Module</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {Object.keys(TOPICS).map(mod => {
                const meta = MODULE_META[mod]
                return (
                  <div key={mod} onClick={()=>{ setSelectedModule(mod); setStep('topic') }}
                    style={{
                      padding:'12px 16px', borderRadius:12, border:`1.5px solid ${meta.border}`,
                      background:meta.bg, cursor:'pointer', display:'flex', alignItems:'center', gap:12,
                      transition:'all 0.15s',
                    }}
                    onMouseEnter={e=>e.currentTarget.style.transform='translateX(4px)'}
                    onMouseLeave={e=>e.currentTarget.style.transform='translateX(0)'}
                  >
                    <span style={{ width:28, height:28, borderRadius:8, background:meta.color, color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{meta.label}</span>
                    <span style={{ fontSize:14, fontWeight:500, color:'#1C1C1E' }}>{mod}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {step === 'topic' && selectedModule && (
          <>
            <button onClick={()=>setStep('module')} style={{ background:'none', border:'none', cursor:'pointer', color:'#8A8A8E', fontSize:13, marginBottom:16, display:'flex', alignItems:'center', gap:4, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:600, marginBottom:4 }}>Select Topic</div>
            <div style={{ fontSize:13, color:'#8A8A8E', marginBottom:16 }}>{selectedModule}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {TOPICS[selectedModule].map(topic => (
                <div key={topic} onClick={()=>{ onPickTopic(selectedModule, topic); onClose() }}
                  style={{
                    padding:'8px 14px', borderRadius:20, border:'1.5px solid #E8E3D5',
                    cursor:'pointer', fontSize:13, color:'#3A3A3C',
                    transition:'all 0.15s',
                  }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=gold; e.currentTarget.style.background='#FFF8E7'; e.currentTarget.style.color='#1C1C1E' }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='#E8E3D5'; e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#3A3A3C' }}
                >{topic}</div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ProfileModal({ session, profile, onClose, onSave, onSignOut }) {
  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const initials = getInitials(name, session.user.email)

  const handleSave = async () => {
    setSaving(true)
    await onSave({ name })
    setSaving(false)
    onClose()
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:100,
    }} onClick={onClose}>
      <div style={{
        background:'#fff', borderRadius:20, padding:32, width:380, maxWidth:'90vw',
        boxShadow:'0 24px 64px rgba(0,0,0,0.12)',
        animation:'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
      }} onClick={e=>e.stopPropagation()}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{
            width:72, height:72, borderRadius:'50%',
            background:goldGrad, color:'#fff',
            fontSize:26, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 12px',
            boxShadow:'0 4px 16px rgba(184,150,12,0.3)',
          }}>{initials}</div>
          <div style={{ fontSize:13, color:'#8A8A8E' }}>{session.user.email}</div>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#8A8A8E', marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>Display Name</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            style={{
              width:'100%', padding:'11px 14px', border:'1.5px solid #E8E3D5',
              borderRadius:10, fontSize:14, fontFamily:"'DM Sans',sans-serif", color:'#1C1C1E',
              outline:'none', background:'#FAFAF8',
            }}
            onFocus={e=>e.target.style.borderColor=gold}
            onBlur={e=>e.target.style.borderColor='#E8E3D5'}
          />
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          width:'100%', padding:12, background:goldGrad,
          border:'none', borderRadius:10, color:'#fff', fontSize:14, fontWeight:600,
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:10,
        }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>

        <button onClick={onSignOut} style={{
          width:'100%', padding:12, background:'none',
          border:'1.5px solid #E8E3D5', borderRadius:10, color:'#636366', fontSize:14,
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
        }}>Sign Out</button>
      </div>
    </div>
  )
}

// ─── Main Brain Component ─────────────────────────────────────────────────────

export default function Brain({ session }) {
  const [conversations, setConversations]   = useState([])
  const [activeConvId, setActiveConvId]     = useState(null)
  const [input, setInput]                   = useState('')
  const [isLoading, setIsLoading]           = useState(false)
  const [isStreaming, setIsStreaming]        = useState(false)
  const [streamingText, setStreamingText]   = useState('')
  const [dbLoading, setDbLoading]           = useState(true)
  const [showNewChat, setShowNewChat]        = useState(false)
  const [pendingModule, setPendingModule]   = useState(null)
  const [pendingTopic, setPendingTopic]     = useState(null)
  const [searchQuery, setSearchQuery]       = useState('')
  const [showProfile, setShowProfile]       = useState(false)
  const [profile, setProfile]               = useState(null)
  const [showSummarise, setShowSummarise]   = useState(false)
  const [isSummarising, setIsSummarising]   = useState(false)
  const [sidebarOpen, setSidebarOpen]       = useState(true)

  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)
  const abortRef    = useRef(null)

  const activeConv  = conversations.find(c => c.id === activeConvId)
  const messages    = activeConv?.messages || []

  const filteredConvs = conversations.filter(c => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.title?.toLowerCase().includes(q)
      || c.module?.toLowerCase().includes(q)
      || c.topic?.toLowerCase().includes(q)
      || c.messages?.some(m => m.content?.toLowerCase().includes(q))
  })

  const groups = groupConversations(filteredConvs)

  // Load data
  useEffect(() => {
    Promise.all([
      loadConversations(session.user.id),
      getProfile(session.user.id),
    ]).then(([convs, prof]) => {
      setConversations(convs)
      setProfile(prof)
      setDbLoading(false)
    })
  }, [session])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages, streamingText])

  // Summarise warning
  useEffect(() => {
    if (messages.length >= SUMMARISE_THRESHOLD && !showSummarise) {
      setShowSummarise(true)
    }
  }, [messages.length])

  // Focus input when conversation changes
  useEffect(() => {
    if (activeConvId) inputRef.current?.focus()
  }, [activeConvId])

  const startNewConversation = (mod, topic) => {
    setActiveConvId(null)
    setPendingModule(mod || null)
    setPendingTopic(topic || null)
    setShowSummarise(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading || isStreaming) return

    const msgText = input.trim()
    const userMsg = { role:'user', content:msgText }
    setInput('')
    setIsLoading(true)

    let convId = activeConvId
    let currentMod = activeConv?.module || pendingModule
    let currentTopic = activeConv?.topic || pendingTopic
    let currentMsgs = [...messages, userMsg]

    // If no active conversation, create one immediately
    if (!convId) {
      const title = msgText.length > 50 ? msgText.slice(0,47)+'…' : msgText
      const newConv = await createConversation(session.user.id, {
        title, module: currentMod, topic: currentTopic, messages: [userMsg]
      })
      convId = newConv.id
      currentMsgs = [userMsg]
      setConversations(prev => [newConv, ...prev])
      setActiveConvId(newConv.id)
      setPendingModule(null)
      setPendingTopic(null)
    } else {
      await updateConversation(convId, { messages: currentMsgs })
      setConversations(prev => prev.map(c => c.id===convId ? {...c, messages:currentMsgs} : c))
    }

    // Get AI response
    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ messages:currentMsgs, module:currentMod, topic:currentTopic }),
      })
      const { reply, error } = await res.json()
      if (error) throw new Error(error)

      setIsLoading(false)

      // Stream the response with typing effect
      setIsStreaming(true)
      abortRef.current = new AbortController()
      await simulateTyping(reply, setStreamingText, abortRef.current.signal)
      setIsStreaming(false)
      setStreamingText('')

      const finalMsgs = [...currentMsgs, { role:'assistant', content:reply }]
      await updateConversation(convId, { messages:finalMsgs })
      setConversations(prev => prev.map(c => c.id===convId ? {...c, messages:finalMsgs, updated_at:new Date().toISOString()} : c))

      // Auto-categorise if no module was set (free mode, first message)
      if (!currentMod && currentMsgs.length === 1) {
        fetch('/api/categorise', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ message:msgText })
        }).then(r=>r.json()).then(({ module, topic, title }) => {
          if (module) {
            updateConversation(convId, { module, topic, title })
            setConversations(prev => prev.map(c => c.id===convId ? {...c, module, topic, title} : c))
          }
        }).catch(()=>{})
      }

    } catch (err) {
      setIsLoading(false)
      setIsStreaming(false)
      setStreamingText('')
      const errMsg = { role:'assistant', content:'Error reaching AI. Please try again.' }
      const errMsgs = [...currentMsgs, errMsg]
      setConversations(prev => prev.map(c => c.id===convId ? {...c, messages:errMsgs} : c))
    }
  }

  const handleSummarise = async () => {
    if (!activeConvId || isSummarising) return
    setIsSummarising(true)
    try {
      const res = await fetch('/api/summarise', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ messages, module:activeConv.module, topic:activeConv.topic }),
      })
      const { summary } = await res.json()
      const summaryMsg = { role:'assistant', content:`📋 **Conversation Summary**\n\n${summary}\n\n---\n*Conversation summarised. Continuing from here.*` }
      const newMsgs = [summaryMsg]
      await updateConversation(activeConvId, { messages:newMsgs, is_summarised:true, summary })
      setConversations(prev => prev.map(c => c.id===activeConvId ? {...c, messages:newMsgs, is_summarised:true} : c))
      setShowSummarise(false)
    } catch {}
    setIsSummarising(false)
  }

  const handleDelete = async (id) => {
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id!==id))
    if (activeConvId === id) setActiveConvId(null)
  }

  const handleSaveProfile = async (updates) => {
    await upsertProfile(session.user.id, updates)
    setProfile(prev => ({ ...prev, ...updates }))
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const isNewChat = !activeConvId

  return (
    <div style={{ display:'flex', height:'100vh', background:'#FAFAF8', fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        @keyframes msgSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .sidebar-btn:hover { background:#FFF8E7 !important; }
        .send-btn:hover:not(:disabled) { transform:scale(0.96); opacity:0.88; }
        .icon-btn:hover { background:#F5F0E8 !important; }
        textarea:focus { outline:none; }
        input:focus { outline:none; }
      `}</style>

      {/* ── Sidebar */}
      <div style={{
        width: sidebarOpen ? 264 : 0, minWidth: sidebarOpen ? 264 : 0,
        background:'#FFFFFF', borderRight:'1px solid #EDEDE8',
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition:'all 0.25s ease', flexShrink:0,
      }}>
        {/* Header */}
        <div style={{ padding:'20px 16px 14px', borderBottom:'1px solid #F0EDE5' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <div style={{
              width:36, height:36, borderRadius:10, background:goldGrad,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:700, color:'#fff',
              boxShadow:'0 2px 8px rgba(184,150,12,0.25)',
            }}>W</div>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:600, background:goldGrad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Wani</span>
          </div>

          {/* New Chat button */}
          <button onClick={()=>setShowNewChat(true)} style={{
            width:'100%', padding:'10px 14px',
            background:goldGrad, border:'none', borderRadius:10,
            color:'#fff', fontSize:13, fontWeight:600,
            cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:'0 2px 10px rgba(184,150,12,0.25)',
            transition:'all 0.2s',
          }}
            onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(184,150,12,0.35)'; e.currentTarget.style.transform='translateY(-1px)' }}
            onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 2px 10px rgba(184,150,12,0.25)'; e.currentTarget.style.transform='translateY(0)' }}
          >
            <span style={{ fontSize:18, lineHeight:1 }}>+</span> New Conversation
          </button>
        </div>

        {/* Search */}
        <div style={{ padding:'12px 16px 8px' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#AEAEB2', fontSize:14 }}>🔍</span>
            <input
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              style={{
                width:'100%', padding:'8px 10px 8px 32px',
                border:'1.5px solid #EDEDE8', borderRadius:10,
                fontSize:13, color:'#1C1C1E', background:'#FAFAF8',
                fontFamily:"'DM Sans',sans-serif", transition:'border-color 0.2s',
              }}
              onFocus={e=>e.target.style.borderColor=gold}
              onBlur={e=>e.target.style.borderColor='#EDEDE8'}
            />
          </div>
        </div>

        {/* Conversations */}
        <div style={{ flex:1, overflowY:'auto', padding:'4px 8px 8px' }}>
          {dbLoading ? (
            <div style={{ padding:20, textAlign:'center' }}>
              <div style={{ width:20, height:20, border:'2px solid #E8E3D5', borderTopColor:gold, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 8px' }}/>
              <span style={{ fontSize:12, color:'#AEAEB2' }}>Loading...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding:'24px 16px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
              <p style={{ fontSize:12, color:'#AEAEB2', lineHeight:1.6 }}>No conversations yet.<br/>Start one above.</p>
            </div>
          ) : (
            Object.entries(groups).map(([group, convs]) => convs.length === 0 ? null : (
              <div key={group}>
                <div style={{ fontSize:10, fontWeight:600, color:'#AEAEB2', letterSpacing:0.8, textTransform:'uppercase', padding:'12px 6px 4px' }}>{group}</div>
                {convs.map(conv => (
                  <ConversationItem
                    key={conv.id} conv={conv}
                    isActive={conv.id === activeConvId}
                    onClick={()=>{ setActiveConvId(conv.id); setShowSummarise(false) }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Profile */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid #F0EDE5' }}>
          <div
            onClick={()=>setShowProfile(true)}
            className="sidebar-btn"
            style={{
              display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
              borderRadius:10, cursor:'pointer', transition:'background 0.15s',
            }}
          >
            <div style={{
              width:32, height:32, borderRadius:'50%', background:goldGrad,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700, color:'#fff', flexShrink:0,
            }}>
              {getInitials(profile?.name, session.user.email)}
            </div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontSize:13, fontWeight:500, color:'#1C1C1E', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {profile?.name || 'My Profile'}
              </div>
              <div style={{ fontSize:11, color:'#AEAEB2', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {session.user.email}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main area */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Top bar */}
        <div style={{
          padding:'14px 20px', borderBottom:'1px solid #EDEDE8',
          display:'flex', alignItems:'center', gap:12, background:'#FFFFFF',
          flexShrink:0,
        }}>
          <button
            className="icon-btn"
            onClick={()=>setSidebarOpen(!sidebarOpen)}
            style={{ background:'none', border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:8, fontSize:16, color:'#636366', transition:'background 0.15s' }}
          >☰</button>

          {activeConv ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
              <ModuleBadge module={activeConv.module} />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:600, color:'#1C1C1E', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {activeConv.title}
                </div>
                <div style={{ fontSize:11, color:'#AEAEB2' }}>{activeConv.topic}</div>
              </div>
            </div>
          ) : isNewChat && (pendingModule || pendingTopic) ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
              {pendingModule && <ModuleBadge module={pendingModule} />}
              <div style={{ fontSize:15, fontWeight:500, color:'#3A3A3C' }}>{pendingTopic || pendingModule}</div>
            </div>
          ) : (
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:500, color:'#AEAEB2' }}>
                {isNewChat ? 'New Conversation' : 'Select a conversation'}
              </div>
            </div>
          )}

          {isNewChat && pendingModule && (
            <button onClick={()=>{ setPendingModule(null); setPendingTopic(null) }} style={{
              background:'none', border:'1px solid #E8E3D5', borderRadius:8,
              padding:'5px 10px', fontSize:12, color:'#8A8A8E', cursor:'pointer',
              fontFamily:"'DM Sans',sans-serif",
            }}>Clear</button>
          )}
        </div>

        {/* Summarise warning */}
        {showSummarise && activeConv && (
          <div style={{
            background:'#FFF8E7', borderBottom:'1px solid #E8D9A0',
            padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
            fontSize:13, flexShrink:0,
          }}>
            <span style={{ color:'#92700A' }}>⚡ This conversation is getting long. Summarise to free up context?</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleSummarise} disabled={isSummarising} style={{
                padding:'5px 12px', background:goldGrad, border:'none', borderRadius:8,
                color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",
              }}>
                {isSummarising ? 'Summarising…' : 'Summarise & Continue'}
              </button>
              <button onClick={()=>setShowSummarise(false)} style={{
                padding:'5px 12px', background:'none', border:'1px solid #E8D9A0', borderRadius:8,
                color:'#92700A', fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              }}>Dismiss</button>
            </div>
          </div>
        )}

        {/* Chat area */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
          <div style={{ maxWidth:740, margin:'0 auto' }}>

            {/* Empty state */}
            {!activeConv && !isStreaming ? (
              <div style={{
                display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', height:'calc(100vh - 200px)',
                textAlign:'center', animation:'fadeIn 0.4s ease',
              }}>
                <div style={{
                  width:64, height:64, borderRadius:18, background:goldGrad,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:24, color:'#fff', marginBottom:20,
                  boxShadow:'0 8px 24px rgba(184,150,12,0.25)',
                }}>W</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:600, color:'#1C1C1E', marginBottom:8 }}>
                  {pendingModule ? `${MODULE_META[pendingModule]?.label} · ${pendingTopic || pendingModule}` : 'Wani'}
                </div>
                <p style={{ fontSize:14, color:'#8A8A8E', maxWidth:360, lineHeight:1.7, marginBottom:28 }}>
                  {pendingModule
                    ? `Ask anything about ${pendingTopic || pendingModule}. Technical, precise answers.`
                    : 'Your private SAP knowledge base. Ask anything about PP, PM, MM, Fiori, or S/4HANA.'}
                </p>

                {/* Starter suggestions */}
                {pendingTopic && STARTERS[pendingTopic] && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:480 }}>
                    {STARTERS[pendingTopic].map((s,i) => (
                      <div key={i} onClick={()=>setInput(s)} style={{
                        padding:'8px 14px', background:'#FFFFFF', border:'1.5px solid #EDEDE8',
                        borderRadius:20, fontSize:12, color:'#636366', cursor:'pointer',
                        transition:'all 0.15s',
                      }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor=gold; e.currentTarget.style.color='#1C1C1E'; e.currentTarget.style.background='#FFF8E7' }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor='#EDEDE8'; e.currentTarget.style.color='#636366'; e.currentTarget.style.background='#FFFFFF' }}
                      >{s}</div>
                    ))}
                  </div>
                )}

                {!pendingModule && (
                  <button onClick={()=>setShowNewChat(true)} style={{
                    padding:'12px 24px', background:goldGrad, border:'none', borderRadius:12,
                    color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer',
                    fontFamily:"'DM Sans',sans-serif",
                    boxShadow:'0 4px 16px rgba(184,150,12,0.25)',
                  }}>+ Start New Conversation</button>
                )}
              </div>
            ) : (
              /* Messages */
              <>
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} isStreaming={false} streamingText="" />
                ))}
                {isLoading && !isStreaming && (
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:20 }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:goldGrad, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0, boxShadow:'0 2px 8px rgba(184,150,12,0.25)' }}>W</div>
                    <div style={{ background:'#FFFFFF', border:'1px solid #EDEDED', borderRadius:'4px 16px 16px 16px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
                {isStreaming && (
                  <MessageBubble
                    msg={{ role:'assistant', content:'' }}
                    isStreaming={true}
                    streamingText={streamingText}
                  />
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </div>

        {/* Input area */}
        <div style={{
          padding:'14px 20px 18px', borderTop:'1px solid #EDEDE8', background:'#FFFFFF', flexShrink:0,
        }}>
          <div style={{ maxWidth:740, margin:'0 auto' }}>
            <div style={{
              display:'flex', gap:10, alignItems:'flex-end',
              background:'#FAFAF8', border:'1.5px solid #EDEDE8',
              borderRadius:14, padding:'10px 12px',
              transition:'border-color 0.2s, box-shadow 0.2s',
            }}
              onFocusCapture={e=>{ e.currentTarget.style.borderColor=gold; e.currentTarget.style.boxShadow=`0 0 0 3px rgba(184,150,12,0.08)` }}
              onBlurCapture={e=>{ e.currentTarget.style.borderColor='#EDEDE8'; e.currentTarget.style.boxShadow='none' }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); handleSend() } }}
                placeholder={pendingModule ? `Ask about ${pendingTopic || pendingModule}…` : 'Ask any SAP question… (Enter to send, Shift+Enter for new line)'}
                rows={1}
                style={{
                  flex:1, background:'transparent', border:'none', resize:'none',
                  fontSize:14, color:'#1C1C1E', fontFamily:"'DM Sans',sans-serif",
                  lineHeight:1.6, maxHeight:120, overflowY:'auto', padding:0,
                  outline:'none',
                }}
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!input.trim() || isLoading || isStreaming}
                style={{
                  width:36, height:36, borderRadius:10, border:'none', flexShrink:0,
                  background: input.trim() && !isLoading && !isStreaming ? goldGrad : '#E8E3D5',
                  color: input.trim() && !isLoading && !isStreaming ? '#fff' : '#AEAEB2',
                  cursor: input.trim() && !isLoading && !isStreaming ? 'pointer' : 'not-allowed',
                  fontSize:16, display:'flex', alignItems:'center', justifyContent:'center',
                  transition:'all 0.2s',
                }}
              >→</button>
            </div>
            <div style={{ fontSize:11, color:'#CBCACC', textAlign:'right', marginTop:6 }}>
              {pendingModule ? `AI mode · ${pendingModule}` : activeConv?.module ? activeConv.module : 'Free mode · AI will detect topic'}
              {' · '}Standard SAP — verify system-specific behaviour
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals */}
      {showNewChat && (
        <NewChatModal
          onClose={()=>setShowNewChat(false)}
          onPickTopic={(mod, topic)=>startNewConversation(mod, topic)}
          onFreeChat={()=>startNewConversation(null, null)}
        />
      )}
      {showProfile && (
        <ProfileModal
          session={session}
          profile={profile}
          onClose={()=>setShowProfile(false)}
          onSave={handleSaveProfile}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  )
}
