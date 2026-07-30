// src/components/visuals/AnswerContainer.jsx
//
// Renders the finished shape of a container-mode answer:
//   1. Quick Answer   — small banner, shown first
//   2. Full Answer    — the complete markdown explanation, plain (no
//                       collapsible wrapper — deliberately unstyled relative
//                       to the streaming state so nothing shifts when the
//                       message flips from "streaming" to "done")
//   3. Verified Links — shown only if references.length > 0, each with a
//                       short note on why it's worth opening
//   4. Follow-ups      — shown only if present
//
// The quick answer is passed in already-known (it streamed in first, well
// before the full answer finished — see the 'quick_answer' SSE event in
// Brain.jsx) so it never "pops in" here; this component just renders the
// same content the reader has already been looking at, plus whatever only
// becomes available once generation is fully done (references, follow-ups).
// The visual is intentionally NOT part of this component — it's rendered
// on demand elsewhere, only after the reader clicks "View as visual".
import { useTheme } from '../../App.jsx'

function ReferencesList({ refs, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {refs.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <a href={r.url} target="_blank" rel="noopener noreferrer" style={{
            fontSize: 12.5, color: '#0A6ED1', textDecoration: 'none', display: 'flex', gap: 6, alignItems: 'baseline',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: dark ? '#94A3B8' : '#666',
              background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 4, padding: '1px 5px',
            }}>{(r.type || 'link').replace('_', ' ')}</span>
            <span style={{ fontWeight: 600 }}>{r.title || r.url}</span>
          </a>
          {r.note && (
            <span style={{ fontSize: 12, lineHeight: 1.4, color: dark ? '#94A3B8' : '#666', paddingLeft: 2 }}>
              {r.note}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// renderMarkdown is passed in from Brain.jsx (already exists there) so this
// component doesn't need its own markdown renderer.
export default function AnswerContainer({
  quickAnswer, references, detailedExplanation, followUps, renderMarkdown,
}) {
  const { dark } = useTheme()
  const refsPresent = Array.isArray(references) && references.length > 0
  const followUpsPresent = Array.isArray(followUps) && followUps.length > 0

  return (
    <div>
      {quickAnswer && (
        <div style={{
          borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13.5, lineHeight: 1.5,
          background: 'linear-gradient(135deg, #0A6ED1, #0F828F)', color: '#fff',
        }}>
          {quickAnswer}
        </div>
      )}

      {renderMarkdown(detailedExplanation || '')}

      {refsPresent && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#94A3B8' : '#666', textTransform: 'uppercase', marginBottom: 8 }}>
            Verified links
          </div>
          <ReferencesList refs={references} dark={dark} />
        </div>
      )}

      {followUpsPresent && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#94A3B8' : '#666', textTransform: 'uppercase' }}>
            💡 You may also ask
          </div>
          {followUps.map((q, i) => (
            <div key={i} style={{
              fontSize: 13, lineHeight: 1.4, color: dark ? '#D1D5DB' : '#374151',
              padding: '8px 10px', borderRadius: 8,
              background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              borderLeft: `2px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
            }}>{q}</div>
          ))}
        </div>
      )}
    </div>
  )
}
