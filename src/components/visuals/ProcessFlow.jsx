// src/components/visuals/ProcessFlow.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Reference implementation for the process_flow template. Two renderers, one
// data shape (see api/visual-schema.js). ProcessFlow picks which one to mount
// based on viewport width — the model never sees or generates layout info.
//
// data = { title: string, steps: [{ title, description }] }
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'

const BREAKPOINT = 768

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT : false
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

// ── DESKTOP: horizontal one-page brief ───────────────────────────────────────
function ProcessFlowDesktop({ data, dark }) {
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 16, padding: 24, background: dark ? '#12121A' : '#fff',
    }}>
      <h3 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 700, color: dark ? '#fff' : '#111' }}>
        {data.title}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.steps.length}, 1fr)`, gap: 14 }}>
        {data.steps.map((step, i) => (
          <div key={i} style={{
            position: 'relative', padding: 16, borderRadius: 12,
            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            background: dark ? '#0A0A12' : '#FAFAF8',
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: dark ? 'rgba(10,110,209,0.18)' : '#DCEEFF', color: '#0A6ED1',
              fontWeight: 800, fontSize: 13, marginBottom: 10,
            }}>{i + 1}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: dark ? '#fff' : '#111' }}>
              {step.title}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: dark ? '#94A3B8' : '#666' }}>
              {step.description}
            </div>
            {i < data.steps.length - 1 && (
              <div style={{
                position: 'absolute', right: -22, top: '50%', transform: 'translateY(-50%)',
                width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: dark ? '#fff' : '#111', color: dark ? '#111' : '#fff',
                fontWeight: 900, fontSize: 12, zIndex: 2,
              }}>→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MOBILE: vertical timeline, progressive disclosure ────────────────────────
function ProcessFlowMobile({ data, dark, onViewFull }) {
  const [expanded, setExpanded] = useState(0) // one step open at a time

  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 14, padding: 16, background: dark ? '#12121A' : '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: dark ? '#fff' : '#111' }}>
          {data.title}
        </h3>
        <button onClick={onViewFull} style={{
          fontSize: 11, fontWeight: 700, color: '#0A6ED1', background: 'transparent',
          border: 'none', padding: 0, cursor: 'pointer',
        }}>
          View full visual
        </button>
      </div>

      <div style={{ position: 'relative', paddingLeft: 20 }}>
        <div style={{
          position: 'absolute', left: 9, top: 6, bottom: 6, width: 2,
          background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
        }} />
        {data.steps.map((step, i) => {
          const isOpen = expanded === i
          return (
            <div key={i} style={{ position: 'relative', marginBottom: 10 }}>
              <div style={{
                position: 'absolute', left: -20, top: 2, width: 20, height: 20, borderRadius: '50%',
                display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800,
                background: isOpen ? '#0A6ED1' : (dark ? '#1E1E2A' : '#EEF2F5'),
                color: isOpen ? '#fff' : (dark ? '#94A3B8' : '#666'),
              }}>{i + 1}</div>
              <button
                onClick={() => setExpanded(isOpen ? -1 : i)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                  background: dark ? '#0A0A12' : '#FAFAF8', cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13.5, color: dark ? '#fff' : '#111' }}>
                  {step.title}
                </div>
                {isOpen && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: dark ? '#94A3B8' : '#666', marginTop: 6 }}>
                    {step.description}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── FULLSCREEN OVERLAY (mobile "View full visual") ───────────────────────────
function FullscreenOverlay({ data, dark, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, background: dark ? '#0A0A12' : '#fff',
      overflow: 'auto', padding: 20,
    }}>
      <button onClick={onClose} style={{
        position: 'absolute', top: 16, right: 16, border: 'none', background: 'transparent',
        color: dark ? '#fff' : '#111', fontSize: 22, cursor: 'pointer',
      }}>✕</button>
      <div style={{ marginTop: 40, minWidth: 640 }}>
        <ProcessFlowDesktop data={data} dark={dark} />
      </div>
    </div>
  )
}

// ── ENTRY POINT ────────────────────────────────────────────────────────────
// Usage: <ProcessFlow data={visualData} />  — data comes straight from the
// `done` event's visualData, unchanged. This component owns the desktop/
// mobile decision; nothing upstream needs to know about it.
export default function ProcessFlow({ data }) {
  // Visuals are always rendered light — client-ready/shareable output
  // shouldn't follow the consultant's personal dark-mode preference.
  const dark = false
  const isMobile = useIsMobile()
  const [fullscreen, setFullscreen] = useState(false)

  if (!data?.steps?.length) return null

  return (
    <>
      {isMobile
        ? <ProcessFlowMobile data={data} dark={dark} onViewFull={() => setFullscreen(true)} />
        : <ProcessFlowDesktop data={data} dark={dark} />
      }
      {fullscreen && <FullscreenOverlay data={data} dark={dark} onClose={() => setFullscreen(false)} />}
    </>
  )
}
