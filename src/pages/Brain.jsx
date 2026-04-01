import { useState, useEffect, useRef } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import { WaniLogo } from './Login.jsx'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
  getProfile, upsertProfile,
} from '../supabaseClient'

// ─── Constants ───────────────────────────────────────────────────────────────
const gold = '#C850C0'
const goldGrad = 'linear-gradient(135deg,#C850C0,#FF6B35,#FFCC70)'

const MODULE_COLORS = {
  "PP – Production Planning": { from:'#16a34a', to:'#059669', light:'#f0fdf4', border:'#86efac', emoji:'⚙️' },
  "PM – Plant Maintenance":   { from:'#4f46e5', to:'#7c3aed', light:'#eef2ff', border:'#a5b4fc', emoji:'🔧' },
  "MM – Logistics":           { from:'#ea580c', to:'#dc2626', light:'#fff7ed', border:'#fdba74', emoji:'📦' },
  "Fiori / UX":               { from:'#0284c7', to:'#0369a1', light:'#f0f9ff', border:'#7dd3fc', emoji:'◻️' },
  "S/4HANA General":          { from:'#b45309', to:'#92400e', light:'#fefce8', border:'#fde68a', emoji:'◈' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const simulateTyping = async (text, setDisplay, signal) => {
  let current = ''
  for (let i = 0; i < text.length; i++) {
    if (signal?.aborted) break
    current += text[i]
    setDisplay(current)
    const c = text[i]
    const delay = '.!?'.includes(c) ? 50 : ',;:'.includes(c) ? 20 : c === '\n' ? 30 : 8
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

// ─── ModuleBadge ─────────────────────────────────────────────────────────────
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

// ─── TypingDots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display:'flex', gap:5, alignItems:'center', padding:'14px 18px' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width:7, height:7, borderRadius:'50%', background:gold,
          animation:'typingBounce 1.2s infinite', animationDelay:`${i*0.18}s`, opacity:0.7,
        }}/>
      ))}
    </div>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming, streamingText }) {
  const isUser = msg.role === 'user'
  const content = isStreaming ? streamingText : msg.content

  const inlineFormat = (text) => {
    if (!text) return ''
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i} style={{ fontWeight:600, color:'#1C1C1E' }}>{part.slice(2,-2)}</strong>
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={i} style={{ fontFamily:"'IBM Plex Mono',monospace", background:'rgba(200,80,192,0.1)', padding:'2px 6px', borderRadius:4, fontSize:'0.88em', color:'#7C3A7A' }}>{part.slice(1,-1)}</code>
      if (part.startsWith('_') && part.endsWith('_'))
        return <span key={i} style={{ fontSize:11, color:'#AEAEB2', fontStyle:'italic' }}>{part.slice(1,-1)}</span>
      return <span key={i}>{part}</span>
    })
  }

  const renderMarkdown = (text) => {
    if (!text) return null
    const lines = text.split('\n')
    const elements = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      // Table
      if (line.includes('|') && i + 1 < lines.length && lines[i+1]?.includes('---')) {
        const tableLines = []
        while (i < lines.length && lines[i].includes('|')) { tableLines.push(lines[i]); i++ }
        const headers = tableLines[0].split('|').filter(c => c.trim())
        const rows = tableLines.slice(2).map(r => r.split('|').filter(c => c.trim()))
        elements.push(
          <div key={`t${i}`} style={{ overflowX:'auto', margin:'10px 0' }}>
            <table style={{ borderCollapse:'collapse', width:'100%', fontSize:13 }}>
              <thead>
                <tr>{headers.map((h,j) => (
                  <th key={j} style={{ padding:'8px 12px', background:'linear-gradient(135deg,rgba(200,80,192,0.12),rgba(255,107,53,0.08))', borderBottom:'2px solid #E8C8F0', textAlign:'left', fontWeight:600, color:'#1C1C1E', whiteSpace:'nowrap' }}>
                    {h.trim()}
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {rows.map((row,j) => (
                  <tr key={j} style={{ borderBottom:'1px solid #F0EDE8', background: j%2===0 ? '#FFFFFF' : '#FAFAF8' }}>
                    {row.map((cell,k) => (
                      <td key={k} style={{ padding:'7px 12px', color:'#3A3A3C', verticalAlign:'top' }}>
                        {inlineFormat(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
      // Headings
      if (line.startsWith('## '))      { elements.push(<div key={i} style={{ fontWeight:700, fontSize:15, color:'#1C1C1E', margin:'12px 0 4px', fontFamily:"'Playfair Display',serif" }}>{line.slice(3)}</div>); i++; continue }
      if (line.startsWith('### '))     { elements.push(<div key={i} style={{ fontWeight:600, fontSize:14, color:'#1C1C1E', margin:'10px 0 3px' }}>{line.slice(4)}</div>); i++; continue }
      // Top-level bullets only — no sub-bullets rendered as nested
      if (/^[\*\-] /.test(line)) {
        elements.push(
          <div key={i} style={{ display:'flex', gap:8, margin:'4px 0', paddingLeft:4 }}>
            <span style={{ color:'#C850C0', marginTop:1, flexShrink:0, fontSize:14 }}>•</span>
            <span style={{ lineHeight:1.65 }}>{inlineFormat(line.slice(2))}</span>
          </div>
        )
        i++; continue
      }
      // Sub-bullets — flattened, not nested
      if (/^\s+[\+\-\*] /.test(line)) {
        const text = line.replace(/^\s+[\+\-\*] /, '')
        elements.push(
          <div key={i} style={{ display:'flex', gap:8, margin:'3px 0', paddingLeft:20 }}>
            <span style={{ color:'#FF6B35', fontSize:12, marginTop:3, flexShrink:0 }}>–</span>
            <span style={{ fontSize:13, lineHeight:1.6, color:'#4A4A4C' }}>{inlineFormat(text)}</span>
          </div>
        )
        i++; continue
      }
      if (/^---+$/.test(line.trim())) { elements.push(<hr key={i} style={{ border:'none', borderTop:'1px solid #EDEDE8', margin:'10px 0' }}/>); i++; continue }
      if (line.trim() === '')         { elements.push(<div key={i} style={{ height:6 }}/>); i++; continue }
      elements.push(<div key={i} style={{ margin:'2px 0', lineHeight:1.7 }}>{inlineFormat(line)}</div>)
      i++
    }
    return elements
  }

  return (
    <div style={{
      display:'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap:10, alignItems:'flex-start', marginBottom:20,
      animation:'msgSlide 0.25s ease forwards',
    }}>
      {!isUser && (
        <div style={{ width:32, height:32, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
          <WaniLogo size={30}/>
        </div>
      )}
      <div style={{
        maxWidth:'72%',
        background: isUser ? '#FDF4FF' : '#FFFFFF',
        border: isUser ? '1px solid #E8C8F0' : '1px solid #EDEDED',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding:'12px 16px', color:'#1C1C1E', fontSize:14, lineHeight:1.7,
        wordBreak:'break-word',
        boxShadow: isUser ? '0 2px 8px rgba(200,80,192,0.1)' : '0 2px 6px rgba(0,0,0,0.05)',
      }}>
        {isUser
          ? <span style={{whiteSpace:'pre-wrap'}}>{content}</span>
          : renderMarkdown(content)
        }
        {isStreaming && <span style={{ display:'inline-block', width:2, height:'1em', background:'#C850C0', marginLeft:2, animation:'cursorBlink 0.8s infinite', verticalAlign:'middle' }}/>}
      </div>
      {isUser && (
        <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, background:'linear-gradient(135deg,#1E3A5F,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', marginTop:2 }}>A</div>
      )}
    </div>
  )
}

// ─── ProfileModal ─────────────────────────────────────────────────────────────
function ProfileModal({ session, profile, onClose, onSave, onSignOut }) {
  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const initials = getInitials(name || profile?.name, session.user.email)

  const handleSave = async () => {
    setSaving(true)
    await onSave({ name })
    setSaving(false)
    onClose()
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(10,6,20,0.6)', backdropFilter:'blur(8px)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:100,
    }} onClick={onClose}>
      <div style={{
        background:'linear-gradient(145deg,#1A1035,#0F0A2A)',
        border:'1px solid rgba(200,80,192,0.3)',
        borderRadius:24, padding:36, width:360, maxWidth:'90vw',
        boxShadow:'0 24px 64px rgba(0,0,0,0.4), 0 0 60px rgba(200,80,192,0.1)',
        animation:'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
      }} onClick={e=>e.stopPropagation()}>

        {/* Avatar */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{
            width:76, height:76, borderRadius:'50%',
            background:goldGrad,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:28, fontWeight:700, color:'#fff',
            margin:'0 auto 12px',
            boxShadow:'0 4px 20px rgba(200,80,192,0.4)',
          }}>{initials}</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', letterSpacing:0.3 }}>{session.user.email}</div>
        </div>

        {/* Name field */}
        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block', fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:1.2, textTransform:'uppercase', marginBottom:8 }}>Display Name</label>
          <input
            value={name}
            onChange={e=>setName(e.target.value)}
            placeholder={profile?.name || 'Enter your name'}
            style={{
              width:'100%', padding:'12px 16px', boxSizing:'border-box',
              background:'rgba(255,255,255,0.08)',
              border:'1.5px solid rgba(200,80,192,0.3)',
              borderRadius:12, fontSize:14,
              fontFamily:"'DM Sans',sans-serif",
              color:'#fff', outline:'none',
              transition:'border-color 0.2s',
            }}
            onFocus={e=>e.target.style.borderColor='rgba(200,80,192,0.7)'}
            onBlur={e=>e.target.style.borderColor='rgba(200,80,192,0.3)'}
          />
        </div>

        {/* Save button */}
        <button onClick={handleSave} disabled={saving} style={{
          width:'100%', padding:'13px',
          background:goldGrad,
          border:'none', borderRadius:12,
          color:'#fff', fontSize:14, fontWeight:700,
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
          marginBottom:12, letterSpacing:0.3,
          boxShadow:'0 4px 16px rgba(200,80,192,0.35)',
          transition:'all 0.2s',
        }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>

        {/* Sign out */}
        <button onClick={onSignOut} style={{
          width:'100%', padding:'12px',
          background:'rgba(255,255,255,0.06)',
          border:'1px solid rgba(255,255,255,0.12)',
          borderRadius:12, color:'rgba(255,255,255,0.6)', fontSize:14,
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
          transition:'all 0.2s',
        }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.15)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
        >Sign Out</button>
      </div>
    </div>
  )
}

// ─── ConversationItem ─────────────────────────────────────────────────────────
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
        background: isActive
          ? 'linear-gradient(135deg,rgba(200,80,192,0.12),rgba(255,107,53,0.06))'
          : hovered ? 'rgba(200,80,192,0.05)' : 'transparent',
        borderLeft: isActive ? `3px solid #C850C0` : '3px solid transparent',
        marginBottom:3, transition:'all 0.15s', position:'relative',
        boxShadow: isActive ? 'inset 0 1px 0 rgba(200,80,192,0.1)' : 'none',
      }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
        {conv.module && <ModuleBadge module={conv.module} small />}
        {conv.is_summarised && (
          <span style={{ fontSize:9, color:'#AEAEB2', background:'#F2F2F7', padding:'1px 5px', borderRadius:10 }}>∑</span>
        )}
      </div>
      <div style={{
        fontSize:13, fontWeight: isActive ? 600 : 400,
        color: isActive ? '#1C1C1E' : '#3A3A3C',
        lineHeight:1.4,
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        paddingRight: hovered ? 24 : 0,
      }}>{conv.title}</div>
      <div style={{ fontSize:12, color: isActive ? '#8A5E9E' : '#888', marginTop:2, fontWeight: isActive ? 500 : 400 }}>
        {conv.topic} · {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
      </div>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(conv.id) }}
          style={{
            position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', cursor:'pointer',
            color:'#AEAEB2', fontSize:18, padding:4, lineHeight:1,
            transition:'color 0.15s',
          }}
          onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
          onMouseLeave={e=>e.currentTarget.style.color='#AEAEB2'}
        >×</button>
      )}
    </div>
  )
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────
function HomeScreen({ conversations, onSelectTopic, onNewChat }) {
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'32px 28px', position:'relative', zIndex:1 }}>
      <div style={{ maxWidth:860, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom:32, textAlign:'center' }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
            <WaniLogo size={52}/>
          </div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:600, color:'#1C1C1E', marginBottom:6 }}>
            What would you like to explore?
          </div>
          <p style={{ fontSize:14, color:'#8A8A8E', lineHeight:1.6 }}>
            Select a module to browse your conversations or start a new one
          </p>
        </div>

        {/* Module grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:16, marginBottom:32 }}>
          {Object.entries(TOPICS).map(([mod, topics]) => {
            const colors = MODULE_COLORS[mod]
            const modConvs = conversations.filter(c => c.module === mod)
            const convCount = modConvs.length
            return (
              <div
                key={mod}
                style={{
                  borderRadius:16,
                  background:`linear-gradient(135deg,${colors.from},${colors.to})`,
                  padding:'20px 20px 16px',
                  cursor:'pointer',
                  boxShadow:`0 4px 20px rgba(0,0,0,0.12)`,
                  transition:'all 0.2s',
                  position:'relative',
                  overflow:'hidden',
                }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 28px rgba(0,0,0,0.18)` }}
                onMouseLeave={e=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow=`0 4px 20px rgba(0,0,0,0.12)` }}
                onClick={()=>onSelectTopic(mod, null)}
              >
                {/* Decorative circle */}
                <div style={{ position:'absolute', width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.08)', top:-20, right:-20 }}/>

                {/* Module header */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                  <span style={{ fontSize:22 }}>{colors.emoji}</span>
                  {convCount > 0 && (
                    <span style={{
                      background:'rgba(255,255,255,0.25)', color:'#fff',
                      fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20,
                    }}>{convCount} chat{convCount !== 1 ? 's' : ''}</span>
                  )}
                </div>

                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:600, color:'#fff', marginBottom:10, lineHeight:1.3 }}>
                  {mod.split('–')[0].trim()}<br/>
                  <span style={{ fontSize:12, opacity:0.75, fontFamily:"'DM Sans',sans-serif", fontWeight:400 }}>
                    {mod.includes('–') ? mod.split('–')[1].trim() : ''}
                  </span>
                </div>

                {/* Topic pills */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                  {topics.slice(0,4).map(t => {
                    const hasConv = conversations.some(c => c.module === mod && c.topic === t)
                    return (
                      <span
                        key={t}
                        onClick={e=>{ e.stopPropagation(); onSelectTopic(mod, t) }}
                        style={{
                          fontSize:10, padding:'3px 9px',
                          background: hasConv ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                          color:'#fff', borderRadius:20,
                          fontWeight: hasConv ? 600 : 400,
                          cursor:'pointer',
                          transition:'background 0.15s',
                          border: hasConv ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.45)'}
                        onMouseLeave={e=>e.currentTarget.style.background= hasConv ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}
                      >{t}</span>
                    )
                  })}
                  {topics.length > 4 && (
                    <span style={{ fontSize:10, padding:'3px 9px', background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', borderRadius:20 }}>
                      +{topics.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Recent conversations */}
        {conversations.length > 0 && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'#AEAEB2', letterSpacing:0.8, textTransform:'uppercase', marginBottom:12 }}>
              Recent Conversations
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
              {conversations.slice(0,6).map(conv => {
                const colors = MODULE_COLORS[conv.module] || { from:'#6B7280', to:'#4B5563' }
                return (
                  <div
                    key={conv.id}
                    onClick={()=>onSelectTopic(conv.module, conv.topic, conv.id)}
                    style={{
                      padding:'12px 14px', borderRadius:12,
                      background:'#FFFFFF',
                      border:'1.5px solid #EDEDE8',
                      cursor:'pointer', transition:'all 0.15s',
                      boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
                    }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor='#C850C0'; e.currentTarget.style.boxShadow='0 4px 12px rgba(200,80,192,0.12)' }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor='#EDEDE8'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.04)' }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:`linear-gradient(135deg,${colors.from},${colors.to})`, flexShrink:0 }}/>
                      <span style={{ fontSize:10, color:'#AEAEB2', fontWeight:500 }}>{conv.module?.split('–')[0].trim()}</span>
                    </div>
                    <div style={{ fontSize:13, fontWeight:500, color:'#1C1C1E', lineHeight:1.4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {conv.title}
                    </div>
                    <div style={{ fontSize:11, color:'#AEAEB2', marginTop:4 }}>
                      {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TopicView ────────────────────────────────────────────────────────────────
function TopicView({ module: mod, topic, conversations, onSelectConv, onNewChat, onBack }) {
  const colors = MODULE_COLORS[mod] || { from:'#6B7280', to:'#4B5563', emoji:'◈' }
  const filtered = topic
    ? conversations.filter(c => c.module === mod && c.topic === topic)
    : conversations.filter(c => c.module === mod)
  const groups = groupConversations(filtered)

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', position:'relative', zIndex:1 }}>
      <div style={{ maxWidth:720, margin:'0 auto' }}>

        {/* Back + header */}
        <button onClick={onBack} style={{
          background:'none', border:'none', cursor:'pointer',
          color:'#8A8A8E', fontSize:13, display:'flex', alignItems:'center', gap:6,
          marginBottom:20, fontFamily:"'DM Sans',sans-serif", padding:0,
        }}>← Back to modules</button>

        <div style={{
          borderRadius:16, padding:'20px 24px', marginBottom:24,
          background:`linear-gradient(135deg,${colors.from},${colors.to})`,
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#fff', marginBottom:4 }}>
              {topic || mod.split('–')[0].trim()}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.65)' }}>
              {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={()=>onNewChat(mod, topic)}
            style={{
              padding:'10px 20px', background:'rgba(255,255,255,0.2)',
              border:'1.5px solid rgba(255,255,255,0.5)',
              borderRadius:24, color:'#fff', fontSize:13, fontWeight:600,
              cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              transition:'all 0.2s', backdropFilter:'blur(4px)',
            }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.35)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'}
          >+ New Conversation</button>
        </div>

        {/* Topic filter pills (if module view) */}
        {!topic && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20 }}>
            {TOPICS[mod]?.map(t => {
              const count = conversations.filter(c => c.module === mod && c.topic === t).length
              return (
                <div key={t} onClick={()=>onSelectConv(null, mod, t)}
                  style={{
                    padding:'6px 14px', borderRadius:20,
                    background: count > 0 ? `linear-gradient(135deg,${colors.from}22,${colors.to}11)` : '#F5F0FA',
                    border: count > 0 ? `1.5px solid ${colors.from}55` : '1.5px solid #E8E3D5',
                    cursor:'pointer', fontSize:12, color: count > 0 ? colors.from : '#8A8A8E',
                    fontWeight: count > 0 ? 600 : 400,
                    transition:'all 0.15s',
                    display:'flex', alignItems:'center', gap:6,
                  }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=colors.from}
                  onMouseLeave={e=>e.currentTarget.style.borderColor= count > 0 ? `${colors.from}55` : '#E8E3D5'}
                >
                  {t}
                  {count > 0 && <span style={{ background:colors.from, color:'#fff', borderRadius:10, padding:'0 6px', fontSize:10, fontWeight:700 }}>{count}</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Conversations */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 0', color:'#AEAEB2' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>💬</div>
            <div style={{ fontSize:14, marginBottom:8 }}>No conversations yet</div>
            <div style={{ fontSize:12 }}>Start one with the button above</div>
          </div>
        ) : (
          Object.entries(groups).map(([group, convs]) => convs.length === 0 ? null : (
            <div key={group} style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#AEAEB2', letterSpacing:0.8, textTransform:'uppercase', marginBottom:8, paddingLeft:4 }}>{group}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {convs.map(conv => (
                  <div
                    key={conv.id}
                    onClick={()=>onSelectConv(conv.id)}
                    style={{
                      padding:'14px 16px', borderRadius:12,
                      background:'#FFFFFF', border:'1.5px solid #EDEDE8',
                      cursor:'pointer', transition:'all 0.15s',
                      boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                    }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor='#C850C0'; e.currentTarget.style.boxShadow='0 4px 12px rgba(200,80,192,0.1)' }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor='#EDEDE8'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.04)' }}
                  >
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:500, color:'#1C1C1E', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{conv.title}</div>
                      <div style={{ fontSize:12, color:'#8A8A8E' }}>{conv.topic} · {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                    </div>
                    <span style={{ color:'#AEAEB2', fontSize:18, marginLeft:12 }}>›</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Brain ───────────────────────────────────────────────────────────────
export default function Brain({ session }) {
  // Navigation state: 'home' | 'topic' | 'chat'
  const [view, setView]                         = useState('home')
  const [browseModule, setBrowseModule]         = useState(null)
  const [browseTopic, setBrowseTopic]           = useState(null)

  const [conversations, setConversations]       = useState([])
  const [activeConvId, setActiveConvId]         = useState(null)
  const [input, setInput]                       = useState('')
  const [isLoading, setIsLoading]               = useState(false)
  const [isStreaming, setIsStreaming]            = useState(false)
  const [streamingText, setStreamingText]       = useState('')
  const [dbLoading, setDbLoading]               = useState(true)
  const [searchQuery, setSearchQuery]           = useState('')
  const [showProfile, setShowProfile]           = useState(false)
  const [profile, setProfile]                   = useState(null)
  const [showSummarise, setShowSummarise]       = useState(false)
  const [isSummarising, setIsSummarising]       = useState(false)
  const [sidebarOpen, setSidebarOpen]           = useState(true)
  const [tone, setTone]                         = useState('balanced')

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

  useEffect(() => {
    Promise.all([
      loadConversations(session.user.id).catch(()=>[]),
      getProfile(session.user.id).catch(()=>null),
    ]).then(([convs, prof]) => {
      setConversations(convs || [])
      setProfile(prof)
      setDbLoading(false)
    })
  }, [session])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, streamingText])
  useEffect(() => { if (view === 'chat') inputRef.current?.focus() }, [view, activeConvId])
  useEffect(() => { if (messages.length >= SUMMARISE_THRESHOLD && !showSummarise) setShowSummarise(true) }, [messages.length])

  // Navigation handlers
  const goHome = () => { setView('home'); setActiveConvId(null); setBrowseModule(null); setBrowseTopic(null); setShowSummarise(false) }

  const goTopic = (mod, topic) => { setBrowseModule(mod); setBrowseTopic(topic); setView('topic') }

  const goChat = (convId, mod = null, topic = null) => {
    if (convId) { setActiveConvId(convId); setView('chat'); setShowSummarise(false) }
    else { setActiveConvId(null); setBrowseModule(mod); setBrowseTopic(topic); setView('chat'); setShowSummarise(false) }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading || isStreaming) return
    const msgText = input.trim()
    const userMsg = { role:'user', content:msgText }
    setInput('')
    if (inputRef.current) inputRef.current.style.height = '24px'
    setIsLoading(true)

    let convId = activeConvId
    let currentMod = activeConv?.module || browseModule
    let currentTopic = activeConv?.topic || browseTopic
    let currentMsgs = [...messages, userMsg]

    if (!convId) {
      const cleanTitle = msgText.replace(/\b[A-Z]{2,4}\d{2,3}N?\b/g,'').replace(/\s+/g,' ').trim().slice(0,50) || 'New Conversation'
      const newConv = await createConversation(session.user.id, { title:cleanTitle, module:currentMod, topic:currentTopic, messages:[userMsg] })
      convId = newConv.id
      currentMsgs = [userMsg]
      setConversations(prev => [newConv, ...prev])
      setActiveConvId(newConv.id)
    } else {
      await updateConversation(convId, { messages:currentMsgs })
      setConversations(prev => prev.map(c => c.id===convId ? {...c, messages:currentMsgs} : c))
    }

    try {
      const res = await fetch('/api/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ messages:currentMsgs, module:currentMod, topic:currentTopic, tone }),
      })
      const { reply, error, model } = await res.json()
      if (error) throw new Error(error)

      const modelTag = model === 'claude' ? '\n\n_✦ Claude_' : '\n\n_⚡ Groq_'
      const replyWithTag = reply + modelTag

      setIsLoading(false)
      setIsStreaming(true)
      abortRef.current = new AbortController()
      await simulateTyping(replyWithTag, setStreamingText, abortRef.current.signal)
      setIsStreaming(false)
      setStreamingText('')

      const finalMsgs = [...currentMsgs, { role:'assistant', content:replyWithTag }]
      await updateConversation(convId, { messages:finalMsgs })
      setConversations(prev => prev.map(c => c.id===convId ? {...c, messages:finalMsgs, updated_at:new Date().toISOString()} : c))

      if (currentMsgs.length === 1) {
        fetch('/api/categorise', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:msgText }) })
          .then(r=>r.json()).then(({ module, topic, title }) => {
            if (module) {
              updateConversation(convId, { module, topic, title })
              setConversations(prev => prev.map(c => c.id===convId ? {...c, module, topic, title} : c))
            }
          }).catch(()=>{})
      }
    } catch (err) {
      setIsLoading(false); setIsStreaming(false); setStreamingText('')
      const errMsgs = [...currentMsgs, { role:'assistant', content:'Error reaching AI. Please try again.' }]
      setConversations(prev => prev.map(c => c.id===convId ? {...c, messages:errMsgs} : c))
    }
  }

  const handleSummarise = async () => {
    if (!activeConvId || isSummarising) return
    setIsSummarising(true)
    try {
      const res = await fetch('/api/summarise', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ messages, module:activeConv.module, topic:activeConv.topic }) })
      const { summary } = await res.json()
      const summaryMsg = { role:'assistant', content:`📋 **Conversation Summary**\n\n${summary}\n\n---\n_Conversation summarised. Continuing from here._` }
      const newMsgs = [summaryMsg]
      await updateConversation(activeConvId, { messages:newMsgs, is_summarised:true })
      setConversations(prev => prev.map(c => c.id===activeConvId ? {...c, messages:newMsgs, is_summarised:true} : c))
      setShowSummarise(false)
    } catch {}
    setIsSummarising(false)
  }

  const handleDelete = async (id) => {
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id!==id))
    if (activeConvId === id) goHome()
  }

  const handleSaveProfile = async (updates) => {
    await upsertProfile(session.user.id, updates)
    setProfile(prev => ({ ...prev, ...updates }))
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:'#FAFAF8', fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        @keyframes msgSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-30px) scale(1.08)} 66%{transform:translate(-20px,20px) scale(0.95)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-35px,25px) scale(0.93)} 66%{transform:translate(25px,-15px) scale(1.05)} }
        @keyframes blob3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(20px,30px) scale(1.06)} }
        .sidebar-btn:hover { background:rgba(200,80,192,0.06) !important; }
        .send-btn:hover:not(:disabled) { transform:scale(0.96); opacity:0.88; }
        .icon-btn:hover { background:rgba(200,80,192,0.06) !important; }
        textarea:focus { outline:none; }
        input:focus { outline:none; }
        .tone-btn {
          padding:5px 14px; border-radius:20px;
          border:1.5px solid #D1C8DC; background:#F5F0FA;
          font-size:11px; font-family:'DM Sans',sans-serif;
          cursor:pointer; transition:all 0.18s;
          color:#5A4A6A; font-weight:500;
        }
        .tone-btn:hover { border-color:#C850C0; color:#C850C0; background:#FAF0FF; }
        .tone-btn.active {
          background:linear-gradient(135deg,#C850C0,#FF6B35);
          border-color:transparent; color:#fff; font-weight:700;
          box-shadow:0 2px 10px rgba(200,80,192,0.3);
        }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#E8E3D5;border-radius:4px}
      `}</style>

      {/* ── Sidebar */}
      <div style={{
        width: sidebarOpen ? 264 : 0, minWidth: sidebarOpen ? 264 : 0,
        background:'linear-gradient(180deg,#FFFFFF 0%,#FDF8FF 100%)',
        borderRight:'1px solid #EDEDE8',
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition:'all 0.25s ease', flexShrink:0,
      }}>
        {/* Sidebar header */}
        <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid #F0EDE5' }}>
          <div
            onClick={goHome}
            style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, cursor:'pointer' }}
          >
            <WaniLogo size={32}/>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:600, background:goldGrad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Wani</span>
          </div>
          <button onClick={()=>goChat(null,null,null)} style={{
            width:'100%', padding:'10px 14px',
            background:goldGrad, border:'none', borderRadius:10,
            color:'#fff', fontSize:13, fontWeight:600,
            cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:'0 2px 10px rgba(200,80,192,0.25)', transition:'all 0.2s',
          }}
            onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(200,80,192,0.4)'; e.currentTarget.style.transform='translateY(-1px)' }}
            onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 2px 10px rgba(200,80,192,0.25)'; e.currentTarget.style.transform='translateY(0)' }}
          ><span style={{ fontSize:16 }}>+</span> New Conversation</button>
        </div>

        {/* Search */}
        <div style={{ padding:'12px 16px 8px' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#AEAEB2', fontSize:13 }}>🔍</span>
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              style={{
                width:'100%', padding:'8px 10px 8px 32px', boxSizing:'border-box',
                border:'1.5px solid #EDEDE8', borderRadius:10,
                fontSize:13, color:'#1C1C1E', background:'#FAFAF8',
                fontFamily:"'DM Sans',sans-serif", transition:'border-color 0.2s',
              }}
              onFocus={e=>e.target.style.borderColor='#C850C0'}
              onBlur={e=>e.target.style.borderColor='#EDEDE8'}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex:1, overflowY:'auto', padding:'4px 8px 8px' }}>
          {dbLoading ? (
            <div style={{ padding:20, textAlign:'center' }}>
              <div style={{ width:20, height:20, border:'2px solid #E8E3D5', borderTopColor:'#C850C0', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 8px' }}/>
              <span style={{ fontSize:12, color:'#AEAEB2' }}>Loading...</span>
            </div>
          ) : filteredConvs.length === 0 ? (
            <div style={{ padding:'24px 16px', textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>💬</div>
              <p style={{ fontSize:12, color:'#AEAEB2', lineHeight:1.6 }}>No conversations yet</p>
            </div>
          ) : (
            Object.entries(groups).map(([group, convs]) => convs.length === 0 ? null : (
              <div key={group}>
                <div style={{ fontSize:10, fontWeight:700, color:'#AEAEB2', letterSpacing:0.8, textTransform:'uppercase', padding:'12px 6px 4px' }}>{group}</div>
                {convs.map(conv => (
                  <ConversationItem
                    key={conv.id} conv={conv}
                    isActive={conv.id === activeConvId}
                    onClick={()=>{ setActiveConvId(conv.id); setView('chat'); setShowSummarise(false) }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Profile */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid #F0EDE5' }}>
          <div onClick={()=>setShowProfile(true)} className="sidebar-btn"
            style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, cursor:'pointer', transition:'background 0.15s' }}
          >
            <div style={{
              width:32, height:32, borderRadius:'50%', background:goldGrad,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700, color:'#fff', flexShrink:0,
              boxShadow:'0 2px 8px rgba(200,80,192,0.25)',
            }}>{getInitials(profile?.name, session.user.email)}</div>
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
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, position:'relative' }}>

        {/* Animated background */}
        <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:0, background:'linear-gradient(160deg,#FDF8FF 0%,#FFF5F0 40%,#FFFBF0 100%)' }}>
          <div style={{ position:'absolute', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(200,80,192,0.1) 0%,transparent 65%)', top:'-15%', right:'0%', animation:'blob1 12s ease-in-out infinite' }}/>
          <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(255,107,53,0.08) 0%,transparent 65%)', bottom:'-10%', left:'5%', animation:'blob2 15s ease-in-out infinite' }}/>
          <div style={{ position:'absolute', width:380, height:380, borderRadius:'50%', background:'radial-gradient(circle,rgba(255,204,112,0.1) 0%,transparent 65%)', top:'35%', right:'25%', animation:'blob3 10s ease-in-out infinite' }}/>
        </div>

        {/* Top bar */}
        <div style={{
          padding:'12px 20px', borderBottom:'1px solid #EDEDE8',
          display:'flex', alignItems:'center', gap:12,
          background:'rgba(255,255,255,0.88)', backdropFilter:'blur(8px)',
          flexShrink:0, position:'relative', zIndex:2,
        }}>
          <button className="icon-btn" onClick={()=>setSidebarOpen(!sidebarOpen)}
            style={{ background:'none', border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:8, fontSize:16, color:'#636366', transition:'background 0.15s' }}>☰</button>

          {/* Wani branding always visible */}
          <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }} onClick={goHome}>
            <WaniLogo size={26}/>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:600, background:goldGrad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Wani</span>
          </div>

          {view === 'chat' && activeConv && (
            <>
              <span style={{ color:'#AEAEB2', fontSize:16 }}>›</span>
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
                <ModuleBadge module={activeConv.module}/>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'#1C1C1E', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{activeConv.title}</div>
                  <div style={{ fontSize:11, color:'#AEAEB2' }}>{activeConv.topic}</div>
                </div>
              </div>
            </>
          )}

          {view === 'topic' && (
            <>
              <span style={{ color:'#AEAEB2', fontSize:16 }}>›</span>
              <div style={{ fontSize:14, fontWeight:500, color:'#3A3A3C' }}>{browseTopic || browseModule?.split('–')[0].trim()}</div>
            </>
          )}

          {view === 'chat' && !activeConv && (
            <>
              <span style={{ color:'#AEAEB2', fontSize:16 }}>›</span>
              <div style={{ fontSize:14, fontWeight:500, color:'#AEAEB2' }}>New Conversation</div>
            </>
          )}
        </div>

        {/* Tone selector — only in chat */}
        {view === 'chat' && (
          <div style={{
            padding:'7px 20px', borderBottom:'1px solid #F0EBF8',
            display:'flex', alignItems:'center', gap:8,
            background:'rgba(255,255,255,0.75)', backdropFilter:'blur(6px)',
            flexShrink:0, position:'relative', zIndex:2,
          }}>
            <span style={{ fontSize:11, color:'#9A8AAA', marginRight:2, fontWeight:500 }}>Tone:</span>
            {[
              { key:'balanced', label:'⚖️ Balanced' },
              { key:'direct',   label:'⚡ Direct' },
              { key:'friendly', label:'😊 Friendly' },
              { key:'formal',   label:'📋 Formal' },
            ].map(t => (
              <button key={t.key} className={`tone-btn${tone===t.key?' active':''}`} onClick={()=>setTone(t.key)}>{t.label}</button>
            ))}
          </div>
        )}

        {/* Summarise banner */}
        {showSummarise && activeConv && view === 'chat' && (
          <div style={{
            background:'linear-gradient(135deg,rgba(200,80,192,0.08),rgba(255,107,53,0.06))',
            borderBottom:'1px solid rgba(200,80,192,0.2)',
            padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
            fontSize:13, flexShrink:0, position:'relative', zIndex:2,
          }}>
            <span style={{ color:'#7C3A7A' }}>⚡ This conversation is getting long. Summarise to keep it sharp?</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleSummarise} disabled={isSummarising} style={{
                padding:'5px 14px', background:goldGrad, border:'none', borderRadius:8,
                color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              }}>{isSummarising ? 'Summarising…' : 'Summarise'}</button>
              <button onClick={()=>setShowSummarise(false)} style={{
                padding:'5px 12px', background:'none', border:'1px solid rgba(200,80,192,0.3)', borderRadius:8,
                color:'#7C3A7A', fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              }}>Dismiss</button>
            </div>
          </div>
        )}

        {/* ── Views */}
        {view === 'home' && (
          <HomeScreen
            conversations={conversations}
            onSelectTopic={(mod, topic, convId) => {
              if (convId) goChat(convId)
              else goTopic(mod, topic)
            }}
            onNewChat={(mod, topic) => goChat(null, mod, topic)}
          />
        )}

        {view === 'topic' && (
          <TopicView
            module={browseModule}
            topic={browseTopic}
            conversations={conversations}
            onSelectConv={(convId, mod, topic) => {
              if (convId) goChat(convId)
              else goTopic(mod, topic)
            }}
            onNewChat={(mod, topic) => goChat(null, mod, topic)}
            onBack={goHome}
          />
        )}

        {view === 'chat' && (
          <>
            {/* Chat messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'24px 20px', position:'relative', zIndex:1 }}>
              <div style={{ maxWidth:740, margin:'0 auto' }}>
                {messages.length === 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'calc(100vh - 280px)', textAlign:'center', animation:'fadeIn 0.4s ease' }}>
                    <WaniLogo size={52}/>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#1C1C1E', marginTop:16, marginBottom:8 }}>
                      {browseTopic || browseModule?.split('–')[0].trim() || 'Ask Wani'}
                    </div>
                    <p style={{ fontSize:13, color:'#8A8A8E', maxWidth:320, lineHeight:1.7, marginBottom:24 }}>
                      {browseTopic ? `Ask anything about ${browseTopic}` : 'Ask any SAP question — I\'ll figure out the topic'}
                    </p>
                    {browseTopic && STARTERS[browseTopic] && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:440 }}>
                        {STARTERS[browseTopic].map((s,i) => (
                          <div key={i} onClick={()=>setInput(s)}
                            style={{ padding:'7px 14px', background:'#FFFFFF', border:'1.5px solid #EDEDE8', borderRadius:20, fontSize:12, color:'#636366', cursor:'pointer', transition:'all 0.15s' }}
                            onMouseEnter={e=>{ e.currentTarget.style.borderColor='#C850C0'; e.currentTarget.style.color='#1C1C1E'; e.currentTarget.style.background='#FDF4FF' }}
                            onMouseLeave={e=>{ e.currentTarget.style.borderColor='#EDEDE8'; e.currentTarget.style.color='#636366'; e.currentTarget.style.background='#FFFFFF' }}
                          >{s}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((msg,i) => <MessageBubble key={i} msg={msg} isStreaming={false} streamingText=""/>)}
                    {isLoading && !isStreaming && (
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:20 }}>
                        <div style={{ width:32, height:32, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}><WaniLogo size={30}/></div>
                        <div style={{ background:'#FFFFFF', border:'1px solid #EDEDED', borderRadius:'4px 16px 16px 16px', boxShadow:'0 2px 6px rgba(0,0,0,0.05)' }}><TypingDots/></div>
                      </div>
                    )}
                    {isStreaming && <MessageBubble msg={{ role:'assistant', content:'' }} isStreaming={true} streamingText={streamingText}/>}
                    <div ref={bottomRef}/>
                  </>
                )}
              </div>
            </div>

            {/* Input */}
            <div style={{ padding:'12px 20px 16px', borderTop:'1px solid #EDEDE8', background:'rgba(255,255,255,0.92)', backdropFilter:'blur(8px)', flexShrink:0, position:'relative', zIndex:2 }}>
              <div style={{ maxWidth:740, margin:'0 auto' }}>
                <div style={{
                  display:'flex', gap:10, alignItems:'flex-end',
                  background:'#FAFAF8', border:'1.5px solid #D8D0E8',
                  borderRadius:14, padding:'10px 12px',
                  transition:'border-color 0.2s, box-shadow 0.2s',
                }}
                  onFocusCapture={e=>{ e.currentTarget.style.borderColor='#C850C0'; e.currentTarget.style.boxShadow='0 0 0 3px rgba(200,80,192,0.08)' }}
                  onBlurCapture={e=>{ e.currentTarget.style.borderColor='#D8D0E8'; e.currentTarget.style.boxShadow='none' }}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => {
                      setInput(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
                    }}
                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); handleSend() } }}
                    placeholder="Ask your SAP question… (Enter to send, Shift+Enter for new line)"
                    rows={1}
                    style={{
                      flex:1, background:'transparent', border:'none', resize:'none',
                      fontSize:14, color:'#1C1C1E', fontFamily:"'DM Sans',sans-serif",
                      lineHeight:1.65, height:'24px', maxHeight:'200px',
                      overflowY:'auto', padding:0, outline:'none',
                    }}
                  />
                  <button className="send-btn" onClick={handleSend}
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
                <div style={{ fontSize:11, color:'#B0A8BA', textAlign:'right', marginTop:5 }}>
                  {activeConv?.module || browseModule || 'Free mode'} · Standard SAP — verify system-specific behaviour
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profile modal */}
      {showProfile && (
        <ProfileModal
          session={session} profile={profile}
          onClose={()=>setShowProfile(false)}
          onSave={handleSaveProfile}
          onSignOut={signOut}
        />
      )}
    </div>
  )
}
