// src/components/visuals/Troubleshooting.jsx
// data = {
//   title, issueSummary, checkFirst,
//   causes: [{ id, title, description, check }]
// }
import { useState, useEffect } from 'react'

const BREAKPOINT = 768
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT : false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

function CheckFirstBox({ text, dark }) {
  if (!text) return null
  return (
    <div style={{
      borderRadius: 10, padding: '10px 14px', marginBottom: 14,
      background: dark ? 'rgba(245,166,35,0.12)' : '#FFF0CF',
      border: `1px solid ${dark ? 'rgba(245,166,35,0.3)' : '#EFCF8F'}`,
    }}>
      <span style={{ fontWeight: 800, fontSize: 12.5, color: dark ? '#F5A623' : '#7E4B00' }}>Check first: </span>
      <span style={{ fontSize: 12.5, color: dark ? '#E8CFA0' : '#7E4B00' }}>{text}</span>
    </div>
  )
}

function CauseCard({ cause, dark }) {
  return (
    <div style={{
      padding: 14, borderRadius: 12, background: dark ? '#0A0A12' : '#FAFAF8',
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: dark ? '#fff' : '#111' }}>
        {cause.title}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: dark ? '#94A3B8' : '#666', marginBottom: 8 }}>
        {cause.description}
      </div>
      <div style={{ fontSize: 12, color: '#0A6ED1' }}>
        <strong>Check:</strong> {cause.check}
      </div>
    </div>
  )
}

function TroubleshootingDesktop({ data, dark }) {
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 16, padding: 24, background: dark ? '#12121A' : '#fff',
    }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: dark ? '#fff' : '#111' }}>{data.title}</h3>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: dark ? '#94A3B8' : '#666' }}>{data.issueSummary}</p>
      <CheckFirstBox text={data.checkFirst} dark={dark} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(data.causes.length, 3)}, 1fr)`, gap: 14 }}>
        {data.causes.map(c => <CauseCard key={c.id} cause={c} dark={dark} />)}
      </div>
    </div>
  )
}

function TroubleshootingMobile({ data, dark }) {
  const [openId, setOpenId] = useState(data.causes[0]?.id ?? null)
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 14, padding: 16, background: dark ? '#12121A' : '#fff',
    }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: dark ? '#fff' : '#111' }}>{data.title}</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: dark ? '#94A3B8' : '#666' }}>{data.issueSummary}</p>
      <CheckFirstBox text={data.checkFirst} dark={dark} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.causes.map((c, i) => {
          const isOpen = openId === c.id
          return (
            <div key={c.id} style={{
              borderRadius: 10, border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setOpenId(isOpen ? null : c.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center',
                  background: dark ? '#0A0A12' : '#FAFAF8', border: 'none', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111' }}>
                  {i + 1}. {c.title}
                </span>
                <span style={{ color: dark ? '#94A3B8' : '#666', fontSize: 12 }}>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '10px 12px', background: dark ? '#12121A' : '#fff' }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: dark ? '#94A3B8' : '#666', marginBottom: 8 }}>
                    {c.description}
                  </div>
                  <div style={{ fontSize: 12, color: '#0A6ED1' }}>
                    <strong>Check:</strong> {c.check}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Troubleshooting({ data }) {
  // Visuals are always rendered light — client-ready/shareable output
  // shouldn't follow the consultant's personal dark-mode preference.
  const dark = false
  const isMobile = useIsMobile()
  if (!data?.causes?.length) return null
  return isMobile ? <TroubleshootingMobile data={data} dark={dark} /> : <TroubleshootingDesktop data={data} dark={dark} />
}
