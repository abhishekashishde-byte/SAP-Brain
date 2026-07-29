// src/components/visuals/AnswerContainer.jsx
//
// Renders the answer shape from the `done` event when containerMode is true.
// Sections appear in this order:
//   1. Quick Answer        — always shown if present
//   2. Visual               — shown only if visualFormat !== null
//   3. Full Written Answer  — the complete markdown explanation
//   4. Verified Links       — shown only if references.length > 0
//   5. Follow-ups           — shown only if present
//
// Sonnet decides section 2's content (or absence). This component and its
// defaultOpen map decide what's expanded — that split is deliberate, per the
// architecture: content routing vs. display preference are separate concerns.
import { useState } from 'react'
import { useTheme } from '../../App.jsx'
import AnswerVisual from './AnswerVisual.jsx'

function ChevronIcon({ open, dark }) {
  return (
    <span style={{
      display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      color: dark ? '#94A3B8' : '#666', fontSize: 12, marginRight: 8,
    }}>▶</span>
  )
}

function Section({ id, title, defaultOpen, dark, children, badge }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
      border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: dark ? '#12121A' : '#FAFAF8', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <ChevronIcon open={open} dark={dark} />
          <span style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111' }}>{title}</span>
        </span>
        {badge && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: dark ? '#94A3B8' : '#666',
            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 999, padding: '2px 8px',
          }}>{badge}</span>
        )}
      </button>
      {open && (
        <div style={{ padding: '12px 14px', background: dark ? '#0A0A12' : '#fff' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function ReferencesList({ refs, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {refs.map((r, i) => (
        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 12.5, color: '#0A6ED1', textDecoration: 'none', display: 'flex', gap: 6, alignItems: 'baseline',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: dark ? '#94A3B8' : '#666',
            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 4, padding: '1px 5px',
          }}>{(r.type || 'link').replace('_', ' ')}</span>
          <span>{r.title || r.url}</span>
        </a>
      ))}
    </div>
  )
}

// renderMarkdown is passed in from Brain.jsx (already exists there) so this
// component doesn't need its own markdown renderer.
export default function AnswerContainer({
  quickAnswer, visualFormat, visualData, references, detailedExplanation, followUps, renderMarkdown,
}) {
  const { dark } = useTheme()
  const refsPresent = Array.isArray(references) && references.length > 0
  const followUpsPresent = Array.isArray(followUps) && followUps.length > 0

  return (
    <div>
      {quickAnswer && (
        <div style={{
          borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13.5, lineHeight: 1.5,
          background: 'linear-gradient(135deg, #0A6ED1, #0F828F)', color: '#fff',
        }}>
          {quickAnswer}
        </div>
      )}

      {visualFormat && (
        <div style={{ marginBottom: 12 }}>
          <AnswerVisual visualFormat={visualFormat} visualData={visualData} />
        </div>
      )}

      <Section id="full" title="Full Written Answer" defaultOpen={true} dark={dark}>
        {renderMarkdown(detailedExplanation || '')}
      </Section>

      {refsPresent && (
        <Section id="references" title="Verified Links" defaultOpen={false} dark={dark} badge={String(references.length)}>
          <ReferencesList refs={references} dark={dark} />
        </Section>
      )}

      {followUpsPresent && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#94A3B8' : '#666', textTransform: 'uppercase' }}>
            💡 You may also ask
          </div>
          {followUps.map((q, i) => (
            <div key={i} style={{ fontSize: 13, color: '#0A6ED1' }}>{q}</div>
          ))}
        </div>
      )}
    </div>
  )
}
