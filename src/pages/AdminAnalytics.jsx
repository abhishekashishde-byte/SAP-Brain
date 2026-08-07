import { useEffect, useMemo, useState } from 'react'

const card={background:'#12121A',border:'1px solid rgba(255,255,255,.08)',borderRadius:16,padding:18}

function Metric({label,value,hint}){return <div style={card}><div style={{fontSize:12,color:'#8A849E',marginBottom:8}}>{label}</div><div style={{fontSize:28,fontWeight:760,color:'#F4F1FF'}}>{value}</div>{hint&&<div style={{fontSize:11,color:'#69647C',marginTop:6}}>{hint}</div>}</div>}

export default function AdminAnalytics({onClose}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const load=async()=>{setLoading(true);setError('');try{const r=await fetch('/api/recall',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin_dashboard'})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Could not load analytics');setData(b)}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load();const id=setInterval(load,60000);return()=>clearInterval(id)},[])
  const ranked=useMemo(()=>[...(data?.users||[])].sort((a,b)=>(b.questionsMonth||0)-(a.questionsMonth||0)).slice(0,10),[data])
  const adoption=useMemo(()=>{if(!data?.summary?.totalUsers)return 0;return Math.round((data.summary.activeToday/data.summary.totalUsers)*100)},[data])
  return <div style={{minHeight:'100dvh',background:'#0A0A12',color:'#F4F1FF',padding:24,fontFamily:"'Inter',sans-serif"}}><div style={{maxWidth:1250,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:24}}><div><div style={{fontSize:12,color:'#7F78A7',fontWeight:800,letterSpacing:1.1,textTransform:'uppercase'}}>Wani Admin</div><h1 style={{margin:'6px 0 0',fontSize:28}}>Analytics</h1></div><div style={{display:'flex',gap:8}}><button onClick={load} style={{padding:'9px 14px',borderRadius:10,border:'1px solid #343044',background:'#171522',color:'#D8D3EA'}}>Refresh</button><button onClick={onClose} style={{padding:'9px 14px',borderRadius:10,border:'1px solid #4F46E5',background:'#4F46E5',color:'#fff'}}>Admin Home</button></div></div>
    {error&&<div style={{...card,borderColor:'rgba(239,68,68,.4)',color:'#FCA5A5',marginBottom:18}}>{error}</div>}
    {loading&&!data?<div style={{color:'#8A849E'}}>Loading analytics…</div>:data&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginBottom:18}}><Metric label="Total users" value={data.summary.totalUsers}/><Metric label="Active today" value={data.summary.activeToday}/><Metric label="Online now" value={data.summary.onlineNow}/><Metric label="Questions today" value={data.summary.questionsToday}/><Metric label="Questions this month" value={data.summary.questionsMonth}/><Metric label="Daily adoption" value={`${adoption}%`} hint="Users active today ÷ registered users"/></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:14}}>
        <div style={card}><div style={{fontWeight:750,marginBottom:14}}>Top users this month</div>{ranked.map((u,i)=><div key={u.id} style={{display:'grid',gridTemplateColumns:'28px 1fr auto',gap:10,alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}><div style={{color:'#6F6A7A',fontSize:12}}>{i+1}</div><div><div style={{fontSize:13}}>{u.name}</div><div style={{fontSize:11,color:'#6F6A7A'}}>{u.email}</div></div><div style={{fontWeight:750,color:'#C4B5FD'}}>{u.questionsMonth||0}</div></div>)}{!ranked.length&&<div style={{color:'#77718B'}}>No usage yet.</div>}</div>
        <div style={card}><div style={{fontWeight:750,marginBottom:14}}>Access mix</div>{[['Active',data.summary.approvedUsers,'#86EFAC'],['Pending',data.summary.pendingUsers||0,'#FCD34D'],['Suspended',data.summary.suspendedUsers||0,'#FCA5A5']].map(([l,v,c])=><div key={l} style={{marginBottom:16}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:7}}><span style={{color:'#A9A4BA'}}>{l}</span><span style={{color:c,fontWeight:750}}>{v}</span></div><div style={{height:7,borderRadius:999,background:'#1D1A25',overflow:'hidden'}}><div style={{height:'100%',width:`${data.summary.totalUsers?Math.min(100,(v/data.summary.totalUsers)*100):0}%`,background:c}}/></div></div>)}</div>
      </div>
      <div style={{marginTop:14,fontSize:11,color:'#5E596C'}}>Analytics are based on persisted account activity and credit-usage records. No inferred or fabricated usage values are shown.</div>
    </>}
  </div></div>
}
