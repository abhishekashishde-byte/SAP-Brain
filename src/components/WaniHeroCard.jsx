// src/components/WaniHeroCard.jsx
//
// Real photo of the Wani card (public/wani-hero-card.png), correct 4:3
// aspect ratio (1448x1086 — never force-cropped to square).
//
// heightPx is passed in from Brain.jsx as an ACTUAL MEASURED pixel value
// (via ResizeObserver on the real container), not a CSS %/vh guess. Two
// earlier CSS-only attempts (raw vh, then percentage-of-parent) both broke
// on real devices — vh ignores the header/input chrome, and percentage
// height didn't reliably resolve through the flex ancestor chain on real
// mobile Chrome. Measuring the actual rendered space in JS and sizing off
// that number directly is what finally makes this deterministic instead of
// hoping a CSS unit behaves the way it's supposed to.
//
// The photo's background is NOT uniform pure black — it has a real vignette
// (verified: bottom-left corner samples ~(36,23,14), a warm dark brown, not
// (0,0,0)). So instead of matching a flat background color, the image's own
// edges are radially masked to transparent — that dissolves the photo into
// whatever's behind it regardless of the photo's non-uniform corner colors.
export default function WaniHeroCard({ heightPx }) {
  const fadeMask = 'radial-gradient(ellipse 62% 62% at center, black 50%, transparent 86%)'
  return (
    <div style={{
      position: 'relative',
      height: heightPx ? `${heightPx}px` : 'min(58%, 60vh)',
      width: 'auto',
      aspectRatio: '1448 / 1086',
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
