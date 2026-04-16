import { useState, useEffect, useRef } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import { WaniLogo, WaniWordmark } from './Login.jsx'
import { useTheme } from '../App.jsx'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
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

function MessageBubble({ msg, isStreaming, streamingText, t, dark, userInitial }) {
  const isUser = msg.role === 'user'
  const content = isStreaming ? streamingText : msg.content
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(null)

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
          const csv = [headers.map(h=>h.trim()).join(','), ...rows.map(r=>r.map(c=>c.trim()).join(','))].join('\n')
          navigator.clipboard?.writeText(csv)
        }
        const downloadCSV = () => {
          const csv = [headers.map(h=>h.trim()).join(','), ...rows.map(r=>r.map(c=>c.trim()).join(','))].join('\n')
          const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
          a.download = 'wani-table.csv'; a.click()
        }
        els.push(<div key={`t${i}`} style={{ margin:'10px 0' }}>
          <div style={{ display:'flex',gap:6,marginBottom:6,justifyContent:'flex-end' }}>
            <button onClick={copyTableAsCSV} style={{ fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${t.border}`,background:'transparent',color:t.text3,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}>Copy CSV</button>
            <button onClick={downloadCSV} style={{ fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${t.border}`,background:'transparent',color:t.text3,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}>↓ Download CSV</button>
          </div>
          <div style={{ overflowX:'auto' }}>
          <table style={{ borderCollapse:'collapse',width:'100%',fontSize:15 }}>
            <thead><tr>{headers.map((h,j)=><th key={j} style={{ padding:'8px 12px',background:'rgba(79,70,229,0.08)',borderBottom:'2px solid rgba(79,70,229,0.2)',textAlign:'left',fontWeight:600,color:t.text,whiteSpace:'nowrap' }}>{h.trim()}</th>)}</tr></thead>
            <tbody>{rows.map((row,j)=><tr key={j} style={{ borderBottom:`1px solid ${t.border}`,background:j%2===0?t.surface:t.surface2 }}>{row.map((cell,k)=><td key={k} style={{ padding:'7px 12px',color:t.text2 }}>{inlineFormat(cell.trim())}</td>)}</tr>)}</tbody>
          </table></div></div>)
        continue
      }
      if (line.startsWith('## '))     { els.push(<div key={i} style={{ fontWeight:700,fontSize:18,color:t.text,margin:'14px 0 6px',fontFamily:"'Inter',sans-serif" }}>{line.slice(3)}</div>); i++; continue }
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
        <div style={{ maxWidth:'80%',background:t.msgUser,border:`1px solid ${t.msgUserBdr}`,borderRadius:'16px 4px 16px 16px',padding:'10px 14px',fontSize:16,lineHeight:1.7,color:t.text,wordBreak:'break-word' }}>
          <span style={{ whiteSpace:'pre-wrap' }}>{content}</span>
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

