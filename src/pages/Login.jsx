import { useState } from 'react'
import { supabase } from '../supabaseClient'

const WaniLogo = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#C850C0"/>
        <stop offset="100%" stopColor="#FFCC70"/>
      </linearGradient>
      <linearGradient id="g2" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFCC70"/>
        <stop offset="100%" stopColor="#C850C0"/>
      </linearGradient>
    </defs>
    {/* Top-left circle */}
    <circle cx="32" cy="32" r="19" stroke="url(#g1)" strokeWidth="8" fill="none"/>
    {/* Top-right circle */}
    <circle cx="68" cy="32" r="19" stroke="url(#g2)" strokeWidth="8" fill="none"/>
    {/* Bottom-left circle */}
    <circle cx="32" cy="68" r="19" stroke="url(#g2)" strokeWidth="8" fill="none"/>
    {/* Bottom-right circle */}
    <circle cx="68" cy="68" r="19" stroke="url(#g1)" strokeWidth="8" fill="none"/>
  </svg>
)

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

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
    else setSuccess('Account created! You can now sign in.')
  }

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) return setError('Please enter email and password.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError('Incorrect email or password.')
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#F0EDE8 0%,#E8E3DA 50%,#F0EDE8 100%)',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <style>{`
        @keyframes slideUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes fadein  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .nm-input {
          width:100%; padding:12px 15px; box-sizing:border-box;
          background:#EEE9E0; border:none; border-radius:12px;
          font-size:14px; color:#1C1C1E; font-family:'DM Sans',sans-serif;
          box-shadow: inset 3px 3px 7px rgba(0,0,0,0.13), inset -2px -2px 5px rgba(255,255,255,0.75);
          outline:none; transition:box-shadow 0.2s;
        }
        .nm-input:focus {
          box-shadow: inset 4px 4px 9px rgba(0,0,0,0.15), inset -2px -2px 5px rgba(255,255,255,0.75),
                      0 0 0 2px rgba(184,150,12,0.22);
        }
        .nm-input::placeholder { color:#AEAEB2; }

        .gold-btn {
          width:100%; padding:13px; border:none; border-radius:12px;
          background:linear-gradient(135deg,#C9A84C,#8B6F09);
          color:#fff; font-size:14px; font-weight:600;
          font-family:'DM Sans',sans-serif; cursor:pointer; letter-spacing:0.3px;
          box-shadow: 4px 4px 12px rgba(139,111,9,0.35), -1px -1px 4px rgba(255,255,255,0.12);
          transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:8px;
        }
        .gold-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:5px 5px 16px rgba(139,111,9,0.42); }
        .gold-btn:disabled { opacity:0.55; cursor:not-allowed; }

        .ghost-link {
          background:none; border:none; cursor:pointer;
          color:#B8960C; font-size:13px; font-weight:600;
          font-family:'DM Sans',sans-serif;
          text-decoration:underline; text-underline-offset:3px;
          transition:opacity 0.15s;
        }
        .ghost-link:hover { opacity:0.72; }

        .panel-btn {
          padding:10px 30px; background:transparent;
          border:2px solid rgba(255,255,255,0.6); border-radius:24px;
          color:#fff; font-size:13px; font-weight:600; letter-spacing:0.6px;
          font-family:'DM Sans',sans-serif; cursor:pointer; transition:all 0.2s;
        }
        .panel-btn:hover { background:rgba(255,255,255,0.13); transform:translateY(-1px); }
      `}</style>

      {/* Soft background orbs */}
      <div style={{position:'fixed',inset:0,pointerEvents:'none',overflow:'hidden'}}>
        <div style={{position:'absolute',width:520,height:520,borderRadius:'50%',background:'radial-gradient(circle,rgba(200,80,192,0.05) 0%,transparent 70%)',top:'0%',left:'5%'}}/>
        <div style={{position:'absolute',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(184,150,12,0.06) 0%,transparent 70%)',bottom:'5%',right:'5%'}}/>
        <div style={{position:'absolute',width:280,height:280,borderRadius:'50%',background:'radial-gradient(circle,rgba(30,58,95,0.05) 0%,transparent 70%)',top:'30%',right:'20%'}}/>
      </div>

      {/* ── CARD */}
      <div style={{
        position:'relative', width:840, maxWidth:'96vw', height:530,
        borderRadius:24, overflow:'hidden',
        background:'#EEE9E0',
        boxShadow:'20px 20px 52px rgba(0,0,0,0.13), -8px -8px 24px rgba(255,255,255,0.84)',
        animation:'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>

        {/* 
          LAYOUT LOGIC:
          - Sign In mode  (isSignUp=false): Navy panel LEFT  | Sign In form RIGHT
          - Sign Up mode  (isSignUp=true) : Sign Up form LEFT | Navy panel RIGHT
          
          Both forms sit permanently in their half.
          Navy panel (z-index 10) slides left ↔ right and covers the inactive form.
        */}

        {/* ── Sign In form — always RIGHT half */}
        <div style={{
          position:'absolute', top:0, bottom:0, right:0, width:'50%',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'40px 48px', zIndex:1,
        }}>
          <div style={{width:'100%', maxWidth:280, animation:'fadein 0.3s ease'}}>
            <div style={{fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#1C1C1E', textAlign:'center', marginBottom:4}}>Sign In</div>
            <p style={{fontSize:12, color:'#AEAEB2', textAlign:'center', marginBottom:24}}>Welcome back to Wani</p>
            <div style={{display:'flex', flexDirection:'column', gap:12}}>
              <div>
                <label style={{fontSize:10, fontWeight:600, color:'#8A8A8E', letterSpacing:0.8, textTransform:'uppercase', display:'block', marginBottom:6}}>Email</label>
                <input className="nm-input" type="email"
                  value={!isSignUp ? email : ''}
                  onChange={e=>{setEmail(e.target.value); setError('')}}
                  onKeyDown={e=>e.key==='Enter' && !isSignUp && handleSignIn()}
                  placeholder="you@company.com"/>
              </div>
              <div>
                <label style={{fontSize:10, fontWeight:600, color:'#8A8A8E', letterSpacing:0.8, textTransform:'uppercase', display:'block', marginBottom:6}}>Password</label>
                <input className="nm-input" type="password"
                  value={!isSignUp ? password : ''}
                  onChange={e=>{setPassword(e.target.value); setError('')}}
                  onKeyDown={e=>e.key==='Enter' && !isSignUp && handleSignIn()}
                  placeholder="••••••••"/>
              </div>
            </div>
            {!isSignUp && error && (
              <div style={{marginTop:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626'}}>{error}</div>
            )}
            <button className="gold-btn" onClick={handleSignIn} disabled={loading} style={{marginTop:20}}>
              {loading && !isSignUp
                ? <div style={{width:16, height:16, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite'}}/>
                : 'SIGN IN →'}
            </button>
            <div style={{textAlign:'center', marginTop:14, fontSize:12, color:'#AEAEB2'}}>
              No account? <button className="ghost-link" onClick={()=>switchTo(true)}>Sign up free</button>
            </div>
          </div>
        </div>

        {/* ── Sign Up form — always LEFT half */}
        <div style={{
          position:'absolute', top:0, bottom:0, left:0, width:'50%',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'36px 48px', zIndex:1,
        }}>
          <div style={{width:'100%', maxWidth:280, animation:'fadein 0.3s ease'}}>
            <div style={{fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#1C1C1E', textAlign:'center', marginBottom:4}}>Create Account</div>
            <p style={{fontSize:12, color:'#AEAEB2', textAlign:'center', marginBottom:18}}>Your private SAP knowledge base</p>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              <div>
                <label style={{fontSize:10, fontWeight:600, color:'#8A8A8E', letterSpacing:0.8, textTransform:'uppercase', display:'block', marginBottom:6}}>Name</label>
                <input className="nm-input" type="text"
                  value={isSignUp ? name : ''}
                  onChange={e=>{setName(e.target.value); setError('')}}
                  placeholder="Your name"/>
              </div>
              <div>
                <label style={{fontSize:10, fontWeight:600, color:'#8A8A8E', letterSpacing:0.8, textTransform:'uppercase', display:'block', marginBottom:6}}>Email</label>
                <input className="nm-input" type="email"
                  value={isSignUp ? email : ''}
                  onChange={e=>{setEmail(e.target.value); setError('')}}
                  placeholder="you@company.com"/>
              </div>
              <div>
                <label style={{fontSize:10, fontWeight:600, color:'#8A8A8E', letterSpacing:0.8, textTransform:'uppercase', display:'block', marginBottom:6}}>Password</label>
                <input className="nm-input" type="password"
                  value={isSignUp ? password : ''}
                  onChange={e=>{setPassword(e.target.value); setError('')}}
                  onKeyDown={e=>e.key==='Enter' && isSignUp && handleSignUp()}
                  placeholder="Min. 6 characters"/>
              </div>
            </div>
            {isSignUp && error && (
              <div style={{marginTop:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626'}}>{error}</div>
            )}
            {isSignUp && success && (
              <div style={{marginTop:10, padding:'8px 12px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, fontSize:12, color:'#15803D', lineHeight:1.5}}>{success}</div>
            )}
            <button className="gold-btn" onClick={handleSignUp} disabled={loading} style={{marginTop:16}}>
              {loading && isSignUp
                ? <div style={{width:16, height:16, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite'}}/>
                : 'CREATE ACCOUNT →'}
            </button>
            <div style={{textAlign:'center', marginTop:12, fontSize:12, color:'#AEAEB2'}}>
              Have an account? <button className="ghost-link" onClick={()=>switchTo(false)}>Sign in</button>
            </div>
          </div>
        </div>

        {/* ── Navy sliding panel — covers whichever form is inactive */}
        <div style={{
          position:'absolute', top:0, bottom:0, width:'50%',
          background:'linear-gradient(145deg,#1E3A5F 0%,#0F2040 58%,#0A1628 100%)',
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          padding:'44px 36px',
          zIndex:20,
          transition:'left 0.7s cubic-bezier(0.68,-0.1,0.27,1.1)',
          left: isSignUp ? '50%' : '0%',
          overflow:'hidden',
        }}>
          {/* Decorative rings */}
          <div style={{position:'absolute',width:260,height:260,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.05)',top:-60,right:-60}}/>
          <div style={{position:'absolute',width:180,height:180,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.04)',bottom:20,left:-50}}/>
          <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:'1px solid rgba(200,168,76,0.18)',top:'40%',right:'22%'}}/>

          {/* Wani Logo */}
          <div style={{marginBottom:20, display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
            <WaniLogo size={56} />
            <span style={{
              fontFamily:"'Playfair Display',serif",
              fontSize:26, fontWeight:600, color:'#fff', letterSpacing:1,
            }}>Wani</span>
          </div>

          <div style={{textAlign:'center', marginBottom:30}}>
            <div style={{fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:600, color:'#fff', marginBottom:10, lineHeight:1.3}}>
              {isSignUp ? 'Welcome Back!' : 'Hello!'}
            </div>
            <p style={{fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.75, maxWidth:190}}>
              {isSignUp
                ? 'Already have an account? Sign in to continue.'
                : 'New here? Create your private SAP knowledge base.'}
            </p>
          </div>

          <button className="panel-btn" onClick={()=>switchTo(!isSignUp)}>
            {isSignUp ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </div>

      </div>
    </div>
  )
}
