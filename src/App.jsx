import { useState, useEffect, createContext, useContext, lazy, Suspense, Component } from 'react'
import { supabase, signOut } from './supabaseClient'
import Login from './pages/Login.jsx'
import { WaniLogo, WaniWordmark } from './pages/Login.jsx'
import Brain from './pages/Brain.jsx'
const DiscoveryWorkshop = lazy(() => import('./features/discovery/DiscoveryWorkshop.jsx'))
import AdminDashboard from './pages/AdminDashboard.jsx'


// Discovery is isolated so an unexpected catalog/rendering error cannot blank Wani chat.
class DiscoveryErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) { console.error('Discovery UI error', error, info) }
  render() {
    if (this.state.failed) return (
      <main role="alert" style={{ minHeight:'100dvh',background:'#0a0a12',color:'#f5f3fa',padding:'max(48px,8vh) 20px',fontFamily:'Inter,system-ui,sans-serif',textAlign:'center' }}>
        <h1 style={{ fontSize:24 }}>Discovery could not open</h1>
        <p style={{ maxWidth:520,margin:'16px auto',lineHeight:1.6,color:'#bdb5ce' }}>The workshop encountered an error. Your Wani chat is unaffected. Please report this screen so we can fix the workshop.</p>
        <a href="/" style={{ display:'inline-block',padding:'12px 18px',borderRadius:10,background:'#5947cf',color:'white',textDecoration:'none',fontWeight:700 }}>Return to Wani</a>
      </main>
    )
    return this.props.children
  }
}


const implementationPhases = [
  { id:'discovery',number:'01',name:'Discover',subtitle:'Discovery & assessment',description:'Understand the customer landscape, business goals, SAP PM processes, data and project scope.',active:true,href:'/discovery' },
  { id:'prepare',number:'02',name:'Prepare',subtitle:'Project preparation',description:'Project governance, scope baseline, team, timeline and implementation planning.' },
  { id:'explore',number:'03',name:'Explore',subtitle:'Fit-to-standard & design',description:'Workshops, process design, fit-gap decisions and solution backlog.' },
  { id:'realize',number:'04',name:'Realize',subtitle:'Configuration & build',description:'Configuration, extensions, integrations, data migration and testing.' },
  { id:'deploy',number:'05',name:'Deploy',subtitle:'Go-live readiness',description:'Cutover, user enablement, go-live checklist and release planning.' },
  { id:'run',number:'06',name:'Run',subtitle:'Operate & improve',description:'Hypercare, stabilization, handover and continuous improvement.' },
]