function HomeScreen({ conversations, onSelectTopic, onNewChat, t, dark }) {
  const cardRefs=useRef([]),slotsRef=useRef(MODULE_STACK.map((_,i)=>i)),busyRef=useRef(false)
  const [dotIdx,setDotIdx]=useState(0)
  const ty0=useRef(0),tdrag=useRef(false),my0=useRef(0),mdrag=useRef(false),mdown=useRef(false)
  const SPRING='top 500ms cubic-bezier(0.22,1.4,0.36,1), transform 500ms cubic-bezier(0.22,1.4,0.36,1), opacity 380ms ease'
  const SNAP='top 300ms cubic-bezier(0.34,1.3,0.64,1), opacity 260ms ease'
  const applyCard=(idx,slot,tr)=>{const el=cardRefs.current[idx];if(!el)return;el.style.transition=tr;el.style.top=`${topFor(slot)}px`;el.style.transform=`scale(${scaleFor(slot)})`;el.style.opacity=opacityFor(slot);el.style.zIndex=N_CARDS-slot;el.style.pointerEvents=slot===0?'auto':'none'}
  const renderAll=(sl,tr)=>{sl.forEach((slot,idx)=>applyCard(idx,slot,tr));setDotIdx(sl.indexOf(0))}
  useEffect(()=>{renderAll(slotsRef.current,'none')},[])
  const advance=()=>{
    if(busyRef.current)return;busyRef.current=true
    const slots=slotsRef.current,fi=slots.indexOf(0),front=cardRefs.current[fi]
    if(front){front.style.transition='top 260ms cubic-bezier(0.4,0,1,1), opacity 200ms ease, transform 260ms ease';front.style.top='-200px';front.style.opacity='0';front.style.transform='scale(0.88)';front.style.zIndex='0'}
    setTimeout(()=>{
      const newSlots=slots.map(s=>s===0?N_CARDS-1:s-1);slotsRef.current=newSlots
      if(front){front.style.transition='none';front.style.top=`${topFor(N_CARDS-1)}px`;front.style.transform=`scale(${scaleFor(N_CARDS-1)})`;front.style.opacity=opacityFor(N_CARDS-1);front.style.zIndex=`${N_CARDS-(N_CARDS-1)}`;front.style.pointerEvents='none'}
      requestAnimationFrame(()=>{newSlots.forEach((slot,idx)=>{if(idx!==fi)applyCard(idx,slot,SPRING)});setTimeout(()=>{applyCard(fi,newSlots[fi],SPRING);setDotIdx(newSlots.indexOf(0));setTimeout(()=>{busyRef.current=false},530)},80)})
    },240)
  }
  const retreat=()=>{if(busyRef.current)return;busyRef.current=true;const newSlots=slotsRef.current.map(s=>s===N_CARDS-1?0:s+1);slotsRef.current=newSlots;renderAll(newSlots,SPRING);setTimeout(()=>{busyRef.current=false},550)}
  const dragFollow=(fi,dy)=>{const el=cardRefs.current[fi];if(!el)return;const c=Math.max(-80,Math.min(100,dy));el.style.transition='none';el.style.top=`${c*0.38}px`;el.style.opacity=`${1-Math.abs(c)/130*0.35}`}
  const snapFront=(fi)=>{const el=cardRefs.current[fi];if(!el)return;el.style.transition=SNAP;el.style.top='0px';el.style.opacity='1'}
  const newBtnGrad=dark?'linear-gradient(135deg,#ffffff 0%,#9ca3af 100%)':'linear-gradient(135deg,#1a1a2e 0%,#111827 100%)'
  const newBtnColor=dark?'#0D0D1A':'#ffffff'
  return (
    <div style={{ flex:1,overflowY:'auto',position:'relative',zIndex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'2rem 1rem 2.5rem' }}>
      {dark&&(<div style={{ position:'fixed',inset:0,zIndex:0,pointerEvents:'none',background:'#0D0D1A' }}><div style={{ position:'absolute',inset:0,background:'radial-gradient(ellipse 70% 50% at 15% 25%,rgba(79,70,229,0.22) 0%,transparent 60%), radial-gradient(ellipse 55% 45% at 85% 65%,rgba(124,58,237,0.16) 0%,transparent 55%)',animation:'auroraHS 14s ease-in-out infinite alternate' }}/><div style={{ position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(255,255,255,0.05) 1px,transparent 1px)',backgroundSize:'26px 26px',animation:'gridHS 22s linear infinite' }}/></div>)}
      <style>{`@keyframes auroraHS{0%{transform:scale(1) translateY(0);opacity:1}50%{transform:scale(1.07) translateY(-18px);opacity:0.7}100%{transform:scale(1) translateY(0);opacity:1}}@keyframes gridHS{from{background-position:0 0}to{background-position:26px 26px}}@keyframes deckIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}.hs-card-wrap{animation:deckIn 0.45s ease both}.hs-topic{font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);white-space:nowrap}.hs-open-btn{font-size:13px;font-weight:600;padding:9px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.45);background:rgba(0,0,0,0.2);color:#fff;font-family:'Inter','DM Sans',sans-serif;cursor:pointer;pointer-events:auto;position:relative;z-index:30;transition:background 0.2s;min-width:100px;text-align:center}.hs-open-btn:hover{background:rgba(0,0,0,0.35)}.hs-open-btn:active{transform:scale(0.97)}.hs-recent-row{display:flex;align-items:center;gap:10px;padding:9px 13px;background:${dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)'};border:1px solid ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)'};border-radius:10px;cursor:pointer;transition:background 0.15s,border-color 0.15s}.hs-recent-row:hover{background:${dark?'rgba(79,70,229,0.08)':'rgba(79,70,229,0.05)'};border-color:rgba(79,70,229,0.28)}`}</style>
      <div style={{ position:'relative',zIndex:1,textAlign:'center',marginBottom:28 }}>
        <div style={{ fontFamily:"'Inter',sans-serif",fontSize:21,fontWeight:600,color:t.text,marginBottom:5 }}>What would you like to explore?</div>
        <p style={{ fontSize:11,color:t.text3 }}>click card · swipe to cycle modules</p>
      </div>
      <div className="hs-card-wrap" style={{ position:'relative',zIndex:1,width:'min(100%,420px)',height:`${CARD_H+20}px`,touchAction:'none',cursor:'pointer',flexShrink:0,overflow:'hidden',borderRadius:22 }}
        onClick={e=>{if(e.target.closest('.hs-open-btn')||e.target.closest('.hs-topic'))return;advance()}}
        onMouseDown={e=>{if(e.target.closest('.hs-open-btn')||e.target.closest('.hs-topic'))return;mdown.current=true;my0.current=e.clientY;mdrag.current=false}}
        onMouseMove={e=>{if(!mdown.current||busyRef.current)return;const dy=e.clientY-my0.current;if(Math.abs(dy)>6)mdrag.current=true;if(!mdrag.current)return;dragFollow(slotsRef.current.indexOf(0),dy)}}
        onMouseUp={e=>{if(!mdown.current)return;mdown.current=false;const dy=e.clientY-my0.current;const fi=slotsRef.current.indexOf(0);if(mdrag.current){dy>40?advance():dy<-40?retreat():snapFront(fi)}mdrag.current=false}}
        onMouseLeave={()=>{if(mdown.current&&!mdrag.current)mdown.current=false}}
        onTouchStart={e=>{ty0.current=e.touches[0].clientY;tdrag.current=false}}
        onTouchMove={e=>{const dy=e.touches[0].clientY-ty0.current;if(Math.abs(dy)>8)tdrag.current=true;if(!tdrag.current||busyRef.current)return;dragFollow(slotsRef.current.indexOf(0),dy)}}
        onTouchEnd={e=>{const dy=e.changedTouches[0].clientY-ty0.current;const fi=slotsRef.current.indexOf(0);if(tdrag.current){dy>55?advance():dy<-55?retreat():snapFront(fi)}tdrag.current=false}}
      >
        {(()=>{
          const usedModules=MODULE_STACK.filter(m=>conversations.some(c=>c.module===m.key))
          const stackToShow=usedModules.length>0?usedModules:null
          if(!stackToShow)return(<div style={{ position:'absolute',inset:0,borderRadius:22,background:dark?'#1A1830':'#F0EEF8',border:`1px solid ${dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)'}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24 }}><div style={{ fontSize:36,opacity:0.3 }}>💬</div><div style={{ fontFamily:"'Inter',sans-serif",fontSize:18,fontWeight:600,color:t.text,textAlign:'center' }}>Start your first conversation</div><p style={{ fontSize:14,color:t.text3,textAlign:'center',maxWidth:260,lineHeight:1.6 }}>Ask any SAP question — your modules will appear here as you explore</p><button onClick={()=>onNewChat(null,null)} style={{ marginTop:8,padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#1a1a2e,#4F46E5)',color:'#fff',fontSize:14,fontWeight:600,fontFamily:"'Inter','DM Sans',sans-serif",cursor:'pointer' }}>Ask Wani →</button></div>)
          return stackToShow.map((m,idx)=>{
            const count=conversations.filter(c=>c.module===m.key).length
            const topics=TOPICS[m.key]||[]
            return(<div key={m.key} ref={el=>cardRefs.current[idx]=el} style={{ position:'absolute',left:0,right:0,height:CARD_H,borderRadius:22,background:dark?m.gradDark:m.gradLight,boxShadow:'0 10px 36px rgba(0,0,0,0.38)',overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'17px 22px 15px',willChange:'top,transform,opacity' }}>
              <div style={{ position:'absolute',top:0,left:0,right:0,height:'50%',background:'linear-gradient(180deg,rgba(255,255,255,0.13) 0%,transparent 100%)',borderRadius:'22px 22px 0 0',pointerEvents:'none' }}/>
              <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'28%',background:'linear-gradient(0deg,rgba(0,0,0,0.18) 0%,transparent 100%)',pointerEvents:'none' }}/>
              <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'flex-start',justifyContent:'space-between' }}>
                <div style={{ display:'flex',alignItems:'center',gap:13 }}>
                  <div style={{ width:48,height:48,borderRadius:14,background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.28)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0 }}>{m.emoji}</div>
                  <div><div style={{ fontFamily:"'Inter',sans-serif",fontSize:22,fontWeight:600,color:'#fff',letterSpacing:'-0.3px',lineHeight:1 }}>{m.mod}</div><div style={{ fontSize:11,color:'rgba(255,255,255,0.68)',marginTop:4 }}>{m.sub}</div></div>
                </div>
                <span style={{ fontSize:10,fontWeight:600,padding:'4px 10px',borderRadius:20,background:'rgba(0,0,0,0.22)',border:'1px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.82)',whiteSpace:'nowrap',flexShrink:0 }}>{count} {count===1?'conv':'convs'}</span>
              </div>
              <div style={{ position:'relative',zIndex:1,display:'flex',flexWrap:'wrap',gap:5,pointerEvents:'none' }}>{topics.slice(0,4).map(tp=>(<span key={tp} className="hs-topic">{tp}</span>))}{topics.length>4&&<span className="hs-topic">+{topics.length-4} more</span>}</div>
              <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'center',justifyContent:'flex-end' }}><button className="hs-open-btn" onClick={e=>{e.stopPropagation();onSelectTopic(m.key,null)}}>Open {m.mod} →</button></div>
            </div>)
          })
        })()}
      </div>
      <div style={{ position:'relative',zIndex:1,display:'flex',gap:7,marginTop:14,alignItems:'center',justifyContent:'center' }}>
        {MODULE_STACK.map((_,i)=>(<div key={i} style={{ width:6,height:6,borderRadius:'50%',transition:'background 0.35s,transform 0.35s',background:dotIdx===i?(dark?'#ffffff':'#1a1a2e'):(dark?'rgba(255,255,255,0.18)':'rgba(0,0,0,0.14)'),transform:dotIdx===i?'scale(1.4)':'scale(1)' }}/>))}
      </div>
      <div style={{ position:'relative',zIndex:1,width:'min(100%,420px)',margin:'22px 0 0',display:'flex',alignItems:'center',gap:10 }}>
        <div style={{ flex:1,height:1,background:`linear-gradient(90deg,transparent,${dark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'},transparent)` }}/>
        <span style={{ fontSize:10,fontWeight:700,color:t.text4,letterSpacing:0.9,textTransform:'uppercase',whiteSpace:'nowrap' }}>Recent conversations</span>
        <div style={{ flex:1,height:1,background:`linear-gradient(90deg,${dark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'},transparent)` }}/>
      </div>
      <div style={{ position:'relative',zIndex:1,width:'min(100%,420px)',marginTop:14 }}>
        <button onClick={()=>onNewChat(null,null)} style={{ width:'100%',padding:'12px 20px',borderRadius:13,border:'none',background:newBtnGrad,color:newBtnColor,fontSize:14,fontWeight:600,fontFamily:"'Inter','DM Sans',sans-serif",cursor:'pointer',letterSpacing:0.2,display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:dark?'0 4px 18px rgba(0,0,0,0.4)':'0 4px 18px rgba(0,0,0,0.2)',transition:'box-shadow 0.2s,transform 0.15s' }}
          onMouseEnter={e=>{e.currentTarget.style.boxShadow=dark?'0 6px 26px rgba(0,0,0,0.55)':'0 6px 26px rgba(0,0,0,0.3)';e.currentTarget.style.transform='translateY(-1px)'}}
          onMouseLeave={e=>{e.currentTarget.style.boxShadow=dark?'0 4px 18px rgba(0,0,0,0.4)':'0 4px 18px rgba(0,0,0,0.2)';e.currentTarget.style.transform='translateY(0)'}}
        ><span style={{ fontSize:16 }}>+</span> New Conversation</button>
      </div>
      {conversations.length>0&&(
        <div style={{ position:'relative',zIndex:1,width:'min(100%,420px)',marginTop:10,display:'flex',flexDirection:'column',gap:7 }}>
          {conversations.slice(0,4).map(conv=>(
            <div key={conv.id} className="hs-recent-row" onClick={()=>onSelectTopic(conv.module,conv.topic,conv.id)}>
              <span style={{ fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:6,background:'rgba(79,70,229,0.12)',border:'1px solid rgba(79,70,229,0.22)',color:'#818cf8',flexShrink:0 }}>{conv.module?.split('–')[0].trim()||'SAP'}</span>
              <span style={{ fontSize:12,color:t.text2,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{conv.title}</span>
              <span style={{ fontSize:11,color:t.text4,flexShrink:0 }}>{new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
            </div>
          ))}
        </div>
      )}
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
  const [autoCompacting, setAutoCompacting] = useState(false)
  const [compactProgress, setCompactProgress] = useState(0)
  const hasAutoSummarisedRef = useRef(new Set())
  const [sidebarOpen, setSidebarOpen]     = useState(!isMobileWidth())
  const [tone, setTone]                   = useState('balanced')
  const [isMobile, setIsMobile]           = useState(isMobileWidth())
  const [showExport, setShowExport]       = useState(false)

  const bottomRef      = useRef(null)
  const inputRef       = useRef(null)
  const chatScrollRef  = useRef(null)

  const activeConv = conversations.find(c=>c.id===activeConvId)
  const messages   = activeConv?.messages || []

  const filteredConvs = conversations.filter(c => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.title?.toLowerCase().includes(q)||c.module?.toLowerCase().includes(q)||c.topic?.toLowerCase().includes(q)||c.messages?.some(m=>m.content?.toLowerCase().includes(q))
  })

  useEffect(()=>{
    const handleResize=()=>{ if(isMobileWidth())setSidebarOpen(false); else setSidebarOpen(true) }
    window.addEventListener('resize',handleResize)
    return()=>window.removeEventListener('resize',handleResize)
  },[])

  useEffect(()=>{
    Promise.all([
      loadConversations(session.user.id).catch(()=>[]),
      getProfile(session.user.id).catch(()=>null),
    ]).then(([convs,prof])=>{ setConversations(convs||[]); setProfile(prof); setDbLoading(false) })
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

  const goHome=()=>{ setView('home');setActiveConvId(null);setBrowseModule(null);setBrowseTopic(null);setShowSummarise(false);if(isMobileWidth())setSidebarOpen(false);window.history.replaceState({ view:'home' },'') }
  const goTopic=(mod,topic)=>{ setBrowseModule(mod);setBrowseTopic(topic);setView('topic');if(isMobileWidth())setSidebarOpen(false);window.history.pushState({ view:'topic',mod,topic },'') }
  const goChat=(convId,mod=null,topic=null)=>{ if(convId){ setActiveConvId(convId);setView('chat');setShowSummarise(false) } else { setActiveConvId(null);setBrowseModule(mod);setBrowseTopic(topic);setView('chat');setShowSummarise(false) };window.history.pushState({ view:'chat',convId,mod,topic },'');if(isMobileWidth())setSidebarOpen(false) }

  const handleSend = async () => {
    if (!input.trim()||isLoading||isStreaming) return
    const msgText = input.trim()
    const userMsg = { role:'user', content:msgText }
    setInput('')
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
      const res = await fetch('/api/chat',{
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ messages:currentMsgs, module:currentMod, topic:currentTopic, tone, userId:session.user.id, userName:profile?.name||null, userRole:profile?.role||null, userModules:profile?.modules||[] }),
      })

      if (!res.ok) throw new Error('Network error')

      setIsLoading(false)
      setIsStreaming(true)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = '', fullReply = '', modelUsed = ''
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
        : modelUsed === 'claude-haiku' ? '✦ Claude Haiku'
        : modelUsed === 'claude+gemini' ? '✦ Claude  📚 Gemini'
        : '✦ Claude'

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
      await updateConversation(convId,{ messages:finalMsgs })
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:finalMsgs,updated_at:new Date().toISOString()}:c))

      if (currentMsgs.length===1) {
        fetch('/api/categorise',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ message:msgText }) })
          .then(r=>r.json()).then(({ module,topic,title })=>{ if(module){ updateConversation(convId,{ module,topic,title });setConversations(prev=>prev.map(c=>c.id===convId?{...c,module,topic,title}:c)) } }).catch(()=>{})
      }

      fetch('/api/extract',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ userId:session.user.id,convId,module:currentMod||null,topic:currentTopic||null,userMsg:msgText,assistantMsg:finalReply }) }).catch(()=>{})

    } catch(err) {
      setIsLoading(false);setIsStreaming(false);setStreamingText('')
      const errMsgs=[...currentMsgs,{ role:'assistant',content:'Error reaching AI. Please try again.' }]
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:errMsgs}:c))
    }
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
        </div>
        <div style={{ flex:1,overflowY:'auto',padding:'4px 8px 8px' }}>
          {dbLoading?(
            <div style={{ padding:20,textAlign:'center' }}><div style={{ width:20,height:20,border:`2px solid ${t.border}`,borderTopColor:'#4F46E5',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px' }}/><span style={{ fontSize:12,color:t.text4 }}>Loading...</span></div>
          ):filteredConvs.length===0?(
            <div style={{ padding:'24px 16px',textAlign:'center' }}><div style={{ fontSize:28,marginBottom:8 }}>💬</div><p style={{ fontSize:12,color:t.text4,lineHeight:1.6 }}>No conversations yet</p></div>
          ):(
            Object.entries(groups).map(([group,convs])=>convs.length===0?null:(
              <div key={group}>
                <div style={{ fontSize:10,fontWeight:700,color:t.text4,letterSpacing:0.8,textTransform:'uppercase',padding:'10px 6px 4px' }}>{group}</div>
                {convs.map(conv=>(<ConversationItem key={conv.id} conv={conv} isActive={conv.id===activeConvId} t={t} onClick={()=>{ setActiveConvId(conv.id);setView('chat');setShowSummarise(false);if(isMobile)setSidebarOpen(false) }} onDelete={handleDelete}/>))}
              </div>
            ))
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
            <button onClick={()=>setShowExport(true)} title="Export" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:isMobile?48:undefined,height:isMobile?48:undefined,padding:isMobile?0:'5px 10px',cursor:'pointer',fontSize:isMobile?20:12,color:t.text3,fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:4,transition:'all 0.15s',flexShrink:0 }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}>{isMobile?'↓':'↓ Export'}</button>
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

        {view==='home'&&<HomeScreen conversations={conversations} t={t} dark={dark} onSelectTopic={(mod,topic,convId)=>{ if(convId)goChat(convId); else goTopic(mod,topic) }} onNewChat={(mod,topic)=>goChat(null,mod,topic)}/>}
        {view==='topic'&&<TopicView module={browseModule} topic={browseTopic} conversations={conversations} t={t} onSelectConv={(convId,mod,topic)=>{ if(convId)goChat(convId); else goTopic(mod,topic) }} onNewChat={(mod,topic)=>goChat(null,mod,topic)} onBack={goHome}/>}

        {view==='chat'&&(
          <>
            <div ref={chatScrollRef} className="chat-messages" style={{ flex:1,overflowY:'auto',padding:'20px 16px',position:'relative',zIndex:1 }}>
              <div style={{ maxWidth:720,margin:'0 auto' }}>
                {messages.length===0?(
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'calc(100vh - 280px)',textAlign:'center',animation:'fadeIn 0.4s ease' }}>
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
                ):(
                  <>
                    {messages.map((msg,i)=><MessageBubble key={i} msg={msg} isStreaming={false} streamingText="" t={t} dark={dark} userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}/>)}
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
                <div style={{ display:'flex',gap:10,alignItems:'flex-end',background:t.inputBg,border:`1.5px solid ${t.border2}`,borderRadius:14,padding:'10px 12px',transition:'border-color 0.2s, box-shadow 0.2s' }}
                  onFocusCapture={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.boxShadow='0 0 0 3px rgba(79,70,229,0.1)'}}
                  onBlurCapture={e=>{e.currentTarget.style.borderColor=t.border2;e.currentTarget.style.boxShadow='none'}}
                >
                  <textarea ref={inputRef} value={input}
                    onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px'}}
                    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}}}
                    placeholder="Ask your SAP question…" rows={1}
                    style={{ flex:1,background:'transparent',border:'none',resize:'none',fontSize:16,color:t.text,fontFamily:"'Inter','DM Sans',sans-serif",lineHeight:1.65,height:'26px',maxHeight:'160px',overflowY:'auto',padding:0,outline:'none' }}
                  />
                  <button onClick={handleSend} disabled={!input.trim()||isLoading||isStreaming}
                    style={{ width:36,height:36,borderRadius:10,border:'none',flexShrink:0,background:input.trim()&&!isLoading&&!isStreaming?'#4F46E5':t.border,color:input.trim()&&!isLoading&&!isStreaming?'#fff':t.text4,cursor:input.trim()&&!isLoading&&!isStreaming?'pointer':'not-allowed',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s' }}
                  >→</button>
                </div>
                <div style={{ fontSize:11,color:t.text4,textAlign:'right',marginTop:4 }}>{activeConv?.module||browseModule||'Free mode'} · verify system-specific behaviour</div>
              </div>
            </div>
          </>
        )}
      </div>

      {showProfile&&<ProfileModal session={session} profile={profile} t={t} onClose={()=>setShowProfile(false)} onSave={async(u)=>{await upsertProfile(session.user.id,u);setProfile(p=>({...p,...u}))}} onSignOut={signOut}/>}
      {showExport&&<ExportModal conversation={activeConv} messages={messages} t={t} dark={dark} onClose={()=>setShowExport(false)}/>}
    </div>
  )
}
