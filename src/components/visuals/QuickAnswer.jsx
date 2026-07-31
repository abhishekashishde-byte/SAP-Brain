// src/components/visuals/QuickAnswer.jsx
//
// The quick-answer banner, used identically in two places:
//   - Brain.jsx, live, while it's still streaming in (before the full
//     answer has started)
//   - AnswerContainer.jsx, once the message is done
// Sharing one component keeps them pixel-identical, which is what makes the
// streaming→done transition invisible — nothing about this block should
// ever look different between the two states, only whether the cursor is
// blinking.
//
// Styling intentionally does NOT use a strong background color/card look —
// earlier versions used a blue/teal gradient block with white text, which
// read as a separate, bolted-on element rather than part of the answer.
// This version reads as a lead-in line of the same document: same font
// family as the body text, a small uppercase label (same typographic
// language as "Verified links" / "You may also ask" below it), slightly
// bolder weight for emphasis, and a thin divider — grouped with, not cut
// off from, the full answer underneath.
import { useTheme } from '../../App.jsx'

export default function QuickAnswer({ text, showCursor }) {
  const { dark } = useTheme()
  if (!text) return null
  return (
    <div style={{
      marginBottom: 16, paddingBottom: 14,
      borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3,
        color: dark ? '#94A3B8' : '#8A8A8A', marginBottom: 6,
      }}>
        Quick answer
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.6, fontWeight: 500, color: dark ? '#E5E7EB' : '#1F2937' }}>
        {text}
        {showCursor && (
          <span style={{
            display: 'inline-block', width: 2, height: '1em', background: '#4F46E5',
            marginLeft: 2, animation: 'cursorBlink 0.8s infinite', verticalAlign: 'middle',
          }} />
        )}
      </div>
    </div>
  )
}
