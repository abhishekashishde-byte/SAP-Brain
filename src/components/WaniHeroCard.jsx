// src/components/WaniHeroCard.jsx
//
// Real photo of the Wani card (public/wani-hero-card.png), correct 4:3
// aspect ratio (1448x1086 — never force-cropped to square).
//
// widthPx/heightPx are passed in from Brain.jsx as ACTUAL MEASURED, ALREADY
// PROPORTIONED pixel values — both dimensions computed together in JS, not
// one set explicitly while the other is derived from CSS aspect-ratio and
// then separately clamped by max-width. That combination was a real bug:
// when the derived width got clamped, the container's explicit height
// stayed fixed, so the box was no longer correctly proportioned — the
// <img> (object-fit:contain) then shrank to fit correctly within that
// mismatched box and centered itself, leaving empty space that wasn't
// visible anywhere in the CSS, only in the actual render. Computing both
// pixel values together upstream removes that ambiguity entirely.
//
// The photo's background is NOT uniform pure black — it has a real vignette
// (verified: bottom-left corner samples ~(36,23,14), a warm dark brown, not
// (0,0,0)). So instead of matching a flat background color, the image's own
// edges are radially masked to transparent — that dissolves the photo into
// whatever's behind it regardless of the photo's non-uniform corner colors.
export default function WaniHeroCard({ widthPx, heightPx }) {
  const fadeMask = 'radial-gradient(ellipse 62% 62% at center, black 50%, transparent 86%)'
  return (
    <div style={{
      position: 'relative',
      width: widthPx ? `${widthPx}px` : 240,
      height: heightPx ? `${heightPx}px` : 180,
      flexShrink: 0,
      marginBottom: '0.5%',
    }}>
      <img
        src="/wani-hero-card.png"
        alt="Wani"
        style={{
          width: '100%', height: '100%', objectFit: 'contain', display: 'block',
          maskImage: fadeMask, WebkitMaskImage: fadeMask,
        }}
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
