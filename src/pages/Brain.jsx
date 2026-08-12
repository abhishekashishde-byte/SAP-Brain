import { useState, useEffect, useRef } from 'react'
import { TOPICS, MODULE_META, STARTERS, SUMMARISE_THRESHOLD } from '../constants'
import { WaniLogo, WaniWordmark } from './Login.jsx'
import { useTheme } from '../App.jsx'
import AnswerVisual from '../components/visuals/AnswerVisual.jsx'
import AnswerContainer from '../components/visuals/AnswerContainer.jsx'
import QuickAnswer from '../components/visuals/QuickAnswer.jsx'
import WaniHeroCard from '../components/WaniHeroCard.jsx'
import {
  supabase, signOut,
  loadConversations, createConversation, updateConversation, deleteConversation,
  markAsProject, loadProjects,
  getProfile, upsertProfile,
} from '../supabaseClient'

// ── Simple line-style icons — replace emoji for a cleaner, consistent look ──
const IconMic = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
)
const IconChart = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="12" y1="20" x2="12" y2="9"/>
    <line x1="18" y1="20" x2="18" y2="4"/>
  </svg>
)
const IconChat = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
)
const IconHistory = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7"/>
    <polyline points="3 4 3 9 8 9"/>
    <polyline points="12 8 12 12 15 14"/>
  </svg>
)
const IconBook = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14z"/>
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20"/>
  </svg>
)
const IconHome = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10.5 12 3l9 7.5"/>
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>
  </svg>
)
const IconLogOut = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)
const IconPlus = ({ size=16, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const T = {
  light: {
    bg:'#FAFAF8',surface:'#FFFFFF',surface2:'#F5F0FA',border:'#EDEDE8',border2:'#D8D0E8',
    text:'#1C1C1E',text2:'#3A3A3C',text3:'#8A8A8E',text4:'#AEAEB2',
    sidebar:'linear-gradient(180deg,#FFFFFF 0%,#FDF8FF 100%)',topbar:'rgba(255,255,255,0.9)',
    inputBg:'#FAFAF8',msgUser:'#FDF4FF',msgUserBdr:'#E8C8F0',msgAI:'#FFFFFF',msgAIBdr:'#EDEDED',
    blob1:'rgba(200,80,192,0.12)',blob2:'rgba(255,107,53,0.09)',blob3:'rgba(255,204,112,0.11)',
    bgGrad:'linear-gradient(160deg,#FDF8FF 0%,#FFF5F0 40%,#FFFBF0 100%)',
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
    codeBg:'rgba(200,80,192,0.18)',codeTxt:'#D070D0',
    summarise:'linear-gradient(135deg,rgba(200,80,192,0.15),rgba(255,107,53,0.1))',
    summariseBdr:'rgba(200,80,192,0.35)',summariseTxt:'#D090D0',
  }
}

// Selectable animated background themes — profile-level choice, independent of
// light/dark mode. Only affects the background layer behind the main chat panel
// and the on-background greeting text; everything else (sidebar, bubbles, fonts,
// layout) is untouched and keeps using the existing light/dark `t` object.
const BG_THEMES = {
  aurora:   { bgGrad:'linear-gradient(160deg,#140b1f 0%,#0c0a1a 100%)', blobA:'rgba(127,119,221,0.55)', blobB:'rgba(83,74,183,0.5)',  blobC:'rgba(175,169,236,0.3)', text:'#CECBF6', text2:'#AFA9EC' },
  ember:    { bgGrad:'linear-gradient(160deg,#1c0f0a 0%,#140b08 100%)', blobA:'rgba(240,153,123,0.5)', blobB:'rgba(153,60,29,0.5)',  blobC:'rgba(216,90,48,0.3)',   text:'#F5C4B3', text2:'#F0997B' },
  graphite: { bgGrad:'linear-gradient(160deg,#141412 0%,#0d0d0c 100%)', blobA:'rgba(136,135,128,0.4)', blobB:'rgba(95,94,90,0.4)',  blobC:'rgba(68,68,65,0.3)',    text:'#D3D1C7', text2:'#B4B2A9' },
  light:    { bgGrad:'linear-gradient(160deg,#eaf1fb 0%,#f5f8fd 100%)', blobA:'rgba(133,183,235,0.45)',blobB:'rgba(175,169,236,0.4)',blobC:'rgba(133,183,235,0.25)',text:'#0C447C', text2:'#185FA5' },
}
const BG_THEME_LIST = [
  { key:'aurora',   label:'Aurora' },
  { key:'ember',    label:'Ember' },
  { key:'graphite', label:'Graphite' },
  { key:'light',    label:'Light' },
]

const MODULE_COLORS = {
  "PP – Production Planning":{ from:'#16a34a',to:'#059669',emoji:'⚙️' },
  "PM – Plant Maintenance":  { from:'#4f46e5',to:'#7c3aed',emoji:'🔧' },
  "MM – Materials Management":          { from:'#ea580c',to:'#dc2626',emoji:'📦' },
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

// ── FURTHER READING BLOCK — two-tier display ─────────────────────────────────
const SOURCE_META = {
  'SAP Help':         { icon: '📘', color: '#0070F2', label: 'SAP Help' },
  'SAP Community':    { icon: '💬', color: '#E8A000', label: 'SAP Community' },
  'SAP Blog':         { icon: '✍️', color: '#D97706', label: 'SAP Blogs' },
  'SAP Fiori Library':{ icon: '◻️', color: '#0070F2', label: 'Fiori Library' },
  'SAP Support':      { icon: '🔧', color: '#C0392B', label: 'SAP Support' },
  'SAP':              { icon: '📄', color: '#425B76', label: 'SAP Docs' },
  'Web':              { icon: '🌐', color: '#555',    label: 'Google Search' },
  'Google':           { icon: '🔍', color: '#4285F4', label: 'Google' },
}

// ── DAILY USAGE BAR ───────────────────────────────────────────────────────────
function UsageBar({ count, limit, dark }) {
  const [dismissed, setDismissed] = useState(false)
  const pct = Math.min((count / limit) * 100, 100)
  const remaining = Math.max(limit - count, 0)

  if (dismissed || pct < 75) return null

  const isRed    = pct >= 100
  const isOrange = pct >= 90 && pct < 100
  const barColor = isRed ? '#EF4444' : isOrange ? '#F97316' : '#4F46E5'
  const bgColor  = isRed ? 'rgba(239,68,68,0.08)' : isOrange ? 'rgba(249,115,22,0.08)' : 'rgba(79,70,229,0.08)'
  const borderColor = isRed ? 'rgba(239,68,68,0.25)' : isOrange ? 'rgba(249,115,22,0.25)' : 'rgba(79,70,229,0.2)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 16px',
      background: bgColor,
      borderTop: `1px solid ${borderColor}`,
      fontSize: 12, fontFamily: "'Inter',sans-serif",
    }}>
      {/* Progress bar */}
      <div style={{ flex: 1, height: 4, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.4s ease' }}/>
      </div>
      {/* Text */}
      <span style={{ color: barColor, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {isRed ? 'Daily limit reached' : `${remaining} message${remaining !== 1 ? 's' : ''} remaining today`}
      </span>
      {/* Dismiss */}
      {!isRed && (
        <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
      )}
    </div>
  )
}

// ── SOURCE INFO PANEL — shows under every answer ─────────────────────────────
function SourceInfoPanel({ info, t, dark }) {
  const [expanded, setExpanded] = useState(false)
  if (!info) return null

  const modelLabel = info.routing?.includes('sonnet-direct')
    ? 'Claude Sonnet'
    : info.routing?.includes('sonnet') && info.routing?.includes('gpt4o')
    ? 'GPT-4o + Claude Sonnet'
    : info.routing?.includes('sonnet') ? 'Claude Sonnet'
    : info.routing?.includes('gpt4o') ? 'GPT-4o'
    : info.routing || 'Claude Sonnet'

  // Total web activity actually performed = Tavily general + Tavily community +
  // related links (formerly OpenAI). OpenAI text is no longer injected, so its count
  // moved to relatedLinks; the badge must reflect real search activity, not the
  // now-always-zero openAISources field.
  const webSearchCount = (info.tavilyFiltered || 0) + (info.tavilyNotes || 0) + (info.relatedLinks?.length || 0)

  const pills = [
    info.bookChunks > 0     && { icon:'📚', label:`Book: ${info.bookChunks} chunk${info.bookChunks>1?'s':''}`, color:'#059669' },
    webSearchCount > 0       && { icon:'🌐', label:`Web search: ${webSearchCount}`, color:'#2563EB' },
    !info.needsSearch        && { icon:'⚡', label:'No search', color:'#6B7280' },
  ].filter(Boolean)

  return (
    <div style={{ marginTop:8, fontSize:11, fontFamily:"'Inter',sans-serif" }}>
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', userSelect:'none', flexWrap:'wrap' }}
      >
        <span style={{ color: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)', fontSize:10 }}>
          {expanded ? '▼' : '▶'}
        </span>
        <span style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', fontSize:10, fontWeight:500 }}>
          Sources
        </span>
        {pills.map((p, i) => (
          <span key={i} style={{
            padding:'1px 7px', borderRadius:10,
            background: `${p.color}18`,
            border: `1px solid ${p.color}40`,
            color: p.color, fontWeight:600, fontSize:10,
          }}>
            {p.icon} {p.label}
          </span>
        ))}
        <span style={{ color: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)', fontSize:10, marginLeft:'auto' }}>
          {modelLabel}
          {info.totalMs && ` · ${(info.totalMs/1000).toFixed(1)}s`}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          marginTop:8, padding:'10px 12px',
          background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          borderRadius:10,
        }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px' }}>
            <div><span style={{ color: dark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)' }}>Intent: </span><span style={{ color: dark?'#a5b4fc':'#4F46E5', fontWeight:600 }}>{info.intent}</span></div>
            {info.detectedModule && <div><span style={{ color: dark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)' }}>Module: </span><span style={{ color:'#059669', fontWeight:600 }}>{info.detectedModule}</span></div>}
            <div><span style={{ color: dark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)' }}>Models: </span><span style={{ color: dark?'#e2e8f0':'#1C1C1E' }}>{modelLabel}</span></div>
            {info.totalMs && <div><span style={{ color: dark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)' }}>Time: </span><span style={{ color: dark?'#fbbf24':'#D97706', fontWeight:600 }}>{(info.totalMs/1000).toFixed(1)}s</span></div>}
          </div>
          {info.bookSources?.length > 0 && (
            <div style={{ marginTop:6 }}>
              <span style={{ color: dark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)' }}>Book sources: </span>
              <span style={{ color:'#059669' }}>{info.bookSources.join(' · ')}</span>
            </div>
          )}
          {webSearchCount > 0 && (
            <div style={{ marginTop:4 }}>
              <span style={{ color: dark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)' }}>Web search: </span>
              <span style={{ color:'#2563EB' }}>
                {info.tavilyFiltered || 0} Tavily{(info.tavilyNotes ? ` + ${info.tavilyNotes} community` : '')}{(info.relatedLinks?.length ? ` + ${info.relatedLinks.length} related` : '')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ANSWER PIPELINE DEBUGGER — admin only, collapsible ───────────────────────
function AnswerPipeline({ pipeline, dark }) {
  const [open, setOpen] = useState(false)
  const [openSteps, setOpenSteps] = useState({}) // each step independently toggleable

  const toggleStep = (id) => setOpenSteps(prev => ({ ...prev, [id]: !prev[id] }))
  if (!pipeline) return null

  const mono = { fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }
  const labelStyle = { color: dark?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.35)', fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.8 }
  const contentStyle = { color: dark?'#94a3b8':'#475569', fontSize:11, lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word', marginTop:4 }

  const steps = [
    {
      id: 'books',
      icon: '📚',
      label: `Book RAG (${pipeline.bookChunkDetails?.length || 0} chunks)`,
      color: '#059669',
      empty: !pipeline.bookChunkDetails?.length,
      content: pipeline.bookChunkDetails?.length
        ? pipeline.bookChunkDetails.map((c,i) =>
            `[${i+1}] ${c.book}, p.${c.page}${c.title ? ` — ${c.title}` : ''}\n${c.content}`
          ).join('\n\n---\n\n')
        : 'No book chunks found for this question',
    },
    {
      id: 'openai_search',
      icon: '🌐',
      label: 'Web Search (OpenAI)',
      color: '#2563EB',
      empty: !pipeline.openAISnippet,
      content: pipeline.openAISnippet || 'Web search did not fire or returned no results',
    },
    {
      id: 'claude',
      icon: '🧠',
      label: 'Claude Sonnet Answer',
      color: '#8B5CF6',
      empty: !pipeline.claudeAnswer,
      content: pipeline.claudeAnswer || 'No Claude Sonnet answer',
    },
    {
      id: 'merged',
      icon: '✨',
      label: 'GPT-4o Final Analysis',
      color: '#4F46E5',
      empty: !pipeline.mergedAnswer,
      content: pipeline.mergedAnswer || 'No final answer',
    },
  ]

  return (
    <div style={{ marginTop:8, fontFamily:"'Inter',sans-serif" }}>
      {/* Header toggle */}
      <div
        onClick={() => setOpen(p => !p)}
        style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', userSelect:'none', padding:'4px 0' }}
      >
        <span style={{ color: dark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.2)', fontSize:10 }}>{open ? '▼' : '▶'}</span>
        <span style={{ color: dark?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.25)', fontSize:10, fontWeight:600, letterSpacing:0.5 }}>
          ANSWER PIPELINE
        </span>
        <span style={{ color: dark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)', fontSize:10 }}>
          {steps.length} steps
        </span>
      </div>

      {open && (
        <div style={{
          marginTop:6,
          background: dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)',
          border:`1px solid ${dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`,
          borderRadius:12,
          overflow:'hidden',
        }}>
          {/* Step list */}
          <div style={{ display:'flex', flexDirection:'column' }}>
            {steps.map((step, idx) => (
              <div key={step.id}>
                {/* Step header */}
                <div
                  onClick={() => toggleStep(step.id)}
                  style={{
                    display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                    cursor:'pointer', userSelect:'none',
                    background: openSteps[step.id]
                      ? (dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)')
                      : 'transparent',
                    borderBottom: idx < steps.length-1
                      ? `1px solid ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}`
                      : 'none',
                  }}
                >
                  <span style={{ fontSize:13 }}>{step.icon}</span>
                  <span style={{ ...mono, color: step.empty ? (dark?'#475569':'#94a3b8') : step.color, fontWeight:600 }}>
                    {step.label}
                  </span>
                  <span style={{ marginLeft:'auto', color: dark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.2)', fontSize:10 }}>
                    {openSteps[step.id] ? '▲' : '▼'}
                  </span>
                </div>

                {/* Step content — expanded */}
                {openSteps[step.id] && (
                  <div style={{
                    padding:'10px 14px 12px',
                    background: dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)',
                    borderBottom: idx < steps.length-1
                      ? `1px solid ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}`
                      : 'none',
                  }}>
                    <div style={{ ...contentStyle, ...mono }}>
                      {step.content}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FurtherReading({ links, t, dark }) {
  if (!links || links.length === 0) return null

  // Supplemental = links generated by us (search-page URLs), not real CSE page hits
  const isSupplemental = l =>
    /^(SAP Help:|SAP Community:|SAP Blogs?:|Google:)/i.test(l.title) ||
    l.source === 'Google' ||
    l.url.includes('searchpage/tab/message') ||
    l.url.includes('blogs.sap.com/?s=') ||
    l.url.includes('help.sap.com/docs/search') ||
    l.url.includes('google.com/search')

  const realLinks = links.filter(l => !isSupplemental(l)).slice(0, 6)
  const suppLinks = links.filter(l =>  isSupplemental(l))

  // Deduplicate supplemental by source label
  const seen = new Set()
  const dedupedSupp = suppLinks.filter(l => {
    const k = (SOURCE_META[l.source] || SOURCE_META['Web']).label
    if (seen.has(k)) return false; seen.add(k); return true
  })

  if (realLinks.length === 0 && dedupedSupp.length === 0) return null

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: t.text4, marginBottom: 6 }}>🔎 Further reading:</div>

      {/* Real CSE results — full readable rows */}
      {realLinks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: dedupedSupp.length > 0 ? 8 : 0 }}>
          {realLinks.map((link, i) => {
            const meta = SOURCE_META[link.source] || SOURCE_META['SAP']
            const cleanTitle = link.title.replace(/ [|] SAP Help Portal$| [|] SAP Community$| [|] SAP$/i, '').trim()
            return (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <span style={{ fontSize: 13, flexShrink: 0 }}>{meta.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: meta.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                  {cleanTitle}
                </span>
                <span style={{ fontSize: 10, color: t.text4, flexShrink: 0 }}>↗</span>
              </a>
            )
          })}
        </div>
      )}

      {/* Supplemental search links — always shown as pills below real results */}
      {dedupedSupp.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: realLinks.length > 0 ? 4 : 0 }}>
          {realLinks.length === 0 && <span style={{ fontSize: 11, color: t.text4, width: '100%', marginBottom: 2 }}>Search on:</span>}
          {dedupedSupp.map((link, i) => {
            const meta = SOURCE_META[link.source] || SOURCE_META['Web']
            return (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-block', fontSize: 12, fontWeight: 400, color: t.text2,
                  textDecoration: 'none', padding: '3px 10px', borderRadius: 20,
                  border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)'}`,
                  background: 'transparent', transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.color = meta.color }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)'; e.currentTarget.style.color = t.text2 }}
              >
                {meta.icon} {meta.label}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DELIVERABLE DOWNLOAD BUTTON ───────────────────────────────────────────────
function DownloadDeliverableButton({ label, color, onClick, t }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    setLoading(true)
    try { await onClick() } finally { setLoading(false) }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={handle}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 10,
          border: `1.5px solid ${color}`,
          background: `${color}14`,
          color: color, fontSize: 13, fontWeight: 600,
          fontFamily: "'Inter','DM Sans',sans-serif",
          cursor: loading ? 'wait' : 'pointer',
          transition: 'all 0.15s',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading
          ? <><div style={{ width:14,height:14,border:`2px solid ${color}40`,borderTopColor:color,borderRadius:'50%',animation:'spin 0.8s linear infinite' }}/> Generating…</>
          : label
        }
      </button>
    </div>
  )
}

// "View as visual" — on-demand only. The button restructures the answer
// that's ALREADY on screen via a separate, cheap (Haiku) call — nothing here
// touches or re-runs the main answer. Result is cached on the message
// itself (msg._visualFormat/_visualData) by the parent once generated, so
// re-opening it after a toggle is instant and never re-calls the API.
function OnDemandVisual({ msg, onRequestVisual, t, dark }) {
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const hasVisual = !!(msg._visualFormat && msg._visualData)

  const handleClick = async () => {
    if (hasVisual) { setVisible(v => !v); return }
    setRequesting(true); setError('')
    try {
      await onRequestVisual()
      setVisible(true)
    } catch (e) {
      setError(e.message || 'Could not generate a visual for this answer.')
    } finally {
      setRequesting(false)
    }
  }

  const accent = '#0A6ED1'
  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={handleClick} disabled={requesting} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)'}`,
        borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 400,
        color: dark ? '#C8C4DC' : '#374151', cursor: requesting ? 'default' : 'pointer',
        fontFamily: "'Inter','DM Sans',sans-serif", transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (!requesting) { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)'; e.currentTarget.style.color = dark ? '#C8C4DC' : '#374151' }}
      >
        {requesting ? (
          <>
            <span style={{
              width: 11, height: 11, borderRadius: '50%',
              border: `2px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
              borderTopColor: accent, animation: 'spin 0.8s linear infinite',
            }} />
            Building visual…
          </>
        ) : (
          <>
            <IconChart size={13} color="currentColor" />
            {hasVisual ? (visible ? 'Hide visual' : 'View as visual') : 'View as visual'}
          </>
        )}
      </button>
      {error && <div style={{ marginTop: 6, fontSize: 12, color: '#DC2626' }}>{error}</div>}
      {hasVisual && visible && (
        <AnswerVisual visualFormat={msg._visualFormat} visualData={msg._visualData} />
      )}
    </div>
  )
}

function MessageBubble({ msg, isStreaming, streamingText, streamingQuickAnswer, isPreparing, isFinalizing, t, dark, userInitial, prevUserMsg, onAnalyse, onRequestVisual, session }) {
  const isUser = msg.role === 'user'
  const content = isStreaming ? streamingText : msg.content
  const displayContent = msg._display || (isUser ? content?.replace(/\[ATTACHED_CODE[\s\S]*?\[\/ATTACHED_CODE\]/g, '').trim() : content)
  const codeAttachment = msg._code || null
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(null)
  const [codeExpanded, setCodeExpanded] = useState(false)

  const inlineFormat = (text) => {
    if (!text) return ''
    // Strip bold markers that WRAP a link: **[label](url)** → [label](url), so the link
    // rule below can see it. Without this, the bold rule consumed the ** first and dumped
    // the raw [label](url) as plain text (the un-clickable source lists in the screenshots).
    text = text.replace(/\*\*(\[[^\]]*\]\(https?:\/\/[^\s)]+\))\*\*/g, '$1')
    // Handle markdown links [label](url) FIRST — split them out before the bare-URL rule,
    // otherwise the raw https:// inside a link leaks as visible text.
    return text.split(/(\[[^\]]*\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|https?:\/\/[^\s)<>\]]+)/g).map((part, i) => {
      const mdLink = part.match(/^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/)
      if (mdLink) {
        const label = mdLink[1]
        const isCitation = /^\d+$/.test(label.trim())
        return <a key={i} href={mdLink[2]} target="_blank" rel="noopener noreferrer" style={ isCitation
          ? { color:'#4F46E5',textDecoration:'none',fontSize:'0.72em',verticalAlign:'super',fontWeight:600,padding:'0 1px' }
          : { color:'#4F46E5',textDecoration:'underline',fontWeight:600,wordBreak:'break-word' } }>{isCitation ? `[${label}]` : label}</a>
      }
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ fontWeight:600,color:t.text }}>{part.slice(2,-2)}</strong>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ fontFamily:"'IBM Plex Mono',monospace",background:t.codeBg,padding:'2px 6px',borderRadius:4,fontSize:'0.88em',color:t.codeTxt }}>{part.slice(1,-1)}</code>
      if (part.startsWith('_') && part.endsWith('_')) return <span key={i} style={{ fontSize:11,color:t.text4,fontStyle:'italic' }}>{part.slice(1,-1)}</span>
      if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color:'#4F46E5',textDecoration:'underline',wordBreak:'break-all' }}>{part}</a>
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
      // Skip orphan reference-style link definitions ([1]: https://…) and bare citation
      // numbers left on their own line — these are footnote plumbing, not content. Without
      // this they fell through to the numbered-list rule below and rendered as stray blue
      // numbers (the "81 / 38 / 1" on their own lines).
      if (/^\s*\[\d+\]:\s*https?:\/\//.test(line)) { i++; continue }
      if (/^\s*\d+\s*$/.test(line) && (els.length === 0 || i > 0)) {
        // Lone number on its own line, only when it's not part of a real numbered step
        // (real steps have text after the number, caught by the rule below).
        i++; continue
      }
      if (line.startsWith('# '))      { els.push(<div key={i} style={{ fontWeight:700,fontSize:20,color:t.text,margin:'16px 0 8px',letterSpacing:'-0.01em' }}>{inlineFormat(line.slice(2).replace(/^#+\s*/,''))}</div>); i++; continue }
      if (line.startsWith('## '))     { els.push(<div key={i} style={{ fontWeight:700,fontSize:18,color:t.text,margin:'14px 0 6px',letterSpacing:'-0.01em' }}>{inlineFormat(line.slice(3).replace(/^#+\s*/,''))}</div>); i++; continue }
      if (line.startsWith('### '))    { els.push(<div key={i} style={{ fontWeight:600,fontSize:16,color:t.text,margin:'10px 0 4px' }}>{inlineFormat(line.slice(4).replace(/^#+\s*/,''))}</div>); i++; continue }
      if (/^\d+\.\s/.test(line))     { const m = line.match(/^(\d+)\.\s(.*)$/); els.push(<div key={i} style={{ display:'flex',gap:8,margin:'6px 0 2px',paddingLeft:2 }}><span style={{ color:'#4F46E5',fontWeight:700,fontSize:15,flexShrink:0,minWidth:18 }}>{m[1]}.</span><span style={{ fontWeight:600,color:t.text,fontSize:16,lineHeight:1.7 }}>{inlineFormat(m[2])}</span></div>); i++; continue }
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
        {msg._primaryLabel && <div style={{ fontSize:10, color:'#0A6ED1', opacity:0.75, marginBottom:6, fontFamily:"'Inter',sans-serif" }}>{msg._primaryLabel}</div>}
        <div style={{ fontSize:16,lineHeight:1.8,wordBreak:'break-word' }}>
          {isPreparing ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: dark ? '#94A3B8' : '#666', fontSize: 14 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                border: `2px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                borderTopColor: '#0A6ED1', animation: 'spin 0.8s linear infinite',
              }} />
              Wani is preparing your answer…
            </span>
          ) : (!isStreaming && msg._containerMode) ? (
            <AnswerContainer
              quickAnswer={msg._quickAnswer}
              references={msg._references}
              followUps={msg._followUps}
              detailedExplanation={content}
              renderMarkdown={renderMarkdown}
            />
          ) : (
            <>
              {/* Quick answer streams in FIRST, word by word, well before
                  the full answer is done — it never pops in later, and its
                  cursor hands off to the full answer's cursor the moment
                  the first chunk of that arrives. Same component as the
                  finished-state version below, so nothing shifts when the
                  message flips from streaming to done. */}
              {isStreaming && streamingQuickAnswer && (
                <QuickAnswer text={streamingQuickAnswer} showCursor={!content} />
              )}
              {renderMarkdown(content)}
              {isStreaming && !isFinalizing && <span style={{ display:'inline-block',width:2,height:'1em',background:'#4F46E5',marginLeft:2,animation:'cursorBlink 0.8s infinite',verticalAlign:'middle' }}/>}
              {isStreaming && isFinalizing && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, color: dark ? '#94A3B8' : '#666', fontSize: 13 }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%',
                    border: `2px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                    borderTopColor: '#0A6ED1', animation: 'spin 0.8s linear infinite',
                  }} />
                  Finalizing sources and follow-ups…
                </div>
              )}
            </>
          )}
        </div>
        {!isStreaming && <ActionBar/>}

        {/* On-demand visual — never generated automatically. One button per
            finished answer; clicking it restructures the answer already on
            screen via a separate, cheap call. Skipped for deliverables
            (FS/PPT already have their own download) and stopped/empty replies. */}
        {!isStreaming && !msg._deliverable && !msg._stopped && content?.trim() && onRequestVisual && (
          <OnDemandVisual msg={msg} onRequestVisual={onRequestVisual} t={t} dark={dark} />
        )}

        {!isStreaming && msg._dualText && (
          <div style={{ marginTop:16, borderTop:`1px solid rgba(255,255,255,0.08)`, paddingTop:14 }}>
            <div style={{ fontSize:10, color:'#D97706', opacity:0.7, marginBottom:6, fontFamily:"'Inter',sans-serif" }}>
              {msg._dualLabel}
            </div>
            <div style={{ fontSize:16, lineHeight:1.8, wordBreak:'break-word' }}>
              {renderMarkdown(msg._dualText)}
            </div>
          </div>
        )}
        {!isStreaming && msg._links?.length > 0 && (
          <FurtherReading links={msg._links} t={t} dark={dark} />
        )}
        {!isStreaming && msg._sourceInfo && (
          <SourceInfoPanel info={msg._sourceInfo} t={t} dark={dark} />
        )}
        {!isStreaming && msg._sourceInfo?.pipeline && (
          <AnswerPipeline pipeline={msg._sourceInfo.pipeline} dark={dark} />
        )}
        {!isStreaming && msg._debugDoc && (
          <div style={{ marginTop:6 }}>
            <button
              onClick={() => {
                const blob = new Blob([msg._debugDoc], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = msg._abDebugDocWithoutTavily ? `wani-debug-WITH-tavily-${Date.now()}.txt` : `wani-debug-${Date.now()}.txt`
                a.click()
                URL.revokeObjectURL(url)
              }}
              style={{
                background: 'transparent',
                border: `1px solid ${dark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
                borderRadius: 8,
                padding: '3px 10px',
                fontSize: 11,
                color: dark?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.35)',
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              {msg._abDebugDocWithoutTavily ? '📄 Debug — WITH Tavily' : '📄 Download Debug Doc'}
            </button>
          </div>
        )}
        {!isStreaming && msg._abDebugDocWithoutTavily && (
          <div style={{ marginTop:6 }}>
            <button
              onClick={() => {
                const blob = new Blob([msg._abDebugDocWithoutTavily], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `wani-debug-WITHOUT-tavily-${Date.now()}.txt`
                a.click()
                URL.revokeObjectURL(url)
              }}
              style={{
                background: 'transparent',
                border: `1px solid ${dark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
                borderRadius: 8,
                padding: '3px 10px',
                fontSize: 11,
                color: '#D97706',
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              📄 Debug — WITHOUT Tavily
            </button>
          </div>
        )}
        {/* Fallback download button for FS documents */}
        {!isStreaming && msg._deliverable === 'FS_SPEC' && msg._fsText && (
          <DownloadDeliverableButton
            label="📄 Download Functional Spec (.docx)"
            color="#365F91"
            onClick={async () => {
              try {
                const r = await fetch('/api/generate-fs-doc', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fsText: msg._fsText, fileName: `Wani_FS_${new Date().toISOString().slice(0,10)}` })
                })
                if (!r.ok) return
                const blob = await r.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `Wani_FS_${new Date().toISOString().slice(0,10)}.docx`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
              } catch(e) { console.error('FS download failed', e) }
            }}
            t={t}
          />
        )}
        {/* Fallback download button for PPT */}
        {!isStreaming && msg._deliverable === 'WORKSHOP_PPT' && msg._pptText && (
          <DownloadDeliverableButton
            label="📊 Download Workshop Slides (.pptx)"
            color="#C0392B"
            onClick={async () => {
              try {
                const r = await fetch('/api/generate-ppt', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pptText: msg._pptText, fileName: `Wani_Workshop_${new Date().toISOString().slice(0,10)}` })
                })
                if (!r.ok) return
                const blob = await r.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `Wani_Workshop_${new Date().toISOString().slice(0,10)}.pptx`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
              } catch(e) { console.error('PPT download failed', e) }
            }}
            t={t}
          />
        )}
        {/* Code Analysis buttons — only show when previous user message contained real ABAP code block */}
        {!isStreaming && prevUserMsg && (
          /\[ATTACHED_CODE/i.test(prevUserMsg) ||
          (/(?:METHOD\s+\w+|CLASS\s+\w+|LOOP\s+AT\s+\w+|FIELD-SYMBOL\s*\(|ENDLOOP\.|ENDMETHOD\.|DATA\s*:\s*\w|SELECT\s+\*?\s+FROM\s+\w|FORM\s+\w+\s*\.|FUNCTION\s+\w+\s*\.|REPORT\s+\w+\s*\.|TYPES:\s*BEGIN|CONSTANTS:\s*\w)/i.test(prevUserMsg) &&
           prevUserMsg.trim().split(/\s+/).length > 15)  // must be substantial — not just a sentence mentioning ABAP keywords
        ) && (
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
    (text||'').replace(/\n\n_✦ (GPT-4o mini|GPT-4o|Claude Haiku|Claude Sonnet|Claude  📚 Gemini|Claude).*_$/,'').replace(/\n\n_⚡.*$/,'').trim()

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

function SaveFindingModal({ t, dark, onClose, onSave }) {
  const [module, setModule]   = useState('')
  const [topic, setTopic]     = useState('')
  const [object, setObject]   = useState('')
  const [finding, setFinding] = useState('')
  const [saving, setSaving]   = useState(false)

  const fieldStyle = { width:'100%', boxSizing:'border-box', color:t.text, background:dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 10px', marginBottom:10, lineHeight:1.5, fontFamily:"'Inter',sans-serif", fontSize:13 }

  const handleSave = async () => {
    if (!finding.trim() || saving) return
    setSaving(true)
    await onSave({ module, topic, object, finding })
    setSaving(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'18px 20px', maxWidth:440, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,0.35)' }}>
        <div style={{ fontWeight:700, color:t.text, marginBottom:2, fontSize:15 }}>💡 Save Finding to Knowledge</div>
        <div style={{ color:t.text3, fontSize:12, marginBottom:14 }}>Goes straight into your knowledge base — no chat reply, no model call.</div>

        <input value={module} onChange={e=>setModule(e.target.value)} placeholder="Module (optional, e.g. PM)" style={fieldStyle} />
        <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Topic (optional, e.g. Maintenance Orders)" style={fieldStyle} />
        <input value={object} onChange={e=>setObject(e.target.value)} placeholder="Object (optional, e.g. F3567)" style={fieldStyle} />
        <textarea value={finding} onChange={e=>setFinding(e.target.value)} rows={4} placeholder="What did you learn? e.g. 'Actual Maintenance Cost Analysis app (F3567) cannot show itemized costing — no labor/material cost split.'" style={{ ...fieldStyle, resize:'vertical' }} />

        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button onClick={onClose} style={{ flex:1, padding:'8px', borderRadius:8, border:`1px solid ${t.border}`, background:'transparent', color:t.text3, cursor:'pointer', fontFamily:"'Inter',sans-serif", fontSize:13 }}>Cancel</button>
          <button onClick={handleSave} disabled={!finding.trim() || saving}
            style={{ flex:2, padding:'8px', borderRadius:8, border:'none', background: finding.trim() ? '#4F46E5' : '#9ca3af', color:'white', cursor: finding.trim() ? 'pointer' : 'not-allowed', fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:600 }}>
            {saving ? 'Saving…' : '✓ Save to Knowledge Base'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileModal({ session, profile, onClose, onSave, onSignOut, t }) {
  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'memory'
  const [name, setName] = useState(profile?.name||'')
  const [modules, setModules] = useState(profile?.modules||[])
  const [role, setRole] = useState(profile?.role||'')
  const [selectedTheme, setSelectedTheme] = useState(profile?.theme || 'aurora')
  const [saving, setSaving] = useState(false)
  const [memories, setMemories] = useState([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [newMemory, setNewMemory] = useState('')
  const [addingMemory, setAddingMemory] = useState(false)
  const initials = getInitials(name||profile?.name, session.user.email)
  const SAP_MODULES = ['PP','PM','MM','SD','FI','CO','HR','Fiori','S/4HANA','WM/EWM','QM','PS']
  const toggleModule = (m) => setModules(prev => prev.includes(m) ? prev.filter(x=>x!==m) : [...prev, m])

  // Load memories when tab switches to memory
  const loadMemories = async () => {
    setMemoriesLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'get_memories' })
      })
      const data = await res.json()
      setMemories(data.memories || [])
    } catch { setMemories([]) }
    setMemoriesLoading(false)
  }

  const deleteMemory = async (id) => {
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'delete_memory', memoryId: id })
      })
      setMemories(prev => prev.filter(m => m.id !== id))
    } catch {}
  }

  const addMemory = async () => {
    if (!newMemory.trim()) return
    setAddingMemory(true)
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'save_memory', summary: newMemory.trim() })
      })
      setNewMemory('')
      await loadMemories()
    } catch {}
    setAddingMemory(false)
  }

  useEffect(() => { if (activeTab === 'memory') loadMemories() }, [activeTab])

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:16 }} onClick={onClose}>
      <div style={{ background:'linear-gradient(145deg,#1A1035,#0F0A2A)',border:'1px solid rgba(79,70,229,0.2)',borderRadius:24,padding:32,width:420,maxWidth:'100%',maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',animation:'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ textAlign:'center',marginBottom:20 }}>
          <div style={{ width:64,height:64,borderRadius:'50%',background:'linear-gradient(135deg,#1a1a2e,#4F46E5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,fontWeight:700,color:'#fff',margin:'0 auto 10px',boxShadow:'0 4px 20px rgba(79,70,229,0.25)' }}>{initials}</div>
          <div style={{ fontSize:12,color:'rgba(255,255,255,0.5)' }}>{session.user.email}</div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex',gap:4,marginBottom:20,background:'rgba(255,255,255,0.06)',borderRadius:10,padding:4 }}>
          {['profile','memory'].map(tab => (
            <button key={tab} onClick={()=>setActiveTab(tab)} style={{
              flex:1, padding:'7px 0', borderRadius:8, border:'none', cursor:'pointer',
              background: activeTab===tab ? 'rgba(79,70,229,0.5)' : 'transparent',
              color: activeTab===tab ? '#fff' : 'rgba(255,255,255,0.4)',
              fontSize:13, fontWeight:600, fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
              textTransform:'capitalize',
            }}>{tab === 'memory' ? '🧠 Memory' : '👤 Profile'}</button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div style={{ flex:1, overflowY:'auto' }}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.2,textTransform:'uppercase',marginBottom:8 }}>Your Name</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your name"
                style={{ width:'100%',padding:'10px 14px',boxSizing:'border-box',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(79,70,229,0.25)',borderRadius:10,fontSize:14,fontFamily:"'Inter','DM Sans',sans-serif",color:'#fff',outline:'none' }}
              />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.2,textTransform:'uppercase',marginBottom:8 }}>Your Role</label>
              <input value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. SAP Consultant, Project Manager"
                style={{ width:'100%',padding:'10px 14px',boxSizing:'border-box',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(79,70,229,0.25)',borderRadius:10,fontSize:14,fontFamily:"'Inter','DM Sans',sans-serif",color:'#fff',outline:'none' }}
              />
            </div>
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
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.2,textTransform:'uppercase',marginBottom:8 }}>Background theme</label>
              <div style={{ display:'flex',gap:14,flexWrap:'wrap' }}>
                {BG_THEME_LIST.map(({key,label}) => (
                  <div key={key} onClick={()=>setSelectedTheme(key)} style={{ textAlign:'center',cursor:'pointer' }}>
                    <div style={{
                      width:44,height:44,borderRadius:'50%',
                      background:`radial-gradient(circle at 35% 30%,${BG_THEMES[key].blobA},${BG_THEMES[key].bgGrad.match(/#[0-9a-fA-F]{6}/)?.[0] || '#141412'} 70%)`,
                      border: selectedTheme===key ? '2px solid #4F46E5' : '1px solid rgba(255,255,255,0.15)',
                      boxSizing:'border-box',
                    }}/>
                    <div style={{ fontSize:10,color:selectedTheme===key?'#a5b4fc':'rgba(255,255,255,0.5)',marginTop:4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={async()=>{ setSaving(true); await onSave({name, role, modules, theme:selectedTheme}); setSaving(false); onClose() }}
              style={{ width:'100%',padding:13,background:'linear-gradient(135deg,#1a1a2e,#4F46E5)',border:'none',borderRadius:12,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif",marginBottom:12,boxShadow:'0 4px 16px rgba(79,70,229,0.25)' }}>
              {saving?'Saving...':'Save Profile'}
            </button>
            <button onClick={onSignOut} style={{ width:'100%',padding:12,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,color:'rgba(255,255,255,0.6)',fontSize:14,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif" }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.15)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
            >Sign Out</button>
          </div>
        )}

        {/* Memory Tab */}
        {activeTab === 'memory' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
            {/* Add new memory */}
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input value={newMemory} onChange={e=>setNewMemory(e.target.value)}
                onKeyDown={e=>e.key==='Enter' && addMemory()}
                placeholder="Add a new memory..."
                style={{ flex:1, padding:'9px 12px', background:'rgba(255,255,255,0.08)', border:'1.5px solid rgba(79,70,229,0.25)', borderRadius:10, fontSize:13, color:'#fff', outline:'none', fontFamily:"'Inter',sans-serif" }}
              />
              <button onClick={addMemory} disabled={addingMemory || !newMemory.trim()}
                style={{ padding:'9px 14px', borderRadius:10, border:'none', background:'#4F46E5', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', opacity: addingMemory||!newMemory.trim() ? 0.5 : 1 }}>
                {addingMemory ? '...' : '+ Add'}
              </button>
            </div>

            {/* Memory list */}
            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
              {memoriesLoading ? (
                <div style={{ textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:13, padding:20 }}>Loading...</div>
              ) : memories.length === 0 ? (
                <div style={{ textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:13, padding:20 }}>
                  No memories saved yet. Wani will ask you to save important findings during conversations.
                </div>
              ) : memories.map(mem => (
                <div key={mem.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', background:'rgba(255,255,255,0.05)', borderRadius:10, border:'1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize:14, flexShrink:0 }}>🧠</span>
                  <span style={{ flex:1, fontSize:12, color:'rgba(255,255,255,0.8)', lineHeight:1.5 }}>{mem.content}</span>
                  <button onClick={()=>deleteMemory(mem.id)}
                    style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.2)', fontSize:16, padding:'0 4px', lineHeight:1 }}
                    onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
                    onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.2)'}
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationItem({ conv, isActive, onClick, onDelete, t }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onClick={onClick}
      style={{
        padding:'14px 16px', borderRadius:14, cursor:'pointer', position:'relative',
        background: isActive ? 'rgba(79,70,229,0.10)' : t.surface,
        border: `1.5px solid ${isActive ? '#4F46E5' : hovered ? 'rgba(79,70,229,0.35)' : t.border}`,
        boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.10)' : '0 1px 3px rgba(0,0,0,0.03)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition:'all 0.18s ease',
        display:'flex', flexDirection:'column', minHeight:92,
      }}>
      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:8 }}>
        {conv.module && <ModuleBadge module={conv.module} small/>}
        {conv.is_summarised && <span style={{ fontSize:9,color:t.text4,background:t.surface2,padding:'1px 5px',borderRadius:10 }}>∑ summarised</span>}
      </div>
      <div style={{ fontSize:14,fontWeight:isActive?600:500,color:isActive?'#4F46E5':t.text,lineHeight:1.35,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',paddingRight:hovered?22:0,flex:1 }}>{conv.title}</div>
      <div style={{ fontSize:11.5,color:t.text3,marginTop:10,fontWeight:400,display:'flex',alignItems:'center',gap:5 }}>
        <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{conv.topic}</span>
        <span style={{ color:t.text4,flexShrink:0 }}>·</span>
        <span style={{ flexShrink:0,color:t.text4 }}>{new Date(conv.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
      </div>
      {hovered && (
        <button onClick={e=>{e.stopPropagation();onDelete(conv.id)}} style={{ position:'absolute',right:10,top:10,background:t.surface2,border:'none',borderRadius:8,cursor:'pointer',color:t.text4,fontSize:15,width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1 }}
          onMouseEnter={e=>{e.currentTarget.style.color='#fff';e.currentTarget.style.background='#EF4444'}}
          onMouseLeave={e=>{e.currentTarget.style.color=t.text4;e.currentTarget.style.background=t.surface2}}
        >×</button>
      )}
    </div>
  )
}

function ProjectItem({ proj, isActive, onClick, onDelete, t }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onClick={onClick}
      style={{
        padding:'14px 16px', borderRadius:14, cursor:'pointer', position:'relative',
        background: isActive ? 'rgba(79,70,229,0.12)' : 'linear-gradient(135deg,rgba(79,70,229,0.06),rgba(124,58,237,0.04))',
        border: `1.5px solid ${isActive ? '#4F46E5' : hovered ? 'rgba(79,70,229,0.45)' : 'rgba(79,70,229,0.22)'}`,
        boxShadow: hovered ? '0 6px 20px rgba(79,70,229,0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition:'all 0.18s ease',
        display:'flex', flexDirection:'column', minHeight:92,
      }}
    >
      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:8 }}>
        {proj.module && <ModuleBadge module={proj.module} small/>}
        <span style={{ fontSize:9,fontWeight:700,color:'#4F46E5',background:'rgba(79,70,229,0.15)',padding:'2px 7px',borderRadius:8,letterSpacing:0.5 }}>📁 FS</span>
      </div>
      <div style={{ fontSize:14,fontWeight:600,color:isActive?'#4F46E5':t.text,lineHeight:1.35,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',paddingRight:hovered?22:0,flex:1 }}>
        {proj.project_name || proj.fs_title || proj.title}
      </div>
      <div style={{ fontSize:11.5,color:t.text3,marginTop:10 }}>
        {proj.fs_generated_at ? new Date(proj.fs_generated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : new Date(proj.updated_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
      </div>
      {hovered && (
        <button onClick={e=>{e.stopPropagation();onDelete(proj.id)}} style={{ position:'absolute',right:10,top:10,background:t.surface2,border:'none',borderRadius:8,cursor:'pointer',color:t.text4,fontSize:15,width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1 }}
          onMouseEnter={e=>{e.currentTarget.style.color='#fff';e.currentTarget.style.background='#EF4444'}}
          onMouseLeave={e=>{e.currentTarget.style.color=t.text4;e.currentTarget.style.background=t.surface2}}
        >×</button>
      )}
    </div>
  )
}

const MODULE_STACK = [
  { key:'PP – Production Planning',mod:'PP',sub:'Production Planning',emoji:'⚙️',gradDark:'linear-gradient(140deg,#1E3A8A 0%,#2563EB 55%,#60A5FA 100%)',gradLight:'linear-gradient(140deg,#1E3A8A 0%,#2563EB 55%,#93C5FD 100%)' },
  { key:'PM – Plant Maintenance',mod:'PM',sub:'Plant Maintenance',emoji:'🔧',gradDark:'linear-gradient(140deg,#064E3B 0%,#059669 55%,#6EE7B7 100%)',gradLight:'linear-gradient(140deg,#064E3B 0%,#059669 55%,#6EE7B7 100%)' },
  { key:'MM – Materials Management',mod:'MM',sub:'Materials Management',emoji:'📦',gradDark:'linear-gradient(140deg,#7F1D1D 0%,#DC2626 55%,#FCA5A5 100%)',gradLight:'linear-gradient(140deg,#7F1D1D 0%,#DC2626 55%,#FCA5A5 100%)' },
  { key:'Fiori / UX',mod:'Fiori',sub:'User Experience',emoji:'◻',gradDark:'linear-gradient(140deg,#1E3A5F 0%,#1D4ED8 55%,#93C5FD 100%)',gradLight:'linear-gradient(140deg,#1E3A5F 0%,#1D4ED8 55%,#93C5FD 100%)' },
  { key:'S/4HANA General',mod:'S/4HANA',sub:'General',emoji:'◈',gradDark:'linear-gradient(140deg,#3B0764 0%,#7C3AED 55%,#DDD6FE 100%)',gradLight:'linear-gradient(140deg,#3B0764 0%,#7C3AED 55%,#DDD6FE 100%)' },
]

const N_CARDS=MODULE_STACK.length,CARD_H=170,PEEK=14
function topFor(slot){return slot===0?0:CARD_H+(slot-1)*PEEK}
function scaleFor(slot){return 1-slot*0.022}
function opacityFor(slot){return slot===0?1:slot===1?0.45:0}

function TextRoll({ text, style, repeat = false, pauseMs = 2000 }) {
  // Rolls each character in with a staggered delay. If repeat is true, it re-rolls on a
  // cycle: full roll, then a pause, then roll again. Pure CSS (letterRoll keyframe).
  const [cycle, setCycle] = useState(0)
  const chars = Array.from(text)
  const rollDurationMs = 400 + (chars.length - 1) * 45 // last letter's delay + its duration
  useEffect(() => {
    if (!repeat) return
    const t = setTimeout(() => setCycle(c => c + 1), rollDurationMs + pauseMs)
    return () => clearTimeout(t)
  }, [cycle, repeat, rollDurationMs, pauseMs])
  return (
    <span style={style} aria-label={text}>
      {chars.map((ch, i) => (
        <span
          key={`${cycle}-${i}`}
          aria-hidden="true"
          style={{
            display: 'inline-block',
            whiteSpace: 'pre',
            animation: `letterRoll 0.4s ease both`,
            animationDelay: `${i * 0.045}s`,
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  )
}

function HistoryPage({ conversations, projects, searchQuery, setSearchQuery, filterDropdownOpen, setFilterDropdownOpen, deliverableFilter, setDeliverableFilter, DELIVERABLE_FILTERS, groups, filteredConvs, activeConvId, dbLoading, goHome, goChat, handleDelete, setActiveConvId, setView, setShowSummarise, profile, session, setShowProfile, dark, t, isMobile }) {
  const totalCount = projects.length + filteredConvs.length
  const gridStyle = { display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: isMobile?10:14 }
  const [collapsedGroups, setCollapsedGroups] = useState({}) // { [groupLabel]: true } when collapsed
  return (
    <div style={{ flex:1, height:'100%', overflow:'hidden', display:'flex', flexDirection:'column', background:t.bg }}>
      <div style={{ padding: isMobile?'14px 18px 10px':'28px 40px 18px', borderBottom:`1px solid ${t.border}`, width:'100%', boxSizing:'border-box' }}>
        <div style={{ maxWidth:1280, margin:'0 auto', width:'100%' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, marginBottom:isMobile?10:16 }}>
            <div>
              <div style={{ fontSize:isMobile?17:24, fontWeight:700, color:t.text, fontFamily:"'Inter','DM Sans',sans-serif" }}>History</div>
              <div style={{ fontSize:12, color:t.text3, marginTop:1 }}>{totalCount} conversation{totalCount!==1?'s':''}{projects.length>0?` · ${projects.length} project${projects.length!==1?'s':''}`:''}</div>
            </div>
            {!isMobile&&(<button onClick={()=>goChat(null,null,null)} style={{ padding:'10px 18px',background:dark?'linear-gradient(135deg,#ffffff 0%,#a0a0b0 100%)':'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',border:'none',borderRadius:10,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:'0 2px 10px rgba(79,70,229,0.2)',transition:'all 0.2s',flexShrink:0,whiteSpace:'nowrap' }}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(79,70,229,0.3)';e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 10px rgba(79,70,229,0.2)';e.currentTarget.style.transform='translateY(0)'}}
            ><span style={{ fontSize:16,color:dark?'#0D0D1A':'#ffffff' }}>+</span><span style={{color:dark?'#0D0D1A':'#ffffff'}}>New Conversation</span></button>)}
          </div>

          <div style={{ display:'flex', gap:10, flexDirection:isMobile?'column':'row' }}>
            <div style={{ position:'relative', flex:1, minWidth:0 }}>
              <span style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:t.text4,fontSize:14 }}>🔍</span>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search conversations..."
                style={{ width:'100%',padding:'10px 12px 10px 36px',boxSizing:'border-box',border:`1.5px solid ${t.border}`,borderRadius:10,fontSize:13.5,color:t.text,background:t.inputBg,fontFamily:"'Inter','DM Sans',sans-serif",outline:'none',transition:'border-color 0.2s' }}
                onFocus={e=>e.target.style.borderColor='#4F46E5'}
                onBlur={e=>e.target.style.borderColor=t.border}
              />
            </div>
            <div style={{ position:'relative', flexShrink:0, width:isMobile?'100%':220 }} data-filter-dropdown>
              <div
                onClick={() => setFilterDropdownOpen(prev => !prev)}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.border}`,
                  background:t.inputBg, cursor:'pointer', transition:'border-color 0.2s',
                  fontFamily:"'Inter','DM Sans',sans-serif", height:'100%', boxSizing:'border-box',
                }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#4F46E5'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=filterDropdownOpen?'#4F46E5':t.border}
              >
                <span style={{ fontSize:13, color: deliverableFilter==='ALL' ? t.text3 : '#4F46E5', fontWeight: deliverableFilter==='ALL'?400:600, whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                  {DELIVERABLE_FILTERS.find(f=>f.key===deliverableFilter)?.label || 'All Conversations'}
                </span>
                <span style={{ fontSize:11, color:t.text4, transform: filterDropdownOpen?'rotate(180deg)':'rotate(0deg)', transition:'transform 0.2s', flexShrink:0, marginLeft:6 }}>▾</span>
              </div>

              {filterDropdownOpen && (
                <div style={{
                  position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:100,
                  background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:12,
                  boxShadow:'0 8px 24px rgba(0,0,0,0.15)', overflowY:'auto', overflowX:'hidden',
                  maxHeight:'min(60vh, 420px)', WebkitOverflowScrolling:'touch',
                  fontFamily:"'Inter','DM Sans',sans-serif",
                }}>
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
        </div>
      </div>

      <div style={{ flex:1,overflowY:'auto',padding: isMobile?'16px 18px 20px':'24px 40px 32px', width:'100%', boxSizing:'border-box' }}>
        <div style={{ maxWidth:1280, margin:'0 auto', width:'100%' }}>
          {dbLoading?(
            <div style={{ padding:60,textAlign:'center' }}><div style={{ width:22,height:22,border:`2px solid ${t.border}`,borderTopColor:'#4F46E5',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 10px' }}/><span style={{ fontSize:13,color:t.text4 }}>Loading...</span></div>
          ):(
            <>
              {projects.length > 0 && (
                <div style={{ marginBottom:28 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:'#4F46E5',letterSpacing:0.8,textTransform:'uppercase',padding:'0 0 10px',display:'flex',alignItems:'center',gap:6 }}>
                    <span>📁</span> Projects
                    <span style={{ background:'rgba(79,70,229,0.12)',color:'#4F46E5',borderRadius:10,padding:'0 6px',fontSize:10,fontWeight:700 }}>{projects.length}</span>
                  </div>
                  <div style={gridStyle}>
                    {projects.map(proj => (
                      <ProjectItem key={proj.id} proj={proj} isActive={activeConvId===proj.id} t={t}
                        onClick={()=>{ setActiveConvId(proj.id);setView('chat');setShowSummarise(false) }}
                        onDelete={handleDelete}/>
                    ))}
                  </div>
                </div>
              )}

              {filteredConvs.length===0?(
                <div style={{ padding:'60px 16px',textAlign:'center' }}><div style={{ fontSize:32,marginBottom:10 }}>💬</div><p style={{ fontSize:13,color:t.text4,lineHeight:1.6 }}>No conversations yet</p></div>
              ):(
                Object.entries(groups).map(([group,convs])=>convs.length===0?null:(
                  <div key={group} style={{ marginBottom:16 }}>
                    <div
                      onClick={()=>setCollapsedGroups(prev=>({ ...prev, [group]: !prev[group] }))}
                      style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'6px 0 10px',userSelect:'none' }}
                    >
                      <span style={{ display:'inline-block',width:0,height:0,borderTop:'4px solid transparent',borderBottom:'4px solid transparent',borderLeft:`5px solid ${t.text4}`,transform: collapsedGroups[group]?'rotate(0deg)':'rotate(90deg)',transition:'transform 0.18s ease' }}/>
                      <span style={{ fontSize:11,fontWeight:700,color:t.text4,letterSpacing:0.8,textTransform:'uppercase' }}>{group}</span>
                      <span style={{ fontSize:11,fontWeight:500,color:t.text4,opacity:0.6 }}>{convs.length}</span>
                    </div>
                    {!collapsedGroups[group] && (
                      <div style={{ ...gridStyle, animation:'fadeIn 0.25s ease' }}>
                        {convs.map(conv=>(
                          <ConversationItem key={conv.id} conv={conv} isActive={conv.id===activeConvId} t={t} onClick={()=>{ setActiveConvId(conv.id);setView('chat');setShowSummarise(false) }} onDelete={handleDelete}/>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ padding: isMobile?'10px 18px':'12px 40px',borderTop:`1px solid ${t.border}`, width:'100%', boxSizing:'border-box' }}>
        <div style={{ maxWidth:1280, margin:'0 auto', width:'100%' }}>
          <div onClick={()=>setShowProfile(true)} style={{ display:'inline-flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:10,cursor:'pointer',transition:'background 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(79,70,229,0.07)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1a1a2e,#4F46E5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0,boxShadow:'0 2px 8px rgba(79,70,229,0.2)' }}>{getInitials(profile?.name,session.user.email)}</div>
            <div style={{ overflow:'hidden' }}><div style={{ fontSize:13,fontWeight:500,color:t.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{profile?.name||'My Profile'}</div><div style={{ fontSize:11,color:t.text4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{session.user.email}</div></div>
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
  const { toggle } = useTheme()

  const [view, setView]                   = useState('chat')
  const [introVideoFailed, setIntroVideoFailed] = useState(false) // graceful fallback if /wani-intro.mp4 fails to load — shows the spinner instead of a blank/black screen
  const [browseModule, setBrowseModule]   = useState(null)
  const [browseTopic, setBrowseTopic]     = useState(null)
  const [conversations, setConversations] = useState([])
  const [projects, setProjects]           = useState([])
  const [activeConvId, setActiveConvId]   = useState(null)
  useEffect(()=>{ activeConvIdRef.current = activeConvId },[activeConvId])
  const [input, setInput]                 = useState('')
  const [attachedCode, setAttachedCode]   = useState(null) // { content, lines, language }
  const [expandedCode, setExpandedCode]   = useState(false)
  const [quickLaunchMessages, setQuickLaunchMessages] = useState([])
  const [isLoading, setIsLoading]         = useState(false)
  const [isStreaming, setIsStreaming]      = useState(false)
  const [busyConvIds, setBusyConvIds]     = useState({})
  const abortControllersRef               = useRef({})
  const activeConvIdRef                   = useRef(null)
  const [streamingText, setStreamingText] = useState('')
  const [isPreparingAnswer, setIsPreparingAnswer] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false) // true while Sonnet is still writing the trailing references/follow-ups JSON after the visible answer finished
  const [streamingQuickAnswer, setStreamingQuickAnswer] = useState('') // arrives first — shown above the streaming answer text, never pops in later
  const [streamingIntent, setStreamingIntent] = useState('SAP_QA')
  const [dualStreaming, setDualStreaming] = useState(false)
  const [dualText, setDualText] = useState('')
  const [dualLabel, setDualLabel] = useState('')
  const [primaryLabel, setPrimaryLabel] = useState('')
  const [messageCount, setMessageCount]   = useState(0)
  const [isUnlimited, setIsUnlimited]     = useState(false)
  const DAILY_LIMIT = 50
  const [dbLoading, setDbLoading]         = useState(true)
  const [searchQuery, setSearchQuery]     = useState('')
  const [showProfile, setShowProfile]     = useState(false)
  const [showSaveFinding, setShowSaveFinding] = useState(false)
  const [profile, setProfile]             = useState(null)
  const dark = profile?.theme !== 'light'
  const t = dark ? T.dark : T.light
  const bgTheme = BG_THEMES[profile?.theme] || BG_THEMES.aurora
  const [showSummarise, setShowSummarise] = useState(false)
  const [isSummarising, setIsSummarising] = useState(false)
  const [autoCompacting, setAutoCompacting] = useState(false)
  const [compactProgress, setCompactProgress] = useState(0)
  const hasAutoSummarisedRef = useRef(new Set())
  const [isMobile, setIsMobile]           = useState(isMobileWidth())
  const [showExport, setShowExport]       = useState(false)

  // ── DOC WIZARD STATE ──────────────────────────────────────────────────────
  const [docWizardStage, setDocWizardStage] = useState(null)   // null | 'awaiting_confirm' | 'confirmed' | 'gathering' | 'generate'
  const [docWizardIntent, setDocWizardIntent] = useState(null) // 'FS_SPEC' | 'WORKSHOP_PPT' etc.

  // ── ADMIN DEBUG PANEL ─────────────────────────────────────────────────────
  const [debugData, setDebugData]         = useState(null)
  const [showDebug, setShowDebug]         = useState(false)
  const ADMIN_EMAILS = [import.meta.env.VITE_ADMIN_EMAIL_1, import.meta.env.VITE_ADMIN_EMAIL_2].filter(Boolean)
  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email || '')
  // Private admin experiment; OFF by default to avoid accidental double Sonnet spend.
  const [tavilyABMode, setTavilyABMode] = useState(false)

  // Document upload state
  const [uploadedDoc, setUploadedDoc]         = useState(null) // { name, content, type, docType }
  const [docUploading, setDocUploading]       = useState(false)
  const [docUploadStage, setDocUploadStage]   = useState(null) // 'extracting' | 'indexing' | 'ready' | 'failed' | null
  const [showKnowledge, setShowKnowledge]     = useState(false)
  const [knowledgeEntries, setKnowledgeEntries] = useState([])
  const [showCapabilities, setShowCapabilities] = useState(false)
  const [pendingFinding, setPendingFinding]       = useState(null)
  const [editedFindingText, setEditedFindingText] = useState('')
  const [rejectedFindingKeys, setRejectedFindingKeys] = useState(() => new Set())
  const [pendingCorrection, setPendingCorrection] = useState(null)
  const [pendingMemorySave, setPendingMemorySave] = useState(null) // {summary, triggerMsgIndex}
  const [knowledgeToast, setKnowledgeToast]       = useState(null)
  const docInputRef = useRef(null)
  const chatScrollRef = useRef(null)
  const [scrollProgress, setScrollProgress] = useState(0) // 0..1 reading position in the chat
  const handleChatScroll = () => {
    const el = chatScrollRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setScrollProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0)
  }
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // ── AUTHENTICATED FETCH — always sends JWT, backend derives userId from token ──
  const chatFetch = async (body) => {
    const token = session?.access_token
    // Strip heavy client-only fields from the message history before sending. The model
    // only needs role + content; debug docs, source pipelines, and any large attachments
    // must never be echoed back up — they bloat the request body and caused 413
    // FUNCTION_PAYLOAD_TOO_LARGE on long conversations. This runs for every request.
    let safeBody = body
    if (Array.isArray(body?.messages)) {
      safeBody = {
        ...body,
        messages: body.messages.map(m => ({
          role: m.role,
          content: m.content,
          ...(m._deliverable ? { _deliverable: m._deliverable } : {}),
        })),
      }
    }
    return fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(safeBody)
    })
  }

  const activeConv = conversations.find(c=>c.id===activeConvId)
  const messages   = activeConv?.messages || []
  const isHeroLanding = view==='chat' && messages.length===0 && quickLaunchMessages.length===0
  const [heroBoxHeight, setHeroBoxHeight] = useState(0)
  const [heroBoxWidth, setHeroBoxWidth] = useState(0)
  useEffect(() => {
    if (!isHeroLanding) return
    const el = chatScrollRef.current
    if (!el) return
    // Measuring chatScrollRef itself (not the hero div) is what actually
    // avoids a circular dependency: chatScrollRef's clientHeight is fixed by
    // the outer flex layout regardless of what's inside it (that's what
    // overflowY:auto guarantees) — it does NOT grow to fit its content.
    // An earlier version measured the hero div directly, whose own height
    // depended on an intermediate wrapper with no explicit height, so it
    // just grew to fit the image, which was then measured to make the image
    // bigger, which grew the container further — a runaway feedback loop,
    // which is exactly why the image ballooned out of control on mobile.
    const measure = () => { setHeroBoxHeight(el.clientHeight); setHeroBoxWidth(el.clientWidth) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isHeroLanding])
  // Image gets a fixed share of the measured space, with the rest reserved
  // for greeting/subtitle/history. Capped on both ends: floor so it never
  // collapses before the first measurement, ceiling so it can't dominate an
  // enormous desktop monitor either.
  const heroWillShowHistory = !browseTopic && conversations.length > 0
  const heroWillShowStarters = !!(browseTopic && STARTERS[browseTopic])
  // Fixed pixel budget for everything that ISN'T the image — these don't
  // shrink with screen height (a greeting is a greeting at any screen size),
  // so a flat percentage split was never going to reliably leave them room.
  // Reserve them first, image gets whatever's actually left over.
  const heroReservedForText =
    8 /* container top padding */ +
    36 /* greeting */ + 6 /* gap */ +
    40 /* subtitle */ + 6 /* gap */ +
    (heroWillShowHistory ? (18 /* "Recently Updated" label */ + 8 + Math.min(4, conversations.length) * 47 + 20 /* panel padding */) : 0) +
    (heroWillShowStarters ? 40 : 0) +
    12 /* bottom padding */
  const heroImageHeightBudget = heroBoxHeight
    ? Math.min(440, Math.max(120, heroBoxHeight - heroReservedForText))
    : 200
  const PHOTO_RATIO = 1448 / 1086 // width / height
  // Take whichever constraint actually binds: the vertical budget above, or
  // the available width (minus the hero's own side padding) converted to a
  // height via the photo's real ratio. Deriving BOTH final pixel dimensions
  // here — instead of setting height and letting CSS aspect-ratio derive
  // width, then clamping that width with maxWidth — is what actually
  // guarantees the rendered box stays correctly proportioned. The previous
  // version could end up with an explicit height that no longer matched the
  // clamped width, leaving the photo (via object-fit:contain) letterboxed
  // inside its own container — empty space that wasn't visible in the CSS,
  // only in the render.
  const availableWidth = heroBoxWidth ? Math.max(120, heroBoxWidth - 40) : 300
  const heightFromWidthBudget = availableWidth / PHOTO_RATIO
  const heroImageHeight = Math.round(Math.min(heroImageHeightBudget, heightFromWidthBudget))
  const heroImageWidth = Math.round(heroImageHeight * PHOTO_RATIO)

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
    setDocUploadStage('extracting')
    try {
      const content = await extractDocText(file)
      if (!content.trim()) { alert('Could not extract text from this file'); setDocUploading(false); setDocUploadStage(null); return }

      // Classify document type
      const classRes = await chatFetch({ action: 'classify_doc', content: content.slice(0, 2000) })
      const { docType } = await classRes.json()

      // Indexing (chunk + embed + store) — AWAITED. The doc is only marked ready
      // once storage genuinely completes, so a question asked immediately after
      // upload can never race ahead of indexing and find nothing.
      setDocUploadStage('indexing')
      const storeRes = await chatFetch({ action: 'store_chunks', content, docName: file.name, docType })
      const storeData = await storeRes.json()

      if (!storeRes.ok || (storeData?.stored ?? 0) === 0) {
        alert(`Could not index "${file.name}" for search. You can still ask about it, but answers may be incomplete — try re-uploading if this persists.`)
        setDocUploadStage('failed')
        setUploadedDoc({ name: file.name, content, type: file.type, docType, indexed: false })
      } else {
        setDocUploadStage('ready')
        setUploadedDoc({ name: file.name, content, type: file.type, docType, indexed: true })
      }
    } catch (err) {
      alert('Upload failed: ' + err.message)
      setDocUploadStage('failed')
    }
    setDocUploading(false)
    e.target.value = ''
  }

  const getDocChunks = async (question) => {
    if (!uploadedDoc) return []
    try {
      const res = await chatFetch({ action: 'retrieve_chunks', question, docName: uploadedDoc.name })
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
    await chatFetch({ action: 'save_finding', ...finding, finding: editedFindingText.trim() || finding.finding })
    setPendingFinding(null)
    setKnowledgeToast('💡 Finding saved to knowledge base')
    setTimeout(() => setKnowledgeToast(null), 3000)
  }

  // Direct manual knowledge capture — triggered by an explicit "Save Finding" button,
  // not by parsing a typed statement. Goes straight to the knowledge base: no Sonnet,
  // no GPT-4o, no Gemini call, no chat reply generated.
  const saveManualFinding = async ({ module, topic, object, finding }) => {
    if (!finding?.trim()) return
    await chatFetch({ action: 'save_finding', module: module || '', topic: topic || '', object: object || '', finding: finding.trim(), confidence: 'verified' })
    setShowSaveFinding(false)
    setKnowledgeToast('💡 Saved to knowledge base')
    setTimeout(() => setKnowledgeToast(null), 3000)
  }

  const findingKey = (f) => `${f.module || ''}|${f.topic || ''}|${f.object || ''}|${(f.finding || '').slice(0, 80)}`

  const checkForFindings = async (msgs) => {
    if (msgs.length < 4) return
    try {
      const res = await chatFetch({ action: 'suggest_finding', messages: msgs.slice(-10), module: activeConv?.module || browseModule })
      const data = await res.json()
      if (data.found && !rejectedFindingKeys.has(findingKey(data))) {
        setPendingFinding(data)
        setEditedFindingText(data.finding || '')
      }
    } catch {}
  }

  const rejectFinding = () => {
    if (pendingFinding) setRejectedFindingKeys(prev => new Set(prev).add(findingKey(pendingFinding)))
    setPendingFinding(null)
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
    { key: 'GENERAL_DOC',   label: 'Write-up / Summary Doc', group: 'Deliverables' },
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
    // Seed the initial entry WITH the current conversation if there is one, so returning
    // to this entry (e.g. after tapping an external link and coming back) doesn't land on
    // a convId-less state that would blank the screen.
    window.history.replaceState({ view:'chat', convId: activeConvIdRef.current || null },'')
    const handlePop=(e)=>{
      const state=e.state
      // Guard: if we can't positively resolve a target from history state, do NOT wipe the
      // active conversation — that caused the blank screen on returning from an external
      // link. Only change state when the history entry tells us where to go.
      if(state && state.view==='topic'){ setBrowseModule(state.mod);setBrowseTopic(state.topic);setView('topic') }
      else if(state && state.view==='chat' && state.convId){ setActiveConvId(state.convId);setView('chat') }
      else if(state && state.view==='home'){ setView('chat');setActiveConvId(null);setBrowseModule(null);setBrowseTopic(null);setShowSummarise(false);window.history.pushState({ view:'chat', convId:null },'') }
      else {
        // Unknown/empty state (common when returning focus from an external tab): keep the
        // user where they were. Re-assert a chat entry carrying the CURRENT conversation so
        // forward/back stay consistent, but never clear what's on screen.
        setView('chat')
        try { window.history.replaceState({ view:'chat', convId: activeConvIdRef.current || null },'') } catch(_){}
      }
    }
    window.addEventListener('popstate',handlePop)
    const handleResize=()=>setIsMobile(isMobileWidth())
    window.addEventListener('resize',handleResize)
    return()=>{ window.removeEventListener('popstate',handlePop);window.removeEventListener('resize',handleResize) }
  },[])

  useEffect(()=>{ if(view==='chat') setTimeout(()=>inputRef.current?.focus(),100) },[view,activeConvId])
  // Auto-summarise DISABLED — this was silently replacing the real conversation history
  // (messages array) with a single summary line in the database, permanently discarding
  // the original Q&A content the user could see and rely on (including for Export).
  // If a shorter context is ever needed for the AI's own prompt window, that should be
  // handled server-side at request time without destroying the user-visible history.

  const goHome=()=>{ setView('chat');setActiveConvId(null);setBrowseModule(null);setBrowseTopic(null);setShowSummarise(false);setInput('');setAttachedCode(null);setExpandedCode(false);setQuickLaunchMessages([]);try{window.history.replaceState({ view:'chat' },'',window.location.pathname)}catch(e){} }
  const goTopic=(mod,topic)=>{ setBrowseModule(mod);setBrowseTopic(topic);setView('topic');try{window.history.pushState({ view:'topic',mod,topic },'',window.location.pathname)}catch(e){} }
  const goChat=(convId,mod=null,topic=null)=>{ 
    setFilterDropdownOpen(false)
    setInput('')
    setAttachedCode(null)
    setExpandedCode(false)
    setQuickLaunchMessages([])
    if(convId){ setActiveConvId(convId);setView('chat');setShowSummarise(false) } 
    else { setActiveConvId(null);setBrowseModule(mod);setBrowseTopic(topic);setView('chat');setShowSummarise(false) }
    try { window.history.pushState({ view:'chat',convId,mod,topic },'',window.location.pathname) } catch(e){}
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

  const markBusy = (id, val) => setBusyConvIds(prev => {
    const next = { ...prev }
    if (val) next[id] = true; else delete next[id]
    return next
  })
  const isMine = (id) => activeConvIdRef.current === id

  const handleStop = () => {
    const id = activeConvId
    if (id && abortControllersRef.current[id]) {
      abortControllersRef.current[id].abort()
    }
  }

  const handleSend = async (overrideText) => {
    // Guard: overrideText must be a plain string — never a DOM event or object
    const safeOverride = (typeof overrideText === 'string') ? overrideText : null
    const baseText = (safeOverride || input).trim()
    if (baseText === '' && !attachedCode) return
    if (activeConvId && busyConvIds[activeConvId]) return

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
    setDualText('')
    setDualLabel('')
    setPrimaryLabel('')
    setStreamingQuickAnswer('')
    setIsFinalizing(false)
    let localDualText = ''
    let localDualLabel = ''
    let localPrimaryLabel = ''
    let localSourceInfo = null
    let localDebugDoc = null
    let localABDebugDocWithoutTavily = null
    let localQuickAnswer = null
    let localReferences = []
    let localFollowUps = []

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
      // Guarded: this sits outside the streaming try/catch below, so an unguarded
      // throw here would surface as an unhandled rejection and abort the send
      // silently. Local state is authoritative for the turn; a failed pre-save
      // must not block the user's question from being answered.
      try {
        await updateConversation(convId,{ messages:currentMsgs })
      } catch (e) {
        console.error('Pre-stream conversation save failed (continuing):', e)
      }
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:currentMsgs}:c))
    }

    markBusy(convId, true)
    const abortController = new AbortController()
    abortControllersRef.current[convId] = abortController
    let accumulated = ''
    // Hoisted out of the try block so the catch handler can recover a fully
    // streamed answer when a POST-stream step (e.g. the Supabase save) fails.
    let streamedFinal = ''

    try {
      const docChunks = uploadedDoc ? await getDocChunks(msgText) : []
      const token = session?.access_token
      // Send only role + content for history. Prior messages carry heavy client-only
      // fields (_debugDoc, _sourceInfo.pipeline, deliverable text) that the model doesn't
      // need — echoing them back bloated the request body and caused 413
      // FUNCTION_PAYLOAD_TOO_LARGE on long conversations.
      const leanMsgs = (currentMsgs || []).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ messages:leanMsgs, module:currentMod, topic:currentTopic, userName:profile?.name||null, userRole:profile?.role||null, userModules:profile?.modules||[], documentChunks:docChunks, documentName:uploadedDoc?.name||null, documentType:uploadedDoc?.docType||null, docWizardStage, docIntent:docWizardIntent, tavilyABTest: isAdmin && tavilyABMode }),
        signal: abortController.signal,
      })

      if (!res.ok) throw new Error('Network error')

      if (isMine(convId)) { setIsLoading(false); setIsStreaming(true); setIsPreparingAnswer(false); setIsFinalizing(false) }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = '', fullReply = '', modelUsed = '', deliverableType = 'NONE'
      let searchResults = []
      let furtherReadingLinks = []
      let localContainerMode = false

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
              if (isMine(convId)) setStreamingText(accumulated)
            } else if (evt.type === 'quick_answer') {
              // Increments, same pattern as 'chunk' — the quick answer now
              // streams in live, word by word, not as one lump dropped in
              // once the closing marker is found server-side.
              localQuickAnswer = (localQuickAnswer || '') + (evt.text || '')
              if (isMine(convId)) setStreamingQuickAnswer(localQuickAnswer)
            } else if (evt.type === 'finalizing') {
              // Visible answer text just finished streaming, but Sonnet is
              // still writing the trailing references/follow-ups JSON —
              // without this signal the cursor just sits there looking
              // stalled for a moment.
              if (isMine(convId)) setIsFinalizing(true)
            } else if (evt.type === 'save_to_memory_confirm') {
              // User said "save this" — show popup with summary for confirmation
              // Delete the trigger message from chat (last user message)
              const msgsWithoutTrigger = currentMsgs.slice(0, -1)
              await updateConversation(convId, { messages: msgsWithoutTrigger })
              setConversations(prev => prev.map(c => c.id === convId
                ? { ...c, messages: msgsWithoutTrigger, updated_at: new Date().toISOString() }
                : c
              ))
              markBusy(convId, false)
              delete abortControllersRef.current[convId]
              if (isMine(convId)) {
                setPendingMemorySave({ summary: evt.summary })
                setIsLoading(false)
                setIsStreaming(false)
                setIsPreparingAnswer(false)
                setIsFinalizing(false)
                setStreamingText('')
              }
              return
            } else if (evt.type === 'model_label') {
              localPrimaryLabel = evt.label || ''
              if (isMine(convId)) setPrimaryLabel(localPrimaryLabel)
            } else if (evt.type === 'dual_start') {
              localDualLabel = evt.label || ''
              localDualText = ''
              if (isMine(convId)) { setDualLabel(localDualLabel); setDualStreaming(true); setDualText('') }
            } else if (evt.type === 'dual_chunk') {
              localDualText += evt.text
              if (isMine(convId)) setDualText(prev => prev + evt.text)
            } else if (evt.type === 'dual_done') {
              if (isMine(convId)) setDualStreaming(false)
            } else if (evt.type === 'start') {
              if (isMine(convId)) setStreamingIntent(evt.intent || 'SAP_QA')
            } else if (evt.type === 'search_results') {
              searchResults = evt.results || []
            } else if (evt.type === 'further_reading') {
              furtherReadingLinks = evt.links || []
            } else if (evt.type === 'done') {
                              // Handle doc wizard stage transitions
                              if (evt.docWizardStage) {
                                setDocWizardStage(evt.docWizardStage)
                                if (evt.docIntent) setDocWizardIntent(evt.docIntent)
                              } else if (evt.docWizardStage === null) {
                                setDocWizardStage(null)
                                setDocWizardIntent(null)
                              }
                              // If user confirmed doc wizard → move to gathering stage
                              if (docWizardStage === 'awaiting_confirm') setDocWizardStage('confirmed')
                              if (docWizardStage === 'gathering') setDocWizardStage('generate')
              // For FS/PPT: always use evt.full (the clean card) — never accumulated raw content
              fullReply = evt.full || (
                (evt.fsComplete || evt.pptComplete) ? '' : accumulated
              )
              streamedFinal = fullReply
              modelUsed = evt.model
              deliverableType = evt.deliverableType || 'NONE'
              if (typeof evt.messageCount === 'number') setMessageCount(evt.messageCount)
              if (typeof evt.isUnlimited === 'boolean') setIsUnlimited(evt.isUnlimited)
              if (evt.sourceInfo) localSourceInfo = evt.sourceInfo
              if (evt.debugDoc)    localDebugDoc   = evt.debugDoc
              if (evt.tavilyAB?.withoutTavilyDebugDoc) localABDebugDocWithoutTavily = evt.tavilyAB.withoutTavilyDebugDoc
              if (evt.containerMode) {
                localContainerMode = true
                localQuickAnswer = evt.quickAnswer || null
                localReferences = evt.references || []
                localFollowUps = evt.followUps || []
              }
              if (isMine(convId)) setIsPreparingAnswer(false)
              if (evt.isCorrection) {
                setPendingCorrection({
                  userMsg: currentMsgs[currentMsgs.length - 1]?.content || '',
                  assistantMsg: prevAssistantMsg,
                })
              }

              // FS Complete — auto-trigger Word document download
              if (evt.fsComplete && evt.fsText) {
                // Store fsText on the message for fallback button
                window.__lastFsText = evt.fsText
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
                    const fsTitleMatch = evt.fsText.match(/FS_TITLE:\s*(.+)/i)
                    const fsTitle = fsTitleMatch?.[1]?.trim() || activeConv?.title || 'Functional Specification'
                    markAsProject(convId, fsTitle).then(() => {
                      const projectConv = { ...conversations.find(c=>c.id===convId), is_project: true, project_name: fsTitle, fs_title: fsTitle, fs_generated_at: new Date().toISOString() }
                      setProjects(prev => [projectConv, ...prev.filter(p=>p.id!==convId)])
                      setConversations(prev => prev.map(c => c.id===convId ? {...c, is_project:true, project_name:fsTitle} : c))
                    }).catch(()=>{})
                  }
                } catch (e) { console.error('FS doc generation failed:', e) }
              }

              // PPT Complete — auto-trigger PowerPoint download
              if (evt.pptComplete && evt.pptText) {
                // Store pptText on the message for fallback button
                window.__lastPptText = evt.pptText
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
            } else if (evt.type === 'debug_info') {
                              if (isAdmin) setDebugData(evt.data)
                            } else if (evt.type === 'error') {
              throw new Error(evt.error)
            }
          } catch {}
        }
      }

      const finalReply = fullReply || accumulated

      if (isMine(convId)) { setIsStreaming(false); setIsPreparingAnswer(false); setIsFinalizing(false); setStreamingText(''); setStreamingQuickAnswer(''); setStreamingIntent('SAP_QA') }

      // No separate links section — sources are now cited inline in the answer
      const replyContent = finalReply

      // Attach deliverable text to message for fallback download button
      const assistantMsg = {
        role: 'assistant',
        content: replyContent,
        _model: modelUsed,
        ...(localPrimaryLabel ? { _primaryLabel: localPrimaryLabel } : {}),
        ...(localDualText ? { _dualText: localDualText, _dualLabel: localDualLabel } : {}),
        ...(furtherReadingLinks.length > 0 ? { _links: furtherReadingLinks } : {}),
        ...(deliverableType === 'FS_SPEC' && window.__lastFsText
          ? { _fsText: window.__lastFsText, _deliverable: 'FS_SPEC' } : {}),
        ...(deliverableType === 'WORKSHOP_PPT' && window.__lastPptText
          ? { _pptText: window.__lastPptText, _deliverable: 'WORKSHOP_PPT' } : {}),
        ...(localSourceInfo ? { _sourceInfo: localSourceInfo } : {}),
        ...(localDebugDoc ? { _debugDoc: localDebugDoc } : {}),
        ...(localABDebugDocWithoutTavily ? { _abDebugDocWithoutTavily: localABDebugDocWithoutTavily } : {}),
        ...(localContainerMode ? {
          _containerMode: true,
          _quickAnswer: localQuickAnswer,
          _references: localReferences,
          _followUps: localFollowUps,
        } : {}),
      }

      const finalMsgs = [...currentMsgs, assistantMsg]

      // Debug doc + full pipeline are attached to EVERY answer and persisted, so they
      // survive reload on every message with no exceptions. The original crash came from
      // the row growing without bound, so the ONLY thing guarded here is total size: if
      // the serialized messages would exceed the row budget, the oldest debug-doc blobs
      // (the largest, most redundant part) are shed oldest-first until it fits — pipeline
      // and sourceInfo are always kept. In practice this never triggers until a
      // conversation is very long; short and normal conversations keep everything.
      const ROW_BUDGET = 3_000_000 // ~3MB, well under Postgres/Supabase row limits
      let persistMsgs = finalMsgs
      const size = arr => JSON.stringify(arr).length
      if (size(persistMsgs) > ROW_BUDGET) {
        // Shed oldest _debugDoc blobs first (keep pipeline + sourceInfo intact everywhere)
        persistMsgs = finalMsgs.map(m => ({ ...m }))
        for (let i = 0; i < persistMsgs.length && size(persistMsgs) > ROW_BUDGET; i++) {
          if (persistMsgs[i]._debugDoc) {
            persistMsgs[i] = { ...persistMsgs[i], _debugDoc: '[debug doc trimmed — conversation exceeded row size budget]' }
          }
        }
      }

      const convUpdate = { messages: persistMsgs }
      if (deliverableType !== 'NONE') convUpdate.deliverable_type = deliverableType

      // Update the VISIBLE conversation state — and therefore `messages`,
      // which the next send() reads to build its own history — IMMEDIATELY,
      // before awaiting the DB save. This ordering matters specifically for
      // backgrounded mobile tabs: browsers can suspend/throttle a
      // backgrounded tab's fetch calls for a long time (sometimes
      // indefinitely until the user returns). If the save were awaited
      // FIRST, the streaming bubble would already be gone (isStreaming was
      // already set false right after the SSE stream finished) with nothing
      // visibly replacing it until the save call finally resolves — reading
      // as "the answer vanished, only the question is left". Worse, if the
      // user asked a follow-up during that gap, `messages` locally would
      // still be missing this assistant reply, so the next send would carry
      // two consecutive user turns with no assistant reply between them —
      // which is exactly what api/chat.js's validMessages would forward to
      // Sonnet as-is (see the mergeConsecutiveRoles guard added there as a
      // second line of defense). Local state always keeps full-fidelity
      // messages (incl. debug doc) regardless of what gets trimmed for the
      // save below.
      setConversations(prev=>prev.map(c=>c.id===convId?{...c,...convUpdate,messages:finalMsgs,updated_at:new Date().toISOString()}:c))
      markBusy(convId, false)
      delete abortControllersRef.current[convId]
      // Clear live dual bubble now that saved message has _dualText — prevents duplicate
      if (isMine(convId)) { setDualText(''); setDualLabel('') }

      try {
        await updateConversation(convId, convUpdate)
      } catch (e) {
        // Last-resort fallback: if the save still fails (size or otherwise), retry once
        // with debug docs stripped so the ANSWER is never lost — pipeline/sourceInfo kept.
        console.error('Conversation save failed, retrying without debug docs:', e)
        const lean = finalMsgs.map(m => { const { _debugDoc, ...rest } = m; return rest })
        try { await updateConversation(convId, { ...convUpdate, messages: lean }) } catch (e2) { console.error('Lean retry also failed:', e2) }
      }

      if (currentMsgs.length===1) {
        fetch('/api/categorise',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ message:msgText, answer:(finalReply||'').slice(0,800) }) })
          .then(r=>r.json()).then(({ module,topic,title })=>{ if(module){ updateConversation(convId,{ module,topic,title });setConversations(prev=>prev.map(c=>c.id===convId?{...c,module,topic,title}:c)) } }).catch(()=>{})
      }

      fetch('/api/extract',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ userId:session.user.id,convId,module:currentMod||null,topic:currentTopic||null,userMsg:msgText,assistantMsg:finalReply }) }).catch(()=>{})

      // Check for consultant findings worth saving (fire and forget)
      checkForFindings(finalMsgs).catch(() => {})

    } catch(err) {
      markBusy(convId, false)
      delete abortControllersRef.current[convId]

      if (err.name === 'AbortError') {
        // User clicked Stop — save whatever was streamed so far as the message, marked as stopped
        if (isMine(convId)) { setIsLoading(false);setIsStreaming(false);setIsPreparingAnswer(false);setIsFinalizing(false);setStreamingText('');setStreamingQuickAnswer('');setStreamingIntent('SAP_QA');setDualStreaming(false) }
        const partialText = (accumulated || '').trim()
        const stoppedMsgs = partialText
          ? [...currentMsgs,{ role:'assistant',content:partialText,_stopped:true }]
          : currentMsgs
        if (partialText) await updateConversation(convId,{ messages:stoppedMsgs }).catch(()=>{})
        setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:stoppedMsgs}:c))
        return
      }

      if (isMine(convId)) { setIsLoading(false);setIsStreaming(false);setIsPreparingAnswer(false);setIsFinalizing(false);setStreamingText('');setStreamingQuickAnswer('');setStreamingIntent('SAP_QA');setDualStreaming(false);setPrimaryLabel('') }
      // Note: dualText and dualLabel intentionally NOT cleared here
      // They persist until next dual_start event so Claude answer stays visible

      // A complete answer may already have streamed — most failures here come from
      // the SAVE that follows streaming, not from the model. Never discard text the
      // user has already seen; keep it and flag that persistence failed.
      const recovered = (streamedFinal || accumulated || '').trim()
      if (recovered) {
        const recoveredMsgs = [...currentMsgs, { role:'assistant', content: recovered, _saveFailed: true }]
        setConversations(prev=>prev.map(c=>c.id===convId?{...c,messages:recoveredMsgs}:c))
        // Retry the save with the lean payload; if it still fails the answer at
        // least stays on screen rather than being replaced by an error.
        updateConversation(convId, { messages: recoveredMsgs }).catch(()=>{})
        return
      }

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
      /^SELECT\s+(\*|\w+\s+FROM)/im, /^LOOP\s+AT\s+/im, /^IF\s+(sy-|l_|lv_|lt_|ls_|\w+\s*(=|<>|IS))/im, /^ENDLOOP\./im,
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
    // Only treat as generic code if it has code-like structure — short lines, symbols, indentation
    // Avoid treating pasted SAP replies, emails, or documents as code
    const avgLineLen = text.length / lines.length
    const hasCodeStructure = avgLineLen < 60 && lines.filter(l => /^\s{2,}|[{};()=>]/.test(l)).length > lines.length * 0.3
    if (lines.length >= 20 && hasCodeStructure) return { content: text, lines: lines.length, language: 'Code' }
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

      if (summary && summary.length > 20) {
        // Store summary silently as a system role message — never shown in UI
        // The backend reads is_summarised + the summary content for context injection
        const summaryMsg = { role:'system', content:summary }
        const newMsgs = [summaryMsg]
        await updateConversation(activeConvId, { messages:newMsgs, is_summarised:true })
        setConversations(prev=>prev.map(c=>c.id===activeConvId?{...c,messages:newMsgs,is_summarised:true}:c))
      }

      setCompactProgress(100)
      setTimeout(()=>{ setAutoCompacting(false); setCompactProgress(0); if(chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight }, 600)
    } catch {
      clearInterval(progressInterval)
      setAutoCompacting(false)
      setCompactProgress(0)
    }
  }

  // On-demand visual — called only when the reader clicks "View as visual"
  // on an already-finished answer. Restructures that answer's own text via
  // a separate, cheap (Haiku) call; never touches or re-runs the main
  // answer. Result is cached onto the message (both in local state and
  // persisted) so re-viewing it later never re-calls the API.
  const handleGenerateVisual = async (convId, msgIndex, questionText, answerText) => {
    const token = session?.access_token
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: 'generate_visual', question: questionText, answerText }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Could not generate a visual for this answer.')

    let updatedMsgs = null
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c
      const msgs = [...(c.messages || [])]
      if (msgs[msgIndex]) msgs[msgIndex] = { ...msgs[msgIndex], _visualFormat: data.format, _visualData: data.data }
      updatedMsgs = msgs
      return { ...c, messages: msgs }
    }))
    if (updatedMsgs) updateConversation(convId, { messages: updatedMsgs }).catch(() => {})
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
    setProjects(prev=>prev.filter(p=>p.id!==id))
    if (activeConvId===id) goHome()
  }

  const groups = groupConversations(filteredConvs)

  return (
    <div style={{ display:'flex',width:'100%',height:'100dvh',background:t.bg,fontFamily:"'Inter','DM Sans',sans-serif",overflow:'hidden',overflowX:'hidden' }}>
      <style>{`
        @keyframes typingBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes msgSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes letterRoll{from{opacity:0;transform:translateY(0.5em) rotate(8deg)}to{opacity:1;transform:translateY(0) rotate(0deg)}}
        @keyframes fabIn{from{opacity:0;transform:scale(0.6) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes fabIn{from{opacity:0;transform:scale(0.6)}to{opacity:1;transform:scale(1)}}
        @keyframes blob1{0%,100%{transform:translate(-15%,-15%) scale(1)}50%{transform:translate(20%,15%) scale(1.35)}}
        @keyframes blob2{0%,100%{transform:translate(15%,20%) scale(1.1)}50%{transform:translate(-20%,-10%) scale(1.4)}}
        @keyframes blob3{0%,100%{transform:translate(-5%,10%) scale(1)}50%{transform:translate(10%,-15%) scale(1.2)}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(79,70,229,0.25);border-radius:4px}
        @media(max-width:768px){
          .main-topbar{padding:0 18px!important;height:68px!important;min-height:68px!important;}
          .chat-input-wrap{padding:10px 14px 16px!important;margin-bottom:0!important;}
          .chat-messages{padding:16px 14px!important;}
          .home-input-dock{left:18px!important;right:18px!important;bottom:calc(env(safe-area-inset-bottom) + 8px)!important;}
        }
      `}</style>

      
      {/* Main */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0,position:'relative' }}>
        <div style={{ position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:0,background: isHeroLanding ? '#000000' : bgTheme.bgGrad }}>
          {!isHeroLanding && (<>
          <div style={{ position:'absolute',width:600,height:600,borderRadius:'50%',background:`radial-gradient(circle,${bgTheme.blobA} 0%,transparent 65%)`,top:'-15%',right:'0%',animation:'blob1 9s ease-in-out infinite alternate' }}/>
          <div style={{ position:'absolute',width:500,height:500,borderRadius:'50%',background:`radial-gradient(circle,${bgTheme.blobB} 0%,transparent 65%)`,bottom:'-10%',left:'5%',animation:'blob2 10s ease-in-out infinite alternate' }}/>
          <div style={{ position:'absolute',width:380,height:380,borderRadius:'50%',background:`radial-gradient(circle,${bgTheme.blobC} 0%,transparent 65%)`,top:'35%',right:'25%',animation:'blob3 11s ease-in-out infinite alternate' }}/>
          </>)}
        </div>

        {/* Topbar */}
        <div className="main-topbar" style={{ borderBottom:`1px solid ${isHeroLanding ? '#000000' : t.border}`,display:'flex',alignItems:'center',gap:isMobile?12:8,background: isHeroLanding ? '#000000' : t.topbar,backdropFilter:'blur(10px)',flexShrink:0,position:'relative',zIndex:2,paddingLeft:isMobile?'18px':'12px',paddingRight:isMobile?'18px':'12px',paddingBottom:isMobile?'0':'9px',paddingTop:isMobile?'max(14px, calc(env(safe-area-inset-top) + 10px))':'9px',height:isMobile?'auto':48,minHeight:isMobile?68:48 }}>
          <div style={{ display:'flex',alignItems:'center',background:t.surface2,borderRadius:10,padding:2,gap:2,flexShrink:0 }}>
            <button onClick={goHome} title="Chat"
              style={{ display:'flex',alignItems:'center',gap:6,border:'none',borderRadius:8,cursor:'pointer',padding:isMobile?'8px 12px':'6px 10px',fontSize:isMobile?13:12,fontWeight:600,fontFamily:"'Inter','DM Sans',sans-serif",transition:'all 0.15s',
                background: view==='chat' ? (dark?'#2A2440':'#fff') : 'transparent',
                color: view==='chat' ? t.text : t.text3,
                boxShadow: view==='chat' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
              }}><IconChat size={15}/>{!isMobile&&' Chat'}</button>
            <button onClick={()=>setView('history')} title="History"
              style={{ display:'flex',alignItems:'center',gap:6,border:'none',borderRadius:8,cursor:'pointer',padding:isMobile?'8px 12px':'6px 10px',fontSize:isMobile?13:12,fontWeight:600,fontFamily:"'Inter','DM Sans',sans-serif",transition:'all 0.15s',
                background: view==='history' ? (dark?'#2A2440':'#fff') : 'transparent',
                color: view==='history' ? t.text : t.text3,
                boxShadow: view==='history' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
              }}><IconHistory size={15}/>{!isMobile&&' History'}</button>
          </div>
          {!(isMobile&&view==='chat')&&(<div style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',flexShrink:0 }} onClick={goHome}><WaniLogo size={isMobile?26:22} dark={dark}/>{!isMobile&&<WaniWordmark height={13} dark={dark}/>}</div>)}

          {/* Persistent quick-access icons — always visible, not just inside an active chat */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <button onClick={()=>goChat(null,null,null)} title="New Conversation" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:32,height:32,padding:0,cursor:'pointer',color:t.text3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}><IconPlus size={15}/></button>
            <button onClick={()=>{ setShowKnowledge(true); loadKnowledge() }} title="Knowledge Base" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:32,height:32,padding:0,cursor:'pointer',color:t.text3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s',position:'relative' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}>
              <IconBook size={15}/>
              {knowledgeEntries.length > 0 && <span style={{ position:'absolute',top:-4,right:-4,background:'#6366f1',color:'white',borderRadius:'50%',width:14,height:14,fontSize:9,display:'flex',alignItems:'center',justifyContent:'center' }}>{knowledgeEntries.length}</span>}
            </button>
          </div>

          {view==='chat'&&activeConv&&(<div style={{ display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0 }}><ModuleBadge module={activeConv.module} small={isMobile}/>{!isMobile&&<div style={{ fontSize:13,fontWeight:500,color:t.text2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0 }}>{activeConv.title}</div>}{isMobile&&<div style={{ fontSize:14,fontWeight:500,color:t.text2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0,flex:1 }}>{activeConv.topic||activeConv.module?.split('–')[0].trim()}</div>}</div>)}
          {view==='topic'&&(<div style={{ display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0 }}><span style={{ color:t.text4,fontSize:16 }}>›</span><div style={{ fontSize:isMobile?15:13,fontWeight:500,color:t.text2 }}>{browseTopic||browseModule?.split('–')[0].trim()}</div></div>)}
          {!(view==='chat'||view==='topic')&&<div style={{ flex:1 }}/>}
          {view==='chat'&&messages.some(m=>m.role==='user')&&(
            <>
              <button onClick={()=>setShowCapabilities(c=>!c)} title="What can Wani do?" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:isMobile?48:undefined,height:isMobile?48:undefined,padding:isMobile?0:'5px 10px',cursor:'pointer',fontSize:isMobile?20:12,color:showCapabilities?'#4F46E5':t.text3,fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:4,transition:'all 0.15s',flexShrink:0,borderColor:showCapabilities?'#4F46E5':t.border }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{if(!showCapabilities){e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}}>{isMobile?'✨':'✨ What can I do?'}</button>
              <button onClick={()=>{ setShowKnowledge(true); loadKnowledge() }} title="Knowledge Base" style={{ background:'none',border:`1.5px solid ${t.border}`,borderRadius:10,width:isMobile?48:undefined,height:isMobile?48:undefined,padding:isMobile?0:'5px 10px',cursor:'pointer',fontSize:isMobile?20:12,color:t.text3,fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:4,transition:'all 0.15s',flexShrink:0 }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color='#4F46E5'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}>
                <IconBook size={13}/> {!isMobile && 'Knowledge'}
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
        </div>

        {/* Home / History — now positioned right below the header. Profile moved to
            a dedicated avatar + logout cluster on the right of this same row. */}
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:isMobile?'8px 14px':'8px 12px', borderBottom:`1px solid ${t.border}`, background:t.topbar, flexShrink:0 }}>
          {[
            { key:'home',    label:'New Chat', Icon:IconHome,    onClick:goHome,               active: !showProfile && view==='chat' && !activeConvId && !browseModule && !browseTopic },
            { key:'history', label:'History', Icon:IconHistory, onClick:()=>setView('history'), active: view==='history' },
          ].map(tab=>(
            <button key={tab.key} onClick={tab.onClick}
              style={{
                display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:10, border:'none',
                cursor:'pointer', fontFamily:"'Inter','DM Sans',sans-serif", fontSize:13, fontWeight:600,
                background: tab.active ? '#4F46E5' : 'transparent',
                color: tab.active ? '#fff' : t.text3,
                transition:'all 0.15s',
              }}
              onMouseEnter={e=>{ if(!tab.active) e.currentTarget.style.background = t.hoverBg||'rgba(79,70,229,0.06)' }}
              onMouseLeave={e=>{ if(!tab.active) e.currentTarget.style.background = 'transparent' }}
            >
              <tab.Icon size={15}/>
              {tab.label}
            </button>
          ))}

          <div style={{ flex:1 }} />

          {/* Profile avatar (initials) + Logout — top right */}
          <button onClick={()=>setShowProfile(true)} title="Profile" style={{
            width:32, height:32, borderRadius:'50%', border:'none', cursor:'pointer',
            background:'linear-gradient(135deg,#4F46E5,#7C3AED)', color:'#fff',
            fontSize:13, fontWeight:700, fontFamily:"'Inter','DM Sans',sans-serif",
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>
            {(profile?.name || session?.user?.email || '?').charAt(0).toUpperCase()}
          </button>
          <button onClick={signOut} title="Sign out" style={{ width:32,height:32,borderRadius:10,border:`1.5px solid ${t.border}`,background:'none',color:t.text3,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#EF4444';e.currentTarget.style.color='#EF4444'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3}}
          >
            <IconLogOut size={15}/>
          </button>
        </div>

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

        {view==='topic'&&<TopicView module={browseModule} topic={browseTopic} conversations={conversations} t={t} onSelectConv={(convId,mod,topic)=>{ if(convId)goChat(convId); else goTopic(mod,topic) }} onNewChat={(mod,topic)=>goChat(null,mod,topic)} onBack={goHome}/>}
        {view==='history'&&<HistoryPage conversations={conversations} projects={projects} searchQuery={searchQuery} setSearchQuery={setSearchQuery} filterDropdownOpen={filterDropdownOpen} setFilterDropdownOpen={setFilterDropdownOpen} deliverableFilter={deliverableFilter} setDeliverableFilter={setDeliverableFilter} DELIVERABLE_FILTERS={DELIVERABLE_FILTERS} groups={groups} filteredConvs={filteredConvs} activeConvId={activeConvId} dbLoading={dbLoading} goHome={goHome} goChat={goChat} handleDelete={handleDelete} setActiveConvId={setActiveConvId} setView={setView} setShowSummarise={setShowSummarise} profile={profile} session={session} setShowProfile={setShowProfile} dark={dark} t={t} isMobile={isMobile}/>}

        {view==='chat'&&(
          <>
            <div ref={chatScrollRef} onScroll={handleChatScroll} className="chat-messages" style={{ flex:1,overflowY:'auto',padding:'20px 16px',position:'relative',zIndex:1 }}>
              <div style={{ maxWidth:720,margin:'0 auto' }}>
                {messages.length===0 && dbLoading ? (
                  // True initial load only — dbLoading flips false exactly once, right after
                  // conversations/profile/projects all resolve together, so by the time this
                  // clears, the home screen below renders fully-formed in one paint (hero +
                  // greeting + Recently Updated all at once) instead of the Recently Updated
                  // block popping in on its own a moment later.
                  // The video is NOT gated on its own timer — this block simply disappears the
                  // instant dbLoading flips false, however far into the 10s clip that happens to
                  // be. Deliberately no `loop` — if data ever takes longer than the clip, it
                  // holds on the last frame instead of jumping back to frame one, which read as
                  // a jarring reset.
                  // Two stacked <video> elements playing the SAME small (~2MB, browser-cached
                  // after the first fetch) clip: a blurred, scaled-up backdrop filling the whole
                  // area, with the sharp clip centered on top of it. Without the backdrop layer,
                  // a 16:9 clip inside object-fit:contain leaves hard flat-black bars around it —
                  // on a wide desktop viewport that read as "a small video player floating in a
                  // big empty box" rather than one immersive scene. The blur fills that space
                  // with the clip's own color/light instead of flat black.
                  // If /wani-intro.mp4 ever 404s or fails to decode, onError flips
                  // introVideoFailed so this falls back to the spinner instead of silently
                  // showing nothing — a black video area on a black background looks
                  // identical to "completely blank", which is much harder to debug than a
                  // visible fallback.
                  introVideoFailed ? (
                    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',minHeight:'60vh',animation:'fadeIn 0.25s ease',background:'#000000' }}>
                      <div style={{ position:'relative',width:60,height:60,display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <span style={{ position:'absolute',inset:0,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,0.1)',borderTopColor:'#4F46E5',animation:'spin 0.9s linear infinite' }}/>
                        <WaniLogo size={30} dark/>
                      </div>
                    </div>
                  ) : (
                  <div style={{ position:'relative',width:'100%',height:'70vh',minHeight:420,maxHeight:640,overflow:'hidden',borderRadius:16,background:'#000000',animation:'fadeIn 0.25s ease' }}>
                    <video autoPlay muted playsInline onError={()=>setIntroVideoFailed(true)}
                      style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:'blur(50px) saturate(1.3) brightness(0.55)',transform:'scale(1.25)' }}
                    >
                      <source src="/wani-intro.mp4" type="video/mp4"/>
                    </video>
                    <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
                      <video autoPlay muted playsInline onError={()=>setIntroVideoFailed(true)}
                        style={{ maxWidth:'94%',maxHeight:'94%',objectFit:'contain',borderRadius:10,boxShadow:'0 20px 70px rgba(0,0,0,0.55)' }}
                      >
                        <source src="/wani-intro.mp4" type="video/mp4"/>
                      </video>
                    </div>
                  </div>
                  )
                ) : messages.length===0?(
                  quickLaunchMessages.length > 0 ? (
                    <div style={{ animation:'fadeIn 0.4s ease', padding:'20px 0' }}>
                      {quickLaunchMessages.map((msg, i) => (
                        <MessageBubble key={i} msg={msg} isStreaming={false} streamingText="" t={t} dark={dark} userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}/>
                      ))}
                    </div>
                  ) : (
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',height:'100%',minHeight:'60vh',textAlign:'center',animation:'fadeIn 0.4s ease',padding:'8px 20px 12px',background:'#000000',gap:6 }}>
                    <WaniHeroCard widthPx={heroImageWidth} heightPx={heroImageHeight}/>
                    {profile?.name&&(<div style={{ fontFamily:"'Inter',sans-serif",fontSize:window.innerWidth<768?18:22,fontWeight:600,color:'#F5F5F7' }}>Hello, <TextRoll text={profile.name.split(' ')[0]} repeat pauseMs={5000} style={{ display:'inline-block' }}/></div>)}
                    <p style={{ fontSize:15,color:'#94A3B8',maxWidth:340,lineHeight:1.5,margin:0 }}>{browseTopic?`Ask anything about ${browseTopic}`:'What SAP question can I help with?'}</p>
                    {browseTopic&&STARTERS[browseTopic]&&(
                      <div style={{ display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',maxWidth:420 }}>
                        {STARTERS[browseTopic].map((s,i)=>(<div key={i} onClick={()=>setInput(s)} style={{ padding:'7px 14px',background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:20,fontSize:12,color:t.text3,cursor:'pointer',transition:'all 0.15s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.color=t.text;e.currentTarget.style.background=t.surface2}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text3;e.currentTarget.style.background=t.surface}}>{s}</div>))}
                      </div>
                    )}
                    {!browseTopic && !input.trim() && conversations.length>0 && (
                      <div style={{ width:'100%',maxWidth:440,marginTop:8,textAlign:'left',animation:'fadeIn 0.4s ease',background:'linear-gradient(180deg, transparent 0%, rgba(30,20,50,0.55) 25%, rgba(30,20,50,0.55) 100%)',borderRadius:18,padding:'16px 14px' }}>
                        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
                          <span style={{ fontSize:11,fontWeight:700,color:t.text4,letterSpacing:1,textTransform:'uppercase' }}>Recently Updated</span>
                          <span onClick={()=>setView('history')} style={{ fontSize:12,color:'#4F46E5',cursor:'pointer',fontWeight:600 }}>View all</span>
                        </div>
                        <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,overflow:'hidden' }}>
                          {[...conversations].sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,4).map((conv,i)=>{
                            const mins = Math.floor((Date.now()-new Date(conv.updated_at))/60000)
                            const rel = mins<1?'Just now':mins<60?`${mins} min ago`:mins<1440?`${Math.floor(mins/60)} hr ago`:mins<2880?'Yesterday':`${Math.floor(mins/1440)} days ago`
                            return (
                              <div key={conv.id} onClick={()=>goChat(conv.id)} style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 14px',cursor:'pointer',borderTop:i>0?`1px solid ${t.border}`:'none',transition:'background 0.15s' }}
                                onMouseEnter={e=>e.currentTarget.style.background=t.surface2}
                                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                              >
                                <span style={{ width:22,height:22,borderRadius:'50%',background:'rgba(16,185,129,0.15)',color:'#10B981',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0 }}>✓</span>
                                <span style={{ flex:1,fontSize:13,color:t.text2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>"{conv.title}"</span>
                                <span style={{ fontSize:11.5,color:t.text4,flexShrink:0 }}>{rel}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                ):(
                  <>
                    {messages.filter(m=>m.role!=='system').map((msg,i)=>{
                      const prevUser = msg.role === 'assistant'
                        ? messages.slice(0,i).filter(m=>m.role==='user').slice(-1)[0]?.content || ''
                        : ''
                      return <MessageBubble key={i} msg={msg} isStreaming={false} streamingText="" t={t} dark={dark}
                        userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}
                        prevUserMsg={prevUser}
                        session={session}
                        onAnalyse={(prompt) => {
                          // Extract original code — strip any previously prepended prompt
                          // Original code starts from the ABAP keywords
                          const codeMatch = prevUser.match(/((?:METHOD|CLASS|REPORT|FORM|FUNCTION|DATA:|SELECT|LOOP AT)[\s\S]+)/i)
                          const cleanCode = codeMatch ? codeMatch[0] : prevUser
                          handleSendText(`${prompt}\n\nCode:\n${cleanCode}`)
                        }}
                        onRequestVisual={msg.role === 'assistant' ? () => handleGenerateVisual(activeConvId, i, prevUser, msg.content) : null}
                      />
                    })}
                    {isLoading&&!isStreaming&&(
                      <div style={{ display:'flex',gap:10,alignItems:'flex-start',marginBottom:20 }}>
                        <div style={{ width:32,height:32,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' }}><WaniLogo size={28} dark={dark}/></div>
                        <div style={{ background:t.msgAI,border:`1px solid ${t.msgAIBdr}`,borderRadius:'4px 16px 16px 16px' }}><TypingDots/></div>
                      </div>
                    )}
                    {isStreaming && (streamingIntent === 'FS_SPEC' || streamingIntent === 'WORKSHOP_PPT') ? (
                      <div style={{ display:'flex',gap:10,alignItems:'flex-start',marginBottom:20 }}>
                        <div style={{ width:32,height:32,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' }}><WaniLogo size={28} dark={dark}/></div>
                        <div style={{ background:t.msgAI,border:`1px solid ${t.msgAIBdr}`,borderRadius:'4px 16px 16px 16px',padding:'14px 18px',maxWidth:420 }}>
                          <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:8 }}>
                            <div style={{ width:14,height:14,border:'2px solid rgba(79,70,229,0.3)',borderTopColor:'#4F46E5',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0 }}/>
                            <span style={{ fontSize:14,fontWeight:600,color:t.text }}>
                              {streamingIntent === 'FS_SPEC' ? '📄 Building Functional Specification…' : '📊 Building Workshop Presentation…'}
                            </span>
                          </div>
                          <div style={{ fontSize:12,color:t.text3,lineHeight:1.5 }}>
                            {streamingIntent === 'FS_SPEC'
                              ? `Writing all 17 sections from your requirements. This takes 30–60 seconds — your Word document will download automatically when complete.`
                              : `Generating all slides with speaker notes and SAP references. Your PowerPoint will download automatically when complete.`
                            }
                          </div>
                          {/* Live section counter */}
                          {(() => {
                            const sections = (streamingText.match(/---SECTION \d+:/g) || []).length
                            const slides   = (streamingText.match(/---SLIDE \d+---/g) || []).length
                            const count = streamingIntent === 'FS_SPEC' ? sections : slides
                            const total = streamingIntent === 'FS_SPEC' ? 17 : '~15'
                            if (count === 0) return null
                            return (
                              <div style={{ marginTop:10,fontSize:12,color:'#4F46E5',fontWeight:600 }}>
                                {streamingIntent === 'FS_SPEC' ? `✓ ${count} of ${total} sections written` : `✓ ${count} slides written`}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    ) : isStreaming ? (
                      <>
                        <MessageBubble msg={{role:'assistant',content:''}} isStreaming={true} streamingText={streamingText} streamingQuickAnswer={streamingQuickAnswer} isPreparing={isPreparingAnswer} isFinalizing={isFinalizing} t={t} dark={dark} userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}/>
                      </>
                    ) : null}
                    {/* Dual model bubble — only show while actively streaming */}
                    {(dualStreaming || dualText) && !isLoading ? (
                      <div style={{ marginTop:16 }}>
                        <div style={{ fontSize:10, color:'#D97706', opacity:0.7, marginBottom:4, marginLeft:48, fontFamily:"'Inter',sans-serif" }}>
                          {dualLabel}
                        </div>
                        <MessageBubble msg={{role:'assistant',content:dualText}} isStreaming={dualStreaming} streamingText={dualStreaming ? dualText : ''} t={t} dark={dark} userInitial={profile?.name?profile.name[0].toUpperCase():session.user.email[0].toUpperCase()}/>
                      </div>
                    ) : null}
                    <div ref={bottomRef}/>
                  </>
                )}
              </div>
            </div>

            {/* Floating action buttons — pinned bottom-right, just above the input.
                • Scroll-to-bottom: appears only when the user has scrolled up in a long answer.
                • New chat: always available, thumb-reachable on mobile. */}
            <div style={{ position:'absolute', right: isMobile?16:28, bottom: isMobile?150:130, display:'flex', flexDirection:'column', gap:12, zIndex:6, pointerEvents:'none' }}>
              {scrollProgress < 0.92 && messages.some(m=>m.role==='user') && (
                <button
                  onClick={()=>{ if(chatScrollRef.current) chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior:'smooth' }) }}
                  title="Scroll to latest"
                  style={{ pointerEvents:'auto', width:40, height:40, borderRadius:'50%', border:`1px solid ${t.border}`, background:t.topbar, color:t.text2, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', backdropFilter:'blur(10px)', animation:'fabIn 0.25s ease' }}
                >↓</button>
              )}
              <button
                onClick={goHome}
                title="New chat"
                style={{ pointerEvents:'auto', width:52, height:52, borderRadius:'50%', border:'none', background:'#4F46E5', color:'#fff', cursor:'pointer', fontSize:26, fontWeight:300, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 20px rgba(79,70,229,0.45)', animation:'fabIn 0.3s ease' }}
                onMouseDown={e=>{ e.currentTarget.style.transform='scale(0.92)' }}
                onMouseUp={e=>{ e.currentTarget.style.transform='scale(1)' }}
                onMouseLeave={e=>{ e.currentTarget.style.transform='scale(1)' }}
              >+</button>
            </div>

            {isAdmin && (
              <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'6px 12px', background:t.topbar, borderTop:`1px solid ${t.border}` }}>
                <button
                  onClick={()=>setTavilyABMode(v=>!v)}
                  disabled={isLoading || isStreaming}
                  title="Private controlled test: same question twice, only Tavily injection differs"
                  style={{ border:`1px solid ${tavilyABMode?'#D97706':t.border}`, background:tavilyABMode?'rgba(217,119,6,0.12)':'transparent', color:tavilyABMode?'#D97706':t.text4, borderRadius:20, padding:'4px 11px', fontSize:11, fontWeight:600, cursor:(isLoading||isStreaming)?'default':'pointer', fontFamily:"'Inter',sans-serif" }}
                >
                  Tavily A/B: {tavilyABMode ? 'ON' : 'OFF'}
                </button>
                {tavilyABMode && <span style={{ fontSize:10, color:t.text4 }}>Admin test · 2 Sonnet calls · same books/Findings/history</span>}
              </div>
            )}

            {/* Input */}
            <div className="chat-input-wrap" style={{ borderTop:`1px solid ${t.border}`,background:t.topbar,backdropFilter:'blur(10px)',flexShrink:0,position:'relative',zIndex:2,paddingBottom:'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}>
              {!isUnlimited && <UsageBar count={messageCount} limit={DAILY_LIMIT} dark={dark} />}
              <div style={{ maxWidth:720,margin:'0 auto' }}>

                {/* Document chip */}
                {uploadedDoc && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'6px 10px', background:'rgba(79,70,229,0.1)', border:'1px solid rgba(79,70,229,0.25)', borderRadius:10, fontSize:12 }}>
                    <span style={{ fontSize:14 }}>📄</span>
                    <span style={{ flex:1, color:t.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{uploadedDoc.name}</span>
                    {docUploadStage==='indexing' ? (
                      <span style={{ color:'#D97706', fontSize:11, fontWeight:600, background:'rgba(217,119,6,0.15)', padding:'2px 7px', borderRadius:6 }}>⏳ Indexing…</span>
                    ) : uploadedDoc.indexed===false ? (
                      <span title="Search-based retrieval may not work — full text is still used as fallback" style={{ color:'#DC2626', fontSize:11, fontWeight:600, background:'rgba(220,38,38,0.15)', padding:'2px 7px', borderRadius:6 }}>⚠️ Not indexed</span>
                    ) : (
                      <span style={{ color:'#6366f1', fontSize:11, fontWeight:600, background:'rgba(99,102,241,0.15)', padding:'2px 7px', borderRadius:6 }}>{uploadedDoc.docType?.replace('_',' ')}</span>
                    )}
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

                <div style={{ display:'flex',flexWrap:'wrap',gap:10,alignItems:isMobile?'center':'flex-end',background:t.inputBg,border:`1.5px solid ${t.border2}`,borderRadius:14,padding:'10px 12px',transition:'border-color 0.2s, box-shadow 0.2s' }}
                  onFocusCapture={e=>{e.currentTarget.style.borderColor='#4F46E5';e.currentTarget.style.boxShadow='0 0 0 3px rgba(79,70,229,0.1)'}}
                  onBlurCapture={e=>{e.currentTarget.style.borderColor=t.border2;e.currentTarget.style.boxShadow='none'}}
                >
                  {/* Upload button */}
                  <button onClick={()=>docInputRef.current?.click()} disabled={docUploading}
                    title={docUploadStage==='extracting'?'Extracting text…':docUploadStage==='indexing'?'Indexing document — please wait before asking about it':docUploadStage==='failed'?'Indexing failed — click to retry':'Upload document (PDF, DOCX, TXT)'}
                    style={{ width:32,height:32,borderRadius:8,border:`1px solid ${t.border}`,background:'transparent',color:uploadedDoc?'#6366f1':t.text4,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    {docUploadStage==='extracting'?'📄':docUploadStage==='indexing'?'⏳':docUploadStage==='failed'?'⚠️':'📎'}
                  </button>
                  <input ref={docInputRef} type="file" accept=".txt,.pdf,.docx" style={{ display:'none' }} onChange={handleDocUpload} />

                  {/* Save Finding button — direct manual knowledge capture, bypasses chat/model pipeline */}
                  <button onClick={()=>setShowSaveFinding(true)}
                    title="Save a finding directly to your knowledge base (no chat reply)"
                    style={{ width:32,height:32,borderRadius:8,border:`1px solid ${t.border}`,background:'transparent',color:t.text4,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    💡
                  </button>

                  {/* Attached code card */}
                  {attachedCode && (
                    <div style={{ width:'100%', marginBottom:6, ...(isMobile?{ order:-2 }:{}) }}>
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
                    style={{ flex:isMobile?'1 1 100%':1,...(isMobile?{ order:-1,width:'100%' }:{}),background:'transparent',border:'none',resize:'none',fontSize:16,color:t.text,fontFamily:"'Inter','DM Sans',sans-serif",lineHeight:1.65,height:'26px',maxHeight:'160px',overflowY:'auto',padding:0,outline:'none' }}
                  />
                  <button title="Voice input (coming soon)" style={{ width:36,height:36,borderRadius:10,border:'none',background:'transparent',color:t.text4,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,...(isMobile?{ marginLeft:'auto' }:{}) }}>
                    <IconMic size={17}/>
                  </button>
                  {activeConvId && busyConvIds[activeConvId] ? (
                    <button onClick={handleStop} title="Stop generating"
                      style={{ width:36,height:36,borderRadius:10,border:'none',flexShrink:0,background:'#4F46E5',color:'#fff',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s' }}
                    ><span style={{ width:11,height:11,background:'#fff',borderRadius:2,display:'block' }}/></button>
                  ) : (
                    <button onClick={() => handleSend()} disabled={(!input.trim()&&!attachedCode)||(activeConvId&&busyConvIds[activeConvId])}
                      style={{ width:36,height:36,borderRadius:10,border:'none',flexShrink:0,background:(input.trim()||attachedCode)?'#4F46E5':t.border,color:(input.trim()||attachedCode)?'#fff':t.text4,cursor:(input.trim()||attachedCode)?'pointer':'not-allowed',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s' }}
                    >→</button>
                  )}
                </div>
                <div style={{ fontSize:11,color:t.text4,textAlign:'right',marginTop:4 }}>{(activeConv?.module||browseModule) ? `${activeConv?.module||browseModule} · ` : ''}Wani can make mistakes. Please verify important information.</div>
              </div>
            </div>

            {/* Knowledge toast notification */}
            {knowledgeToast && (
              <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:'rgba(79,70,229,0.95)', color:'white', padding:'8px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:100, boxShadow:'0 4px 20px rgba(79,70,229,0.4)' }}>
                {knowledgeToast}
              </div>
            )}

            {/* Save to Memory confirmation popup */}
            {pendingMemorySave && (
              <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:t.surface, border:'1px solid rgba(79,70,229,0.4)', borderRadius:14, padding:'16px 18px', zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.3)', maxWidth:440, width:'90vw' }}>
                <div style={{ fontWeight:700, color:t.text, marginBottom:6, fontSize:14 }}>🧠 Save to Wani's Memory?</div>
                <div style={{ color:t.text2, fontSize:12, lineHeight:1.6, marginBottom:12, whiteSpace:'pre-wrap', maxHeight:180, overflowY:'auto', background:dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', borderRadius:8, padding:'8px 10px' }}>
                  {pendingMemorySave.summary}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setPendingMemorySave(null)}
                    style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${t.border}`, background:'transparent', color:t.text3, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
                    Cancel
                  </button>
                  <button onClick={async () => {
                    try {
                      await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                        body: JSON.stringify({ action: 'save_memory', summary: pendingMemorySave.summary })
                      })
                      setPendingMemorySave(null)
                      setKnowledgeToast("🧠 Saved to Wani's memory")
                      setTimeout(() => setKnowledgeToast(null), 3000)
                    } catch { setPendingMemorySave(null) }
                  }} style={{ flex:2, padding:'7px', borderRadius:8, border:'none', background:'#4F46E5', color:'white', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'Inter',sans-serif" }}>
                    ✓ Save to Memory
                  </button>
                </div>
              </div>
            )}

            {/* Pending correction confirmation — same style as finding popup */}
            {pendingCorrection && (
              <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:t.surface, border:`1px solid rgba(234,179,8,0.4)`, borderRadius:14, padding:'14px 18px', fontSize:13, zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.3)', maxWidth:420, width:'90vw' }}>
                <div style={{ fontWeight:700, color:t.text, marginBottom:8 }}>💡 Save this correction to Wani's memory?</div>
                <div style={{ color:t.text2, marginBottom:12, fontSize:12, lineHeight:1.5 }}>Wani will remember this and use it in future answers.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setPendingCorrection(null)} style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${t.border}`, background:'transparent', color:t.text3, cursor:'pointer', fontFamily:"'Inter',sans-serif", fontSize:13 }}>Dismiss</button>
                  <button onClick={async () => {
                    try {
                      await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                        body: JSON.stringify({ action: 'save_correction', userMsg: pendingCorrection.userMsg, assistantMsg: pendingCorrection.assistantMsg })
                      })
                      setPendingCorrection(null)
                      setKnowledgeToast('✅ Correction saved to Wani\'s memory')
                      setTimeout(() => setKnowledgeToast(null), 3000)
                    } catch { setPendingCorrection(null) }
                  }} style={{ flex:2, padding:'7px', borderRadius:8, border:'none', background:'#16a34a', color:'white', cursor:'pointer', fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:600 }}>✓ Yes, save it</button>
                </div>
              </div>
            )}

            {/* Pending finding confirmation — editable before saving */}
            {pendingFinding && (
              <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:t.surface, border:`1px solid rgba(79,70,229,0.3)`, borderRadius:14, padding:'14px 18px', fontSize:13, zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.3)', maxWidth:420, width:'90vw' }}>
                <div style={{ fontWeight:700, color:t.text, marginBottom:6 }}>💡 Save this finding?</div>
                <div style={{ color:t.text2, marginBottom:6, fontSize:12 }}><span style={{ color:'#6366f1', fontWeight:600 }}>{pendingFinding.module} › {pendingFinding.topic} › {pendingFinding.object}</span></div>
                <textarea
                  value={editedFindingText}
                  onChange={(e)=>setEditedFindingText(e.target.value)}
                  rows={3}
                  style={{ width:'100%', boxSizing:'border-box', color:t.text, background:dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 10px', marginBottom:12, lineHeight:1.5, fontFamily:"'Inter',sans-serif", fontSize:13, resize:'vertical' }}
                  placeholder="Edit the finding before saving, if needed"
                />
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>setPendingFinding(null)} style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${t.border}`, background:'transparent', color:t.text3, cursor:'pointer', fontFamily:"'Inter',sans-serif", fontSize:12 }}>Dismiss</button>
                  <button onClick={rejectFinding} title="Don't suggest this again" style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${t.border}`, background:'transparent', color:t.text3, cursor:'pointer', fontFamily:"'Inter',sans-serif", fontSize:12 }}>Not needed</button>
                  <button onClick={()=>saveFinding(pendingFinding)} disabled={!editedFindingText.trim()} style={{ flex:2, padding:'7px', borderRadius:8, border:'none', background: editedFindingText.trim() ? '#4F46E5' : '#9ca3af', color:'white', cursor: editedFindingText.trim() ? 'pointer' : 'not-allowed', fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:600 }}>✓ Save to Knowledge Base</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showProfile&&<ProfileModal session={session} profile={profile} t={t} onClose={()=>setShowProfile(false)} onSave={async(u)=>{await upsertProfile(session.user.id,u);setProfile(p=>({...p,...u}))}} onSignOut={signOut}/>}
      {showSaveFinding&&<SaveFindingModal t={t} dark={dark} onClose={()=>setShowSaveFinding(false)} onSave={saveManualFinding}/>}

      {showExport&&<ExportModal conversation={activeConv} messages={messages} t={t} dark={dark} onClose={()=>setShowExport(false)}/>}

      {/* ── ADMIN DEBUG PANEL — only visible to admin emails ── */}
      {isAdmin && debugData && (
        <div style={{ position:'fixed', bottom:16, right:16, zIndex:300 }}>
          <button onClick={()=>setShowDebug(p=>!p)}
            style={{ background:'#1a1a2e', border:'1px solid #4F46E5', borderRadius:10, padding:'6px 12px', color:'#a5b4fc', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif", letterSpacing:0.5 }}>
            {showDebug ? '✕ Debug' : '🔍 Debug'}
          </button>
          {showDebug && (
            <div style={{ position:'absolute', bottom:36, right:0, width:380, maxHeight:'70vh', overflowY:'auto', background:'#0D0D1A', border:'1px solid #2A2440', borderRadius:14, padding:16, boxShadow:'0 8px 32px rgba(0,0,0,0.6)', fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'#a5b4fc' }}>
              <div style={{ fontWeight:700, color:'#818cf8', marginBottom:10, fontSize:12 }}>🔍 Wani Debug Panel</div>

              {/* Intent */}
              <div style={{ marginBottom:8 }}>
                <span style={{ color:'#6366f1' }}>Intent: </span>
                <span style={{ color:'#e2e8f0' }}>{debugData.intent}</span>
                <span style={{ color:'#475569', marginLeft:8 }}>({(debugData.confidence*100).toFixed(0)}%)</span>
              </div>

              {/* Routing */}
              <div style={{ marginBottom:8 }}>
                <span style={{ color:'#6366f1' }}>Routing: </span>
                <span style={{ color:'#fbbf24' }}>{debugData.routing}</span>
              </div>

              {/* Module */}
              {debugData.detectedModule && (
                <div style={{ marginBottom:8 }}>
                  <span style={{ color:'#6366f1' }}>Module: </span>
                  <span style={{ color:'#34d399' }}>{debugData.detectedModule}</span>
                </div>
              )}

              {/* Search query */}
              {debugData.searchQuery && (
                <div style={{ marginBottom:8 }}>
                  <span style={{ color:'#6366f1' }}>Search query: </span>
                  <span style={{ color:'#e2e8f0' }}>"{debugData.searchQuery}"</span>
                </div>
              )}

              {/* Sources */}
              <div style={{ marginBottom:8, display:'flex', gap:12, flexWrap:'wrap' }}>
                <span><span style={{ color:'#6366f1' }}>Book chunks: </span><span style={{ color: debugData.bookChunks > 0 ? '#34d399' : '#ef4444' }}>{debugData.bookChunks}</span></span>
                <span><span style={{ color:'#6366f1' }}>Web search: </span><span style={{ color: debugData.openAISources > 0 ? '#34d399' : '#ef4444' }}>{debugData.openAISources}</span></span>
                <span><span style={{ color:'#6366f1' }}>Knowledge: </span><span style={{ color: debugData.knowledgeChunks > 0 ? '#34d399' : '#ef4444' }}>{debugData.knowledgeChunks}</span></span>
              </div>

              {/* Timing */}
              {debugData.timing && (
                <div style={{ marginBottom:8, borderTop:'1px solid #2A2440', paddingTop:8 }}>
                  <div style={{ color:'#6366f1', marginBottom:4 }}>Timing:</div>
                  <div style={{ color:'#94a3b8', paddingLeft:8 }}>
                    {debugData.timing.parallelMs && <div>Parallel fetch: {debugData.timing.parallelMs}ms</div>}
                    {debugData.timing.modelsMs && <div>Models: {debugData.timing.modelsMs}ms</div>}
                    {debugData.timing.synthesisMs && <div>Synthesis: {debugData.timing.synthesisMs}ms</div>}
                    <div style={{ color:'#fbbf24', fontWeight:700 }}>Total: {debugData.timing.totalMs}ms</div>
                  </div>
                </div>
              )}

              {/* Raw answers */}
              {debugData.rawAnswers?.gpt && (
                <div style={{ borderTop:'1px solid #2A2440', paddingTop:8, marginTop:4 }}>
                  <div style={{ color:'#6366f1', marginBottom:4 }}>GPT-4o raw (first 300):</div>
                  <div style={{ color:'#94a3b8', fontSize:10, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{debugData.rawAnswers.gpt.slice(0,300)}...</div>
                </div>
              )}
              {debugData.rawAnswers?.claude && (
                <div style={{ borderTop:'1px solid #2A2440', paddingTop:8, marginTop:4 }}>
                  <div style={{ color:'#6366f1', marginBottom:4 }}>Claude raw (first 300):</div>
                  <div style={{ color:'#94a3b8', fontSize:10, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{debugData.rawAnswers.claude.slice(0,300)}...</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
