import { useState } from 'react'
import { supabase } from '../supabaseClient'

export const WaniLogo = ({ size = 36, dark = false }) => (
  <img src={dark ? '/logo-w-dark.png' : '/logo-w-light.png'} alt="Wani"
    style={{ height: size, width: 'auto', display:'block' }}/>
)
export const WaniWordmark = ({ height = 28, dark = false }) => (
  <img src={dark ? '/logo-wordmark-dark.png' : '/logo-wordmark-light.png'} alt="wani"
    style={{ height: height, width:'auto', display:'block' }}/>
)

const labelStyle = { fontSize:14, fontWeight:600, color:'#5A5A6E', letterSpacing:0.3, display:'block', marginBottom:8 }
const errorBox   = { marginTop:12, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, fontSize:14, color:'#DC2626' }
const successBox = { marginTop:12, padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, fontSize:14, color:'#15803D', lineHeight:1.6 }
const Spinner    = () => <div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>

const GoogleSVG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
)

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
    <div style={{ width:'100%' }}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:600, color:'#1C1C1E', marginBottom:6 }}>Sign In</div>
      <p style={{ fontSize:15, color:'#8A8A9E', marginBottom:28 }}>Welcome back to Wani</p>

      <button onClick={handleGoogle} style={{
        width:'100%', padding:'14px', border:'1.5px solid #E0DDD8', borderRadius:14,
        background:'#fff', color:'#3A3A3C', fontSize:15, fontWeight:500,
        fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:12,
        marginBottom:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <GoogleSVG/> Continue with Google
      </button>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <div style={{ flex:1, height:1, background:'#E0DDD8' }}/><span style={{ fontSize:13, color:'#AEAEB2' }}>or</span><div style={{ flex:1, height:1, background:'#E0DDD8' }}/>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input className="login-input" type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}}
            onKeyDown={e=>e.key==='Enter'&&handleSignIn()} placeholder="you@company.com"/>
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input className="login-input" type="password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}}
            onKeyDown={e=>e.key==='Enter'&&handleSignIn()} placeholder="••••••••"/>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <button className="login-btn" onClick={handleSignIn} disabled={loading} style={{ marginTop:24 }}>
        {loading ? <Spinner/> : 'Sign In →'}
      </button>

      <div style={{ textAlign:'center', marginTop:18, fontSize:15, color:'#8A8A9E' }}>
        No account? <button className="switch-link" onClick={onSwitch}>Sign up free</button>
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
    else setSuccess('Account created! Check your email to confirm, then sign in.')
  }
  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:window.location.origin } })
  }

  return (
    <div style={{ width:'100%' }}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:600, color:'#1C1C1E', marginBottom:6 }}>Create Account</div>
      <p style={{ fontSize:15, color:'#8A8A9E', marginBottom:28 }}>Your private SAP knowledge base</p>

      <button onClick={handleGoogle} style={{
        width:'100%', padding:'14px', border:'1.5px solid #E0DDD8', borderRadius:14,
        background:'#fff', color:'#3A3A3C', fontSize:15, fontWeight:500,
        fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:12,
        marginBottom:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <GoogleSVG/> Continue with Google
      </button>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <div style={{ flex:1, height:1, background:'#E0DDD8' }}/><span style={{ fontSize:13, color:'#AEAEB2' }}>or</span><div style={{ flex:1, height:1, background:'#E0DDD8' }}/>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div><label style={labelStyle}>Name</label><input className="login-input" type="text" value={name} onChange={e=>{setName(e.target.value);setError('')}} placeholder="Your name"/></div>
        <div><label style={labelStyle}>Email</label><input className="login-input" type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}} placeholder="you@company.com"/></div>
        <div><label style={labelStyle}>Password</label><input className="login-input" type="password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}} placeholder="Min. 6 characters"/></div>
        <div><label style={labelStyle}>Confirm Password</label><input className="login-input" type="password" value={confirm} onChange={e=>{setConfirm(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&handleSignUp()} placeholder="Repeat password"/></div>
      </div>

      {error   && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}

      <button className="login-btn" onClick={handleSignUp} disabled={loading} style={{ marginTop:22 }}>
        {loading ? <Spinner/> : 'Create Account →'}
      </button>

      <div style={{ textAlign:'center', marginTop:18, fontSize:15, color:'#8A8A9E' }}>
        Have an account? <button className="switch-link" onClick={onSwitch}>Sign in</button>
      </div>
    </div>
  )
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)

  return (
    <div style={{
      minHeight:'100vh',
      minHeight:'100dvh', // dynamic viewport height — fixes mobile browser chrome
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      background:'linear-gradient(145deg,#F5F2EE 0%,#EDE8E0 100%)',
      fontFamily:"'DM Sans',sans-serif",
      overflowY:'auto', // scrollable on mobile
      padding:'24px 16px 40px',
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .login-card {
          width: 100%;
          max-width: 420px;
          background: #F5F2EE;
          border-radius: 24px;
          padding: 40px 32px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.1);
          animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
          margin-top: auto;
          margin-bottom: auto;
        }
        .login-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 32px;
          justify-content: center;
        }
        .login-tabs {
          display: flex;
          background: #EAE6E0;
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 32px;
        }
        .login-tab {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 9px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.2s;
          background: transparent;
          color: #8A8A9E;
        }
        .login-tab.active {
          background: #fff;
          color: #1C1C1E;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .login-input {
          width: 100%;
          padding: 14px 16px;
          box-sizing: border-box;
          background: #fff;
          border: 1.5px solid #E0DDD8;
          border-radius: 12px;
          font-size: 15px;
          color: #1C1C1E;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .login-input:focus {
          border-color: #4F46E5;
          box-shadow: 0 0 0 3px rgba(79,70,229,0.1);
        }
        .login-input::placeholder { color: #AEAEB2; }
        .login-btn {
          width: 100%;
          padding: 15px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg,#1a1a2e,#4F46E5);
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 16px rgba(79,70,229,0.3);
        }
        .login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(79,70,229,0.4); }
        .login-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .switch-link {
          background: none; border: none; cursor: pointer;
          color: #4F46E5; font-size: 15px; font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          text-decoration: underline; text-underline-offset: 3px;
        }
        .switch-link:hover { opacity: 0.75; }
      `}</style>

      <div style={{ width:'100%', maxWidth:420, marginTop:'auto', marginBottom:'auto' }}>
        <div className="login-card">
          {/* Logo */}
          <div className="login-logo">
            <WaniLogo size={36} dark={false}/>
            <WaniWordmark height={20} dark={false}/>
          </div>

          {/* Tabs — Sign In / Create Account */}
          <div className="login-tabs">
            <button className={`login-tab${!isSignUp?' active':''}`} onClick={()=>setIsSignUp(false)}>Sign In</button>
            <button className={`login-tab${isSignUp?' active':''}`}  onClick={()=>setIsSignUp(true)}>Create Account</button>
          </div>

          {/* Forms */}
          {!isSignUp ? (
            <SignInForm onSwitch={()=>setIsSignUp(true)}/>
          ) : (
            <SignUpForm onSwitch={()=>setIsSignUp(false)}/>
          )}
        </div>
      </div>
    </div>
  )
}
