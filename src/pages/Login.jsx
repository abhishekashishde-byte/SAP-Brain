import { useState } from 'react'
import { supabase } from '../supabaseClient'

// ── Logo components — using real PNG assets
export const WaniLogo = ({ size = 36, dark = false }) => (
  <img
    src={dark ? '/logo-w-dark.png' : '/logo-w-light.png'}
    alt="Wani"
    style={{ height: size, width: 'auto', display:'block' }}
  />
)

export const WaniWordmark = ({ height = 28, dark = false }) => (
  <img
    src={dark ? '/logo-wordmark-dark.png' : '/logo-wordmark-light.png'}
    alt="wani"
    style={{ height: height, width:'auto', display:'block' }}
  />
)

// ── Shared styles
const labelStyle = { fontSize:10, fontWeight:700, color:'#8A8A8E', letterSpacing:0.8, textTransform:'uppercase', display:'block', marginBottom:6 }
const errorBox   = { marginTop:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626' }
const successBox = { marginTop:10, padding:'8px 12px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, fontSize:12, color:'#15803D', lineHeight:1.5 }
const Spinner    = () => <div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>

function SignInForm({ onSwitch }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) return setError('Please enter email and password.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError('Incorrect email or password.')
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:window.location.origin } })
  }

  return (
    <div style={{ width:'100%', maxWidth:300 }}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#1C1C1E', textAlign:'center', marginBottom:4 }}>Sign In</div>
      <p style={{ fontSize:12, color:'#AEAEB2', textAlign:'center', marginBottom:20 }}>Welcome back to Wani</p>
      <button onClick={handleGoogle} style={{
        width:'100%', padding:'11px', border:'1.5px solid #E8E3D5', borderRadius:12,
        background:'#fff', color:'#3A3A3C', fontSize:13, fontWeight:500,
        fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:10,
        marginBottom:16, transition:'all 0.2s', boxShadow:'2px 2px 6px rgba(0,0,0,0.06)',
      }}
        onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'}
        onMouseLeave={e=>e.currentTarget.style.background='#fff'}
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continue with Google
      </button>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <div style={{ flex:1, height:1, background:'#E8E3D5' }}/><span style={{ fontSize:11, color:'#AEAEB2' }}>or</span><div style={{ flex:1, height:1, background:'#E8E3D5' }}/>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div><label style={labelStyle}>Email</label>
          <input className="nm-input" type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&handleSignIn()} placeholder="you@company.com"/>
        </div>
        <div><label style={labelStyle}>Password</label>
          <input className="nm-input" type="password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&handleSignIn()} placeholder="••••••••"/>
        </div>
      </div>
      {error && <div style={errorBox}>{error}</div>}
      <button className="grad-btn" onClick={handleSignIn} disabled={loading} style={{ marginTop:20 }}>
        {loading ? <Spinner/> : 'SIGN IN →'}
      </button>
      <div style={{ textAlign:'center', marginTop:14, fontSize:12, color:'#AEAEB2' }}>
        No account? <button className="ghost-link" onClick={onSwitch}>Sign up free</button>
      </div>
    </div>
  )
}

