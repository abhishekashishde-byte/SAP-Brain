import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [isSignUp, setIsSignUp]   = useState(false)
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  const reset = () => { setError(''); setSuccess(''); setName(''); setEmail(''); setPassword('') }
  const switchTo = (signup) => { reset(); setIsSignUp(signup) }

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) return setError('Please fill in all fields.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { name: name.trim() } }
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSuccess('Account created! Check your email to confirm, then sign in.')
  }

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) return setError('Please enter email and password.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message)
  }

  const handleSubmit = () => isSignUp ? handleSignUp() : handleSignIn()

  return (
    <div style={{
      height:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg,#F0EDE8 0%,#E8E3DA 50%,#F0EDE8 100%)',
      fontFamily:"'DM Sans',sans-serif", overflow:'hidden',
    }}>
      <style>{`
        @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%,100%{opacity:1}50%{opacity:0.7}}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .nm-input{width:100%;padding:13px 16px;background:#EEE9E0;border:none;border-radius:12px;font-size:14px;color:#1C1C1E;font-family:'DM Sans',sans-serif;box-shadow:inset 3px 3px 7px rgba(0,0,0,0.12),inset -2px -2px 5px rgba(255,255,255,0.7);transition:box-shadow 0.2s;outline:none;}
        .nm-input:focus{box-shadow:inset 4px 4px 9px rgba(0,0,0,0.15),inset -2px -2px 5px rgba(255,255,255,0.7),0 0 0 2px rgba(184,150,12,0.25);}
        .nm-input::placeholder{color:#AEAEB2;}
        .nm-btn-primary{width:100%;padding:13px;background:linear-gradient(135deg,#C9A84C,#8B6F09);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;box-shadow:4px 4px 10px rgba(139,111,9,0.35),-2px -2px 6px rgba(255,255,255,0.2);transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;}
        .nm-btn-primary:hover:not(:disabled){box-shadow:6px 6px 14px rgba(139,111,9,0.4),-2px -2px 8px rgba(255,255,255,0.2);transform:translateY(-1px);}
        .nm-btn-primary:disabled{opacity:0.6;cursor:not-allowed;}
        .nm-btn-ghost{background:none;border:none;cursor:pointer;color:#C9A84C;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;text-decoration:underline;text-underline-offset:3px;transition:opacity 0.15s;}
        .nm-btn-ghost:hover{opacity:0.75;}
        .panel-btn{padding:11px 28px;background:transparent;border:2px solid rgba(255,255,255,0.7);border-radius:24px;color:#fff;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;letter-spacing:0.5px;transition:all 0.2s;}
        .panel-btn:hover{background:rgba(255,255,255,0.15);transform:translateY(-1px);}
      `}</style>

      {/* Background orbs */}
      <div style={{position:'fixed',inset:0,pointerEvents:'none',overflow:'hidden'}}>
        <div style={{position:'absolute',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(184,150,12,0.07) 0%,transparent 70%)',top:'5%',left:'10%'}}/>
        <div style={{position:'absolute',width:350,height:350,borderRadius:'50%',background:'radial-gradient(circle,rgba(30,58,95,0.07) 0%,transparent 70%)',bottom:'10%',right:'10%'}}/>
      </div>

      {/* Card */}
      <div style={{
        width:820, maxWidth:'95vw', height:520,
        borderRadius:24, overflow:'hidden', display:'flex', position:'relative',
        background:'#EEE9E0',
        boxShadow:'20px 20px 50px rgba(0,0,0,0.15),-8px -8px 24px rgba(255,255,255,0.8)',
        animation:'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>

        {/* Navy panel */}
        <div style={{
          width:'42%', flexShrink:0,
          background:'linear-gradient(145deg,#1E3A5F 0%,#0F2040 60%,#0A1628 100%)',
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          padding:'40px 36px', position:'absolute',
          top:0, bottom:0, left:0, width:'42%',
          transition:'transform 0.65s cubic-bezier(0.68,-0.15,0.27,1.15)',
          transform: isSignUp ? 'translateX(138%)' : 'translateX(0)',
          zIndex:2, overflow:'hidden',
          borderRadius:'0 20px 20px 0',
        }}>
          {/* Decorative circles */}
          <div style={{position:'absolute',width:220,height:220,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.06)',top:-40,right:-40}}/>
          <div style={{position:'absolute',width:160,height:160,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.04)',bottom:40,left:-40}}/>
          <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:'1px solid rgba(184,150,12,0.2)',top:'42%',right:'18%'}}/>

          {/* Logo */}
          <div style={{marginBottom:28,display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
            <div style={{
              width:52,height:52,borderRadius:14,
              background:'linear-gradient(135deg,#C9A84C,#8B6F09)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:18,fontWeight:700,color:'#fff',
              boxShadow:'0 6px 20px rgba(184,150,12,0.4)',
            }}>S4</div>
            <span style={{
              fontFamily:"'Playfair Display',serif",
              fontSize:22,fontWeight:600,color:'#fff',letterSpacing:0.5,
            }}>SAP Brain</span>
          </div>

          <div style={{textAlign:'center',marginBottom:32}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:600,color:'#fff',marginBottom:10}}>
              {isSignUp ? 'Welcome Back!' : 'Hello!'}
            </div>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.55)',lineHeight:1.7,maxWidth:190}}>
              {isSignUp
                ? 'Already have an account? Sign in below.'
                : 'New here? Create your private SAP knowledge base.'}
            </p>
          </div>

          <button className="panel-btn" onClick={()=>switchTo(!isSignUp)}>
            {isSignUp ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </div>

        {/* Sign In form */}
        <div style={{
          position:'absolute', top:0, bottom:0, left:0, width:'58%',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'40px 48px',
          transition:'opacity 0.3s, transform 0.3s',
          opacity: isSignUp ? 0 : 1,
          pointerEvents: isSignUp ? 'none' : 'all',
          transform: isSignUp ? 'translateX(-20px)' : 'translateX(0)',
        }}>
          <div style={{width:'100%',maxWidth:280}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600,color:'#1C1C1E',marginBottom:4,textAlign:'center'}}>Sign In</div>
            <p style={{fontSize:12,color:'#AEAEB2',textAlign:'center',marginBottom:24}}>Welcome back to SAP Brain</p>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#8A8A8E',letterSpacing:0.8,textTransform:'uppercase',display:'block',marginBottom:6}}>Email</label>
                <input className="nm-input" type="email" value={!isSignUp?email:''} onChange={e=>{setEmail(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&!isSignUp&&handleSubmit()} placeholder="you@company.com"/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#8A8A8E',letterSpacing:0.8,textTransform:'uppercase',display:'block',marginBottom:6}}>Password</label>
                <input className="nm-input" type="password" value={!isSignUp?password:''} onChange={e=>{setPassword(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&!isSignUp&&handleSubmit()} placeholder="••••••••"/>
              </div>
            </div>
            {!isSignUp && error && <div style={{marginTop:10,padding:'8px 12px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,fontSize:12,color:'#DC2626'}}>{error}</div>}
            <button className="nm-btn-primary" onClick={()=>!isSignUp&&handleSubmit()} disabled={loading} style={{marginTop:20}}>
              {loading&&!isSignUp?<div style={{width:16,height:16,border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>:'SIGN IN →'}
            </button>
            <div style={{textAlign:'center',marginTop:14}}>
              <span style={{fontSize:12,color:'#AEAEB2'}}>No account? </span>
              <button className="nm-btn-ghost" onClick={()=>switchTo(true)}>Sign up free</button>
            </div>
          </div>
        </div>

        {/* Sign Up form */}
        <div style={{
          position:'absolute', top:0, bottom:0, right:0, width:'58%',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'40px 48px',
          transition:'opacity 0.3s, transform 0.3s',
          opacity: isSignUp ? 1 : 0,
          pointerEvents: isSignUp ? 'all' : 'none',
          transform: isSignUp ? 'translateX(0)' : 'translateX(20px)',
        }}>
          <div style={{width:'100%',maxWidth:280}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600,color:'#1C1C1E',marginBottom:4,textAlign:'center'}}>Create Account</div>
            <p style={{fontSize:12,color:'#AEAEB2',textAlign:'center',marginBottom:20}}>Your private SAP knowledge base</p>
            <div style={{display:'flex',flexDirection:'column',gap:11}}>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#8A8A8E',letterSpacing:0.8,textTransform:'uppercase',display:'block',marginBottom:6}}>Name</label>
                <input className="nm-input" type="text" value={isSignUp?name:''} onChange={e=>{setName(e.target.value);setError('')}} placeholder="Your name"/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#8A8A8E',letterSpacing:0.8,textTransform:'uppercase',display:'block',marginBottom:6}}>Email</label>
                <input className="nm-input" type="email" value={isSignUp?email:''} onChange={e=>{setEmail(e.target.value);setError('')}} placeholder="you@company.com"/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#8A8A8E',letterSpacing:0.8,textTransform:'uppercase',display:'block',marginBottom:6}}>Password</label>
                <input className="nm-input" type="password" value={isSignUp?password:''} onChange={e=>{setPassword(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&isSignUp&&handleSubmit()} placeholder="Min. 6 characters"/>
              </div>
            </div>
            {isSignUp && error && <div style={{marginTop:10,padding:'8px 12px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,fontSize:12,color:'#DC2626'}}>{error}</div>}
            {isSignUp && success && <div style={{marginTop:10,padding:'8px 12px',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:8,fontSize:12,color:'#15803D',lineHeight:1.5}}>{success}</div>}
            <button className="nm-btn-primary" onClick={()=>isSignUp&&handleSubmit()} disabled={loading} style={{marginTop:18}}>
              {loading&&isSignUp?<div style={{width:16,height:16,border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>:'CREATE ACCOUNT →'}
            </button>
            <div style={{textAlign:'center',marginTop:14}}>
              <span style={{fontSize:12,color:'#AEAEB2'}}>Have an account? </span>
              <button className="nm-btn-ghost" onClick={()=>switchTo(false)}>Sign in</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
