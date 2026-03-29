import { useState } from 'react'
import { sendMagicLink } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!email.trim() || loading) return
    setLoading(true)
    setError('')
    const { error } = await sendMagicLink(email.trim())
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #FAFAF8 0%, #F5F0E8 50%, #FAFAF8 100%)',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes checkPop { 0%{transform:scale(0)} 70%{transform:scale(1.2)} 100%{transform:scale(1)} }
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.7} }
        .login-input:focus { border-color:#B8960C !important; box-shadow:0 0 0 3px rgba(184,150,12,0.1) !important; outline:none; }
        .login-btn:hover:not(:disabled) { background:linear-gradient(135deg,#C9A84C,#8B6F09) !important; transform:translateY(-1px); box-shadow:0 6px 20px rgba(184,150,12,0.35) !important; }
        .login-btn:active { transform:translateY(0) !important; }
        .login-btn:disabled { opacity:0.6; cursor:not-allowed; }
      `}</style>

      {/* Background pattern */}
      <div style={{ position:'fixed', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position:'absolute',
            width: 300 + i * 80,
            height: 300 + i * 80,
            borderRadius:'50%',
            border:'1px solid rgba(184,150,12,0.06)',
            top:'50%', left:'50%',
            transform:`translate(-50%, -50%)`,
          }} />
        ))}
      </div>

      {/* Card */}
      <div style={{
        background:'#FFFFFF',
        borderRadius:20,
        padding:'52px 48px',
        width:420,
        boxShadow:'0 20px 60px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)',
        animation:'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        position:'relative',
        zIndex:1,
      }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:10, marginBottom:10
          }}>
            <div style={{
              width:44, height:44, borderRadius:12,
              background:'linear-gradient(135deg,#C9A84C,#8B6F09)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:16, fontWeight:700, color:'#fff',
              fontFamily:"'DM Sans',sans-serif",
              boxShadow:'0 4px 12px rgba(184,150,12,0.3)',
            }}>S4</div>
            <span style={{
              fontFamily:"'Playfair Display',serif",
              fontSize:24, fontWeight:600,
              background:'linear-gradient(135deg,#C9A84C,#8B6F09)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
              animation:'shimmer 3s ease-in-out infinite',
            }}>SAP Brain</span>
          </div>
          <p style={{ fontSize:14, color:'#8A8A8E', lineHeight:1.5 }}>
            Your private SAP knowledge base
          </p>
        </div>

        {/* Divider */}
        <div style={{ height:1, background:'linear-gradient(90deg,transparent,#E8E3D5,transparent)', marginBottom:32 }} />

        {sent ? (
          /* Success state */
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <div style={{
              width:64, height:64, borderRadius:'50%',
              background:'linear-gradient(135deg,#C9A84C,#8B6F09)',
              display:'flex', alignItems:'center', justifyContent:'center',
              margin:'0 auto 20px',
              animation:'checkPop 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
              boxShadow:'0 8px 24px rgba(184,150,12,0.3)',
            }}>
              <span style={{ fontSize:28, color:'#fff' }}>✓</span>
            </div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:600, color:'#1C1C1E', marginBottom:10 }}>
              Check your email
            </div>
            <p style={{ fontSize:14, color:'#8A8A8E', lineHeight:1.7 }}>
              We sent a magic link to<br />
              <strong style={{ color:'#1C1C1E' }}>{email}</strong>
            </p>
            <p style={{ fontSize:12, color:'#AEAEB2', marginTop:16 }}>
              Click the link to sign in. No password needed.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              style={{
                marginTop:24, background:'none', border:'1px solid #E8E3D5',
                borderRadius:10, padding:'10px 20px', fontSize:13, color:'#8A8A8E',
                cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              }}
            >Use a different email</button>
          </div>
        ) : (
          /* Email form */
          <div>
            <label style={{ display:'block', fontSize:13, fontWeight:500, color:'#3A3A3C', marginBottom:8 }}>
              Email address
            </label>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="you@company.com"
              style={{
                width:'100%', padding:'13px 16px',
                border:'1.5px solid #E8E3D5', borderRadius:12,
                fontSize:15, color:'#1C1C1E', background:'#FAFAF8',
                fontFamily:"'DM Sans',sans-serif",
                transition:'all 0.2s', marginBottom:error ? 8 : 20,
              }}
            />
            {error && <p style={{ fontSize:12, color:'#EF4444', marginBottom:16 }}>{error}</p>}

            <button
              className="login-btn"
              onClick={handleSubmit}
              disabled={!email.trim() || loading}
              style={{
                width:'100%', padding:'14px',
                background:'linear-gradient(135deg,#C9A84C,#8B6F09)',
                border:'none', borderRadius:12,
                fontSize:15, fontWeight:600, color:'#fff',
                cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                boxShadow:'0 4px 16px rgba(184,150,12,0.25)',
                transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              }}
            >
              {loading ? (
                <div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
              ) : 'Send Magic Link →'}
            </button>

            <p style={{ textAlign:'center', fontSize:12, color:'#AEAEB2', marginTop:16, lineHeight:1.6 }}>
              No password needed. Just click the link in your email.<br />
              Your SAP conversations stay private.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
