// src/components/WaniHeroCard.jsx
//
// Real photo of the Wani card (public/wani-hero-card.png), correct 4:3
// aspect ratio (1448x1086 — never force-cropped to square), with a subtle,
// slow diagonal shine sweeping across it on a loop. Tuned through several
// rounds of live preview: shine is intentionally narrow, dim, and slow
// (7s sweep) — an early version was too fast/bright and looked like a
// glitch rather than a glint. `screen` blend mode is used because the
// photo's background is mostly black; `overlay` washed out and barely
// showed against it.
export default function WaniHeroCard({ size = 'desktop' }) {
  const isMobile = size === 'mobile'
  const width = isMobile ? 240 : 340

  return (
    <div style={{
      position: 'relative',
      width,
      aspectRatio: '1448 / 1086', // matches the source photo exactly — no cropping
      borderRadius: isMobile ? 18 : 22,
      overflow: 'hidden',
    }}>
      <img
        src="/wani-hero-card.png"
        alt="Wani"
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(115deg, transparent 46%, rgba(255,255,255,0.18) 49%, rgba(255,255,255,0.30) 50%, rgba(255,255,255,0.18) 51%, transparent 54%)',
        backgroundSize: '300% 300%',
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
