import { useMemo, useState } from 'react'
import Brain from './Brain.jsx'
import AdminDashboard from './AdminDashboard.jsx'
import AdminKnowledge from './AdminKnowledge.jsx'
import AdminAnalytics from './AdminAnalytics.jsx'
import AdminCosts from './AdminCosts.jsx'
import { signOut } from '../supabaseClient'

const NAV = [
  { key:'home', label:'Overview', icon:'◫' },
  { key:'wani', label:'Wani', icon:'✦' },
  { key:'users', label:'Users', icon:'◎' },
  { key:'knowledge', label:'Knowledge', icon:'◇' },
  { key:'analytics', label:'Analytics', icon:'▥' },
  { key:'costs', label:'Costs', icon:'€' },
  { key:'system', label:'System', icon:'⚙' },
]

const comingSoon = {
  system: ['Model/API health','Recent failures','Supabase health','Deployment and version status'],
}

function Overview({ onOpen }) {
  const cards = [
    ['wani','Open Wani','Use your private Wani workspace and test new features before release.'],
    ['users','Users','Approve, suspend or reactivate users and review activity, credits and last-online information.'],
    ['knowledge','Knowledge','Review consultant corrections and manage Wani global knowledge.'],
    ['analytics','Analytics','See adoption, active users, question volume and top users.'],
    ['costs','Costs','Track actual persisted Claude Sonnet tokens and cost.'],
    ['system','System','Monitor model providers, database health and deployments.'],
  ]
  return (
    <div style={{padding:'34px 34px 60px',maxWidth:1200,margin:'0 auto'}}>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:1.5,color:'#8B7CF6',textTransform:'uppercase'}}>Wani Command Center</div>
        <h1 style={{fontSize:34,lineHeight:1.1,margin:'8px 0 10px',color:'#F7F5FF'}}>Good to see you.</h1>
        <p style={{margin:0,maxWidth:700,color:'#8E899F',fontSize:14,lineHeight:1.6}}>This is the private workspace for operating Wani, testing changes, reviewing knowledge and managing access. Nothing here is intended for normal users.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:14}}>
        {cards.map(([key,title,desc]) => (
          <button key={key} onClick={()=>onOpen(key)} style={{textAlign:'left',padding:20,borderRadius:18,border:'1px solid #262334',background:'linear-gradient(180deg,#15131E,#100F17)',cursor:'pointer',minHeight:145,color:'#fff'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
              <span style={{fontSize:13,color:'#B9B2CF',fontWeight:700}}>{title}</span>
              <span style={{width:28,height:28,borderRadius:9,display:'grid',placeItems:'center',background:'#211B3B',color:'#A99AFB'}}>↗</span>
            </div>
            <div style={{fontSize:13,lineHeight:1.55,color:'#777286'}}>{desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Placeholder({ title, items }) {
  return (
    <div style={{padding:'34px',maxWidth:1100,margin:'0 auto'}}>
      <div style={{fontSize:12,fontWeight:800,letterSpacing:1.3,color:'#8B7CF6',textTransform:'uppercase'}}>Admin Module</div>
      <h1 style={{fontSize:30,margin:'7px 0 8px',color:'#F7F5FF'}}>{title}</h1>
      <p style={{color:'#7F798E',fontSize:14,margin:'0 0 24px'}}>This module is planned for the next phase.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
        {items.map(item => <div key={item} style={{padding:18,borderRadius:14,border:'1px solid #282536',background:'#121019',color:'#B9B4C9',fontSize:13}}>{item}</div>)}
      </div>
    </div>
  )
}

export default function AdminPortal({ session }) {
  const [view,setView] = useState('home')
  const email = session?.user?.email || ''
  const initials = useMemo(()=>email ? email.slice(0,2).toUpperCase() : 'WA',[email])

  if (view === 'wani') return (
    <div style={{position:'relative',height:'100dvh'}}>
      <button onClick={()=>setView('home')} style={{position:'fixed',right:18,bottom:18,zIndex:2147483000,border:'1px solid #4F46E5',borderRadius:999,padding:'9px 14px',background:'#171522',color:'#C4B5FD',cursor:'pointer',fontWeight:700}}>Admin Home</button>
      <Brain session={session}/>
    </div>
  )

  if (view === 'users') return <AdminDashboard onClose={()=>setView('home')} />
  if (view === 'knowledge') return <AdminKnowledge onClose={()=>setView('home')} />
  if (view === 'analytics') return <AdminAnalytics onClose={()=>setView('home')} />
  if (view === 'costs') return <AdminCosts onClose={()=>setView('home')} />

  return (
    <div style={{minHeight:'100dvh',background:'#0A0910',color:'#F7F5FF',fontFamily:"'Inter',sans-serif",display:'flex'}}>
      <aside style={{width:238,flexShrink:0,borderRight:'1px solid #211F2B',background:'#0D0C13',padding:'20px 14px',display:'flex',flexDirection:'column',position:'sticky',top:0,height:'100dvh'}}>
        <div style={{padding:'4px 10px 20px'}}>
          <div style={{fontWeight:800,fontSize:18}}>Wani</div>
          <div style={{fontSize:10,letterSpacing:1.4,color:'#706A82',textTransform:'uppercase',marginTop:3}}>Administrator</div>
        </div>
        <nav style={{display:'flex',flexDirection:'column',gap:5}}>
          {NAV.map(item => {
            const active=view===item.key
            return <button key={item.key} onClick={()=>setView(item.key)} style={{display:'flex',alignItems:'center',gap:11,border:active?'1px solid #39305E':'1px solid transparent',background:active?'#18142A':'transparent',color:active?'#E9E5FF':'#8C8798',borderRadius:10,padding:'10px 11px',cursor:'pointer',textAlign:'left',fontSize:13,fontWeight:active?700:550}}><span style={{width:18,textAlign:'center',color:active?'#9D8BFF':'#6F6A7A'}}>{item.icon}</span>{item.label}</button>
          })}
        </nav>
        <div style={{marginTop:'auto',borderTop:'1px solid #211F2B',padding:'16px 8px 2px'}}>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:12}}>
            <div style={{width:31,height:31,borderRadius:10,display:'grid',placeItems:'center',background:'#211B3B',color:'#B7A9FF',fontSize:11,fontWeight:800}}>{initials}</div>
            <div style={{minWidth:0}}><div style={{fontSize:11,color:'#C8C3D5',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{email}</div><div style={{fontSize:10,color:'#655F70',marginTop:2}}>Owner access</div></div>
          </div>
          <button onClick={()=>signOut()} style={{width:'100%',border:'1px solid #292634',background:'#111018',color:'#8D879B',borderRadius:9,padding:'9px 10px',cursor:'pointer',fontSize:11}}>Sign out</button>
        </div>
      </aside>
      <main style={{flex:1,minWidth:0}}>
        {view==='home' && <Overview onOpen={setView}/>} 
        {view==='system' && <Placeholder title="System" items={comingSoon.system}/>} 
      </main>
    </div>
  )
}
