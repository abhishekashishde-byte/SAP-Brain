import { useState, useEffect, useRef } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import { WaniLogo, WaniWordmark } from './Login.jsx'
import { useTheme } from '../App.jsx'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
  markAsProject, loadProjects,
  getProfile, upsertProfile,
} from '../supabaseClient'

const T = {
  light: {
    bg:'#FAFAF8',surface:'#FFFFFF',surface2:'#F5F0FA',border:'#EDEDE8',border2:'#D8D0E8',
    text:'#1C1C1E',text2:'#3A3A3C',text3:'#8A8A8E',text4:'#AEAEB2',
    sidebar:'linear-gradient(180deg,#FFFFFF 0%,#FDF8FF 100%)',topbar:'rgba(255,255,255,0.9)',
    inputBg:'#FAFAF8',msgUser:'#FDF4FF',msgUserBdr:'#E8C8F0',msgAI:'#FFFFFF',msgAIBdr:'#EDEDED',
    blob1:'rgba(200,80,192,0.12)',blob2:'rgba(255,107,53,0.09)',blob3:'rgba(255,204,112,0.11)',
    bgGrad:'linear-gradient(160deg,#FDF8FF 0%,#FFF5F0 40%,#FFFBF0 100%)',
    toneBtn:'#F5F0FA',toneBtnBdr:'#D1C8DC',toneBtnTxt:'#5A4A6A',
    codeBg:'rgba(200,80,192,0.1)',codeTxt:'#7C3A7A',
    summarise:'linear-gradient(135deg,rgba(200,80,192,0.08),rgba(255,107,53,0.06))',
    summariseBdr:'rgba(200,80,192,0.2)',summariseTxt:'#7C3A7A',
  },
  dark: {
    bg:'#0A0A12',surface:'#12101E',surface2:'#1A1530',border:'#2A2440',border2:'#3D3560',
    text:'#F0EEF8',text2:'#C8C4DC',text3:'#8A849E',text4:'#5A5470',
    sidebar:'linear-gradient(180deg,#12101E 0%,#0E0C1A 100%)',topbar:'rgba(12,10,20,0.92)',
    inputBg:'#1A1530',msgUser:'#1E1535',msgUserBdr:'#4A2060',msgAI:'#16132A',msgAIBdr:'#2A2440',
    blob1:'rgba(200,80,192,0.18)',blob2:'rgba(255,107,53,0.14)',blob3:'rgba(255,204,112,0.12)',
    bgGrad:'linear-gradient(160deg,#0E0C1E 0%,#120A18 40%,#0C0E18 100%)',
    toneBtn:'#1E1A30',toneBtnBdr:'#3D3560',toneBtnTxt:'#A090C0',
    codeBg:'rgba(200,80,192,0.18)',codeTxt:'#D070D0',
    summarise:'linear-gradient(135deg,rgba(200,80,192,0.15),rgba(255,107,53,0.1))',
    summariseBdr:'rgba(200,80,192,0.35)',summariseTxt:'#D090D0',
  }
}

const MODULE_COLORS = {
  "PP – Production Planning":{ from:'#16a34a',to:'#059669',emoji:'⚙️' },
  "PM – Plant Maintenance":  { from:'#4f46e5',to:'#7c3aed',emoji:'🔧' },
  "MM – Logistics":          { from:'#ea580c',to:'#dc2626',emoji:'📦' },
  "Fiori / UX":              { from:'#0284c7',to:'#0369a1',emoji:'◻️' },
  "S/4HANA General":         { from:'#b45309',to:'#92400e',emoji:'◈'  },
}

const groupConversations = (convs) => {
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1)
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate()-7)
  const g = { Today:[],Yesterday:[],'This Week':[],Earlier:[] }
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

// ── CODE ATTACHMENT CARD ──────────────────────────────────────────────────────
function CodeCard({ language, lines, content, expanded, onToggle, onRemove, t, dark }) {
  const langColors = { ABAP: '#1E6B4A', SQL: '#1A56DB', XML: '#9A3412', JSON: '#6D28D9', Code: '#374151' }
  const bgColor = dark ? '#1E1E2E' : '#F8F9FC'
  const borderColor = dark ? '#2D2D3D' : '#E2E8F0'

  return (
    <div style={{ borderRadius:10, border:`1.5px solid ${borderColor}`, background:bgColor, overflow:'hidden', marginBottom:6 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', cursor:'pointer', userSelect:'none' }}
        onClick={onToggle}>
        <span style={{ fontSize:14 }}>📄</span>
        <span style={{ fontSize:12, fontWeight:600, color: langColors[language] || '#374151',
          background: `${langColors[language] || '#374151'}18`, padding:'1px 7px', borderRadius:6 }}>
          {language}
        </span>
        <span style={{ fontSize:12, color: t?.text4 || '#888' }}>{lines} lines</span>
        <span style={{ marginLeft:'auto', fontSize:11, color: t?.text4 || '#888' }}>
          {expanded ? '▲ collapse' : '▼ expand'}
        </span>
        {onRemove && (
          <span onClick={e=>{ e.stopPropagation(); onRemove() }}
            style={{ fontSize:14, color:'#DC2626', cursor:'pointer', marginLeft:4, lineHeight:1 }}>×</span>
        )}
      </div>
      {/* Code preview */}
      {expanded && (
        <div style={{ borderTop:`1px solid ${borderColor}`, background: dark ? '#12121C' : '#F1F5F9',
          padding:'10px 14px', maxHeight:240, overflowY:'auto' }}>
          <pre style={{ margin:0, fontSize:11, fontFamily:"'Fira Code','Courier New',monospace",
            color: dark ? '#A8D8A8' : '#1E293B', whiteSpace:'pre-wrap', wordBreak:'break-word',
            lineHeight:1.6 }}>{content}</pre>
        </div>
      )}
    </div>
  )
}

function ModuleBadge({ module, small }) {
  const meta = MODULE_META[module]
  if (!meta) return null
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',
      padding:small?'2px 7px':'3px 9px',
      background:meta.bg,color:meta.color,
      border:`1px solid ${meta.border}`,
      borderRadius:20,fontSize:small?10:11,fontWeight:600,letterSpacing:0.3,flexShrink:0,
    }}>{meta.label}</span>
  )
}

function TypingDots() {
  return (
    <div style={{ display:'flex',gap:5,alignItems:'center',padding:'12px 16px' }}>
      {[0,1,2].map(i=>(
        <div key={i} style={{ width:7,height:7,borderRadius:'50%',background:'#4F46E5',animation:'typingBounce 1.2s infinite',animationDelay:`${i*0.18}s`,opacity:0.7 }}/>
      ))}
    </div>
  )
}