function SignUpForm({ onSwitch }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) return setError('Please fill in all fields.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({ email:email.trim(), password, options:{ data:{ name:name.trim() } } })
    setLoading(false)
    if (error) setError(error.message)
    else setSuccess('Account created! You can now sign in.')
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:window.location.origin } })
  }

  return (
    <div style={{ width:'100%', maxWidth:300 }}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#1C1C1E', textAlign:'center', marginBottom:4 }}>Create Account</div>
      <p style={{ fontSize:12, color:'#AEAEB2', textAlign:'center', marginBottom:16 }}>Your private SAP knowledge base</p>
      <button onClick={handleGoogle} style={{
        width:'100%', padding:'11px', border:'1.5px solid #E8E3D5', borderRadius:12,
        background:'#fff', color:'#3A3A3C', fontSize:13, fontWeight:500,
        fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:10,
        marginBottom:14, transition:'all 0.2s', boxShadow:'2px 2px 6px rgba(0,0,0,0.06)',
      }}
        onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'}
        onMouseLeave={e=>e.currentTarget.style.background='#fff'}
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continue with Google
      </button>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, height:1, background:'#E8E3D5' }}/><span style={{ fontSize:11, color:'#AEAEB2' }}>or</span><div style={{ flex:1, height:1, background:'#E8E3D5' }}/>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
        <div><label style={labelStyle}>Name</label><input className="nm-input" type="text" value={name} onChange={e=>{setName(e.target.value);setError('')}} placeholder="Your name"/></div>
        <div><label style={labelStyle}>Email</label><input className="nm-input" type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}} placeholder="you@company.com"/></div>
        <div><label style={labelStyle}>Password</label><input className="nm-input" type="password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}} placeholder="Min. 6 characters"/></div>
        <div><label style={labelStyle}>Confirm Password</label><input className="nm-input" type="password" value={confirm} onChange={e=>{setConfirm(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&handleSignUp()} placeholder="Repeat password"/></div>
      </div>
      {error   && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}
      <button className="grad-btn" onClick={handleSignUp} disabled={loading} style={{ marginTop:14 }}>
        {loading ? <Spinner/> : 'CREATE ACCOUNT →'}
      </button>
      <div style={{ textAlign:'center', marginTop:10, fontSize:12, color:'#AEAEB2' }}>
        Have an account? <button className="ghost-link" onClick={onSwitch}>Sign in</button>
      </div>
    </div>
  )
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg,#F0EDE8 0%,#E8E3DA 50%,#F0EDE8 100%)',
      fontFamily:"'DM Sans',sans-serif", padding:'20px',
    }}>
      <style>{`
        @keyframes slideUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes floatA{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-25px)}}
        @keyframes floatB{0%,100%{transform:translate(0,0)}50%{transform:translate(-25px,20px)}}
        @keyframes floatC{0%,100%{transform:translate(0,0)}50%{transform:translate(15px,25px)}}
        .nm-input{width:100%;padding:11px 14px;box-sizing:border-box;background:#EEE9E0;border:none;border-radius:12px;font-size:13px;color:#1C1C1E;font-family:'DM Sans',sans-serif;box-shadow:inset 3px 3px 7px rgba(0,0,0,0.13),inset -2px -2px 5px rgba(255,255,255,0.75);outline:none;transition:box-shadow 0.2s;}
        .nm-input:focus{box-shadow:inset 4px 4px 9px rgba(0,0,0,0.15),inset -2px -2px 5px rgba(255,255,255,0.75),0 0 0 2px rgba(200,80,192,0.22);}
        .nm-input::placeholder{color:#AEAEB2;}
        .grad-btn{width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(135deg,#C850C0,#FF6B35,#FFCC70);color:#fff;font-size:13px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(200,80,192,0.3);transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:0.3px;}
        .grad-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 22px rgba(200,80,192,0.4);}
        .grad-btn:disabled{opacity:0.55;cursor:not-allowed;}
        .ghost-link{background:none;border:none;cursor:pointer;color:#C850C0;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;text-decoration:underline;text-underline-offset:3px;}
        .ghost-link:hover{opacity:0.72;}
        .panel-btn{padding:10px 28px;background:transparent;border:2px solid rgba(255,255,255,0.6);border-radius:24px;color:#fff;font-size:12px;font-weight:600;letter-spacing:0.6px;font-family:'DM Sans',sans-serif;cursor:pointer;transition:all 0.2s;}
        .panel-btn:hover{background:rgba(255,255,255,0.15);transform:translateY(-1px);}
        @media(max-width:640px){.login-card{flex-direction:column!important;height:auto!important;width:100%!important;}.navy-panel{width:100%!important;min-height:180px;position:relative!important;left:auto!important;top:auto!important;border-radius:16px 16px 0 0!important;}.form-panel{width:100%!important;position:relative!important;top:auto!important;left:auto!important;right:auto!important;opacity:1!important;pointer-events:all!important;padding:28px 24px!important;}}
      `}</style>

      {/* Animated blobs */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', overflow:'hidden' }}>
        <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(200,80,192,0.12) 0%,transparent 70%)', top:'-5%', left:'5%', animation:'floatA 9s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(255,107,53,0.1) 0%,transparent 70%)', bottom:'5%', right:'5%', animation:'floatB 11s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(255,204,112,0.1) 0%,transparent 70%)', top:'40%', right:'20%', animation:'floatC 7s ease-in-out infinite' }}/>
      </div>

      {/* Card */}
      <div className="login-card" style={{
        position:'relative', width:840, maxWidth:'100%', height:520,
        borderRadius:24, overflow:'hidden', display:'flex',
        background:'#EEE9E0',
        boxShadow:'20px 20px 52px rgba(0,0,0,0.13),-8px -8px 24px rgba(255,255,255,0.84)',
        animation:'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>
        {/* Sign In form — RIGHT */}
        <div className="form-panel" style={{
          position:'absolute', top:0, bottom:0, right:0, width:'50%',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'32px 44px', zIndex:1,
          opacity: isSignUp ? 0 : 1, transition:'opacity 0.25s',
          pointerEvents: isSignUp ? 'none' : 'all',
        }}>
          <SignInForm onSwitch={()=>setIsSignUp(true)}/>
        </div>

        {/* Sign Up form — LEFT */}
        <div className="form-panel" style={{
          position:'absolute', top:0, bottom:0, left:0, width:'50%',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'28px 44px', zIndex:1,
          opacity: isSignUp ? 1 : 0, transition:'opacity 0.25s',
          pointerEvents: isSignUp ? 'all' : 'none',
        }}>
          <SignUpForm onSwitch={()=>setIsSignUp(false)}/>
        </div>

        {/* Sliding navy panel */}
        <div className="navy-panel" style={{
          position:'absolute', top:0, bottom:0, width:'50%',
          background:'linear-gradient(145deg,#1A1035 0%,#0F0A2A 50%,#08061A 100%)',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'40px 32px', zIndex:20, overflow:'hidden',
          transition:'left 0.7s cubic-bezier(0.68,-0.1,0.27,1.1)',
          left: isSignUp ? '50%' : '0%',
        }}>
          <div style={{ position:'absolute', width:260, height:260, borderRadius:'50%', background:'radial-gradient(circle,rgba(200,80,192,0.15) 0%,transparent 70%)', top:-60, right:-60 }}/>
          <div style={{ position:'absolute', width:180, height:180, borderRadius:'50%', background:'radial-gradient(circle,rgba(255,107,53,0.12) 0%,transparent 70%)', bottom:20, left:-50 }}/>

          <div style={{ marginBottom:24, display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
            <WaniLogo size={52} dark={true}/>
            <WaniWordmark height={24} dark={true}/>
          </div>

          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#fff', marginBottom:10, lineHeight:1.3 }}>
              {isSignUp ? 'Welcome Back!' : 'Hello!'}
            </div>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', lineHeight:1.8, maxWidth:190 }}>
              {isSignUp ? 'Already have an account? Sign in to continue.' : 'New here? Create your private SAP knowledge base.'}
            </p>
          </div>

          <button className="panel-btn" onClick={()=>setIsSignUp(!isSignUp)}>
            {isSignUp ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </div>
      </div>
    </div>
  )
}
