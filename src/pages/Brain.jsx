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
    blob1:      'rgba(200,80,192,0.12)',
    blob2:      'rgba(255,107,53,0.09)',
    blob3:      'rgba(255,204,112,0.11)',
    bgGrad:     'linear-gradient(160deg,#FDF8FF 0%,#FFF5F0 40%,#FFFBF0 100%)',
    toneBtn:    '#F5F0FA',
    toneBtnBdr: '#D1C8DC',
    toneBtnTxt: '#5A4A6A',
    codeBg:     'rgba(200,80,192,0.1)',
    codeTxt:    '#7C3A7A',
    summarise:  'linear-gradient(135deg,rgba(200,80,192,0.08),rgba(255,107,53,0.06))',
    summariseBdr:'rgba(200,80,192,0.2)',
    summariseTxt:'#7C3A7A',
  },
  dark: {
    bg:         '#0A0A12',
    surface:    '#12101E',
    surface2:   '#1A1530',
    border:     '#2A2440',
    border2:    '#3D3560',
    text:       '#F0EEF8',
    text2:      '#C8C4DC',
    text3:      '#8A849E',
    text4:      '#5A5470',
    sidebar:    'linear-gradient(180deg,#12101E 0%,#0E0C1A 100%)',
    topbar:     'rgba(12,10,20,0.92)',
    inputBg:    '#1A1530',
    msgUser:    '#1E1535',
    msgUserBdr: '#4A2060',
    msgAI:      '#16132A',
    msgAIBdr:   '#2A2440',
    blob1:      'rgba(200,80,192,0.18)',
    blob2:      'rgba(255,107,53,0.14)',
    blob3:      'rgba(255,204,112,0.12)',
    bgGrad:     'linear-gradient(160deg,#0E0C1E 0%,#120A18 40%,#0C0E18 100%)',
    toneBtn:    '#1E1A30',
    toneBtnBdr: '#3D3560',
    toneBtnTxt: '#A090C0',
    codeBg:     'rgba(200,80,192,0.18)',
    codeTxt:    '#D070D0',
    summarise:  'linear-gradient(135deg,rgba(200,80,192,0.15),rgba(255,107,53,0.1))',
    summariseBdr:'rgba(200,80,192,0.35)',
    summariseTxt:'#D090D0',
  }
}

const goldGrad = 'linear-gradient(135deg,#C850C0,#FF6B35,#FFCC70)'

const MODULE_COLORS = {
  "PP – Production Planning": { from:'#16a34a', to:'#059669', emoji:'⚙️' },
  "PM – Plant Maintenance":   { from:'#4f46e5', to:'#7c3aed', emoji:'🔧' },
  "MM – Logistics":           { from:'#ea580c', to:'#dc2626', emoji:'📦' },
  "Fiori / UX":               { from:'#0284c7', to:'#0369a1', emoji:'◻️' },
  "S/4HANA General":          { from:'#b45309', to:'#92400e', emoji:'◈'  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const simulateTyping = async (text, setDisplay, signal) => {
  let current = ''
  for (let i = 0; i < text.length; i++) {
    if (signal?.aborted) break
    current += text[i]
    setDisplay(current)
    const c = text[i]
    await new Promise(r => setTimeout(r, '.!?'.includes(c)?50:',;:'.includes(c)?20:c==='\n'?30:8))
  }
}

const groupConversations = (convs) => {
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1)
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate()-7)
  const g = { Today:[], Yesterday:[], 'This Week':[], Earlier:[] }
  convs.forEach(c => {
    const d = new Date(c.updated_at)
    if (d >= today) g.Today.push(c)
    else if (d >= yesterday) g.Yesterday.push(c)
    else if (d >= weekAgo) g['This Week'].push(c)
    else g.Earlier.push(c)
  })
  return g
}

const getInitials = (name, email) => {
  if (name) return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return (email || 'AB')[0].toUpperCase()
}