function MessageBubble({ msg, isStreaming, streamingText, t, dark, userInitial, prevUserMsg, onAnalyse }) {
  const isUser = msg.role === 'user'
  const content = isStreaming ? streamingText : msg.content
  const displayContent = msg._display || (isUser ? content?.replace(/\[ATTACHED_CODE[\s\S]*?\[\/ATTACHED_CODE\]/g, '').trim() : content)
  const codeAttachment = msg._code || null
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(null)
  const [codeExpanded, setCodeExpanded] = useState(false)

  const inlineFormat = (text) => {
    if (!text) return ''
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ fontWeight:600,color:t.text }}>{part.slice(2,-2)}</strong>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ fontFamily:"'IBM Plex Mono',monospace",background:t.codeBg,padding:'2px 6px',borderRadius:4,fontSize:'0.88em',color:t.codeTxt }}>{part.slice(1,-1)}</code>
      if (part.startsWith('_') && part.endsWith('_')) return <span key={i} style={{ fontSize:11,color:t.text4,fontStyle:'italic' }}>{part.slice(1,-1)}</span>
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
        const copyTableAsCSV = () => {
          // Tab-separated — pastes directly into Excel with correct columns
          const tsv = [headers.map(h=>h.trim()).join('\t'), ...rows.map(r=>r.map(c=>c.trim().replace(/<[^>]+>/g,'')).join('\t'))].join('\n')
          navigator.clipboard?.writeText(tsv)
        }
        const downloadCSV = () => {
          // Download as proper CSV file — Excel opens with correct columns automatically
          const csv = [headers.map(h=>`"${h.trim()}"`).join(','), ...rows.map(r=>r.map(c=>`"${c.trim().replace(/<[^>]+>/g,'').replace(/"/g,'""')}"`).join(','))].join('\n')
          const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv)
          a.download = 'wani-table.csv'; a.click()
        }
        els.push(<div key={`t${i}`} style={{ margin:'10px 0' }}>
          <div style={{ display:'flex',gap:6,marginBottom:6,justifyContent:'flex-end' }}>
            <button onClick={copyTableAsCSV} style={{ fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${t.border}`,background:'transparent',color:t.text3,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}>📋 Copy for Excel</button>
            <button onClick={downloadCSV} style={{ fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${t.border}`,background:'transparent',color:t.text3,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}>↓ Download .csv</button>
          </div>
          <div style={{ overflowX:'auto' }}>
          <table style={{ borderCollapse:'collapse',width:'100%',fontSize:15 }}>
            <thead><tr>{headers.map((h,j)=><th key={j} style={{ padding:'8px 12px',background:'rgba(79,70,229,0.08)',borderBottom:'2px solid rgba(79,70,229,0.2)',textAlign:'left',fontWeight:600,color:t.text,whiteSpace:'nowrap' }}>{h.trim()}</th>)}</tr></thead>
            <tbody>{rows.map((row,j)=><tr key={j} style={{ borderBottom:`1px solid ${t.border}`,background:j%2===0?t.surface:t.surface2 }}>{row.map((cell,k)=><td key={k} style={{ padding:'7px 12px',color:t.text2 }}>{inlineFormat(cell.trim())}</td>)}</tr>)}</tbody>
          </table></div></div>)
        continue
      }
      // ── CODE BLOCKS (triple backtick) ────────────────────────────────────
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim().toLowerCase()
        const codeLines = []
        i++
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]); i++
        }
        i++ // skip closing ```
        const codeText = codeLines.join('\n')

        // Detect if it's CSV/TSV data
        const looksLikeCSV = codeLines.length >= 2 && (
          lang === 'csv' || lang === 'tsv' ||
          codeLines[0].includes(',') || codeLines[0].includes('\t')
        )

        if (looksLikeCSV) {
          // Parse and render as proper table with copy button
          const sep = codeLines[0].includes('\t') ? '\t' : ','
          const parseRow = r => r.split(sep).map(c => c.trim().replace(/^"|"$/g, '').replace(/<[^>]+>/g, ''))
          const headerRow = parseRow(codeLines[0])
          const dataRows = codeLines.slice(1).map(parseRow).filter(r => r.some(c => c))

          const copyForExcel = () => {
            const tsv = [headerRow.join('\t'), ...dataRows.map(r => r.join('\t'))].join('\n')
            navigator.clipboard?.writeText(tsv)
          }
          const downloadFile = () => {
            const csv = [headerRow.map(h => `"${h}"`).join(','), ...dataRows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(','))].join('\n')
            const a = document.createElement('a')
            a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv)
            a.download = 'wani-export.csv'; a.click()
          }

          els.push(<div key={`csv${i}`} style={{ margin:'10px 0' }}>
            <div style={{ display:'flex', gap:6, marginBottom:6, justifyContent:'flex-end' }}>
              <button onClick={copyForExcel} style={{ fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${t.border}`,background:'transparent',color:t.text3,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}>📋 Copy for Excel</button>
              <button onClick={downloadFile} style={{ fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${t.border}`,background:'transparent',color:t.text3,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}>↓ Download .csv</button>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ borderCollapse:'collapse', width:'100%', fontSize:15 }}>
                <thead><tr>{headerRow.map((h,j)=><th key={j} style={{ padding:'8px 12px',background:'rgba(79,70,229,0.08)',borderBottom:'2px solid rgba(79,70,229,0.2)',textAlign:'left',fontWeight:600,color:t.text,whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>{dataRows.map((row,j)=><tr key={j} style={{ borderBottom:`1px solid ${t.border}`,background:j%2===0?t.surface:t.surface2 }}>{row.map((cell,k)=><td key={k} style={{ padding:'7px 12px',color:t.text2,lineHeight:1.5 }}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>)
        } else {
          // Regular code block
          const copyCode = () => navigator.clipboard?.writeText(codeText)
          els.push(<div key={`code${i}`} style={{ margin:'10px 0', position:'relative' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 12px', background:'rgba(79,70,229,0.08)', borderRadius:'8px 8px 0 0', borderBottom:`1px solid ${t.border}` }}>
              <span style={{ fontSize:11, color:t.text4, fontFamily:"'IBM Plex Mono',monospace" }}>{lang || 'code'}</span>
              <button onClick={copyCode} style={{ fontSize:11,padding:'2px 8px',borderRadius:5,border:`1px solid ${t.border}`,background:'transparent',color:t.text3,cursor:'pointer',fontFamily:"'Inter',sans-serif" }}>Copy</button>
            </div>
            <pre style={{ margin:0, padding:'12px', background:t.codeBg, borderRadius:'0 0 8px 8px', overflowX:'auto', fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:t.codeTxt, lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{codeText}</pre>
          </div>)
        }
        continue
      }
      if (line.startsWith('### '))    { els.push(<div key={i} style={{ fontWeight:600,fontSize:16,color:t.text,margin:'10px 0 4px' }}>{line.slice(4)}</div>); i++; continue }
      if (/^[\*\-] /.test(line))     { els.push(<div key={i} style={{ display:'flex',gap:8,margin:'4px 0',paddingLeft:4 }}><span style={{ color:'#4F46E5',marginTop:1,flexShrink:0,fontSize:14 }}>•</span><span style={{ lineHeight:1.7,color:t.text2,fontSize:16 }}>{inlineFormat(line.slice(2))}</span></div>); i++; continue }
      if (/^\s+[\+\-\*] /.test(line)) {
        const txt = line.replace(/^\s+[\+\-\*] /,'')
        els.push(<div key={i} style={{ display:'flex',gap:8,margin:'3px 0',paddingLeft:20 }}><span style={{ color:'#6366F1',fontSize:12,marginTop:3,flexShrink:0 }}>–</span><span style={{ fontSize:15,lineHeight:1.65,color:t.text3 }}>{inlineFormat(txt)}</span></div>); i++; continue
      }
      if (/^---+$/.test(line.trim())) { els.push(<hr key={i} style={{ border:'none',borderTop:`1px solid ${t.border}`,margin:'10px 0' }}/>); i++; continue }
      if (line.trim() === '')         { els.push(<div key={i} style={{ height:6 }}/>); i++; continue }
      // SAP Resource links — render as cards
      if (line.match(/^[💬📖✍️🔗].*\[.+\]\(https?:\/\/.+\)/)) {
        const match = line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
        if (match) {
          const icon = line[0]
          const source = icon === '💬' ? 'SAP Community' : icon === '📖' ? 'SAP Help' : icon === '✍️' ? 'SAP Blog' : 'SAP'
          const color = icon === '💬' ? '#0070f3' : icon === '📖' ? '#10b981' : '#8b5cf6'
          els.push(
            <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 12px',margin:'4px 0',background:`${color}11`,border:`1px solid ${color}33`,borderRadius:8,textDecoration:'none',cursor:'pointer' }}>
              <span style={{ fontSize:16,flexShrink:0 }}>{icon}</span>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:600,color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{match[1]}</div>
                <div style={{ fontSize:11,color:t.text4 }}>{source}</div>
              </div>
              <svg style={{ marginLeft:'auto',flexShrink:0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          )
          i++; continue
        }
      }
      // Handle markdown links [title](url)
      if (line.includes('](')) {
        const parts = line.split(/(\[([^\]]+)\]\(([^)]+)\))/g)
        const rendered = []
        for (let pi = 0; pi < parts.length; pi++) {
          if (parts[pi].startsWith('[') && parts[pi].includes('](')) {
            const match = parts[pi].match(/\[([^\]]+)\]\(([^)]+)\)/)
            if (match) rendered.push(<a key={pi} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color:'#4F46E5',textDecoration:'underline' }}>{match[1]}</a>)
          } else if (parts[pi] && !parts[pi].match(/^[^\]]+$|^\([^)]+\)$/)) {
            rendered.push(<span key={pi}>{inlineFormat(parts[pi])}</span>)
          }
        }
        els.push(<div key={i} style={{ margin:'2px 0',lineHeight:1.7,color:t.text2 }}>{rendered}</div>)
        i++; continue
      }
      els.push(<div key={i} style={{ margin:'2px 0',lineHeight:1.7,color:t.text2 }}>{inlineFormat(line)}</div>)
      i++
    }
    return els
  }

  const handleCopy = () => {
    const plain = (content||'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/_([^_]+)_/g,'$1')
    navigator.clipboard?.writeText(plain)
    setCopied(true)
    setTimeout(()=>setCopied(false), 2000)
  }

  const ActionBar = () => (
    <div style={{ display:'flex',gap:6,marginTop:6,alignItems:'center' }}>
      {[{id:'up',icon:'👍',label:'Helpful'},{id:'down',icon:'👎',label:'Not helpful'}].map(btn=>(
        <button key={btn.id} title={btn.label} onClick={()=>setLiked(liked===btn.id?null:btn.id)} style={{
          background:liked===btn.id?'rgba(79,70,229,0.12)':'transparent',
          border:`1px solid ${liked===btn.id?'rgba(79,70,229,0.4)':t.border}`,
          borderRadius:8,padding:'3px 8px',cursor:'pointer',fontSize:13,
          transition:'all 0.15s',color:liked===btn.id?'#4F46E5':t.text4,
        }}>{btn.icon}</button>
      ))}
      <button title="Copy" onClick={handleCopy} style={{
        background:'transparent',border:`1px solid ${t.border}`,
        borderRadius:8,padding:'3px 9px',cursor:'pointer',fontSize:11,
        color:copied?'#4F46E5':t.text4,transition:'all 0.15s',fontFamily:"'Inter','DM Sans',sans-serif",
      }}>{copied?'✓ Copied':'Copy'}</button>
    </div>
  )

  if (isUser) {
    return (
      <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:18,animation:'msgSlide 0.25s ease forwards',gap:8,alignItems:'flex-start' }}>
        <div style={{ maxWidth:'80%', display:'flex', flexDirection:'column', gap:6 }}>
          {/* Code attachment card */}
          {codeAttachment && (
            <CodeCard
              language={codeAttachment.language}
              lines={codeAttachment.lines}
              content={msg.content?.match(/\[ATTACHED_CODE[^\]]*\]([\s\S]*?)\[\/ATTACHED_CODE\]/)?.[1]?.trim() || ''}
              expanded={codeExpanded}
              onToggle={() => setCodeExpanded(p => !p)}
              onRemove={null}
              t={t} dark={dark}
            />
          )}
          {/* Message text */}
          {displayContent && (
            <div style={{ background:t.msgUser,border:`1px solid ${t.msgUserBdr}`,borderRadius:'16px 4px 16px 16px',padding:'10px 14px',fontSize:16,lineHeight:1.7,color:t.text,wordBreak:'break-word' }}>
              <span style={{ whiteSpace:'pre-wrap' }}>{displayContent}</span>
            </div>
          )}
        </div>
        <div style={{ width:30,height:30,borderRadius:8,flexShrink:0,background:'linear-gradient(135deg,#1E3A5F,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',marginTop:2 }}>
          {userInitial||'A'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex',gap:10,alignItems:'flex-start',marginBottom:22,animation:'msgSlide 0.25s ease forwards' }}>
      <div style={{ width:30,height:30,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',marginTop:2 }}>
        <WaniLogo size={26} dark={dark}/>
      </div>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontSize:16,lineHeight:1.8,wordBreak:'break-word' }}>
          {renderMarkdown(content)}
          {isStreaming && <span style={{ display:'inline-block',width:2,height:'1em',background:'#4F46E5',marginLeft:2,animation:'cursorBlink 0.8s infinite',verticalAlign:'middle' }}/>}
        </div>
        {!isStreaming && <ActionBar/>}
        {/* Code Analysis buttons — show when previous user message had code */}
        {!isStreaming && prevUserMsg && /METHOD |CLASS |LOOP AT |SELECT\s|DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |FUNCTION |REPORT |TYPES:|CONSTANTS:/i.test(prevUserMsg) && (
          <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:6 }}>
            <div style={{ width:'100%', fontSize:11, color:t.text4, marginBottom:2, fontWeight:500 }}>🔬 Analyse this code:</div>
            {[
              { icon:'📖', label:'Explain', prompt:'Explain what this code does in simple terms. Structure: what it does, logic flow, key objects, watch out.' },
              { icon:'🔬', label:'Reverse Engineer', prompt:'Extract the business logic and rules from this code. What business problem does it solve? What are the rules, triggers, conditions and outcomes in plain business language — not technical?' },
              { icon:'📋', label:'Functional Spec', prompt:'Generate a functional specification document from this code. Include: Function name, Module, Purpose, Trigger/When it runs, Inputs, Outputs, Business Rules, Edge Cases, Assumptions.' },
              { icon:'⚠️', label:'Find Risks', prompt:'Analyse this code for risks, bugs, performance issues, and edge cases. What could go wrong? What scenarios are not handled? Any SAP-specific concerns?' },
              { icon:'⚡', label:'Optimise', prompt:'How can this code be improved? Suggest performance optimisations, better ABAP patterns, and any S/4HANA-specific improvements.' },
            ].map(btn => (
              <button key={btn.label} onClick={() => onAnalyse(btn.prompt)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:8, border:`1px solid ${t.border}`, background:t.surface2, color:t.text3, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:"'Inter','DM Sans',sans-serif", transition:'all 0.15s' }}>
                {btn.icon} {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ExportModal({ conversation, messages, onClose, t, dark }) {
  const [mode, setMode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const stripMeta = (text) =>
    (text||'').replace(/\n\n_✦ Claude_$/,'').replace(/\n\n_✦ Claude.*$/,'').replace(/\n\n_⚡.*$/,'').trim()

  const generateDocx = async (type) => {
    setLoading(true); setError('')
    try {
      if (!window.docx) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js'
          s.onload = resolve; s.onerror = reject
          document.head.appendChild(s)
        })
      }
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle } = window.docx
      const title = conversation?.title || 'SAP Conversation'
      const mod   = conversation?.module || ''
      const topic = conversation?.topic  || ''
      const date  = new Date().toLocaleDateString('en-GB',{ day:'numeric',month:'long',year:'numeric' })
      const userMsgs = messages.filter(m=>m.role==='user')
      const aiMsgs   = messages.filter(m=>m.role==='assistant')

      const parseRuns = (text) => {
        if (!text) return [new TextRun({ text:'',font:'Arial',size:24 })]
        const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
        return parts.map(part => {
          if (part.startsWith('**')&&part.endsWith('**')) return new TextRun({ text:part.slice(2,-2),bold:true,font:'Arial',size:24 })
          if (part.startsWith('`')&&part.endsWith('`'))  return new TextRun({ text:part.slice(1,-1),font:'Courier New',size:22 })
          return new TextRun({ text:part,font:'Arial',size:24 })
        })
      }

      const bodyToParagraphs = (text) => {
        const paras = []
        const lines = text.split('\n')
        lines.forEach(line => {
          if (!line.trim()) { paras.push(new Paragraph({ children:[new TextRun({ text:'',font:'Arial',size:24 })],spacing:{ after:60 } })); return }
          if (/^[*-] /.test(line)) paras.push(new Paragraph({ numbering:{ reference:'bullets',level:0 },children:parseRuns(line.slice(2)),spacing:{ after:80 } }))
          else if (line.startsWith('## ')) paras.push(new Paragraph({ heading:HeadingLevel.HEADING_2,children:[new TextRun({ text:line.slice(3),font:'Arial',size:26,bold:true })],spacing:{ before:200,after:100 } }))
          else paras.push(new Paragraph({ children:parseRuns(line),spacing:{ after:80 } }))
        })
        return paras
      }

      const divider = (color='E5E7EB',size=2) =>
        new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE,size,color,space:1 } },children:[new TextRun({ text:'',font:'Arial',size:4 })],spacing:{ before:200,after:200 } })

      const children = []
      children.push(
        new Paragraph({ heading:HeadingLevel.HEADING_1,children:[new TextRun({ text:title,font:'Arial',size:36,bold:true,color:'1E3A8A' })],spacing:{ before:0,after:160 } }),
        new Paragraph({ children:[new TextRun({ text:'Module: ',font:'Arial',size:22,bold:true,color:'4F46E5' }),new TextRun({ text:`${mod}   `,font:'Arial',size:22 }),new TextRun({ text:'Topic: ',font:'Arial',size:22,bold:true,color:'4F46E5' }),new TextRun({ text:topic,font:'Arial',size:22 })],spacing:{ after:80 } }),
        new Paragraph({ children:[new TextRun({ text:`Prepared by Wani  ·  ${date}`,font:'Arial',size:20,color:'888888',italics:true })],spacing:{ after:280 } }),
        divider('4F46E5',6),
      )

      if (type === 'transcript') {
        messages.forEach((msg, idx) => {
          if (msg.role==='user') {
            children.push(new Paragraph({ children:[new TextRun({ text:'You asked:',font:'Arial',size:22,bold:true,color:'1D4ED8' })],spacing:{ before:280,after:80 } }),...bodyToParagraphs(stripMeta(msg.content)))
          } else {
            children.push(new Paragraph({ children:[new TextRun({ text:'Wani answered:',font:'Arial',size:22,bold:true,color:'059669' })],spacing:{ before:200,after:80 } }),...bodyToParagraphs(stripMeta(msg.content)))
            if (idx < messages.length-1) children.push(divider())
          }
        })
      } else {
        const firstQuestion = userMsgs[0] ? stripMeta(userMsgs[0].content) : ''
        children.push(new Paragraph({ children:[new TextRun({ text:'Problem Statement',font:'Arial',size:28,bold:true,color:'1E3A8A' })],spacing:{ before:0,after:120 } }),new Paragraph({ children:parseRuns(firstQuestion),spacing:{ after:200 } }),divider())
        const lastAI = aiMsgs[aiMsgs.length-1]
        if (lastAI) { children.push(new Paragraph({ children:[new TextRun({ text:'Solution',font:'Arial',size:28,bold:true,color:'059669' })],spacing:{ before:0,after:120 } }),...bodyToParagraphs(stripMeta(lastAI.content)),divider()) }
        const followUps = userMsgs.slice(1)
        if (followUps.length>0) {
          children.push(new Paragraph({ children:[new TextRun({ text:'Additional Context',font:'Arial',size:28,bold:true,color:'1E3A8A' })],spacing:{ before:0,after:120 } }))
          followUps.forEach((q,i) => {
            const ans = aiMsgs[i+1]
            children.push(new Paragraph({ children:[new TextRun({ text:`Q: ${stripMeta(q.content)}`,font:'Arial',size:22,bold:true,color:'4F46E5',italics:true })],spacing:{ before:200,after:80 } }))
            if (ans) children.push(...bodyToParagraphs(stripMeta(ans.content)))
            if (i<followUps.length-1) children.push(divider())
          })
        }
      }

      children.push(new Paragraph({ children:[new TextRun({ text:'Generated by Wani — ask-wani.com',font:'Arial',size:18,color:'AAAAAA',italics:true })],alignment:AlignmentType.CENTER,spacing:{ before:400 } }))

      const doc = new Document({
        numbering:{ config:[{ reference:'bullets',levels:[{ level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,style:{ paragraph:{ indent:{ left:720,hanging:360 } } } }] }] },
        styles:{ default:{ document:{ run:{ font:'Arial',size:24 } } },paragraphStyles:[{ id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{ size:36,bold:true,font:'Arial' },paragraph:{ spacing:{ before:0,after:200 },outlineLevel:0 } },{ id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{ size:26,bold:true,font:'Arial' },paragraph:{ spacing:{ before:200,after:100 },outlineLevel:1 } }] },
        sections:[{ properties:{ page:{ size:{ width:11906,height:16838 },margin:{ top:1440,right:1440,bottom:1440,left:1440 } } },children }]
      })

      const blob = await Packer.toBlob(doc)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `${title.replace(/[^a-z0-9]/gi,'_').slice(0,40)}_wani_${type==='summary'?'resolution_note':'transcript'}.docx`; a.click()
      URL.revokeObjectURL(url); onClose()
    } catch(e) { console.error(e); setError('Export failed — please try again.') }
    setLoading(false)
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)' }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:18,padding:'28px 28px 24px',width:'min(90vw,400px)',boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'Inter',sans-serif",fontSize:18,fontWeight:600,color:t.text }}>Export Conversation</div>
            <div style={{ fontSize:12,color:t.text3,marginTop:3 }}>Choose your document format</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',fontSize:20,color:t.text3,padding:'4px 8px' }}>×</button>
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:10,marginBottom:22 }}>
          {[
            { key:'summary',icon:'📋',title:'SAP Resolution Note',desc:'Problem statement + solution + key steps. Ready to send to a client or keep as documentation.' },
            { key:'transcript',icon:'📄',title:'Full Transcript',desc:'Complete Q&A dialogue — every message in order.' },
          ].map(opt=>(
            <div key={opt.key} onClick={()=>setMode(opt.key)} style={{ padding:'14px 16px',borderRadius:12,cursor:'pointer',border:`2px solid ${mode===opt.key?'#4F46E5':t.border}`,background:mode===opt.key?'rgba(79,70,229,0.06)':t.surface2,transition:'all 0.15s' }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontSize:20 }}>{opt.icon}</span>
                <div>
                  <div style={{ fontSize:13,fontWeight:600,color:mode===opt.key?'#4F46E5':t.text }}>{opt.title}</div>
                  <div style={{ fontSize:11,color:t.text3,marginTop:2,lineHeight:1.5 }}>{opt.desc}</div>
                </div>
                <div style={{ marginLeft:'auto',width:18,height:18,borderRadius:'50%',border:`2px solid ${mode===opt.key?'#4F46E5':t.border}`,background:mode===opt.key?'#4F46E5':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                  {mode===opt.key && <div style={{ width:8,height:8,borderRadius:'50%',background:'#fff' }}/>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {error && <div style={{ fontSize:12,color:'#DC2626',marginBottom:12 }}>{error}</div>}
        <button onClick={()=>mode&&generateDocx(mode)} disabled={!mode||loading} style={{ width:'100%',padding:'12px',borderRadius:10,border:'none',background:mode&&!loading?'linear-gradient(135deg,#1a1a2e,#4F46E5)':t.border,color:mode&&!loading?'#fff':t.text4,fontSize:14,fontWeight:600,fontFamily:"'Inter','DM Sans',sans-serif",cursor:mode&&!loading?'pointer':'not-allowed',transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
          {loading?<><div style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.8s linear infinite' }}/> Generating…</>:<>↓ Download Word Document</>}
        </button>
        <div style={{ fontSize:11,color:t.text4,textAlign:'center',marginTop:10 }}>.docx — opens in Word, Google Docs, LibreOffice</div>
      </div>
    </div>
  )
}

function ProfileModal({ session, profile, onClose, onSave, onSignOut, t }) {
  const [name, setName] = useState(profile?.name||'')
  const [modules, setModules] = useState(profile?.modules||[])
  const [role, setRole] = useState(profile?.role||'')
  const [saving, setSaving] = useState(false)
  const initials = getInitials(name||profile?.name, session.user.email)

  const SAP_MODULES = ['PP','PM','MM','SD','FI','CO','HR','Fiori','S/4HANA','WM/EWM','QM','PS']

  const toggleModule = (m) => setModules(prev =>
    prev.includes(m) ? prev.filter(x=>x!==m) : [...prev, m]
  )

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:16 }} onClick={onClose}>
      <div style={{ background:'linear-gradient(145deg,#1A1035,#0F0A2A)',border:'1px solid rgba(79,70,229,0.2)',borderRadius:24,padding:32,width:360,maxWidth:'100%',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',animation:'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }} onClick={e=>e.stopPropagation()}>
        <div style={{ textAlign:'center',marginBottom:24 }}>
          <div style={{ width:72,height:72,borderRadius:'50%',background:'linear-gradient(135deg,#1a1a2e,#4F46E5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:700,color:'#fff',margin:'0 auto 12px',boxShadow:'0 4px 20px rgba(79,70,229,0.25)' }}>{initials}</div>
          <div style={{ fontSize:13,color:'rgba(255,255,255,0.5)' }}>{session.user.email}</div>
        </div>

        {/* Name */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.2,textTransform:'uppercase',marginBottom:8 }}>Your Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your name"
            style={{ width:'100%',padding:'10px 14px',boxSizing:'border-box',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(79,70,229,0.25)',borderRadius:10,fontSize:14,fontFamily:"'Inter','DM Sans',sans-serif",color:'#fff',outline:'none' }}
          />
        </div>

        {/* Role */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.2,textTransform:'uppercase',marginBottom:8 }}>Your Role</label>
          <input value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. SAP Consultant, Project Manager"
            style={{ width:'100%',padding:'10px 14px',boxSizing:'border-box',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(79,70,229,0.25)',borderRadius:10,fontSize:14,fontFamily:"'Inter','DM Sans',sans-serif",color:'#fff',outline:'none' }}
          />
        </div>

        {/* SAP Module Focus */}
        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.2,textTransform:'uppercase',marginBottom:8 }}>SAP Module Focus</label>
          <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
            {SAP_MODULES.map(m => (
              <button key={m} onClick={()=>toggleModule(m)} style={{
                padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
                border:`1px solid ${modules.includes(m)?'#4F46E5':'rgba(255,255,255,0.15)'}`,
                background:modules.includes(m)?'rgba(79,70,229,0.3)':'rgba(255,255,255,0.05)',
                color:modules.includes(m)?'#a5b4fc':'rgba(255,255,255,0.5)',
                transition:'all 0.15s',
              }}>{m}</button>
            ))}
          </div>
        </div>

        <button onClick={async()=>{ setSaving(true); await onSave({name, role, modules}); setSaving(false); onClose() }}
          style={{ width:'100%',padding:13,background:'linear-gradient(135deg,#1a1a2e,#4F46E5)',border:'none',borderRadius:12,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif",marginBottom:12,boxShadow:'0 4px 16px rgba(79,70,229,0.25)' }}>
          {saving?'Saving...':'Save Profile'}
        </button>
        <button onClick={onSignOut} style={{ width:'100%',padding:12,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,color:'rgba(255,255,255,0.6)',fontSize:14,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.15)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
        >Sign Out</button>
      </div>
    </div>
  )
}

function ConversationItem({ conv, isActive, onClick, onDelete, t }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onClick={onClick}
      style={{ padding:'10px 14px',borderRadius:10,cursor:'pointer',background:isActive?'rgba(79,70,229,0.12)':hovered?'rgba(79,70,229,0.06)':'transparent',borderLeft:isActive?'3px solid #4F46E5':'3px solid transparent',marginBottom:3,transition:'all 0.15s',position:'relative' }}>
      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
        {conv.module && <ModuleBadge module={conv.module} small/>}
        {conv.is_summarised && <span style={{ fontSize:9,color:t.text4,background:t.surface2,padding:'1px 5px',borderRadius:10 }}>∑</span>}
      </div>
      <div style={{ fontSize:13,fontWeight:isActive?600:400,color:isActive?t.text:t.text2,lineHeight:1.4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',paddingRight:hovered?24:0 }}>{conv.title}</div>
      <div style={{ fontSize:12,color:isActive?'#4F46E5':t.text3,marginTop:2,fontWeight:isActive?500:400 }}>
        {conv.topic} · {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
      </div>
      {hovered && (
        <button onClick={e=>{e.stopPropagation();onDelete(conv.id)}} style={{ position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:t.text4,fontSize:18,padding:4,lineHeight:1 }}
          onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
          onMouseLeave={e=>e.currentTarget.style.color=t.text4}
        >×</button>
      )}
    </div>
  )
}

// HomeScreen and TopicView kept identical to original — omitted for brevity, paste from original Brain.jsx

const MODULE_STACK = [
  { key:'PP – Production Planning',mod:'PP',sub:'Production Planning',emoji:'⚙️',gradDark:'linear-gradient(140deg,#1E3A8A 0%,#2563EB 55%,#60A5FA 100%)',gradLight:'linear-gradient(140deg,#1E3A8A 0%,#2563EB 55%,#93C5FD 100%)' },
  { key:'PM – Plant Maintenance',mod:'PM',sub:'Plant Maintenance',emoji:'🔧',gradDark:'linear-gradient(140deg,#064E3B 0%,#059669 55%,#6EE7B7 100%)',gradLight:'linear-gradient(140deg,#064E3B 0%,#059669 55%,#6EE7B7 100%)' },
  { key:'MM – Logistics',mod:'MM',sub:'Logistics',emoji:'📦',gradDark:'linear-gradient(140deg,#7F1D1D 0%,#DC2626 55%,#FCA5A5 100%)',gradLight:'linear-gradient(140deg,#7F1D1D 0%,#DC2626 55%,#FCA5A5 100%)' },
  { key:'Fiori / UX',mod:'Fiori',sub:'User Experience',emoji:'◻',gradDark:'linear-gradient(140deg,#1E3A5F 0%,#1D4ED8 55%,#93C5FD 100%)',gradLight:'linear-gradient(140deg,#1E3A5F 0%,#1D4ED8 55%,#93C5FD 100%)' },
  { key:'S/4HANA General',mod:'S/4HANA',sub:'General',emoji:'◈',gradDark:'linear-gradient(140deg,#3B0764 0%,#7C3AED 55%,#DDD6FE 100%)',gradLight:'linear-gradient(140deg,#3B0764 0%,#7C3AED 55%,#DDD6FE 100%)' },
]

const N_CARDS=MODULE_STACK.length,CARD_H=170,PEEK=14
function topFor(slot){return slot===0?0:CARD_H+(slot-1)*PEEK}
function scaleFor(slot){return 1-slot*0.022}
function opacityFor(slot){return slot===0?1:slot===1?0.45:0}

function HomeScreen({ conversations, onSelectTopic, onNewChat, onQuickLaunch, t, dark }) {
  const TILES = [
    { action:'fs',          icon:'/icon-fs.png',          label:'Build Specs',      desc:'Turn discussions into structured FS documents',                   accent:'#F97316', soft:'#FFF7ED' },
    { action:'customizing', icon:'/icon-customizing.png', label:'Find & Configure', desc:'SPRO paths, T-codes and config guidance',                         accent:'#E11D48', soft:'#FFF1F2' },
    { action:'code',        icon:'/icon-code.png',        label:'Code Insight',     desc:'Analyze ABAP logic, risks and dependencies',                      accent:'#0A7DD8', soft:'#EFF6FF' },
    { action:'workshop',    icon:'/icon-workshop.png',    label:'Deck Generator',   desc:'Generate polished SAP workshop presentations',                    accent:'#F97316', soft:'#FFF7ED' },
    { action:'fiori',       icon:'/icon-fiori.png',       label:'Explore Fiori',    desc:'Find the right Fiori app for any process',                        accent:'#E11D48', soft:'#FFF1F2' },
    { action:'bestpractice',icon:'/icon-cloud.png',       label:'Best Practices',   desc:'SAP-standard flows, Activate guidance and process recommendations', accent:'#7C3AED', soft:'#F5F3FF' },
  ]

  return (
    <div className="wani-home-exact" style={{
      flex:1,
      overflowY:'auto',
      background: dark
        ? 'radial-gradient(circle at 85% 8%, rgba(251,191,36,0.10), transparent 24%), #0D0D14'
        : 'radial-gradient(circle at 90% 10%, rgba(251,191,36,0.18), transparent 22%), linear-gradient(180deg,#FFFFFF 0%,#FFFDF9 70%,#FFF7ED 100%)',
      fontFamily:"'DM Sans','Inter',system-ui,sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes exactTileIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes exactFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        .wani-home-inner{max-width:1120px;margin:0 auto;padding:56px 34px 24px;}
        .wani-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:34px;}
        .wani-hero h1{font-size:44px;line-height:1.08;letter-spacing:-1.6px;margin:0 0 14px;font-weight:800;}
        .wani-hero p{font-size:22px;line-height:1.35;margin:0;font-weight:500;color:#6B7280;}
        .wani-sparkle{width:188px;height:104px;flex:0 0 188px;margin-top:4px;}
        .wani-tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;}
        .wani-tool-card{animation:exactTileIn .42s cubic-bezier(.16,1,.3,1) both;}
        .wani-tool-card:nth-child(1){animation-delay:.03s}.wani-tool-card:nth-child(2){animation-delay:.07s}.wani-tool-card:nth-child(3){animation-delay:.11s}
        .wani-tool-card:nth-child(4){animation-delay:.15s}.wani-tool-card:nth-child(5){animation-delay:.19s}.wani-tool-card:nth-child(6){animation-delay:.23s}
        .wani-tool-card:hover{transform:translateY(-5px)!important;box-shadow:0 22px 42px rgba(15,23,42,.12)!important;}
        .wani-tool-card:hover .wani-card-icon{animation:exactFloat .8s ease-in-out infinite;}
        .wani-card-icon{width:168px;height:168px;object-fit:contain;display:block;margin:0 auto 26px;}
        .wani-card-title{font-size:29px;line-height:1.03;font-weight:800;letter-spacing:-.8px;text-align:center;margin:0;color:#050505;}
        .wani-under{width:44px;height:3px;border-radius:999px;margin:18px auto 22px;}
        .wani-card-desc{font-size:20px;line-height:1.42;font-weight:500;color:#575757;text-align:center;margin:0 auto;max-width:245px;}
        .wani-arrow{width:58px;height:58px;border-radius:999px;margin:34px auto 0;display:flex;align-items:center;justify-content:center;transition:transform .18s ease;}
        .wani-tool-card:hover .wani-arrow{transform:translateX(3px);}
        .wani-bottom-pill{margin:24px 0 0;padding:15px 22px;border-radius:28px;display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(90deg,rgba(255,255,255,.94),rgba(255,247,237,.94));border:1px solid rgba(217,119,6,.18);box-shadow:0 14px 34px rgba(15,23,42,.08);}
        .wani-pill-left{display:flex;align-items:center;gap:18px;font-size:23px;line-height:1.2;font-weight:800;color:#090909;}
        .wani-pill-icon{width:58px;height:58px;border-radius:999px;background:#FFF7ED;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(217,119,6,.08);}
        .wani-pill-action{width:76px;height:58px;border-radius:22px;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;border:1px solid rgba(217,119,6,.16);box-shadow:0 10px 24px rgba(15,23,42,.08);}
        @media (max-width:760px){
          .wani-home-inner{padding:56px 32px 16px;}
          .wani-hero{margin-bottom:32px;}
          .wani-hero h1{font-size:34px;letter-spacing:-1px;margin-bottom:10px;white-space:nowrap;}
          .wani-hero p{font-size:18px;white-space:nowrap;}
          .wani-sparkle{width:104px;height:70px;flex-basis:104px;margin-top:0;}
          .wani-tool-grid{gap:18px 20px;grid-template-columns:repeat(3,minmax(0,1fr));}
          .wani-tool-card{min-height:310px!important;padding:34px 24px 24px!important;border-radius:26px!important;}
          .wani-card-icon{width:128px;height:128px;margin-bottom:30px;}
          .wani-card-title{font-size:22px;letter-spacing:-.5px;}
          .wani-under{width:42px;height:3px;margin:14px auto 20px;}
          .wani-card-desc{font-size:17px;line-height:1.42;max-width:210px;}
          .wani-arrow{width:54px;height:54px;margin-top:auto;}
          .wani-bottom-pill{margin-top:24px;padding:12px 14px 12px 18px;border-radius:26px;}
          .wani-pill-left{font-size:18px;gap:12px;}
          .wani-pill-icon{width:50px;height:50px;}
          .wani-pill-action{width:66px;height:50px;border-radius:20px;}
        }
        @media (max-width:520px){
          .wani-home-inner{padding:50px 18px 14px;}
          .wani-hero h1{font-size:28px;}
          .wani-hero p{font-size:15px;}
          .wani-sparkle{width:74px;height:56px;flex-basis:74px;}
          .wani-tool-grid{gap:12px;}
          .wani-tool-card{min-height:270px!important;padding:24px 14px 18px!important;border-radius:22px!important;}
          .wani-card-icon{width:92px;height:92px;margin-bottom:24px;}
          .wani-card-title{font-size:17px;}
          .wani-card-desc{font-size:13px;line-height:1.42;}
          .wani-arrow{width:44px;height:44px;}
          .wani-pill-left{font-size:14px;}
          .wani-pill-icon{width:42px;height:42px;}
          .wani-pill-action{width:52px;height:42px;}
        }
      `}</style>

      <div className="wani-home-inner">
        <div className="wani-hero">
          <div>
            <h1 style={{ color:dark?'#F8FAFC':'#030303' }}>What would you like to do?</h1>
            <p style={{ color:dark?'#A1A1AA':'#6B7280' }}>Pick a tool and get started — no typing needed.</p>
          </div>

          <svg className="wani-sparkle" viewBox="0 0 188 104" fill="none" aria-hidden="true">
            <path d="M151 0L155.8 14.2L170 19L155.8 23.8L151 38L146.2 23.8L132 19L146.2 14.2L151 0Z" fill="#F8C44F" opacity="0.92"/>
            <path d="M122 31L126 43L138 47L126 51L122 63L118 51L106 47L118 43L122 31Z" fill="#F8C44F" opacity="0.72"/>
            <path d="M153 71L156 80L165 83L156 86L153 95L150 86L141 83L150 80L153 71Z" fill="#F8C44F" opacity="0.70"/>
            <path d="M16 84C52 80 99 58 151 20" stroke="#F8C44F" strokeWidth="3" strokeLinecap="round" opacity="0.34"/>
            <path d="M55 78C89 68 119 49 145 25" stroke="#F8C44F" strokeWidth="2" strokeLinecap="round" opacity="0.20"/>
          </svg>
        </div>

        <div className="wani-tool-grid">
          {TILES.map(tile => (
            <button
              key={tile.action}
              className="wani-tool-card"
              onClick={() => onQuickLaunch(tile.action)}
              style={{
                minHeight:350,
                padding:'42px 30px 28px',
                borderRadius:30,
                border: dark?'1px solid rgba(255,255,255,0.08)':'1px solid #E8E8E8',
                background: dark?'rgba(24,24,42,0.92)':'rgba(255,255,255,0.94)',
                boxShadow: dark?'0 18px 38px rgba(0,0,0,0.34)':'0 14px 34px rgba(15,23,42,0.07)',
                cursor:'pointer',
                display:'flex',
                flexDirection:'column',
                alignItems:'center',
                textAlign:'center',
                transition:'transform .18s ease, box-shadow .18s ease',
              }}
            >
              <img className="wani-card-icon" src={tile.icon} alt={tile.label} />
              <h2 className="wani-card-title" style={{ color:dark?'#FFFFFF':'#050505' }}>{tile.label}</h2>
              <div className="wani-under" style={{ background:tile.accent }} />
              <p className="wani-card-desc" style={{ color:dark?'#A1A1AA':'#575757' }}>{tile.desc}</p>
              <div className="wani-arrow" style={{ background:tile.soft, border:`1px solid ${tile.accent}18` }}>
                <svg width="27" height="27" viewBox="0 0 27 27" fill="none">
                  <path d="M5 13.5H21M21 13.5L14.5 7M21 13.5L14.5 20" stroke={tile.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>
          ))}
        </div>

        <div className="wani-bottom-pill">
          <div className="wani-pill-left">
            <div className="wani-pill-icon">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                <path d="M15 2L18 11L27 15L18 19L15 28L12 19L3 15L12 11L15 2Z" stroke="#D97706" strokeWidth="2.4" strokeLinejoin="round"/>
                <path d="M23 2L24.4 6.1L28.5 7.5L24.4 8.9L23 13L21.6 8.9L17.5 7.5L21.6 6.1L23 2Z" fill="#D97706"/>
              </svg>
            </div>
            <span>Smart tools. SAP expertise. Better outcomes.</span>
          </div>
          <div className="wani-pill-action">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <path d="M5 25L13 17L19 21L29 9" stroke="#D97706" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 9H29V17" stroke="#D97706" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopicView({ module:mod, topic, conversations, onSelectConv, onNewChat, onBack, t }) {
  const colors=MODULE_COLORS[mod]||{ from:'#6B7280',to:'#4B5563',emoji:'◈' }
  const filtered=topic?conversations.filter(c=>c.module===mod&&c.topic===topic):conversations.filter(c=>c.module===mod)
  const groups=groupConversations(filtered)
  return (
    <div style={{ flex:1,overflowY:'auto',padding:'20px 16px',position:'relative',zIndex:1 }}>
      <div style={{ maxWidth:720,margin:'0 auto' }}>
        <button onClick={onBack} style={{ background:'none',border:'none',cursor:'pointer',color:t.text3,fontSize:13,display:'flex',alignItems:'center',gap:6,marginBottom:16,fontFamily:"'Inter','DM Sans',sans-serif",padding:0 }}>← Back</button>
        <div style={{ borderRadius:16,padding:'18px 22px',marginBottom:20,background:`linear-gradient(135deg,${colors.from},${colors.to})`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10 }}>
          <div><div style={{ fontFamily:"'Inter',sans-serif",fontSize:20,fontWeight:600,color:'#fff',marginBottom:4 }}>{topic||mod.split('–')[0].trim()}</div><div style={{ fontSize:12,color:'rgba(255,255,255,0.65)' }}>{filtered.length} conversation{filtered.length!==1?'s':''}</div></div>
          <button onClick={()=>onNewChat(mod,topic)} style={{ padding:'9px 18px',background:'rgba(255,255,255,0.2)',border:'1.5px solid rgba(255,255,255,0.5)',borderRadius:24,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif",transition:'all 0.2s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.35)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'}
          >+ New Conversation</button>
        </div>
        {!topic&&(<div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:18 }}>{TOPICS[mod]?.map(tp=>{const count=conversations.filter(c=>c.module===mod&&c.topic===tp).length;return(<div key={tp} onClick={()=>onSelectConv(null,mod,tp)} style={{ padding:'6px 14px',borderRadius:20,background:count>0?'rgba(79,70,229,0.08)':t.surface2,border:`1.5px solid ${count>0?'rgba(79,70,229,0.25)':t.border}`,cursor:'pointer',fontSize:12,color:count>0?'#4F46E5':t.text3,fontWeight:count>0?600:400,transition:'all 0.15s',display:'flex',alignItems:'center',gap:6 }} onMouseEnter={e=>e.currentTarget.style.borderColor='#4F46E5'} onMouseLeave={e=>e.currentTarget.style.borderColor=count>0?'rgba(79,70,229,0.2)':t.border}>{tp}{count>0&&<span style={{ background:'#4F46E5',color:'#fff',borderRadius:10,padding:'0 6px',fontSize:10,fontWeight:700 }}>{count}</span>}</div>)})}</div>)}
        {filtered.length===0?(
          <div style={{ textAlign:'center',padding:'40px 0',color:t.text4 }}><div style={{ fontSize:32,marginBottom:12 }}>💬</div><div style={{ fontSize:14,marginBottom:6,color:t.text3 }}>No conversations yet</div><div style={{ fontSize:12 }}>Use the button above to start one</div></div>
        ):(
          Object.entries(groups).map(([group,convs])=>convs.length===0?null:(
            <div key={group} style={{ marginBottom:18 }}>
              <div style={{ fontSize:11,fontWeight:700,color:t.text4,letterSpacing:0.8,textTransform:'uppercase',marginBottom:8 }}>{group}</div>
              <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                {convs.map(conv=>(<div key={conv.id} onClick={()=>onSelectConv(conv.id)} style={{ padding:'14px 16px',borderRadius:12,background:t.surface,border:`1.5px solid ${t.border}`,cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',justifyContent:'space-between' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.boxShadow='0 4px 12px rgba(79,70,229,0.1)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.boxShadow='none'}}><div style={{ flex:1,minWidth:0 }}><div style={{ fontSize:14,fontWeight:500,color:t.text,marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{conv.title}</div><div style={{ fontSize:12,color:t.text3 }}>{conv.topic} · {new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div></div><span style={{ color:t.text4,fontSize:18,marginLeft:12 }}>›</span></div>))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function Brain({ session }) {
  const { dark, toggle } = useTheme()
  const t = dark ? T.dark : T.light

  const [view, setView]                   = useState('home')
  const [browseModule, setBrowseModule]   = useState(null)
  const [browseTopic, setBrowseTopic]     = useState(null)
  const [conversations, setConversations] = useState([])
  const [projects, setProjects]           = useState([])
  const [activeConvId, setActiveConvId]   = useState(null)
  const [input, setInput]                 = useState('')
  const [attachedCode, setAttachedCode]   = useState(null) // { content, lines, language }
  const [expandedCode, setExpandedCode]   = useState(false)
  const [quickLaunchMessages, setQuickLaunchMessages] = useState([])
  const [isLoading, setIsLoading]         = useState(false)
  const [isStreaming, setIsStreaming]      = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [dbLoading, setDbLoading]         = useState(true)
  const [searchQuery, setSearchQuery]     = useState('')
  const [showProfile, setShowProfile]     = useState(false)
  const [profile, setProfile]             = useState(null)
  const [showSummarise, setShowSummarise] = useState(false)
  const [isSummarising, setIsSummarising] = useState(false)
  const [autoCompacting, setAutoCompacting] = useState(false)
  const [compactProgress, setCompactProgress] = useState(0)
  const hasAutoSummarisedRef = useRef(new Set())
  const [sidebarOpen, setSidebarOpen]     = useState(!isMobileWidth())
  const [tone, setTone]                   = useState('balanced')
  const [isMobile, setIsMobile]           = useState(isMobileWidth())
  const [showExport, setShowExport]       = useState(false)

  // Document upload state
  const [uploadedDoc, setUploadedDoc]         = useState(null) // { name, content, type, docType }
  const [docUploading, setDocUploading]       = useState(false)
  const [showKnowledge, setShowKnowledge]     = useState(false)
  const [knowledgeEntries, setKnowledgeEntries] = useState([])
  const [showCapabilities, setShowCapabilities] = useState(false)
  const [pendingFinding, setPendingFinding]   = useState(null) // finding waiting for user confirmation
  const [knowledgeToast, setKnowledgeToast]   = useState(null)
  const docInputRef = useRef(null)
  const chatScrollRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // ── AUTHENTICATED FETCH — always sends JWT, backend derives userId from token ──
  const chatFetch = async (body) => {
    const token = session?.access_token
    return fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    })
  }

  const activeConv = conversations.find(c=>c.id===activeConvId)
  const messages   = activeConv?.messages || []

  // ── DOCUMENT FUNCTIONS ────────────────────────────────────────────────────
  const extractDocText = async (file) => {
    // TXT — native, no library needed
    if (file.type === 'text/plain') return await file.text()

    // PDF — load pdfjs from CDN at runtime (not bundled, Vite won't resolve)
    if (file.type === 'application/pdf') {
      try {
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            script.onload = resolve
            script.onerror = reject
            document.head.appendChild(script)
          })
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        }
        const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
        let text = ''
        for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          text += content.items.map(s => s.str).join(' ') + '\n'
        }
        return text.trim()
      } catch (e) {
        alert('Could not extract PDF text. Please save as TXT and upload again.')
        return ''
      }
    }

    // DOCX — load mammoth from CDN at runtime
    if (file.name.endsWith('.docx')) {
      try {
        if (!window.mammoth) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
            script.onload = resolve
            script.onerror = reject
            document.head.appendChild(script)
          })
        }
        const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
        return result.value.trim()
      } catch (e) {
        alert('Could not extract DOCX text. Please save as TXT or PDF and upload again.')
        return ''
      }
    }

    alert('Unsupported format. Please upload PDF, DOCX, or TXT.')
    return ''
  }

  const handleDocUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('Max file size is 10MB'); return }
    setDocUploading(true)
    try {
      const content = await extractDocText(file)
      if (!content.trim()) { alert('Could not extract text from this file'); setDocUploading(false); return }
      // Classify document type
      const classRes = await chatFetch({ action: 'classify_doc', content: content.slice(0, 2000) })
      const { docType } = await classRes.json()
      // Store chunks with embeddings in background
      chatFetch({ action: 'store_chunks', content, docName: file.name, docType }).catch(() => {})
      setUploadedDoc({ name: file.name, content, type: file.type, docType })
    } catch (err) { alert('Upload failed: ' + err.message) }
    setDocUploading(false)
    e.target.value = ''
  }

  const getDocChunks = async (question) => {
    if (!uploadedDoc) return []
    try {
      const res = await chatFetch({ action: 'retrieve_chunks', question })
      const { chunks } = await res.json()
      return chunks || []
    } catch { return [] }
  }

  const loadKnowledge = async () => {
    try {
      const res = await chatFetch({ action: 'load_knowledge' })
      const { entries } = await res.json()
      setKnowledgeEntries(entries || [])
    } catch {}
  }

  const deleteKnowledge = async (id) => {
    await chatFetch({ action: 'delete_finding', id })
    setKnowledgeEntries(prev => prev.filter(k => k.id !== id))
  }

  const saveFinding = async (finding) => {
    await chatFetch({ action: 'save_finding', ...finding })
    setPendingFinding(null)
    setKnowledgeToast('💡 Finding saved to knowledge base')
    setTimeout(() => setKnowledgeToast(null), 3000)
  }

  const checkForFindings = async (msgs) => {
    if (msgs.length < 4) return
    try {
      const res = await chatFetch({ action: 'suggest_finding', messages: msgs.slice(-10), module: activeConv?.module || browseModule })
      const data = await res.json()
      if (data.found) setPendingFinding(data)
    } catch {}
  }

  // Document action buttons by type
  const DOC_ACTIONS = {
    FUNCTIONAL_SPEC: [
      { icon: '🧪', label: 'Test Cases', prompt: 'Generate test cases for all T-codes and processes in this functional spec. Format as a table: Test Case | Steps | Expected Result | T-code.' },
      { icon: '⚠️', label: 'Find Gaps', prompt: 'What is missing from this functional spec? What scenarios are not covered? What SAP best practices are missing?' },
      { icon: '📋', label: 'Impl. Checklist', prompt: 'Create an implementation checklist. Include: master data required, SPRO customising, integration points, testing steps.' },
      { icon: '🔗', label: 'Integration Points', prompt: 'What are all the SAP module integration points in this spec? Which modules are involved?' },
      { icon: '📊', label: 'Master Data', prompt: 'What master data must exist before this can be implemented? List all required SAP master data objects.' },
    ],
    TEST_SCRIPT: [
      { icon: '🔍', label: 'Missing Scenarios', prompt: 'What test scenarios are missing? What edge cases are not covered?' },
      { icon: '🔀', label: 'Edge Cases', prompt: 'Generate edge case test scenarios for this test script.' },
      { icon: '🔐', label: 'Auth Objects', prompt: 'What authorization objects need to be tested? List all relevant auth objects per T-code.' },
    ],
    MEETING_NOTES: [
      { icon: '✅', label: 'Action Items', prompt: 'Extract all action items. Format as table: Action | Owner | Due Date.' },
      { icon: '📋', label: 'Decisions', prompt: 'What decisions were confirmed in this meeting?' },
      { icon: '❓', label: 'Open Points', prompt: 'What open questions were raised but not resolved?' },
      { icon: '🔧', label: 'SAP Objects', prompt: 'What SAP T-codes, tables, objects, or processes were mentioned?' },
    ],
    PROJECT_PLAN: [
      { icon: '📋', label: 'Missing Activities', prompt: 'What SAP implementation activities are missing from this plan?' },
      { icon: '🔗', label: 'Dependencies', prompt: 'What activity dependencies are missing or incorrect?' },
      { icon: '⚠️', label: 'Risks', prompt: 'What are the risks from an SAP implementation perspective?' },
    ],
  }

  const [deliverableFilter, setDeliverableFilter] = useState('ALL')
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)

  const DELIVERABLE_FILTERS = [
    // ── View all ────────────────────────────────────────────────────────────
    { key: 'ALL',           label: 'All Conversations',  group: null },
    // ── Knowledge & Q&A ─────────────────────────────────────────────────────
    { key: 'SAP_QA',        label: 'Questions & Answers', group: 'Knowledge' },
    { key: 'CUSTOMIZING',   label: 'Customizing / SPRO',  group: 'Knowledge' },
    { key: 'BAPI_SEARCH',   label: 'BAPI / Function Modules', group: 'Knowledge' },
    { key: 'EXIT_SEARCH',   label: 'User Exits & BAdIs',  group: 'Knowledge' },
    { key: 'FIORI_REC',     label: 'Fiori Apps',          group: 'Knowledge' },
    // ── Deliverable Documents ────────────────────────────────────────────────
    { key: 'FS_SPEC',       label: 'Functional Spec',     group: 'Deliverables' },
    { key: 'TECH_SPEC',     label: 'Technical Spec',      group: 'Deliverables' },
    { key: 'TEST_CASES',    label: 'Test Cases',          group: 'Deliverables' },
    { key: 'GAP_ANALYSIS',  label: 'Gap Analysis',        group: 'Deliverables' },
    { key: 'FORMS_SPEC',    label: 'Forms',               group: 'Deliverables' },
    // ── Planning ─────────────────────────────────────────────────────────────
    { key: 'WORKSHOP_PLAN', label: 'Workshop Plan',       group: 'Planning' },
    { key: 'WORKSHOP_PPT',  label: 'Workshop PPT',        group: 'Planning' },
    { key: 'SLIDE_CONTENT', label: 'Slide Content',       group: 'Planning' },
  ]

  const filteredConvs = conversations.filter(c => {
    const matchesSearch = !searchQuery.trim() || (() => {
      const q = searchQuery.toLowerCase()
      return c.title?.toLowerCase().includes(q)||c.module?.toLowerCase().includes(q)||c.topic?.toLowerCase().includes(q)||c.messages?.some(m=>m.content?.toLowerCase().includes(q))
    })()
    const matchesFilter = deliverableFilter === 'ALL'
      || (deliverableFilter === 'SAP_QA' && (!c.deliverable_type || c.deliverable_type === 'NONE'))
      || (deliverableFilter === 'BAPI_SEARCH' && c.deliverable_type === 'BAPI_SEARCH')
      || (deliverableFilter === 'EXIT_SEARCH' && c.deliverable_type === 'EXIT_SEARCH')
      || c.deliverable_type === deliverableFilter
    return matchesSearch && matchesFilter
  })

  useEffect(()=>{
    const handleResize=()=>{ if(isMobileWidth())setSidebarOpen(false); else setSidebarOpen(true) }
    window.addEventListener('resize',handleResize)
    return()=>window.removeEventListener('resize',handleResize)
  },[])

  // Close filter dropdown when clicking outside
  useEffect(()=>{
    if(!filterDropdownOpen) return
    const handleClick = (e) => {
      if(!e.target.closest('[data-filter-dropdown]')) setFilterDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  },[filterDropdownOpen])

  useEffect(()=>{
    const loadAll = async () => {
      try {
        const [convs, prof, projs] = await Promise.all([
          loadConversations(session.user.id).catch(()=>[]),
          getProfile(session.user.id).catch(()=>null),
          loadProjects(session.user.id).catch(()=>[]),
        ])
        setConversations(convs||[])
        setProfile(prof)
        setProjects(projs||[])
      } catch(e) {
        console.error('Startup load error:', e)
        setConversations([])
        setProjects([])
      } finally {
        setDbLoading(false)
      }
    }
    loadAll()
  },[session])

  // No auto-scroll — user scrolls freely
  // useEffect removed intentionally

  useEffect(()=>{
    window.history.replaceState({ view:'home' },'')
    const handlePop=(e)=>{
      const state=e.state
      if(!state||state.view==='home'){ setView('home');setActiveConvId(null);setBrowseModule(null);setBrowseTopic(null);setShowSummarise(false);if(isMobileWidth())setSidebarOpen(false);window.history.pushState({ view:'home' },'') }
      else if(state.view==='topic'){ setBrowseModule(state.mod);setBrowseTopic(state.topic);setView('topic') }
      else if(state.view==='chat'){ if(state.convId){ setActiveConvId(state.convId);setView('chat') } else { setActiveConvId(null);setBrowseModule(state.mod);setBrowseTopic(state.topic);setView('chat') } }
      else { setView('home');window.history.pushState({ view:'home' },'') }
    }
    window.addEventListener('popstate',handlePop)
    const handleResize=()=>setIsMobile(isMobileWidth())
    window.addEventListener('resize',handleResize)
    return()=>{ window.removeEventListener('popstate',handlePop);window.removeEventListener('resize',handleResize) }
  },[])

  useEffect(()=>{ if(view==='chat') setTimeout(()=>inputRef.current?.focus(),100) },[view,activeConvId])
  // Auto-summarise — but ONLY when user sends a new message (not while reading)
  // We check on user message count, not total messages
  useEffect(()=>{
    if (!activeConvId || !messages.length) return
    const userCount = messages.filter(m=>m.role==='user').length
    const assistantCount = messages.filter(m=>m.role==='assistant').length
    // Only trigger after user sends a message AND there are enough assistant replies
    // This ensures we never compact while user is reading the last answer
    const key = `${activeConvId}-${assistantCount}`
    if (userCount > 0 && assistantCount >= 5 && assistantCount % 5 === 0 &&
        !hasAutoSummarisedRef.current.has(key) && !autoCompacting && !isStreaming) {
      hasAutoSummarisedRef.current.add(key)
      autoSummarise()
    }
  },[messages.filter(m=>m.role==='user').length, activeConvId])

  const goHome=()=>{ setView('home');setActiveConvId(null);setBrowseModule(null);setBrowseTopic(null);setShowSummarise(false);if(isMobileWidth())setSidebarOpen(false);try{window.history.replaceState({ view:'home' },'',window.location.pathname)}catch(e){} }
  const goTopic=(mod,topic)=>{ setBrowseModule(mod);setBrowseTopic(topic);setView('topic');if(isMobileWidth())setSidebarOpen(false);try{window.history.pushState({ view:'topic',mod,topic },'',window.location.pathname)}catch(e){} }
  const goChat=(convId,mod=null,topic=null)=>{ 
    setFilterDropdownOpen(false)
    setInput('')
    setAttachedCode(null)
    setExpandedCode(false)
    setQuickLaunchMessages([])
    if(convId){ setActiveConvId(convId);setView('chat');setShowSummarise(false) } 
    else { setActiveConvId(null);setBrowseModule(mod);setBrowseTopic(topic);setView('chat');setShowSummarise(false) }
    try { window.history.pushState({ view:'chat',convId,mod,topic },'',window.location.pathname) } catch(e){}
    if(isMobileWidth())setSidebarOpen(false) 
  }

  // Quick launcher — opens new chat with pre-set intent and opening message from Wani
  const handleQuickLaunch = (action) => {
    const configs = {
      fs: {
        mod: null, topic: 'FS Development',
        openingMsg: `Hi ${profile?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there'}! I'm ready to help you build a Functional Specification. To get started — what is the FS about? Tell me the business requirement or the Z-program/report you need to specify, and we'll build it together step by step.`
      },
      customizing: {
        mod: null, topic: 'Customizing',
        openingMsg: `Hi ${profile?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there'}! I can guide you through any SAP customizing configuration. Which module are you working in — PP, PM, MM, SD, QM, CS, PS, WM or IM? And what do you need to configure?`
      },
      code: {
        mod: null, topic: 'ABAP Analysis',
        openingMsg: null, // B behaviour — pre-fill input
        inputText: 'Analyse this ABAP code:\n\n'
      },
      workshop: {
        mod: null, topic: 'Workshop PPT',
        openingMsg: null, // already has scoping flow
        inputText: 'I need a workshop PPT on '
      },
      fiori: {
        mod: null, topic: 'Fiori Apps',
        openingMsg: null, // B behaviour
        inputText: 'Which Fiori app should I use for '
      },
      bestpractice: {
        mod: null, topic: 'SAP Best Practices',
        openingMsg: `Hi ${profile?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there'}! I can help you explore SAP Best Practices and standard processes. Are you working with SAP Activate methodology, fit-to-standard workshops, or looking for a specific best practice process in PP, PM, MM, SD or another module? Tell me what you need.`
      },
    }

    const config = configs[action]
    if (!config) return

    // Clear state and go to chat
    setFilterDropdownOpen(false)
    setAttachedCode(null)
    setExpandedCode(false)
    setActiveConvId(null)
    setBrowseModule(config.mod)
    setBrowseTopic(config.topic)
    setView('chat')
    try { window.history.pushState({ view:'chat', mod:config.mod, topic:config.topic },'',window.location.pathname) } catch(e){}
    if(isMobileWidth()) setSidebarOpen(false)

    if (config.openingMsg) {
      // A behaviour — Wani speaks first
      setInput('')
      // Inject opening message as assistant message after a brief delay
      setTimeout(() => {
        const openingUserMsg = { role:'user', content:`__QUICK_LAUNCH_${action.toUpperCase()}__`, _display:'', _system:true }
        const openingAssistantMsg = { role:'assistant', content: config.openingMsg, _quickLaunch: true }
        // We directly set messages via a special state trigger
        setQuickLaunchMessages([openingAssistantMsg])
      }, 100)
    } else if (config.inputText) {
      // B behaviour — pre-fill input
      setInput(config.inputText)
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }

  const handleSend = async (overrideText) => {
    const baseText = (overrideText || input).trim()
    if (!baseText && !attachedCode) return
    if (isLoading || isStreaming) return

    // Build the actual content sent to the API
    const msgText = attachedCode
      ? `${baseText ? baseText + '\n\n' : ''}[ATTACHED_CODE lang=${attachedCode.language} lines=${attachedCode.lines}]\n${attachedCode.content}\n[/ATTACHED_CODE]`
      : baseText

    // Store display metadata alongside content for UI rendering
    const userMsg = {
      role: 'user',
      content: msgText,
      _display: baseText || `Analyse this ${attachedCode?.language || 'code'}`,
      _code: attachedCode ? { language: attachedCode.language, lines: attachedCode.lines } : null,
    }

    setInput('')
    setAttachedCode(null)
    if (inputRef.current) inputRef.current.style.height = '24px'
    setIsLoading(true)

    let convId = activeConvId
    let currentMod = activeConv?.module||browseModule
    let currentTopic = activeConv?.topic||browseTopic
    let currentMsgs = [...messages, userMsg]

    if (!convId) {
      const cleanTitle = msgText.replace(/\b[A-Z]{2,4}\d{2,3}N?\b/g,'').replace(/\s+/g,' ').trim().slice(0,50)||'New Conversation'
      const newConv = await createConversation(session.user.id,{ title:cleanTitle,module:currentMod,topic:currentTopic,messages:[userMsg] })
      convId = newConv.id; currentMsgs = [userMsg]
      setConversations(prev=>[newConv,...prev])
      setActiveConvId(newConv.id)
    } else {
      await updateConversation(convId,{ messages:currentMsgs })
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:currentMsgs}:c))
    }

    try {
      const docChunks = uploadedDoc ? await getDocChunks(msgText) : []
      const token = session?.access_token
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ messages:currentMsgs, module:currentMod, topic:currentTopic, tone, userName:profile?.name||null, userRole:profile?.role||null, userModules:profile?.modules||[], documentChunks:docChunks, documentName:uploadedDoc?.name||null, documentType:uploadedDoc?.docType||null }),
      })

      if (!res.ok) throw new Error('Network error')

      setIsLoading(false)
      setIsStreaming(true)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = '', fullReply = '', modelUsed = '', deliverableType = 'NONE'
      let accumulated = ''
      let searchResults = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value,{ stream:true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          try {
            const evt = JSON.parse(raw)
            if (evt.type === 'chunk') {
              accumulated += evt.text
              setStreamingText(accumulated)
            } else if (evt.type === 'search_results') {
              searchResults = evt.results || []
            } else if (evt.type === 'done') {
              fullReply = evt.full || accumulated
              modelUsed = evt.model
              deliverableType = evt.deliverableType || 'NONE'

              // FS Complete — auto-trigger Word document download
              if (evt.fsComplete && evt.fsText) {
                try {
                  const fsRes = await fetch('/api/generate-fs-doc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      fsText: evt.fsText,
                      fileName: `Wani_FS_${new Date().toISOString().slice(0,10)}`
                    })
                  })
                  if (fsRes.ok) {
                    const blob = await fsRes.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `Wani_FS_${new Date().toISOString().slice(0,10)}.docx`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)

                    // Auto-mark this conversation as a project
                    // Extract FS title from the text — look for FS_TITLE: line
                    const fsTitleMatch = evt.fsText.match(/FS_TITLE:\s*(.+)/i)
                    const fsTitle = fsTitleMatch?.[1]?.trim() || activeConv?.title || 'Functional Specification'
                    markAsProject(convId, fsTitle).then(() => {
                      // Update local state — conversation becomes a project
                      const projectConv = { ...conversations.find(c=>c.id===convId), is_project: true, project_name: fsTitle, fs_title: fsTitle, fs_generated_at: new Date().toISOString() }
                      setProjects(prev => [projectConv, ...prev.filter(p=>p.id!==convId)])
                      setConversations(prev => prev.map(c => c.id===convId ? {...c, is_project:true, project_name:fsTitle} : c))
                    }).catch(()=>{})
                  }
                } catch (e) { console.error('FS doc generation failed:', e) }
              }

              // PPT Complete — auto-trigger PowerPoint download
              if (evt.pptComplete && evt.pptText) {
                try {
                  const pptRes = await fetch('/api/generate-ppt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      pptText: evt.pptText,
                      fileName: `Wani_Workshop_${new Date().toISOString().slice(0,10)}`
                    })
                  })
                  if (pptRes.ok) {
                    const blob = await pptRes.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `Wani_Workshop_${new Date().toISOString().slice(0,10)}.pptx`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }
                } catch (e) { console.error('PPT generation failed:', e) }
              }
            } else if (evt.type === 'error') {
              throw new Error(evt.error)
            }
          } catch {}
        }
      }

      const finalReply = fullReply || accumulated

      setIsStreaming(false)
      setStreamingText('')

      // Build model tag
      const modelLabel = modelUsed === 'gpt4o-mini' ? '✦ GPT-4o mini'
        : modelUsed === 'gpt4o' ? '✦ GPT-4o'
        : modelUsed === 'claude-haiku' ? '✦ Claude Haiku'
        : modelUsed === 'claude-sonnet' ? '✦ Claude Sonnet'
        : modelUsed === 'claude+gemini' ? '✦ Claude  📚 Gemini'
        : '✦ GPT-4o'

      // Build search links section as markdown
      let linksSection = ''
      if (searchResults.length > 0) {
        const icons = { 'SAP Community': '💬', 'SAP Help': '📖', 'SAP Blog': '✍️', 'SAP': '🔗' }
        linksSection = '\n\n---\n**📚 SAP Resources**\n' + searchResults.map(r =>
          `${icons[r.source] || '🔗'} [${r.title}](${r.url})`
        ).join('\n')
      }

      const replyWithTag = finalReply + linksSection + `\n\n_${modelLabel}_`

      const finalMsgs = [...currentMsgs,{ role:'assistant',content:replyWithTag }]
      const convUpdate = { messages:finalMsgs }
      if (deliverableType !== 'NONE') convUpdate.deliverable_type = deliverableType
      await updateConversation(convId, convUpdate)
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,...convUpdate,updated_at:new Date().toISOString()}:c))

      if (currentMsgs.length===1) {
        fetch('/api/categorise',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ message:msgText }) })
          .then(r=>r.json()).then(({ module,topic,title })=>{ if(module){ updateConversation(convId,{ module,topic,title });setConversations(prev=>prev.map(c=>c.id===convId?{...c,module,topic,title}:c)) } }).catch(()=>{})
      }

      fetch('/api/extract',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ userId:session.user.id,convId,module:currentMod||null,topic:currentTopic||null,userMsg:msgText,assistantMsg:finalReply }) }).catch(()=>{})

      // Check for consultant findings worth saving (fire and forget)
      checkForFindings(finalMsgs).catch(() => {})

    } catch(err) {
      setIsLoading(false);setIsStreaming(false);setStreamingText('')
      const errMsgs=[...currentMsgs,{ role:'assistant',content:'Error reaching AI. Please try again.' }]
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:errMsgs}:c))
    }
  }

  // Send a specific text programmatically — used by code analysis buttons
  // ── CODE DETECTION — detects ABAP, SQL, JS, XML, JSON pastes ────────────────
  const detectCode = (text) => {
    const lines = text.split('\n')
    if (lines.length < 4) return null // too short to be code

    const abapSignals = [
      /^REPORT\s+/im, /^FUNCTION\s+/im, /^CLASS\s+/im, /^METHOD\s+/im,
      /^DATA\s*:/im, /^TYPES\s*:/im, /^CONSTANTS\s*:/im, /^TABLES\s*:/im,
      /^SELECT\s+/im, /^LOOP\s+AT\s+/im, /^IF\s+/im, /^ENDLOOP\./im,
      /^ENDIF\./im, /^ENDFUNCTION\./im, /^ENDCLASS\./im,
      /CALL\s+FUNCTION/im, /PERFORM\s+/im, /^WRITE\s*:/im,
    ]
    const xmlSignals = [/^<\?xml/i, /^<[A-Z_]+>/i]
    const jsonSignals = [/^\{[\s\S]*\}$/, /^\[[\s\S]*\]$/]
    const sqlSignals = [/^SELECT\s+.*FROM\s+/im, /^INSERT\s+INTO\s+/im]

    const abapScore = abapSignals.filter(r => r.test(text)).length
    if (abapScore >= 2) return { content: text, lines: lines.length, language: 'ABAP' }
    if (xmlSignals.some(r => r.test(text.trim()))) return { content: text, lines: lines.length, language: 'XML' }
    if (jsonSignals.some(r => r.test(text.trim()))) return { content: text, lines: lines.length, language: 'JSON' }
    if (sqlSignals.some(r => r.test(text))) return { content: text, lines: lines.length, language: 'SQL' }
    if (lines.length >= 15) return { content: text, lines: lines.length, language: 'Code' }
    return null
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text') || ''
    const detected = detectCode(pasted)
    if (detected) {
      e.preventDefault()
      setAttachedCode(detected)
      // Clear any existing code from input
      setInput(prev => prev.replace(pasted, '').trim())
    }
    // If not code — let normal paste happen
  }

  const handleSendText = (text) => {
    setInput('')
    handleSend(text)
  }

  const autoSummarise = async () => {
    if (!activeConvId || autoCompacting) return
    const convMessages = conversations.find(c=>c.id===activeConvId)?.messages || []
    if (convMessages.length < 6) return

    setAutoCompacting(true)
    setCompactProgress(0)

    // Animate progress bar — simulate progress while waiting for API
    const progressInterval = setInterval(() => {
      setCompactProgress(prev => {
        if (prev >= 85) { clearInterval(progressInterval); return 85 }
        return prev + Math.random() * 12 + 3
      })
    }, 300)

    try {
      const activeConvData = conversations.find(c=>c.id===activeConvId)
      const res = await fetch('/api/summarise', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ messages:convMessages, module:activeConvData?.module, topic:activeConvData?.topic })
      })
      const { summary } = await res.json()

      clearInterval(progressInterval)
      setCompactProgress(95)

      if (summary) {
        const summaryMsg = { role:'assistant', content:`📋 **Conversation Compacted**\n\n${summary}\n\n---\n_Earlier messages summarised to save context. Continuing from here._` }
        const newMsgs = [summaryMsg]
        await updateConversation(activeConvId, { messages:newMsgs, is_summarised:true })
        setConversations(prev=>prev.map(c=>c.id===activeConvId?{...c,messages:newMsgs,is_summarised:true}:c))
      }

      setCompactProgress(100)
      setTimeout(()=>{ setAutoCompacting(false); setCompactProgress(0) }, 600)
    } catch {
      clearInterval(progressInterval)
      setAutoCompacting(false)
      setCompactProgress(0)
    }
  }

  const handleSummarise = async () => {
    if (!activeConvId||isSummarising) return
    setIsSummarising(true)
    try {
      const res = await fetch('/api/summarise',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ messages,module:activeConv.module,topic:activeConv.topic }) })
      const { summary } = await res.json()
      const summaryMsg = { role:'assistant',content:`📋 **Conversation Summary**\n\n${summary}\n\n---\n_Summarised. Continuing from here._` }
      const newMsgs = [summaryMsg]
      await updateConversation(activeConvId,{ messages:newMsgs,is_summarised:true })
      setConversations(prev=>prev.map(c=>c.id===activeConvId?{...c,messages:newMsgs,is_summarised:true}:c))
      setShowSummarise(false)
    } catch {}
    setIsSummarising(false)
  }

  const handleDelete = async (id) => {
    await deleteConversation(id)
    setConversations(prev=>prev.filter(c=>c.id!==id))
    if (activeConvId===id) goHome()
  }

  const groups = groupConversations(filteredConvs)

  return (
    <div style={{ display:'flex',height:'100dvh',background:t.bg,fontFamily:"'Inter','DM Sans',sans-serif",overflow:'hidden' }}>
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
        .tone-btn{padding:5px 12px;border-radius:20px;font-size:11px;font-family:'Inter','DM Sans',sans-serif;cursor:pointer;transition:all 0.18s;font-weight:500;}
        .tone-btn.active{background:#4F46E5;border-color:transparent!important;color:#fff!important;font-weight:700;box-shadow:0 2px 10px rgba(79,70,229,0.25);}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(79,70,229,0.25);border-radius:4px}
        @media(max-width:768px){
          .main-topbar{padding:0 18px!important;height:68px!important;min-height:68px!important;}
          .chat-input-wrap{padding:10px 14px 16px!important;margin-bottom:0!important;}
          .chat-messages{padding:16px 14px!important;}
          .tone-btn{padding:7px 14px!important;font-size:13px!important;}
        }
      `}</style>

      {sidebarOpen&&isMobile&&(<div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:40,backdropFilter:'blur(2px)' }} onClick={()=>setSidebarOpen(false)}/>)}

      {/* Sidebar */}
      <div style={{ width:264,minWidth:264,background:t.sidebar,borderRight:`1px solid ${t.border}`,display:'flex',flexDirection:'column',overflow:'hidden',transition:'transform 0.3s ease',transform:sidebarOpen?'translateX(0)':'translateX(-100%)',position:isMobile?'fixed':'relative',top:0,bottom:0,left:0,zIndex:50 }}>
        <div style={{ padding:'16px 16px 12px',borderBottom:`1px solid ${t.border}` }}>
          <div onClick={goHome} style={{ display:'flex',alignItems:'center',gap:10,marginBottom:14,cursor:'pointer' }}>
            <WaniLogo size={30} dark={dark}/><WaniWordmark height={16} dark={dark}/>
          </div>
          <button onClick={()=>goChat(null,null,null)} style={{ width:'100%',padding:'10px 14px',background:dark?'linear-gradient(135deg,#ffffff 0%,#a0a0b0 100%)':'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',border:'none',borderRadius:10,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:'0 2px 10px rgba(79,70,229,0.2)',transition:'all 0.2s' }}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(79,70,229,0.3)';e.currentTarget.style.transform='translateY(-1px)'}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 10px rgba(79,70,229,0.2)';e.currentTarget.style.transform='translateY(0)'}}
          ><span style={{ fontSize:16,color:dark?'#0D0D1A':'#ffffff' }}>+</span><span style={{color:dark?'#0D0D1A':'#ffffff'}}> New Conversation</span></button>
        </div>
        <div style={{ padding:'10px 14px 6px' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:t.text4,fontSize:13 }}>🔍</span>
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search..."
              style={{ width:'100%',padding:'8px 10px 8px 32px',boxSizing:'border-box',border:`1.5px solid ${t.border}`,borderRadius:10,fontSize:13,color:t.text,background:t.inputBg,fontFamily:"'Inter','DM Sans',sans-serif",outline:'none',transition:'border-color 0.2s' }}
              onFocus={e=>e.target.style.borderColor='#4F46E5'}
              onBlur={e=>e.target.style.borderColor=t.border}
            />
          </div>
          {/* Deliverable filter — grouped dropdown */}
          <div style={{ position:'relative', marginTop:8 }} data-filter-dropdown>
            <div
              onClick={() => setFilterDropdownOpen(prev => !prev)}
              style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'8px 12px', borderRadius:10, border:`1.5px solid ${t.border}`,
                background:t.inputBg, cursor:'pointer', transition:'border-color 0.2s',
                fontFamily:"'Inter','DM Sans',sans-serif",
              }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='#4F46E5'}
              onMouseLeave={e=>e.currentTarget.style.borderColor=filterDropdownOpen?'#4F46E5':t.border}
            >
              <span style={{ fontSize:13, color: deliverableFilter==='ALL' ? t.text3 : '#4F46E5', fontWeight: deliverableFilter==='ALL'?400:600 }}>
                {DELIVERABLE_FILTERS.find(f=>f.key===deliverableFilter)?.label || 'All Conversations'}
              </span>
              <span style={{ fontSize:11, color:t.text4, transform: filterDropdownOpen?'rotate(180deg)':'rotate(0deg)', transition:'transform 0.2s' }}>▾</span>
            </div>

            {filterDropdownOpen && (
              <div style={{
                position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:100,
                background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:12,
                boxShadow:'0 8px 24px rgba(0,0,0,0.12)', overflow:'hidden',
                fontFamily:"'Inter','DM Sans',sans-serif",
              }}>
                {/* All Conversations — always first, no group header */}
                <div
                  onClick={() => { setDeliverableFilter('ALL'); setFilterDropdownOpen(false) }}
                  style={{
                    padding:'9px 14px', fontSize:13, cursor:'pointer',
                    color: deliverableFilter==='ALL' ? '#4F46E5' : t.text,
                    background: deliverableFilter==='ALL' ? 'rgba(79,70,229,0.07)' : 'transparent',
                    fontWeight: deliverableFilter==='ALL' ? 600 : 400,
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    transition:'background 0.12s',
                  }}
                  onMouseEnter={e=>{ if(deliverableFilter!=='ALL') e.currentTarget.style.background='rgba(79,70,229,0.04)' }}
                  onMouseLeave={e=>{ if(deliverableFilter!=='ALL') e.currentTarget.style.background='transparent' }}
                >
                  All Conversations
                  {deliverableFilter==='ALL' && <span style={{ fontSize:12 }}>✓</span>}
                </div>

                {/* Grouped items */}
                {['Knowledge','Deliverables','Planning'].map(group => {
                  const groupItems = DELIVERABLE_FILTERS.filter(f => f.group === group)
                  return (
                    <div key={group}>
                      <div style={{
                        padding:'6px 14px 4px', fontSize:10, fontWeight:700,
                        color:t.text4, letterSpacing:0.8, textTransform:'uppercase',
                        borderTop:`1px solid ${t.border}`, marginTop:2,
                      }}>
                        {group}
                      </div>
                      {groupItems.map(f => (
                        <div
                          key={f.key}
                          onClick={() => { setDeliverableFilter(f.key); setFilterDropdownOpen(false) }}
                          style={{
                            padding:'8px 14px 8px 20px', fontSize:13, cursor:'pointer',
                            color: deliverableFilter===f.key ? '#4F46E5' : t.text2,
                            background: deliverableFilter===f.key ? 'rgba(79,70,229,0.07)' : 'transparent',
                            fontWeight: deliverableFilter===f.key ? 600 : 400,
                            display:'flex', alignItems:'center', justifyContent:'space-between',
                            transition:'background 0.12s',
                          }}
                          onMouseEnter={e=>{ if(deliverableFilter!==f.key) e.currentTarget.style.background='rgba(79,70,229,0.04)' }}
                          onMouseLeave={e=>{ if(deliverableFilter!==f.key) e.currentTarget.style.background='transparent' }}
                        >
                          {f.label}
                          {deliverableFilter===f.key && <span style={{ fontSize:12 }}>✓</span>}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div style={{ flex:1,overflowY:'auto',padding:'4px 8px 8px' }}>
          {dbLoading?(
            <div style={{ padding:20,textAlign:'center' }}><div style={{ width:20,height:20,border:`2px solid ${t.border}`,borderTopColor:'#4F46E5',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px' }}/><span style={{ fontSize:12,color:t.text4 }}>Loading...</span></div>
          ):(
            <>
              {/* ── PROJECTS SECTION — auto-created when FS is generated ── */}
              {projects.length > 0 && (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:'#4F46E5',letterSpacing:0.8,textTransform:'uppercase',padding:'10px 6px 6px',display:'flex',alignItems:'center',gap:6 }}>
                    <span>📁</span> Projects
                    <span style={{ background:'rgba(79,70,229,0.12)',color:'#4F46E5',borderRadius:10,padding:'0 6px',fontSize:10,fontWeight:700 }}>{projects.length}</span>
                  </div>
                  {projects.map(proj => (
                    <div key={proj.id}
                      onClick={()=>{ setActiveConvId(proj.id);setView('chat');setShowSummarise(false);if(isMobile)setSidebarOpen(false) }}
                      style={{
                        padding:'9px 12px', borderRadius:10, cursor:'pointer', marginBottom:3,
                        background: activeConvId===proj.id ? 'rgba(79,70,229,0.12)' : 'rgba(79,70,229,0.04)',
                        border: `1.5px solid ${activeConvId===proj.id ? '#4F46E5' : 'rgba(79,70,229,0.2)'}`,
                        transition:'all 0.15s',
                      }}
                      onMouseEnter={e=>{ if(activeConvId!==proj.id){ e.currentTarget.style.background='rgba(79,70,229,0.08)';e.currentTarget.style.borderColor='rgba(79,70,229,0.35)' }}}
                      onMouseLeave={e=>{ if(activeConvId!==proj.id){ e.currentTarget.style.background='rgba(79,70,229,0.04)';e.currentTarget.style.borderColor='rgba(79,70,229,0.2)' }}}
                    >
                      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:2 }}>
                        {proj.module && <ModuleBadge module={proj.module} small/>}
                        <span style={{ fontSize:9,fontWeight:700,color:'#4F46E5',background:'rgba(79,70,229,0.12)',padding:'1px 6px',borderRadius:8,letterSpacing:0.5 }}>FS</span>
                      </div>
                      <div style={{ fontSize:13,fontWeight:500,color:activeConvId===proj.id?'#4F46E5':t.text,lineHeight:1.4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                        {proj.project_name || proj.fs_title || proj.title}
                      </div>
                      <div style={{ fontSize:11,color:t.text4,marginTop:2 }}>
                        {proj.fs_generated_at ? new Date(proj.fs_generated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : new Date(proj.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                      </div>
                    </div>
                  ))}
                  <div style={{ height:1,background:t.border,margin:'8px 4px 4px' }}/>
                </div>
              )}

              {/* ── CONVERSATIONS SECTION ── */}
              {filteredConvs.length===0?(
                <div style={{ padding:'24px 16px',textAlign:'center' }}><div style={{ fontSize:28,marginBottom:8 }}>💬</div><p style={{ fontSize:12,color:t.text4,lineHeight:1.6 }}>No conversations yet</p></div>
              ):(
                Object.entries(groups).map(([group,convs])=>convs.length===0?null:(
                  <div key={group}>
                    <div style={{ fontSize:10,fontWeight:700,color:t.text4,letterSpacing:0.8,textTransform:'uppercase',padding:'10px 6px 4px' }}>{group}</div>
                    {convs.map(conv=>(<ConversationItem key={conv.id} conv={conv} isActive={conv.id===activeConvId} t={t} onClick={()=>{ setActiveConvId(conv.id);setView('chat');setShowSummarise(false);if(isMobile)setSidebarOpen(false) }} onDelete={handleDelete}/>))}
                  </div>
                ))
              )}
            </>
          )}
        </div>
        <div style={{ padding:'10px 14px',borderTop:`1px solid ${t.border}` }}>
          <div onClick={()=>setShowProfile(true)} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:10,cursor:'pointer',transition:'background 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(79,70,229,0.07)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1a1a2e,#4F46E5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0,boxShadow:'0 2px 8px rgba(79,70,229,0.2)' }}>{getInitials(profile?.name,session.user.email)}</div>
            <div style={{ overflow:'hidden',flex:1 }}><div style={{ fontSize:13,fontWeight:500,color:t.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{profile?.name||'My Profile'}</div><div style={{ fontSize:11,color:t.text4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{session.user.email}</div></div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0,position:'relative' }}>
        <div style={{ position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:0,background:t.bgGrad }}>
          <div style={{ position:'absolute',width:600,height:600,borderRadius:'50%',background:`radial-gradient(circle,${t.blob1} 0%,transparent 65%)`,top:'-15%',right:'0%',animation:'blob1 12s ease-in-out infinite' }}/>
          <div style={{ position:'absolute',width:500,height:500,borderRadius:'50%',background:`radial-gradient(circle,${t.blob2} 0%,transparent 65%)`,bottom:'-10%',left:'5%',animation:'blob2 15s ease-in-out infinite' }}/>
          <div style={{ position:'absolute',width:380,height:380,borderRadius:'50%',background:`radial-gradient(circle,${t.blob3} 0%,transparent 65%)`,top:'35%',right:'25%',animation:'blob3 10s ease-in-out infinite' }}/>
        </div>

        {/* Topbar */}
        <div className="main-topbar" style={{ borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:isMobile?12:8,background:t.topbar,backdropFilter:'blur(10px)',flexShrink:0,position:'relative',zIndex:2,paddingLeft:isMobile?'18px':'12px',paddingRight:isMobile?'18px':'12px',paddingBottom:isMobile?'0':'9px',paddingTop:isMobile?'max(14px, calc(env(safe-area-inset-top) + 10px))':'9px',height:isMobile?'auto':48,minHeight:isMobile?68:48 }}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{ background:'none',border:'none',cursor:'pointer',borderRadius:10,fontSize:isMobile?24:16,color:t.text,transition:'background 0.15s',flexShrink:0,width:isMobile?48:32,height:isMobile?48:32,display:'flex',alignItems:'center',justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(79,70,229,0.07)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>☰</button>
          {!(isMobile&&view==='chat')&&(<div style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',flexShrink:0 }} onClick={goHome}><WaniLogo size={isMobile?26:22} dark={dark}/>{!isMobile&&<WaniWordmark height={13} dark={dark}/>}</div>)}
          {view==='chat'&&activeConv&&(<div style={{ display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0 }}><ModuleBadge module={activeConv.module} small={isMobile}/>{!isMobile&&<div style={{ fontSize:13,fontWeight:500,color:t.text2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0 }}>{activeConv.title}</div>}{isMobile&&<div style={{ fontSize:14,fontWeight:500,color:t.text2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0,flex:1 }}>{activeConv.topic||activeConv.module?.split('–')[0].trim()}</div>}</div>)}
          {view==='topic'&&(<div style={{ display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0 }}><span style={{ color:t.text4,fontSize:16 }}>›</span><div style={{ fontSize:isMobile?15:13,fontWeight:500,color:t.text2 }}>{browseTopic||browseModule?.split('–')[0].trim()}</div></div>)}
          {!(view==='chat'||view==='topic')&&<div style={{ flex:1 }}/>}
          {view==='chat'&&messages.some(m=>m.role==='user')&&(
            <>
              <button onClick={()=>setShowCapabilities(c=>!c)} title="What can Wani do?" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:isMobile?48:undefined,height:isMobile?48:undefined,padding:isMobile?0:'5px 10px',cursor:'pointer',fontSize:isMobile?20:12,color:showCapabilities?'#4F46E5':t.text3,fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:4,transition:'all 0.15s',flexShrink:0,borderColor:showCapabilities?'#4F46E5':t.border }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{if(!showCapabilities){e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}}>{isMobile?'✨':'✨ What can I do?'}</button>
              <button onClick={()=>{ setShowKnowledge(true); loadKnowledge() }} title="Knowledge Base" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:isMobile?48:undefined,height:isMobile?48:undefined,padding:isMobile?0:'5px 10px',cursor:'pointer',fontSize:isMobile?20:12,color:t.text3,fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:4,transition:'all 0.15s',flexShrink:0 }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}>
                {isMobile?'📚':'📚 Knowledge'}
                {knowledgeEntries.length > 0 && <span style={{ background:'#6366f1',color:'white',borderRadius:'50%',width:16,height:16,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:2 }}>{knowledgeEntries.length}</span>}
              </button>
              <button onClick={()=>setShowExport(true)} title="Export" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:isMobile?48:undefined,height:isMobile?48:undefined,padding:isMobile?0:'5px 10px',cursor:'pointer',fontSize:isMobile?20:12,color:t.text3,fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:4,transition:'all 0.15s',flexShrink:0 }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}>{isMobile?'↓':'↓ Export'}</button>
              {/* Generate Test Cases — only shown for project conversations */}
              {activeConv?.is_project && (
                <button
                  onClick={()=>{ setInput('Generate SIT and UAT test cases from the functional specification discussed in this conversation. Cover all logic steps, edge cases, and error scenarios.'); setTimeout(()=>document.querySelector('textarea')?.focus(),100) }}
                  title="Generate Test Cases from this FS"
                  style={{ background:'linear-gradient(135deg,rgba(79,70,229,0.12),rgba(99,102,241,0.08))',border:'1.5px solid rgba(79,70,229,0.4)',borderRadius:10,padding:isMobile?'0 12px':'5px 12px',cursor:'pointer',fontSize:12,color:'#4F46E5',fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:5,transition:'all 0.15s',flexShrink:0,height:isMobile?48:undefined,whiteSpace:'nowrap' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(79,70,229,0.18)';e.currentTarget.style.borderColor='#4F46E5'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='linear-gradient(135deg,rgba(79,70,229,0.12),rgba(99,102,241,0.08))';e.currentTarget.style.borderColor='rgba(79,70,229,0.4)'}}
                >
                  🧪 {isMobile?'Test Cases':'Generate Test Cases'}
                </button>
              )}
            </>
          )}
          <button onClick={toggle} style={{ width:isMobile?46:44,height:isMobile?28:24,borderRadius:14,border:'none',cursor:'pointer',position:'relative',background:dark?'linear-gradient(135deg,#4F46E5,#6366F1)':'#E2E2EA',transition:'background 0.3s',flexShrink:0 }}>
            <div style={{ position:'absolute',top:isMobile?4:2,width:isMobile?20:20,height:isMobile?20:20,borderRadius:'50%',background:'#fff',transition:'left 0.3s',left:dark?(isMobile?22:22):(isMobile?4:2),boxShadow:'0 2px 4px rgba(0,0,0,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11 }}>{dark?'🌙':'☀️'}</div>
          </button>
        </div>

        {/* Tone bar */}
        {view==='chat'&&messages.some(m=>m.role==='user')&&(
          <div style={{ padding:isMobile?'0 18px':'5px 14px',height:isMobile?48:36,borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:8,background:t.topbar,backdropFilter:'blur(6px)',flexShrink:0,position:'relative',zIndex:2,overflowX:'auto',WebkitOverflowScrolling:'touch' }}>
            <span style={{ fontSize:11,color:t.text4,fontWeight:500,flexShrink:0 }}>Tone:</span>
            {[{key:'balanced',label:'⚖️ Balanced'},{key:'direct',label:'⚡ Direct'},{key:'friendly',label:'😊 Friendly'},{key:'formal',label:'📋 Formal'}].map(to=>(
              <button key={to.key} className={`tone-btn${tone===to.key?' active':''}`} onClick={()=>setTone(to.key)} style={{ border:`1.5px solid ${tone===to.key?'transparent':t.toneBtnBdr}`,background:tone===to.key?undefined:t.toneBtn,color:tone===to.key?undefined:t.toneBtnTxt,flexShrink:0 }}>{to.label}</button>
            ))}
          </div>
        )}

        {/* Auto-compact progress overlay — like Claude.ai */}
        {autoCompacting&&(
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:dark?'#1A1530':'#fff',border:`1px solid ${dark?'#3D3560':'#E0E0E0'}`,borderRadius:20,padding:'32px 40px',width:'min(90vw,380px)',textAlign:'center',boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
              <div style={{ width:44,height:44,borderRadius:'50%',border:'3px solid rgba(79,70,229,0.2)',borderTopColor:'#4F46E5',animation:'spin 0.9s linear infinite',margin:'0 auto 20px' }}/>
              <div style={{ fontSize:16,fontWeight:600,color:dark?'#F0EEF8':'#1C1C1E',marginBottom:8,fontFamily:"'Inter','DM Sans',sans-serif" }}>
                Compacting conversation…
              </div>
              <div style={{ fontSize:13,color:dark?'#8A849E':'#8A8A8E',marginBottom:20,lineHeight:1.5 }}>
                Summarising earlier messages so we can keep chatting
              </div>
              <div style={{ background:dark?'#2A2440':'#F0F0F0',borderRadius:999,height:6,overflow:'hidden' }}>
                <div style={{ height:'100%',borderRadius:999,background:'linear-gradient(90deg,#4F46E5,#7C3AED)',width:`${compactProgress}%`,transition:'width 0.3s ease' }}/>
              </div>
              <div style={{ fontSize:12,color:dark?'#5A5470':'#AEAEB2',marginTop:10 }}>{Math.round(compactProgress)}%</div>
            </div>
          </div>
        )}

        {view==='home'&&<HomeScreen conversations={conversations} t={t} dark={dark} onSelectTopic={(mod,topic,convId)=>{ if(convId)goChat(convId); else goTopic(mod,topic) }} onNewChat={(mod,topic)=>goChat(null,mod,topic)} onQuickLaunch={handleQuickLaunch}/>}
        {view==='topic'&&<TopicView module={browseModule} topic={browseTopic} conversations={conversations} t={t} onSelectConv={(convId,mod,topic)=>{ if(convId)goChat(convId); else goTopic(mod,topic) }} onNewChat={(mod,topic)=>goChat(null,mod,topic)} onBack={goHome}/>}

        {view==='chat'&&(
          <>
            <div ref={chatScrollRef} className="chat-messages" style={{ flex:1,overflowY:'auto',padding:'20px 16px',position:'relative',zIndex:1 }}>
              <div style={{ maxWidth:720,margin:'0 auto' }}>
                {messages.length===0?(
                  quickLaunchMessages.length > 0 ? (
                    <div style={{ animation:'fadeIn 0.4s ease', padding:'20px 0' }}>
                      {quickLaunchMessages.map((msg, i) => (
                        <MessageBubble key={i} msg={msg} isStreaming={false} streamingText="" t={t} dark={dark} userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}/>
                      ))}
                    </div>
                  ) : (
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'60vh',textAlign:'center',animation:'fadeIn 0.4s ease',padding:'40px 20px' }}>
                    <WaniLogo size={window.innerWidth<768?48:80} dark={dark}/>
                    <div style={{ marginTop:16,marginBottom:8 }}><WaniWordmark height={window.innerWidth<768?24:40} dark={dark}/></div>
                    {profile?.name&&(<div style={{ fontFamily:"'Inter',sans-serif",fontSize:window.innerWidth<768?18:22,fontWeight:600,color:t.text,marginTop:12,marginBottom:4 }}>Hello, {profile.name.split(' ')[0]} 👋</div>)}
                    <p style={{ fontSize:15,color:t.text3,maxWidth:300,lineHeight:1.7,marginBottom:22,marginTop:8 }}>{browseTopic?`Ask anything about ${browseTopic}`:'What SAP question can I help with?'}</p>
                    {browseTopic&&STARTERS[browseTopic]&&(
                      <div style={{ display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',maxWidth:420 }}>
                        {STARTERS[browseTopic].map((s,i)=>(<div key={i} onClick={()=>setInput(s)} style={{ padding:'7px 14px',background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:20,fontSize:12,color:t.text3,cursor:'pointer',transition:'all 0.15s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color=t.text;e.currentTarget.style.background=t.surface2}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3;e.currentTarget.style.background=t.surface}}>{s}</div>))}
                      </div>
                    )}
                  </div>
                  )
                ):(
                  <>
                    {messages.map((msg,i)=>{
                      const prevUser = msg.role === 'assistant'
                        ? messages.slice(0,i).filter(m=>m.role==='user').slice(-1)[0]?.content || ''
                        : ''
                      return <MessageBubble key={i} msg={msg} isStreaming={false} streamingText="" t={t} dark={dark}
                        userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}
                        prevUserMsg={prevUser}
                        onAnalyse={(prompt) => {
                          // Extract original code — strip any previously prepended prompt
                          // Original code starts from the ABAP keywords
                          const codeMatch = prevUser.match(/((?:METHOD|CLASS|REPORT|FORM|FUNCTION|DATA:|SELECT|LOOP AT)[\s\S]+)/i)
                          const cleanCode = codeMatch ? codeMatch[0] : prevUser
                          handleSendText(`${prompt}\n\nCode:\n${cleanCode}`)
                        }}
                      />
                    })}
                    {isLoading&&!isStreaming&&(
                      <div style={{ display:'flex',gap:10,alignItems:'flex-start',marginBottom:20 }}>
                        <div style={{ width:32,height:32,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' }}><WaniLogo size={28} dark={dark}/></div>
                        <div style={{ background:t.msgAI,border:`1px solid ${t.msgAIBdr}`,borderRadius:'4px 16px 16px 16px' }}><TypingDots/></div>
                      </div>
                    )}
                    {isStreaming&&<MessageBubble msg={{role:'assistant',content:''}} isStreaming={true} streamingText={streamingText} t={t} dark={dark} userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}/>}
                    <div ref={bottomRef}/>
                  </>
                )}
              </div>
            </div>

            {/* Input */}
            <div className="chat-input-wrap" style={{ borderTop:`1px solid ${t.border}`,background:t.topbar,backdropFilter:'blur(10px)',flexShrink:0,position:'relative',zIndex:2 }}>
              <div style={{ maxWidth:720,margin:'0 auto' }}>

                {/* Document chip */}
                {uploadedDoc && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'6px 10px', background:'rgba(79,70,229,0.1)', border:'1px solid rgba(79,70,229,0.25)', borderRadius:10, fontSize:12 }}>
                    <span style={{ fontSize:14 }}>📄</span>
                    <span style={{ flex:1, color:t.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{uploadedDoc.name}</span>
                    <span style={{ color:'#6366f1', fontSize:11, fontWeight:600, background:'rgba(99,102,241,0.15)', padding:'2px 7px', borderRadius:6 }}>{uploadedDoc.docType?.replace('_',' ')}</span>
                    <button onClick={()=>setUploadedDoc(null)} style={{ background:'none', border:'none', color:t.text4, cursor:'pointer', fontSize:16, lineHeight:1, padding:0 }}>✕</button>
                  </div>
                )}

                {/* Document action buttons */}
                {uploadedDoc && DOC_ACTIONS[uploadedDoc.docType] && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                    {DOC_ACTIONS[uploadedDoc.docType].map(btn => (
                      <button key={btn.label}
                        onClick={() => handleSendText(btn.prompt)}
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:8, border:`1px solid ${t.border}`, background:t.surface2, color:t.text3, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:"'Inter','DM Sans',sans-serif" }}>
                        {btn.icon} {btn.label}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display:'flex',gap:10,alignItems:'flex-end',background:t.inputBg,border:`1.5px solid ${t.border2}`,borderRadius:14,padding:'10px 12px',transition:'border-color 0.2s, box-shadow 0.2s' }}
                  onFocusCapture={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.boxShadow='0 0 0 3px rgba(79,70,229,0.1)'}}
                  onBlurCapture={e=>{e.currentTarget.style.borderColor=t.border2;e.currentTarget.style.boxShadow='none'}}
                >
                  {/* Upload button */}
                  <button onClick={()=>docInputRef.current?.click()} disabled={docUploading}
                    title="Upload document (PDF, DOCX, TXT)"
                    style={{ width:32,height:32,borderRadius:8,border:`1px solid ${t.border}`,background:'transparent',color:uploadedDoc?'#6366f1':t.text4,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    {docUploading ? '⏳' : '📎'}
                  </button>
                  <input ref={docInputRef} type="file" accept=".txt,.pdf,.docx" style={{ display:'none' }} onChange={handleDocUpload} />

                  {/* Attached code card */}
                  {attachedCode && (
                    <div style={{ width:'100%', marginBottom:6 }}>
                      <CodeCard
                        language={attachedCode.language}
                        lines={attachedCode.lines}
                        content={attachedCode.content}
                        expanded={expandedCode}
                        onToggle={() => setExpandedCode(p => !p)}
                        onRemove={() => { setAttachedCode(null); setExpandedCode(false) }}
                        t={t} dark={dark}
                      />
                    </div>
                  )}

                  <textarea ref={inputRef} value={input}
                    onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px'}}
                    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}}}
                    onPaste={handlePaste}
                    placeholder={uploadedDoc ? `Ask about ${uploadedDoc.name}…` : "Ask your SAP question…"} rows={1}
                    style={{ flex:1,background:'transparent',border:'none',resize:'none',fontSize:16,color:t.text,fontFamily:"'Inter','DM Sans',sans-serif",lineHeight:1.65,height:'26px',maxHeight:'160px',overflowY:'auto',padding:0,outline:'none' }}
                  />
                  <button onClick={handleSend} disabled={(!input.trim()&&!attachedCode)||isLoading||isStreaming}
                    style={{ width:36,height:36,borderRadius:10,border:'none',flexShrink:0,background:(input.trim()||attachedCode)&&!isLoading&&!isStreaming?'#4F46E5':t.border,color:(input.trim()||attachedCode)&&!isLoading&&!isStreaming?'#fff':t.text4,cursor:(input.trim()||attachedCode)&&!isLoading&&!isStreaming?'pointer':'not-allowed',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s' }}
                  >→</button>
                </div>
                <div style={{ fontSize:11,color:t.text4,textAlign:'right',marginTop:4 }}>{activeConv?.module||browseModule||'Free mode'} · verify system-specific behaviour</div>
              </div>
            </div>

            {/* Knowledge toast notification */}
            {knowledgeToast && (
              <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:'rgba(79,70,229,0.95)', color:'white', padding:'8px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:100, boxShadow:'0 4px 20px rgba(79,70,229,0.4)' }}>
                {knowledgeToast}
              </div>
            )}

            {/* Pending finding confirmation */}
            {pendingFinding && (
              <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:t.surface, border:`1px solid rgba(79,70,229,0.3)`, borderRadius:14, padding:'14px 18px', fontSize:13, zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.3)', maxWidth:420, width:'90vw' }}>
                <div style={{ fontWeight:700, color:t.text, marginBottom:6 }}>💡 Save this finding?</div>
                <div style={{ color:t.text2, marginBottom:4, fontSize:12 }}><span style={{ color:'#6366f1', fontWeight:600 }}>{pendingFinding.module} › {pendingFinding.topic} › {pendingFinding.object}</span></div>
                <div style={{ color:t.text, marginBottom:12, lineHeight:1.5 }}>"{pendingFinding.finding}"</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>setPendingFinding(null)} style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${t.border}`, background:'transparent', color:t.text3, cursor:'pointer', fontFamily:"'Inter',sans-serif", fontSize:13 }}>Dismiss</button>
                  <button onClick={()=>saveFinding(pendingFinding)} style={{ flex:2, padding:'7px', borderRadius:8, border:'none', background:'#4F46E5', color:'white', cursor:'pointer', fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:600 }}>✓ Save to Knowledge Base</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showProfile&&<ProfileModal session={session} profile={profile} t={t} onClose={()=>setShowProfile(false)} onSave={async(u)=>{await upsertProfile(session.user.id,u);setProfile(p=>({...p,...u}))}} onSignOut={signOut}/>}
      {showExport&&<ExportModal conversation={activeConv} messages={messages} t={t} dark={dark} onClose={()=>setShowExport(false)}/>}

      {/* Capability Discovery Panel */}
      {showCapabilities && (
        <div style={{ position:'fixed', top:64, right:16, width:'min(320px,90vw)', background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:20, zIndex:150, boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:700, color:t.text }}>✨ What Wani can create</div>
            <button onClick={()=>setShowCapabilities(false)} style={{ background:'none', border:'none', color:t.text4, cursor:'pointer', fontSize:18 }}>✕</button>
          </div>
          <div style={{ fontSize:12, color:t.text4, marginBottom:12 }}>Just describe what you need — Wani understands and delivers.</div>
          {[
            { icon:'📋', label:'Functional Spec', hint:'Generate a functional specification for any SAP process' },
            { icon:'⚙️', label:'Technical Spec', hint:'Generate a developer technical specification from a process or FS' },
            { icon:'🧪', label:'Test Cases', hint:'Generate SAP test cases and test scripts' },
            { icon:'⚠️', label:'Gap Analysis', hint:'Find what is missing from a spec, process, or implementation' },
            { icon:'🗓️', label:'Workshop Plan', hint:'Create a workshop agenda, questions, and decision points' },
            { icon:'📄', label:'SAP Form Spec', hint:'Specify Adobe/SmartForms with NACE trigger and field mapping' },
            { icon:'📱', label:'Fiori App Suggestions', hint:'Get Fiori app recommendations for a process or role' },
            { icon:'🔴', label:'Error Analysis', hint:'Paste any SAP error or dump — get root cause and fix steps' },
            { icon:'🔬', label:'Code Analysis', hint:'Paste ABAP code — get 7-dimension analysis and action buttons' },
          ].map(item => (
            <div key={item.label}
              onClick={() => { setInput(`${item.hint}`); setShowCapabilities(false); setTimeout(()=>inputRef.current?.focus(),100) }}
              style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px', borderRadius:10, cursor:'pointer', marginBottom:4, transition:'background 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,0.08)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:t.text, marginBottom:2 }}>{item.label}</div>
                <div style={{ fontSize:11, color:t.text4, lineHeight:1.4 }}>{item.hint}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${t.border}`, fontSize:11, color:t.text4, textAlign:'center' }}>
            Or just type naturally — Wani understands intent automatically
          </div>
        </div>
      )}

      {/* Knowledge Base Panel */}
      {showKnowledge && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}
          onClick={()=>setShowKnowledge(false)}>
          <div style={{ width:'min(420px,95vw)', height:'100vh', background:t.surface, borderLeft:`1px solid ${t.border}`, overflowY:'auto', padding:20 }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:700, color:t.text }}>📚 Knowledge Base</div>
              <button onClick={()=>setShowKnowledge(false)} style={{ background:'none', border:'none', color:t.text4, cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            <div style={{ fontSize:12, color:t.text4, marginBottom:16 }}>Verified consultant findings from real projects. Used automatically when relevant topics come up.</div>
            {knowledgeEntries.length === 0 ? (
              <div style={{ textAlign:'center', color:t.text4, fontSize:13, padding:'40px 20px' }}>
                No findings yet.{'\n'}Findings are suggested automatically after conversations containing real project discoveries.
              </div>
            ) : (
              Object.entries(knowledgeEntries.reduce((acc, k) => {
                if (!acc[k.module]) acc[k.module] = []
                acc[k.module].push(k)
                return acc
              }, {})).map(([module, entries]) => (
                <div key={module} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>{module}</div>
                  {entries.map(entry => (
                    <div key={entry.id} style={{ background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, color:'#6366f1', fontWeight:600, marginBottom:4 }}>{entry.topic} › {entry.object}</div>
                          <div style={{ fontSize:13, color:t.text, lineHeight:1.5 }}>{entry.finding}</div>
                          <div style={{ fontSize:11, color:t.text4, marginTop:4 }}>{new Date(entry.created_at).toLocaleDateString()} · {entry.confidence}</div>
                        </div>
                        <button onClick={()=>deleteKnowledge(entry.id)}
                          style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:14, flexShrink:0, padding:4 }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
