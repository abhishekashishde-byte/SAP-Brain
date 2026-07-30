// src/components/WaniHeroCard.jsx
//
// Real photo of the Wani card (public/wani-hero-card.png), correct 4:3
// aspect ratio (1448x1086 — never force-cropped to square). Background is
// solid #000000 — sampled directly from the photo's own corner pixels — so
// it sits seamlessly on a matching black hero screen with no visible edge.
//
// Sized against the PARENT's height (%), not raw vh — this container lives
// inside `.chat-messages` (flex:1, overflowY:auto), which is only whatever
// space remains after the header/input bar, not the full viewport. Raw vh
// units are relative to the whole browser window and would ignore that
// chrome, risking exactly the overflow/scroll this was built to avoid.
// Percentage height respects the actual available space since flex:1
// establishes a definite height for percentage children to resolve against.
//
// The shine is a soft, slow ambient sweep that extends well beyond the
// image's own rectangle (inset goes negative) so its motion doesn't reveal
// the card's actual pixel boundary — tuned down from an earlier version
// that was too fast/bright and looked like a glitch.
export default function WaniHeroCard() {
  return (
    <div style={{
      position: 'relative',
      height: 'min(58%, 60vh)', // % of parent as primary; vh only as an absolute ceiling
      width: 'auto',
      aspectRatio: '1448 / 1086',
      flexShrink: 0,
      marginBottom: '0.5%',
    }}>
      <img
        src="/wani-hero-card.png"
        alt="Wani"
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
      <div style={{
        position: 'absolute', inset: '-60% -80%',
        background: 'linear-gradient(115deg, transparent 44%, rgba(255,255,255,0.10) 48%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.10) 52%, transparent 56%)',
        backgroundSize: '300% 300%',
        filter: 'blur(18px)',
        animation: 'waniCardShimmer 7s ease-in-out infinite',
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }} />
      <style>{`
        @keyframes waniCardShimmer {
          0%   { background-position: -60% -60%; }
          100% { background-position: 160% 160%; }
        }
      `}</style>
    </div>
  )
}