const isMobileWidth = () => window.innerWidth < 768

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
function TypingDots({ t }) {
  return (
    <div style={{ display:'flex', gap:5, alignItems:'center', padding:'12px 16px' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#C850C0', animation:'typingBounce 1.2s infinite', animationDelay:`${i*0.18}s`, opacity:0.7 }}/>
      ))}
    </div>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming, streamingText, t }) {
  const isUser = msg.role === 'user'
  const content = isStreaming ? streamingText : msg.content

  const inlineFormat = (text) => {
    if (!text) return ''
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ fontWeight:600, color:t.text }}>{part.slice(2,-2)}</strong>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ fontFamily:"'IBM Plex Mono',monospace", background:t.codeBg, padding:'2px 6px', borderRadius:4, fontSize:'0.88em', color:t.codeTxt }}>{part.slice(1,-1)}</code>
      if (part.startsWith('_') && part.endsWith('_')) return <span key={i} style={{ fontSize:11, color:t.text4, fontStyle:'italic' }}>{part.slice(1,-1)}</span>
      return <span key={i}>{part}</span>
    })
  }

  const renderMarkdown = (text) => {
    if (!text) return null
    const lines = text.split('\n')
    const els = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (line.includes('|') && i+1 < lines.length && lines[i+1]?.includes('---')) {
        const tl = []; while (i < lines.length && lines[i].includes('|')) { tl.push(lines[i]); i++ }
        const headers = tl[0].split('|').filter(c=>c.trim())
        const rows = tl.slice(2).map(r=>r.split('|').filter(c=>c.trim()))
        els.push(<div key={`t${i}`} style={{ overflowX:'auto', margin:'10px 0' }}>
          <table style={{ borderCollapse:'collapse', width:'100%', fontSize:13 }}>
            <thead><tr>{headers.map((h,j)=><th key={j} style={{ padding:'8px 12px', background:'rgba(200,80,192,0.12)', borderBottom:'2px solid rgba(200,80,192,0.3)', textAlign:'left', fontWeight:600, color:t.text, whiteSpace:'nowrap' }}>{h.trim()}</th>)}</tr></thead>
            <tbody>{rows.map((row,j)=><tr key={j} style={{ borderBottom:`1px solid ${t.border}`, background: j%2===0?t.surface:t.surface2 }}>{row.map((cell,k)=><td key={k} style={{ padding:'7px 12px', color:t.text2 }}>{inlineFormat(cell.trim())}</td>)}</tr>)}</tbody>
          </table></div>)
        continue
      }
      if (line.startsWith('## '))     { els.push(<div key={i} style={{ fontWeight:700, fontSize:15, color:t.text, margin:'12px 0 4px', fontFamily:"'Playfair Display',serif" }}>{line.slice(3)}</div>); i++; continue }
      if (line.startsWith('### '))    { els.push(<div key={i} style={{ fontWeight:600, fontSize:14, color:t.text, margin:'10px 0 3px' }}>{line.slice(4)}</div>); i++; continue }
      if (/^[\*\-] /.test(line))     { els.push(<div key={i} style={{ display:'flex', gap:8, margin:'4px 0', paddingLeft:4 }}><span style={{ color:'#C850C0', marginTop:1, flexShrink:0, fontSize:14 }}>•</span><span style={{ lineHeight:1.65, color:t.text2 }}>{inlineFormat(line.slice(2))}</span></div>); i++; continue }
      if (/^\s+[\+\-\*] /.test(line)) {
        const txt = line.replace(/^\s+[\+\-\*] /,'')
        els.push(<div key={i} style={{ display:'flex', gap:8, margin:'3px 0', paddingLeft:20 }}><span style={{ color:'#FF6B35', fontSize:12, marginTop:3, flexShrink:0 }}>–</span><span style={{ fontSize:13, lineHeight:1.6, color:t.text3 }}>{inlineFormat(txt)}</span></div>); i++; continue
      }
      if (/^---+$/.test(line.trim())) { els.push(<hr key={i} style={{ border:'none', borderTop:`1px solid ${t.border}`, margin:'10px 0' }}/>); i++; continue }
      if (line.trim() === '')         { els.push(<div key={i} style={{ height:6 }}/>); i++; continue }
      els.push(<div key={i} style={{ margin:'2px 0', lineHeight:1.7, color:t.text2 }}>{inlineFormat(line)}</div>)
      i++
    }
    return els
  }

  return (
    <div style={{ display:'flex', flexDirection:isUser?'row-reverse':'row', gap:10, alignItems:'flex-start', marginBottom:20, animation:'msgSlide 0.25s ease forwards' }}>
      {!isUser && <div style={{ width:32, height:32, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}><WaniLogo size={28} dark={false}/></div>}
      <div style={{
        maxWidth:'72%',
        background: isUser ? t.msgUser : t.msgAI,
        border: `1px solid ${isUser ? t.msgUserBdr : t.msgAIBdr}`,
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding:'12px 16px', fontSize:14, lineHeight:1.7, wordBreak:'break-word',
        boxShadow: isUser ? '0 2px 8px rgba(200,80,192,0.1)' : '0 2px 6px rgba(0,0,0,0.08)',
      }}>
        {isUser ? <span style={{ whiteSpace:'pre-wrap', color:t.text }}>{content}</span> : renderMarkdown(content)}
        {isStreaming && <span style={{ display:'inline-block', width:2, height:'1em', background:'#C850C0', marginLeft:2, animation:'cursorBlink 0.8s infinite', verticalAlign:'middle' }}/>}
      </div>
      {isUser && <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, background:'linear-gradient(135deg,#1E3A5F,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', marginTop:2 }}>A</div>}
    </div>
  )
}

