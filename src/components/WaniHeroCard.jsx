// src/components/WaniHeroCard.jsx
//
// Real photo of the Wani card (public/wani-hero-card.png), correct 4:3
// aspect ratio (1448x1086 — never force-cropped to square).
//
// IMPORTANT: the photo's background is NOT uniform pure black — it has a
// real vignette (verified: bottom-left corner samples ~(36,23,14), a warm
// dark brown, not (0,0,0)). An earlier version matched the page background
// to a single flat black sampled from only one corner and wrongly assumed
// that would blend everywhere — it doesn't, which is part of what was
// producing a visible framed/sticker edge. The actual fix is a radial mask
// on the image itself, fading its own edges to fully transparent — that
// dissolves the photo into whatever's behind it regardless of the photo's
// non-uniform corner colors, instead of relying on an exact color match
// that the source image can't actually support.
export default function WaniHeroCard() {
  const fadeMask = 'radial-gradient(ellipse 62% 62% at center, black 50%, transparent 86%)'
  return (
    <div style={{
      position: 'relative',
      height: 'min(58%, 60vh)',
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
