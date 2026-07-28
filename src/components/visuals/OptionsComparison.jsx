// src/components/visuals/OptionsComparison.jsx
// data = {
//   title, recommendation: { preferredOption, reason },
//   options: [{ id, name, bestWhen, pros:[], cons:[], recommended }],
//   decisionMatrix?: { criteria:[], rows: { [optionId]: [...] } }
// }
import { useState, useEffect } from 'react'
import { useTheme } from '../../App.jsx'

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

function RecommendationBanner({ rec, dark }) {
  if (!rec) return null
  return (
    <div style={{
      borderRadius: 12, padding: '12px 16px', marginBottom: 14,
      background: 'linear-gradient(135deg, #0A6ED1, #0F828F)', color: '#fff',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.85 }}>
        Recommended
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
        Option {rec.preferredOption} — {rec.reason}
      </div>
    </div>
  )
}

function OptionCard({ opt, dark, compact }) {
  return (
    <div style={{
      padding: 16, borderRadius: 12, background: dark ? '#0A0A12' : '#FAFAF8',
      border: opt.recommended
        ? '2px solid #0A6ED1'
        : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 800, fontSize: compact ? 14 : 15, color: dark ? '#fff' : '#111' }}>
          {opt.name}
        </div>
        {opt.recommended && (
          <span style={{
            fontSize: 10, fontWeight: 800, color: '#0A6ED1', background: 'rgba(10,110,209,0.12)',
            borderRadius: 999, padding: '2px 8px',
          }}>RECOMMENDED</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: dark ? '#94A3B8' : '#666', marginBottom: 10 }}>
        Best when: {opt.bestWhen}
      </div>
      {(opt.pros || []).map((p, i) => (
        <div key={`p${i}`} style={{ fontSize: 12.5, color: dark ? '#B8F5C0' : '#2E7D32', marginBottom: 3 }}>+ {p}</div>
      ))}
      {(opt.cons || []).map((c, i) => (
        <div key={`c${i}`} style={{ fontSize: 12.5, color: dark ? '#F5B8B8' : '#B42318', marginBottom: 3 }}>− {c}</div>
      ))}
    </div>
  )
}

function DecisionMatrix({ matrix, options, dark }) {
  if (!matrix) return null
  return (
    <div style={{ marginTop: 16, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 10px', color: dark ? '#94A3B8' : '#666' }}>Criterion</th>
            {options.map(o => (
              <th key={o.id} style={{ textAlign: 'left', padding: '8px 10px', color: dark ? '#fff' : '#111' }}>{o.id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.criteria.map((crit, i) => (
            <tr key={crit} style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
              <td style={{ padding: '8px 10px', color: dark ? '#94A3B8' : '#666' }}>{crit}</td>
              {options.map(o => (
                <td key={o.id} style={{ padding: '8px 10px', color: dark ? '#fff' : '#111' }}>
                  {matrix.rows?.[o.id]?.[i] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OptionsDesktop({ data, dark }) {
  const ordered = [...data.options].sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0))
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 16, padding: 24, background: dark ? '#12121A' : '#fff',
    }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: dark ? '#fff' : '#111' }}>{data.title}</h3>
      <RecommendationBanner rec={data.recommendation} dark={dark} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ordered.length}, 1fr)`, gap: 14 }}>
        {ordered.map(opt => <OptionCard key={opt.id} opt={opt} dark={dark} />)}
      </div>
      <DecisionMatrix matrix={data.decisionMatrix} options={ordered} dark={dark} />
    </div>
  )
}

function OptionsMobile({ data, dark }) {
  // Recommended option first, stacked — no side-scroll, no matrix by default
  const ordered = [...data.options].sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0))
  const [showMatrix, setShowMatrix] = useState(false)
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 14, padding: 16, background: dark ? '#12121A' : '#fff',
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: dark ? '#fff' : '#111' }}>{data.title}</h3>
      <RecommendationBanner rec={data.recommendation} dark={dark} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.map(opt => <OptionCard key={opt.id} opt={opt} dark={dark} compact />)}
      </div>
      {data.decisionMatrix && (
        <>
          <button onClick={() => setShowMatrix(s => !s)} style={{
            marginTop: 12, fontSize: 12, fontWeight: 700, color: '#0A6ED1',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            {showMatrix ? 'Hide' : 'Show'} decision matrix
          </button>
          {showMatrix && <DecisionMatrix matrix={data.decisionMatrix} options={ordered} dark={dark} />}
        </>
      )}
    </div>
  )
}

export default function OptionsComparison({ data }) {
  const { dark } = useTheme()
  const isMobile = useIsMobile()
  if (!data?.options?.length) return null
  return isMobile ? <OptionsMobile data={data} dark={dark} /> : <OptionsDesktop data={data} dark={dark} />
}