// ─── ProfileModal ─────────────────────────────────────────────────────────────
function ProfileModal({ session, profile, onClose, onSave, onSignOut, t }) {
  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const initials = getInitials(name || profile?.name, session.user.email)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:16 }} onClick={onClose}>
      <div style={{
        background:'linear-gradient(145deg,#1A1035,#0F0A2A)',
        border:'1px solid rgba(200,80,192,0.3)',
        borderRadius:24, padding:32, width:340, maxWidth:'100%',
        boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
        animation:'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
      }} onClick={e=>e.stopPropagation()}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:goldGrad, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:700, color:'#fff', margin:'0 auto 12px', boxShadow:'0 4px 20px rgba(200,80,192,0.4)' }}>{initials}</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>{session.user.email}</div>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block', fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:1.2, textTransform:'uppercase', marginBottom:8 }}>Display Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder={profile?.name || 'Enter your name'}
            style={{ width:'100%', padding:'12px 16px', boxSizing:'border-box', background:'rgba(255,255,255,0.08)', border:'1.5px solid rgba(200,80,192,0.3)', borderRadius:12, fontSize:14, fontFamily:"'DM Sans',sans-serif", color:'#fff', outline:'none' }}
            onFocus={e=>e.target.style.borderColor='rgba(200,80,192,0.7)'}
            onBlur={e=>e.target.style.borderColor='rgba(200,80,192,0.3)'}
          />
        </div>
        <button onClick={async()=>{ setSaving(true); await onSave({name}); setSaving(false); onClose() }} style={{ width:'100%', padding:13, background:goldGrad, border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:12, boxShadow:'0 4px 16px rgba(200,80,192,0.35)' }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
        <button onClick={onSignOut} style={{ width:'100%', padding:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, color:'rgba(255,255,255,0.6)', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.15)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
        >Sign Out</button>
      </div>
    </div>
  )
}

