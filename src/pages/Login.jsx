import { useState } from 'react'
import { supabase } from '../supabaseClient'

export const WaniLogo = ({ size = 36, dark = false }) => (
  <img src={dark ? '/logo-w-dark.png' : '/logo-w-light.png'} alt="Wani"
    style={{ height: size, width: 'auto', display:'block' }} />
)

export const WaniWordmark = ({ height = 28, dark = false }) => (
  <img src={dark ? '/logo-wordmark-dark.png' : '/logo-wordmark-light.png'} alt="wani"
    style={{ height: height, width:'auto', display:'block' }} />
)

const Spinner = () => (
  <div style={{ width:18, height:18, border:'2.5px solid rgba(255,255,255,0.35)',
    borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
)

function GoogleButton({ onClick }) {
  return (
    <button onClick={onClick} style={{
      width:'100%', padding:'12px 16px',
      background:'#fff', border:'1.5px solid #E2E8F0',
      borderRadius:12, cursor:'pointer',
      display:'flex', alignItems:'center', justifyContent:'center', gap:10,
      fontSize:14, fontWeight:500, color:'#1a1a2e',
      fontFamily:"'DM Sans',sans-serif",
      boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
      transition:'all 0.18s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 3px 12px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'}
    >
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continue with Google
    </button>
  )
}

function Divider() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, margin:'4px 0' }}>
      <div style={{ flex:1, height:1, background:'#E2E8F0' }}/>
      <span style={{ fontSize:12, color:'#94A3B8', fontWeight:500 }}>or</span>
      <div style={{ flex:1, height:1, background:'#E2E8F0' }}/>
    </div>
  )
}

function Input({ type, value, onChange, onKeyDown, placeholder, label }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'#64748B',
        letterSpacing:0.7, textTransform:'uppercase' }}>{label}</label>
      <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          width:'100%', padding:'11px 14px', boxSizing:'border-box',
          border:'1.5px solid #E2E8F0', borderRadius:10,
          fontSize:14, color:'#1a1a2e', background:'#FAFBFC',
          fontFamily:"'DM Sans',sans-serif", outline:'none',
          transition:'border-color 0.18s, box-shadow 0.18s',
        }}
        onFocus={e => { e.target.style.borderColor='#4F46E5'; e.target.style.boxShadow='0 0 0 3px rgba(79,70,229,0.1)' }}
        onBlur={e => { e.target.style.borderColor='#E2E8F0'; e.target.style.boxShadow='none' }}
      />
    </div>
  )
}