function ImplementationHub() {
  return (
    <main className="wani-implementation" aria-label="SAP S/4HANA implementation phases">
      <style>{`
        .wani-implementation{min-height:100dvh;overflow-y:auto;background:radial-gradient(ellipse 85% 45% at 50% -20%,#282044 0%,transparent 85%),#090910;color:#f6f4ff;font-family:Inter,system-ui,sans-serif;padding:22px max(18px,calc((100vw - 1120px)/2)) 80px}
        .wani-impl-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0 48px}
        .wani-impl-back{color:#c7c1dc;font-weight:650;font-size:13px;border:1px solid #39344b;background:#1a1727;border-radius:11px;padding:10px 13px}
        .wani-impl-brand{font-size:13px;letter-spacing:.03em;font-weight:780;color:#eeeaff}
        .wani-impl-hero{margin-bottom:28px}
        .wani-impl-eyebrow{color:#ab96ff;font-size:11px;font-weight:780;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}
        .wani-impl-hero h1{font-size:clamp(29px,5.7vw,47px);line-height:1.08;letter-spacing:-.045em;margin:0 0 14px;font-weight:780}
        .wani-impl-hero p{font-size:14px;line-height:1.7;color:#b5afc7;max-width:670px;margin:0}
        .wani-impl-progress{margin:24px 0 28px;display:flex;align-items:center;gap:11px;color:#a9a3ba;font-size:12px}
        .wani-impl-progress strong{color:#d8cffb}
        .wani-impl-progress-line{height:5px;background:#2c263a;flex:1;border-radius:99px;overflow:hidden}
        .wani-impl-progress-line::before{content:'';display:block;height:100%;width:16.6667%;background:linear-gradient(90deg,#7460e6,#bb9cff);border-radius:inherit}
        .wani-impl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        .wani-impl-phase{position:relative;display:flex;flex-direction:column;min-height:222px;gap:12px;text-align:left;padding:23px;border-radius:17px;border:1px solid #302b3c;background:#15131d;color:inherit;text-decoration:none;transition:transform .18s,border-color .18s,background .18s}
        .wani-impl-phase:not(a){opacity:.74}
        a.wani-impl-phase:hover{transform:translateY(-3px);border-color:#a28eff;background:#211b34}
        a.wani-impl-phase:focus-visible{outline:3px solid #aa96ff;outline-offset:3px}
        .wani-impl-phase.active{background:linear-gradient(145deg,#292044,#181422 70%);border-color:#8f72e7;box-shadow:0 9px 28px #0005}
        .wani-impl-phase-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .wani-impl-num{font-size:12px;font-weight:750;color:#b7a3e6}
        .wani-impl-status{font-size:10px;font-weight:750;padding:6px 9px;border:1px solid #51436f;background:#29213b;border-radius:99px;color:#d6c9fa}
        .wani-impl-phase:not(.active) .wani-impl-status{color:#a7a1b4;border-color:#393443;background:#211d29}
        .wani-impl-phase h2{font-size:23px;letter-spacing:-.03em;margin:0;font-weight:750}
        .wani-impl-subtitle{font-size:12px;color:#c5b7ed;font-weight:640}
        .wani-impl-phase p{font-size:12px;line-height:1.65;color:#afa9bc;margin:0;flex:1}
        .wani-impl-open{color:#d0beff;font-size:12px;font-weight:760;margin-top:5px}
        .wani-impl-foot{margin-top:24px;padding:14px 17px;border:1px solid #292638;background:#11101a;border-radius:13px;color:#aaa4b9;font-size:12px;line-height:1.6}
        @media(max-width:900px){.wani-impl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:620px){.wani-implementation{padding:14px 15px 75px}.wani-impl-top{padding-bottom:32px}.wani-impl-grid{grid-template-columns:1fr;gap:11px}.wani-impl-phase{min-height:177px;padding:19px;gap:9px}.wani-impl-phase h2{font-size:21px}.wani-impl-hero p{font-size:13px}.wani-impl-progress{font-size:11px}}
        @media(prefers-reduced-motion:reduce){.wani-impl-phase{transition:none}}
      `}</style>
      <div className="wani-impl-top">
        <a className="wani-impl-back" href="/">← Back to Wani</a>
        <span className="wani-impl-brand">WANI / IMPLEMENTATION</span>
      </div>
      <section className="wani-impl-hero">
        <div className="wani-impl-eyebrow">SAP S/4HANA · Project workspace</div>
        <h1>Implementation</h1>
        <p>One workspace for the complete SAP S/4HANA implementation journey. Start with Discovery, then build out the next phases step by step.</p>
      </section>
      <div className="wani-impl-progress" aria-label="One of six phases available">
        <strong>1 phase available</strong>
        <div className="wani-impl-progress-line"/>
        <span>6 phases</span>
      </div>
      <section className="wani-impl-grid" aria-label="Implementation phases">
        {implementationPhases.map(phase => {
          const content = <>
            <div className="wani-impl-phase-top"><span className="wani-impl-num">PHASE {phase.number}</span><span className="wani-impl-status">{phase.active?'Available':'Coming next'}</span></div>
            <div><h2>{phase.name}</h2><div className="wani-impl-subtitle">{phase.subtitle}</div></div>
            <p>{phase.description}</p>
            {phase.active && <span className="wani-impl-open">Open Discovery Workshop →</span>}
          </>
          return phase.active
            ? <a key={phase.id} className="wani-impl-phase active" href={phase.href}>{content}</a>
            : <div key={phase.id} className="wani-impl-phase" aria-disabled="true">{content}</div>
        })}
      </section>
      <p className="wani-impl-foot">The existing Discovery Workshop and saved data remain unchanged. Other phases will be added individually.</p>
    </main>
  )
}

