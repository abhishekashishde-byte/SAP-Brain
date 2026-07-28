// src/components/visuals/ConceptExplainer.jsx
// data = { title, coreConcept, concepts: [{ title, description }] }  // concepts: 2-3 max
//
// Deliberately the lightest of the four templates on both breakpoints — this
// is the format most at risk of becoming the default "poster for everything"
// bucket, so it stays a short card stack rather than a full one-pager even
// on desktop.
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

export default function ConceptExplainer({ data }) {
  const { dark } = useTheme()
  const isMobile = useIsMobile()
  if (!data?.coreConcept) return null

  const concepts = (data.concepts || []).slice(0, 3) // hard cap, both breakpoints

  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: isMobile ? 14 : 16, padding: isMobile ? 16 : 22,
      background: dark ? '#12121A' : '#fff',
    }}>
      <h3 style={{ margin: '0 0 10px', fontSize: isMobile ? 15 : 17, fontWeight: 700, color: dark ? '#fff' : '#111' }}>
        {data.title}
      </h3>
      <div style={{
        borderRadius: 10, padding: '12px 14px', marginBottom: concepts.length ? 12 : 0,
        background: 'linear-gradient(135deg, #0A6ED1, #0F828F)', color: '#fff',
        fontSize: isMobile ? 13 : 13.5, lineHeight: 1.5,
      }}>
        {data.coreConcept}
      </div>
      {concepts.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 10,
        }}>
          {concepts.map((c, i) => (
            <div key={i} style={{
              flex: 1, padding: 12, borderRadius: 10,
              background: dark ? '#0A0A12' : '#FAFAF8',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4, color: dark ? '#fff' : '#111' }}>
                {c.title}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: dark ? '#94A3B8' : '#666' }}>
                {c.description}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