function SignInForm({ onSwitch }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleGoogle = () =>
    supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:window.location.origin } })

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) return setError('Please enter email and password.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError('Incorrect email or password.')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <GoogleButton onClick={handleGoogle}/>
      <Divider/>
      <Input label="Email" type="email" value={email}
        onChange={e => { setEmail(e.target.value); setError('') }}
        onKeyDown={e => e.key==='Enter' && handleSignIn()}
        placeholder="you@company.com"/>
      <Input label="Password" type="password" value={password}
        onChange={e => { setPassword(e.target.value); setError('') }}
        onKeyDown={e => e.key==='Enter' && handleSignIn()}
        placeholder="••••••••"/>
      {error && (
        <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA',
          borderRadius:8, fontSize:13, color:'#DC2626' }}>{error}</div>
      )}
      <button onClick={handleSignIn} disabled={loading} style={{
        width:'100%', padding:'13px', border:'none', borderRadius:12,
        background: loading ? '#94A3B8' : 'linear-gradient(135deg,#4F46E5,#7C3AED)',
        color:'#fff', fontSize:14, fontWeight:700,
        fontFamily:"'DM Sans',sans-serif", cursor: loading ? 'not-allowed' : 'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        boxShadow: loading ? 'none' : '0 4px 14px rgba(79,70,229,0.35)',
        transition:'all 0.2s',
      }}>
        {loading ? <Spinner/> : 'Sign In →'}
      </button>
      <p style={{ textAlign:'center', fontSize:13, color:'#94A3B8', margin:0 }}>
        No account?{' '}
        <button onClick={onSwitch} style={{ background:'none', border:'none', cursor:'pointer',
          color:'#4F46E5', fontWeight:600, fontSize:13, fontFamily:"'DM Sans',sans-serif",
          textDecoration:'underline', textUnderlineOffset:3 }}>Sign up free</button>
      </p>
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

  const handleGoogle = () =>
    supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:window.location.origin } })

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) return setError('Please fill in all fields.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { name: name.trim() } }
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSuccess('Account created! Check your email to confirm, then sign in.')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <GoogleButton onClick={handleGoogle}/>
      <Divider/>
      <Input label="Name" type="text" value={name}
        onChange={e => { setName(e.target.value); setError('') }}
        placeholder="Your name"/>
      <Input label="Email" type="email" value={email}
        onChange={e => { setEmail(e.target.value); setError('') }}
        placeholder="you@company.com"/>
      <Input label="Password" type="password" value={password}
        onChange={e => { setPassword(e.target.value); setError('') }}
        placeholder="Min. 6 characters"/>
      <Input label="Confirm Password" type="password" value={confirm}
        onChange={e => { setConfirm(e.target.value); setError('') }}
        onKeyDown={e => e.key==='Enter' && handleSignUp()}
        placeholder="Repeat password"/>
      {error && (
        <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA',
          borderRadius:8, fontSize:13, color:'#DC2626' }}>{error}</div>
      )}
      {success && (
        <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0',
          borderRadius:8, fontSize:13, color:'#15803D', lineHeight:1.6 }}>{success}</div>
      )}
      <button onClick={handleSignUp} disabled={loading} style={{
        width:'100%', padding:'13px', border:'none', borderRadius:12,
        background: loading ? '#94A3B8' : 'linear-gradient(135deg,#4F46E5,#7C3AED)',
        color:'#fff', fontSize:14, fontWeight:700,
        fontFamily:"'DM Sans',sans-serif", cursor: loading ? 'not-allowed' : 'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        boxShadow: loading ? 'none' : '0 4px 14px rgba(79,70,229,0.35)',
        transition:'all 0.2s',
      }}>
        {loading ? <Spinner/> : 'Create Account →'}
      </button>
      <p style={{ textAlign:'center', fontSize:13, color:'#94A3B8', margin:0 }}>
        Have an account?{' '}
        <button onClick={onSwitch} style={{ background:'none', border:'none', cursor:'pointer',
          color:'#4F46E5', fontWeight:600, fontSize:13, fontFamily:"'DM Sans',sans-serif",
          textDecoration:'underline', textUnderlineOffset:3 }}>Sign in</button>
      </p>
    </div>
  )
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)

  return (
    <div style={{
      minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg,#F8F7FF 0%,#EEF2FF 50%,#F0F4FF 100%)',
      fontFamily:"'DM Sans',sans-serif", padding:'20px',
      position:'relative', overflow:'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,-30px)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-25px,20px)} }
      `}</style>

      {/* Background blobs */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', width:600, height:600, borderRadius:'50%',
          background:'radial-gradient(circle,rgba(79,70,229,0.08) 0%,transparent 70%)',
          top:'-10%', left:'-10%', animation:'float1 12s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%',
          background:'radial-gradient(circle,rgba(124,58,237,0.07) 0%,transparent 70%)',
          bottom:'-10%', right:'-5%', animation:'float2 15s ease-in-out infinite' }}/>
      </div>

      {/* Card */}
      <div style={{
        position:'relative', zIndex:1,
        width:'100%', maxWidth:420,
        background:'#ffffff',
        borderRadius:20,
        boxShadow:'0 8px 40px rgba(79,70,229,0.12), 0 1px 3px rgba(0,0,0,0.06)',
        padding:'36px 36px 32px',
        animation:'fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, marginBottom:28 }}>
          <WaniLogo size={48} dark={false}/>
          <WaniWordmark height={22} dark={false}/>
          <p style={{ fontSize:13, color:'#94A3B8', margin:0, marginTop:2 }}>
            {isSignUp ? 'Create your SAP AI account' : 'Welcome back to Wani'}
          </p>
        </div>

        {/* Title */}
        <h1 style={{ fontSize:20, fontWeight:700, color:'#1a1a2e', textAlign:'center',
          margin:'0 0 20px', fontFamily:"'DM Sans',sans-serif" }}>
          {isSignUp ? 'Create Account' : 'Sign In'}
        </h1>

        {/* Form */}
        {isSignUp
          ? <SignUpForm onSwitch={() => setIsSignUp(false)}/>
          : <SignInForm onSwitch={() => setIsSignUp(true)}/>
        }
      </div>
    </div>
  )
}