export const ThemeContext = createContext({ dark: false, toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

function jwtSessionId(token) {
  try {
    const payload = token?.split('.')?.[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return decoded?.session_id || null
  } catch { return null }
}

function PendingApproval({ dark, email, onSignOut }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#0A0A12' : '#FAFAF8', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', background: dark ? '#12121A' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 20, padding: '40px 32px' }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ fontSize: 32, margin: '20px 0 8px' }}>⏳</div>
        <h2 style={{ margin: '0 0 12px', color: dark ? '#fff' : '#111', fontSize: 20, fontWeight: 700 }}>Application Pending</h2>
        <p style={{ color: dark ? '#94A3B8' : '#666', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          Thanks for applying. We're reviewing your application personally and will send access to <strong>{email}</strong> shortly.
        </p>
        <button onClick={onSignOut} style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`, background: 'transparent', color: dark ? '#94A3B8' : '#666', cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
          Log out
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [approved, setApproved] = useState(null)
  const [adminAvailable, setAdminAvailable] = useState(false)
  const [adminView, setAdminView] = useState(false)
  const dark = true
  const toggle = () => {}

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  const sessionUserId = session?.user?.id || null
  const sessionEmail = session?.user?.email?.trim().toLowerCase() || ''

  // Notify once per real Supabase session. TOKEN_REFRESHED keeps the same
  // session_id, so background refreshes do not generate duplicate login emails.
  useEffect(() => {
    if (!session?.access_token || !sessionUserId) return
    const sid = jwtSessionId(session.access_token)
    if (!sid) return
    const key = `wani-login-notified:${sid}`
    try { if (localStorage.getItem(key) === '1') return } catch {}

    fetch('/api/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'notify_login' }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('login notification failed')))
      .then(result => {
        const n = result?.loginNotification
        if (n?.sent || n?.skipped === 'duplicate') {
          try { localStorage.setItem(key, '1') } catch {}
        }
      })
      .catch(() => {})
  }, [sessionUserId, session?.access_token])

  useEffect(() => {
    if (!sessionEmail) {
      setApproved(null)
      setAdminAvailable(false)
      setAdminView(false)
      return
    }

    // Supabase emits TOKEN_REFRESHED when a hidden tab or backgrounded app
    // becomes active again. The session object changes, but the user does not.
    // Keying this check to user identity keeps Brain mounted during token
    // refreshes, so an in-progress chat draft is not lost.
    setApproved(null)
    supabase
      .from('approved_emails')
      .select('email')
      .eq('email', sessionEmail)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Approval check error:', error)
          setApproved(false) // Fail closed. The API performs the authoritative check too.
          return
        }
        setApproved(Boolean(data))
      })
  }, [sessionUserId, sessionEmail])

  // Pending users re-check approval while the page is open, so they do not need
  // to keep signing out/in after the administrator approves them.
  useEffect(() => {
    if (!sessionEmail || approved !== false) return
    const check = () => supabase.from('approved_emails').select('email').eq('email', sessionEmail).maybeSingle()
      .then(({ data }) => { if (data) setApproved(true) }).catch(() => {})
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [sessionEmail, approved])

  // Ask the server whether this verified user is an administrator. Do NOT load
  // the full admin dashboard just to answer this boolean; that made the Admin control
  // depend on a much heavier request and could leave it missing on a slow login.
  useEffect(() => {
    if (!session || approved !== true) {
      setAdminAvailable(false)
      return
    }
    let cancelled = false
    const token = session.access_token
    fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: 'admin_status' }),
    })
      .then(res => res.ok ? res.json() : Promise.reject(new Error('admin status failed')))
      .then(data => {
        if (!cancelled) setAdminAvailable(data?.isAdmin === true)
      })
      .catch(() => {
        if (!cancelled) setAdminAvailable(false)
      })
    return () => { cancelled = true }
  }, [sessionUserId, approved])

  useEffect(() => {
    if (!adminAvailable) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('admin') === 'users') setAdminView(true)
  }, [adminAvailable])

  const handleSignOut = async () => {
    await signOut()
    setApproved(null)
    setAdminAvailable(false)
    setAdminView(false)
  }

  if (loading || (session && approved === null)) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#0A0A12' : '#FAFAF8' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <WaniLogo size={48} dark={dark}/>
        <div style={{ width: 24, height: 24, border: `2px solid ${dark ? '#333' : '#E8E3D5'}`, borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <WaniWordmark height={16} dark={dark}/>
      </div>
    </div>
  )

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {!session
        ? <Login/>
        : approved
          ? adminView
            ? <AdminDashboard session={session} onClose={() => setAdminView(false)} />
            : <>
                {window.location.pathname.startsWith('/implementation')
                  ? <ImplementationHub/>
                  : window.location.pathname.startsWith('/discovery')
                  ? <DiscoveryErrorBoundary><Suspense fallback={<div role="status" style={{background:'#0a0a12',color:'#e8e3ff',minHeight:'100dvh',display:'grid',placeItems:'center',fontFamily:'Inter,sans-serif'}}>Loading Discovery Workshop…</div>}><DiscoveryWorkshop session={session}/></Suspense></DiscoveryErrorBoundary>
                  : <>
                  <Brain session={session}/>
                  <a href="/implementation" aria-label="Open SAP S/4HANA Implementation" title="Open SAP S/4HANA Implementation" style={{position:'fixed',left:16,top:76,zIndex:2147483001,display:'inline-flex',alignItems:'center',gap:8,border:'1px solid #9f90ff',borderRadius:12,padding:'12px 16px',background:'#4f46e5',color:'#fff',textDecoration:'none',boxShadow:'0 8px 24px #0008',fontWeight:750,fontSize:13,letterSpacing:'.01em',maxWidth:'calc(100vw - 32px)'}}>◈ Implementation</a>
                </>}
                {adminAvailable && !window.location.pathname.startsWith('/discovery') && !window.location.pathname.startsWith('/implementation') && (
                  <button
                    onClick={() => setAdminView(true)}
                    title="Open Wani admin dashboard"
                    style={{
                      position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000,
                      border: '1px solid rgba(167,139,250,.55)', borderRadius: 999,
                      padding: '9px 14px', background: 'rgba(17,17,27,.94)', color: '#C4B5FD',
                      boxShadow: '0 10px 30px rgba(0,0,0,.35)', cursor: 'pointer',
                      font: "650 12px/1 'Inter',sans-serif", backdropFilter: 'blur(12px)',
                    }}
                  >
                    Admin
                  </button>
                )}
              </>
          : <PendingApproval dark={dark} email={session.user.email} onSignOut={handleSignOut}/>
      }
    </ThemeContext.Provider>
  )
}