// ─── ConversationItem ─────────────────────────────────────────────────────────
function ConversationItem({ conv, isActive, onClick, onDelete, t }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onClick={onClick}
      style={{
        padding:'10px 14px', borderRadius:10, cursor:'pointer',
        background: isActive ? 'linear-gradient(135deg,rgba(200,80,192,0.15),rgba(255,107,53,0.08))' : hovered ? 'rgba(200,80,192,0.07)' : 'transparent',
        borderLeft: isActive ? '3px solid #C850C0' : '3px solid transparent',
        marginBottom:3, transition:'all 0.15s', position:'relative',
      }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
        {conv.module && <ModuleBadge module={conv.module} small/>}
        {conv.is_summarised && <span style={{ fontSize:9, color:t.text4, background:t.surface2, padding:'1px 5px', borderRadius:10 }}>∑</span>}
      </div>
      <div style={{ fontSize:13, fontWeight:isActive?600:400, color:isActive?t.text:t.text2, lineHeight:1.4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:hovered?24:0 }}>{conv.title}</div>
      <div style={{ fontSize:12, color:isActive?'#C850C0':t.text3, marginTop:2, fontWeight:isActive?500:400 }}>
        {conv.topic} · {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
      </div>
      {hovered && (
        <button onClick={e=>{e.stopPropagation();onDelete(conv.id)}} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:t.text4, fontSize:18, padding:4, lineHeight:1 }}
          onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
          onMouseLeave={e=>e.currentTarget.style.color=t.text4}
        >×</button>
      )}
    </div>
  )
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────
function HomeScreen({ conversations, onSelectTopic, t }) {
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'24px 16px', position:'relative', zIndex:1 }}>
      <div style={{ maxWidth:860, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom:28, textAlign:'center' }}>
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:14, marginBottom:14 }}>
            <WaniLogo size={40} dark={false}/>
            <WaniWordmark height={28} dark={false}/>
          </div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:24, fontWeight:600, color:t.text, marginBottom:6 }}>What would you like to explore?</div>
          <p style={{ fontSize:13, color:t.text3, lineHeight:1.6 }}>Select a module to browse conversations or start a new one</p>
        </div>

        {/* Module grid — responsive */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:28 }}>
          {Object.entries(TOPICS).map(([mod, topics]) => {
            const colors = MODULE_COLORS[mod]
            const count = conversations.filter(c=>c.module===mod).length
            return (
              <div key={mod}
                style={{ borderRadius:16, background:`linear-gradient(135deg,${colors.from},${colors.to})`, padding:'18px 18px 14px', cursor:'pointer', boxShadow:'0 4px 20px rgba(0,0,0,0.15)', transition:'all 0.2s', position:'relative', overflow:'hidden' }}
                onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.22)'}}
                onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.15)'}}
                onClick={()=>onSelectTopic(mod, null)}
              >
                <div style={{ position:'absolute', width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.08)', top:-20, right:-20 }}/>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <span style={{ fontSize:20 }}>{colors.emoji}</span>
                  {count > 0 && <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>{count}</span>}
                </div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:600, color:'#fff', marginBottom:10, lineHeight:1.3 }}>
                  {mod.split('–')[0].trim()}<br/>
                  <span style={{ fontSize:11, opacity:0.7, fontFamily:"'DM Sans',sans-serif", fontWeight:400 }}>{mod.includes('–') ? mod.split('–')[1].trim() : ''}</span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {topics.slice(0,3).map(t2 => {
                    const hasConv = conversations.some(c=>c.module===mod&&c.topic===t2)
                    return (
                      <span key={t2} onClick={e=>{e.stopPropagation();onSelectTopic(mod,t2)}}
                        style={{ fontSize:10, padding:'3px 8px', background:hasConv?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.15)', color:'#fff', borderRadius:20, fontWeight:hasConv?600:400, cursor:'pointer', border:hasConv?'1px solid rgba(255,255,255,0.5)':'1px solid transparent', transition:'background 0.15s' }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.45)'}
                        onMouseLeave={e=>e.currentTarget.style.background=hasConv?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.15)'}
                      >{t2}</span>
                    )
                  })}
                  {topics.length > 3 && <span style={{ fontSize:10, padding:'3px 8px', background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', borderRadius:20 }}>+{topics.length-3}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Recent conversations */}
        {conversations.length > 0 && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:t.text4, letterSpacing:0.8, textTransform:'uppercase', marginBottom:10 }}>Recent</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
              {conversations.slice(0,6).map(conv => {
                const colors = MODULE_COLORS[conv.module] || { from:'#6B7280', to:'#4B5563' }
                return (
                  <div key={conv.id} onClick={()=>onSelectTopic(conv.module, conv.topic, conv.id)}
                    style={{ padding:'12px 14px', borderRadius:12, background:t.surface, border:`1.5px solid ${t.border}`, cursor:'pointer', transition:'all 0.15s', boxShadow:`0 2px 8px rgba(0,0,0,0.06)` }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#C850C0';e.currentTarget.style.boxShadow='0 4px 16px rgba(200,80,192,0.15)'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.boxShadow=`0 2px 8px rgba(0,0,0,0.06)`}}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:`linear-gradient(135deg,${colors.from},${colors.to})`, flexShrink:0 }}/>
                      <span style={{ fontSize:10, color:t.text4, fontWeight:500 }}>{conv.module?.split('–')[0].trim()}</span>
                    </div>
                    <div style={{ fontSize:13, fontWeight:500, color:t.text, lineHeight:1.4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{conv.title}</div>
                    <div style={{ fontSize:11, color:t.text4, marginTop:4 }}>{new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
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
function TopicView({ module: mod, topic, conversations, onSelectConv, onNewChat, onBack, t }) {
  const colors = MODULE_COLORS[mod] || { from:'#6B7280', to:'#4B5563', emoji:'◈' }
  const filtered = topic ? conversations.filter(c=>c.module===mod&&c.topic===topic) : conversations.filter(c=>c.module===mod)
  const groups = groupConversations(filtered)

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', position:'relative', zIndex:1 }}>
      <div style={{ maxWidth:720, margin:'0 auto' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:t.text3, fontSize:13, display:'flex', alignItems:'center', gap:6, marginBottom:16, fontFamily:"'DM Sans',sans-serif", padding:0 }}>← Back</button>
        <div style={{ borderRadius:16, padding:'18px 22px', marginBottom:20, background:`linear-gradient(135deg,${colors.from},${colors.to})`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:600, color:'#fff', marginBottom:4 }}>{topic || mod.split('–')[0].trim()}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>{filtered.length} conversation{filtered.length!==1?'s':''}</div>
          </div>
          <button onClick={()=>onNewChat(mod, topic)} style={{ padding:'9px 18px', background:'rgba(255,255,255,0.2)', border:'1.5px solid rgba(255,255,255,0.5)', borderRadius:24, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.35)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'}
          >+ New Conversation</button>
        </div>

        {/* Topic filter pills */}
        {!topic && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:18 }}>
            {TOPICS[mod]?.map(tp => {
              const count = conversations.filter(c=>c.module===mod&&c.topic===tp).length
              return (
                <div key={tp} onClick={()=>onSelectConv(null, mod, tp)}
                  style={{ padding:'6px 14px', borderRadius:20, background:count>0?`rgba(200,80,192,0.1)`:t.surface2, border:`1.5px solid ${count>0?'rgba(200,80,192,0.3)':t.border}`, cursor:'pointer', fontSize:12, color:count>0?'#C850C0':t.text3, fontWeight:count>0?600:400, transition:'all 0.15s', display:'flex', alignItems:'center', gap:6 }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#C850C0'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=count>0?'rgba(200,80,192,0.3)':t.border}
                >
                  {tp}
                  {count > 0 && <span style={{ background:'#C850C0', color:'#fff', borderRadius:10, padding:'0 6px', fontSize:10, fontWeight:700 }}>{count}</span>}
                </div>
              )
            })}
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:t.text4 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>💬</div>
            <div style={{ fontSize:14, marginBottom:6, color:t.text3 }}>No conversations yet</div>
            <div style={{ fontSize:12 }}>Use the button above to start one</div>
          </div>
        ) : (
          Object.entries(groups).map(([group, convs]) => convs.length === 0 ? null : (
            <div key={group} style={{ marginBottom:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:t.text4, letterSpacing:0.8, textTransform:'uppercase', marginBottom:8 }}>{group}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {convs.map(conv => (
                  <div key={conv.id} onClick={()=>onSelectConv(conv.id)}
                    style={{ padding:'14px 16px', borderRadius:12, background:t.surface, border:`1.5px solid ${t.border}`, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', justifyContent:'space-between' }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#C850C0';e.currentTarget.style.boxShadow='0 4px 12px rgba(200,80,192,0.12)'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.boxShadow='none'}}
                  >
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:500, color:t.text, marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{conv.title}</div>
                      <div style={{ fontSize:12, color:t.text3 }}>{conv.topic} · {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                    </div>
                    <span style={{ color:t.text4, fontSize:18, marginLeft:12 }}>›</span>
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
  const { dark, toggle } = useTheme()
  const t = dark ? T.dark : T.light

  const [view, setView]                   = useState('home')
  const [browseModule, setBrowseModule]   = useState(null)
  const [browseTopic, setBrowseTopic]     = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId]   = useState(null)
  const [input, setInput]                 = useState('')
  const [isLoading, setIsLoading]         = useState(false)
  const [isStreaming, setIsStreaming]      = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [dbLoading, setDbLoading]         = useState(true)
  const [searchQuery, setSearchQuery]     = useState('')
  const [showProfile, setShowProfile]     = useState(false)
  const [profile, setProfile]             = useState(null)
  const [showSummarise, setShowSummarise] = useState(false)
  const [isSummarising, setIsSummarising] = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(!isMobileWidth())
  const [tone, setTone]                   = useState('balanced')

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const abortRef  = useRef(null)

  const activeConv = conversations.find(c=>c.id===activeConvId)
  const messages   = activeConv?.messages || []

  const filteredConvs = conversations.filter(c => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.title?.toLowerCase().includes(q)||c.module?.toLowerCase().includes(q)||c.topic?.toLowerCase().includes(q)||c.messages?.some(m=>m.content?.toLowerCase().includes(q))
  })

  // Auto-close sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (isMobileWidth()) setSidebarOpen(false)
      else setSidebarOpen(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    Promise.all([
      loadConversations(session.user.id).catch(()=>[]),
      getProfile(session.user.id).catch(()=>null),
    ]).then(([convs, prof]) => { setConversations(convs||[]); setProfile(prof); setDbLoading(false) })
  }, [session])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, streamingText])
  useEffect(() => { if (view==='chat') setTimeout(()=>inputRef.current?.focus(), 100) }, [view, activeConvId])
  useEffect(() => { if (messages.length >= SUMMARISE_THRESHOLD && !showSummarise) setShowSummarise(true) }, [messages.length])

  const goHome = () => { setView('home'); setActiveConvId(null); setBrowseModule(null); setBrowseTopic(null); setShowSummarise(false); if(isMobileWidth()) setSidebarOpen(false) }
  const goTopic = (mod, topic) => { setBrowseModule(mod); setBrowseTopic(topic); setView('topic'); if(isMobileWidth()) setSidebarOpen(false) }
  const goChat = (convId, mod=null, topic=null) => {
    if (convId) { setActiveConvId(convId); setView('chat'); setShowSummarise(false) }
    else { setActiveConvId(null); setBrowseModule(mod); setBrowseTopic(topic); setView('chat'); setShowSummarise(false) }
    if (isMobileWidth()) setSidebarOpen(false)
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
      convId = newConv.id; currentMsgs = [userMsg]
      setConversations(prev => [newConv, ...prev])
      setActiveConvId(newConv.id)
    } else {
      await updateConversation(convId, { messages:currentMsgs })
      setConversations(prev => prev.map(c=>c.id===convId?{...c,messages:currentMsgs}:c))
    }

    try {
      const res = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ messages:currentMsgs, module:currentMod, topic:currentTopic, tone, userId:session.user.id }) })
      const { reply, error, model } = await res.json()
      if (error) throw new Error(error)

      const modelTag = model==='claude' ? '\n\n_✦ Claude_' : '\n\n_⚡ Groq_'
      const replyWithTag = reply + modelTag

      setIsLoading(false); setIsStreaming(true)
      abortRef.current = new AbortController()
      await simulateTyping(replyWithTag, setStreamingText, abortRef.current.signal)
      setIsStreaming(false); setStreamingText('')

      const finalMsgs = [...currentMsgs, { role:'assistant', content:replyWithTag }]
      await updateConversation(convId, { messages:finalMsgs })
      setConversations(prev => prev.map(c=>c.id===convId?{...c,messages:finalMsgs,updated_at:new Date().toISOString()}:c))

      if (currentMsgs.length === 1) {
        fetch('/api/categorise', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:msgText }) })
          .then(r=>r.json()).then(({ module, topic, title }) => {
            if (module) { updateConversation(convId, { module, topic, title }); setConversations(prev=>prev.map(c=>c.id===convId?{...c,module,topic,title}:c)) }
          }).catch(()=>{})
      }

      // Silent memory extraction — fire-and-forget, never surfaces errors to user
      fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:       session.user.id,
          convId,
          module:       currentMod   || null,
          topic:        currentTopic || null,
          userMsg:      msgText,
          assistantMsg: reply,
        }),
      }).catch(() => {})

    } catch (err) {
      setIsLoading(false); setIsStreaming(false); setStreamingText('')
      const errMsgs = [...currentMsgs, { role:'assistant', content:'Error reaching AI. Please try again.' }]
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:errMsgs}:c))
    }
  }

  const handleSummarise = async () => {
    if (!activeConvId || isSummarising) return
    setIsSummarising(true)
    try {
      const res = await fetch('/api/summarise', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ messages, module:activeConv.module, topic:activeConv.topic }) })
      const { summary } = await res.json()
      const summaryMsg = { role:'assistant', content:`📋 **Conversation Summary**\n\n${summary}\n\n---\n_Summarised. Continuing from here._` }
      const newMsgs = [summaryMsg]
      await updateConversation(activeConvId, { messages:newMsgs, is_summarised:true })
      setConversations(prev=>prev.map(c=>c.id===activeConvId?{...c,messages:newMsgs,is_summarised:true}:c))
      setShowSummarise(false)
    } catch {}
    setIsSummarising(false)
  }

  const handleDelete = async (id) => {
    await deleteConversation(id)
    setConversations(prev=>prev.filter(c=>c.id!==id))
    if (activeConvId === id) goHome()
  }

  const groups = groupConversations(filteredConvs)

  return (
    <div style={{ display:'flex', height:'100vh', background:t.bg, fontFamily:"'DM Sans',sans-serif", overflow:'hidden' }}>
      <style>{`
        @keyframes typingBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes msgSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blob1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,-30px) scale(1.08)}66%{transform:translate(-20px,20px) scale(0.95)}}
        @keyframes blob2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-35px,25px) scale(0.93)}66%{transform:translate(25px,-15px) scale(1.05)}}
        @keyframes blob3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(20px,30px) scale(1.06)}}
        .tone-btn{padding:5px 12px;border-radius:20px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;transition:all 0.18s;font-weight:500;}
        .tone-btn.active{background:linear-gradient(135deg,#C850C0,#FF6B35);border-color:transparent!important;color:#fff!important;font-weight:700;box-shadow:0 2px 10px rgba(200,80,192,0.3);}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(200,80,192,0.3);border-radius:4px}
        @media(max-width:768px){.main-topbar{padding:10px 14px!important;}.chat-input-wrap{padding:10px 12px 14px!important;}.chat-messages{padding:16px 12px!important;}}
      `}</style>

      {/* Mobile overlay */}
      {sidebarOpen && isMobileWidth() && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40, backdropFilter:'blur(2px)' }} onClick={()=>setSidebarOpen(false)}/>
      )}

      {/* ── Sidebar */}
      <div style={{
        width:264, minWidth:264,
        background:t.sidebar, borderRight:`1px solid ${t.border}`,
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition:'transform 0.3s ease',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        position: isMobileWidth() ? 'fixed' : 'relative',
        top:0, bottom:0, left:0, zIndex:50,
      }}>
        <div style={{ padding:'16px 16px 12px', borderBottom:`1px solid ${t.border}` }}>
          <div onClick={goHome} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, cursor:'pointer' }}>
            <WaniLogo size={30} dark={dark}/>
            <WaniWordmark height={16} dark={dark}/>
          </div>
          <button onClick={()=>goChat(null,null,null)} style={{
            width:'100%', padding:'10px 14px', background:goldGrad, border:'none', borderRadius:10,
            color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:'0 2px 10px rgba(200,80,192,0.25)', transition:'all 0.2s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(200,80,192,0.4)';e.currentTarget.style.transform='translateY(-1px)'}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 10px rgba(200,80,192,0.25)';e.currentTarget.style.transform='translateY(0)'}}
          ><span style={{ fontSize:16 }}>+</span> New Conversation</button>
        </div>

        {/* Search */}
        <div style={{ padding:'10px 14px 6px' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:t.text4, fontSize:13 }}>🔍</span>
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search..."
              style={{ width:'100%', padding:'8px 10px 8px 32px', boxSizing:'border-box', border:`1.5px solid ${t.border}`, borderRadius:10, fontSize:13, color:t.text, background:t.inputBg, fontFamily:"'DM Sans',sans-serif", outline:'none', transition:'border-color 0.2s' }}
              onFocus={e=>e.target.style.borderColor='#C850C0'}
              onBlur={e=>e.target.style.borderColor=t.border}
            />
          </div>
        </div>

        {/* Conversations */}
        <div style={{ flex:1, overflowY:'auto', padding:'4px 8px 8px' }}>
          {dbLoading ? (
            <div style={{ padding:20, textAlign:'center' }}>
              <div style={{ width:20, height:20, border:`2px solid ${t.border}`, borderTopColor:'#C850C0', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 8px' }}/>
              <span style={{ fontSize:12, color:t.text4 }}>Loading...</span>
            </div>
          ) : filteredConvs.length === 0 ? (
            <div style={{ padding:'24px 16px', textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>💬</div>
              <p style={{ fontSize:12, color:t.text4, lineHeight:1.6 }}>No conversations yet</p>
            </div>
          ) : (
            Object.entries(groups).map(([group, convs]) => convs.length===0 ? null : (
              <div key={group}>
                <div style={{ fontSize:10, fontWeight:700, color:t.text4, letterSpacing:0.8, textTransform:'uppercase', padding:'10px 6px 4px' }}>{group}</div>
                {convs.map(conv => (
                  <ConversationItem key={conv.id} conv={conv} isActive={conv.id===activeConvId} t={t}
                    onClick={()=>{ setActiveConvId(conv.id); setView('chat'); setShowSummarise(false); if(isMobileWidth()) setSidebarOpen(false) }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Profile */}
        <div style={{ padding:'10px 14px', borderTop:`1px solid ${t.border}` }}>
          <div onClick={()=>setShowProfile(true)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, cursor:'pointer', transition:'background 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(200,80,192,0.08)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{ width:32, height:32, borderRadius:'50%', background:goldGrad, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0, boxShadow:'0 2px 8px rgba(200,80,192,0.25)' }}>
              {getInitials(profile?.name, session.user.email)}
            </div>
            <div style={{ overflow:'hidden', flex:1 }}>
              <div style={{ fontSize:13, fontWeight:500, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile?.name || 'My Profile'}</div>
              <div style={{ fontSize:11, color:t.text4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{session.user.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, position:'relative' }}>

        {/* Animated background */}
        <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:0, background:t.bgGrad }}>
          <div style={{ position:'absolute', width:600, height:600, borderRadius:'50%', background:`radial-gradient(circle,${t.blob1} 0%,transparent 65%)`, top:'-15%', right:'0%', animation:'blob1 12s ease-in-out infinite' }}/>
          <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:`radial-gradient(circle,${t.blob2} 0%,transparent 65%)`, bottom:'-10%', left:'5%', animation:'blob2 15s ease-in-out infinite' }}/>
          <div style={{ position:'absolute', width:380, height:380, borderRadius:'50%', background:`radial-gradient(circle,${t.blob3} 0%,transparent 65%)`, top:'35%', right:'25%', animation:'blob3 10s ease-in-out infinite' }}/>
        </div>

        {/* Top bar */}
        <div className="main-topbar" style={{ padding:'11px 16px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:10, background:t.topbar, backdropFilter:'blur(10px)', flexShrink:0, position:'relative', zIndex:2 }}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:8, fontSize:16, color:t.text3, transition:'background 0.15s', flexShrink:0 }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(200,80,192,0.08)'}
            onMouseLeave={e=>e.currentTarget.style.background='none'}
          >☰</button>

          <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', flexShrink:0 }} onClick={goHome}>
            <WaniLogo size={22} dark={dark}/>
            <WaniWordmark height={13} dark={dark}/>
          </div>

          {view==='chat' && activeConv && (
            <><span style={{ color:t.text4, fontSize:16 }}>›</span>
            <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
              <ModuleBadge module={activeConv.module}/>
              <div style={{ minWidth:0, display:'none' }} className="conv-title-wrap">
                <div style={{ fontSize:13, fontWeight:600, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{activeConv.title}</div>
              </div>
            </div></>
          )}

          {view==='topic' && (<><span style={{ color:t.text4, fontSize:16 }}>›</span><div style={{ fontSize:13, fontWeight:500, color:t.text2 }}>{browseTopic || browseModule?.split('–')[0].trim()}</div></>)}

          <div style={{ flex:1 }}/>

          {/* Dark mode toggle */}
          <button onClick={toggle} style={{
            width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative',
            background: dark ? goldGrad : '#E8E3D5',
            transition:'background 0.3s', flexShrink:0,
          }}>
            <div style={{
              position:'absolute', top:2, width:20, height:20, borderRadius:'50%',
              background:'#fff', transition:'left 0.3s',
              left: dark ? 22 : 2,
              boxShadow:'0 2px 4px rgba(0,0,0,0.2)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:11,
            }}>{dark ? '🌙' : '☀️'}</div>
          </button>
        </div>

        {/* Tone bar — chat only */}
        {view==='chat' && (
          <div style={{ padding:'6px 16px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:8, background:t.topbar, backdropFilter:'blur(6px)', flexShrink:0, position:'relative', zIndex:2, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:t.text4, marginRight:2, fontWeight:500 }}>Tone:</span>
            {[{key:'balanced',label:'⚖️ Balanced'},{key:'direct',label:'⚡ Direct'},{key:'friendly',label:'😊 Friendly'},{key:'formal',label:'📋 Formal'}].map(to => (
              <button key={to.key} className={`tone-btn${tone===to.key?' active':''}`}
                onClick={()=>setTone(to.key)}
                style={{ border:`1.5px solid ${tone===to.key?'transparent':t.toneBtnBdr}`, background:tone===to.key?undefined:t.toneBtn, color:tone===to.key?undefined:t.toneBtnTxt }}
              >{to.label}</button>
            ))}
          </div>
        )}

        {/* Summarise banner */}
        {showSummarise && activeConv && view==='chat' && (
          <div style={{ background:t.summarise, borderBottom:`1px solid ${t.summariseBdr}`, padding:'9px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:13, flexShrink:0, position:'relative', zIndex:2, flexWrap:'wrap', gap:8 }}>
            <span style={{ color:t.summariseTxt }}>⚡ Getting long — summarise to keep it sharp?</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleSummarise} disabled={isSummarising} style={{ padding:'5px 14px', background:goldGrad, border:'none', borderRadius:8, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>{isSummarising?'Summarising…':'Summarise'}</button>
              <button onClick={()=>setShowSummarise(false)} style={{ padding:'5px 12px', background:'none', border:`1px solid ${t.summariseBdr}`, borderRadius:8, color:t.summariseTxt, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Dismiss</button>
            </div>
          </div>
        )}

        {/* Views */}
        {view==='home' && <HomeScreen conversations={conversations} t={t} onSelectTopic={(mod, topic, convId)=>{ if(convId) goChat(convId); else goTopic(mod, topic) }} onNewChat={(mod,topic)=>goChat(null,mod,topic)}/>}
        {view==='topic' && <TopicView module={browseModule} topic={browseTopic} conversations={conversations} t={t} onSelectConv={(convId,mod,topic)=>{ if(convId) goChat(convId); else goTopic(mod,topic) }} onNewChat={(mod,topic)=>goChat(null,mod,topic)} onBack={goHome}/>}

        {view==='chat' && (
          <>
            <div className="chat-messages" style={{ flex:1, overflowY:'auto', padding:'20px 16px', position:'relative', zIndex:1 }}>
              <div style={{ maxWidth:720, margin:'0 auto' }}>
                {messages.length === 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'calc(100vh - 280px)', textAlign:'center', animation:'fadeIn 0.4s ease' }}>
                    <WaniLogo size={window.innerWidth < 768 ? 48 : 80} dark={dark}/>
                    <div style={{ marginTop:16, marginBottom:8 }}>
                      <WaniWordmark height={window.innerWidth < 768 ? 24 : 40} dark={dark}/>
                    </div>
                    <p style={{ fontSize:14, color:t.text3, maxWidth:300, lineHeight:1.7, marginBottom:22, marginTop:8 }}>
                      {browseTopic ? `Ask anything about ${browseTopic}` : 'Ask any SAP question'}
                    </p>
                    {browseTopic && STARTERS[browseTopic] && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:420 }}>
                        {STARTERS[browseTopic].map((s,i)=>(
                          <div key={i} onClick={()=>setInput(s)}
                            style={{ padding:'7px 14px', background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:20, fontSize:12, color:t.text3, cursor:'pointer', transition:'all 0.15s' }}
                            onMouseEnter={e=>{e.currentTarget.style.borderColor='#C850C0';e.currentTarget.style.color=t.text;e.currentTarget.style.background=t.surface2}}
                            onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3;e.currentTarget.style.background=t.surface}}
                          >{s}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((msg,i)=><MessageBubble key={i} msg={msg} isStreaming={false} streamingText="" t={t}/>)}
                    {isLoading && !isStreaming && (
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:20 }}>
                        <div style={{ width:32, height:32, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}><WaniLogo size={28} dark={dark}/></div>
                        <div style={{ background:t.msgAI, border:`1px solid ${t.msgAIBdr}`, borderRadius:'4px 16px 16px 16px' }}><TypingDots t={t}/></div>
                      </div>
                    )}
                    {isStreaming && <MessageBubble msg={{role:'assistant',content:''}} isStreaming={true} streamingText={streamingText} t={t}/>}
                    <div ref={bottomRef}/>
                  </>
                )}
              </div>
            </div>

            {/* Input */}
            <div className="chat-input-wrap" style={{ padding:'11px 16px 14px', borderTop:`1px solid ${t.border}`, background:t.topbar, backdropFilter:'blur(10px)', flexShrink:0, position:'relative', zIndex:2 }}>
              <div style={{ maxWidth:720, margin:'0 auto' }}>
                <div style={{ display:'flex', gap:10, alignItems:'flex-end', background:t.inputBg, border:`1.5px solid ${t.border2}`, borderRadius:14, padding:'10px 12px', transition:'border-color 0.2s, box-shadow 0.2s' }}
                  onFocusCapture={e=>{e.currentTarget.style.borderColor='#C850C0';e.currentTarget.style.boxShadow='0 0 0 3px rgba(200,80,192,0.1)'}}
                  onBlurCapture={e=>{e.currentTarget.style.borderColor=t.border2;e.currentTarget.style.boxShadow='none'}}
                >
                  <textarea ref={inputRef} value={input}
                    onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px'}}
                    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}}}
                    placeholder="Ask your SAP question… (Enter to send)"
                    rows={1}
                    style={{ flex:1, background:'transparent', border:'none', resize:'none', fontSize:14, color:t.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.65, height:'24px', maxHeight:'160px', overflowY:'auto', padding:0, outline:'none' }}
                  />
                  <button onClick={handleSend} disabled={!input.trim()||isLoading||isStreaming}
                    style={{ width:36, height:36, borderRadius:10, border:'none', flexShrink:0, background:input.trim()&&!isLoading&&!isStreaming?goldGrad:t.border, color:input.trim()&&!isLoading&&!isStreaming?'#fff':t.text4, cursor:input.trim()&&!isLoading&&!isStreaming?'pointer':'not-allowed', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s' }}
                  >→</button>
                </div>
                <div style={{ fontSize:11, color:t.text4, textAlign:'right', marginTop:4 }}>
                  {activeConv?.module || browseModule || 'Free mode'} · verify system-specific behaviour
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showProfile && <ProfileModal session={session} profile={profile} t={t} onClose={()=>setShowProfile(false)} onSave={async(u)=>{await upsertProfile(session.user.id,u);setProfile(p=>({...p,...u}))}} onSignOut={signOut}/>}
    </div>
  )
}
