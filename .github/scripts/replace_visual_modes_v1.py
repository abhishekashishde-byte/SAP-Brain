from pathlib import Path
import re

brain = Path('src/pages/Brain.jsx')
chat = Path('api/chat.js')

b = brain.read_text()
c = chat.read_text()

# 1) Replace old HTML OnDemandVisual UI with image-based Customer Brief UI.
pat = re.compile(r'// "View as visual" — on-demand only\.[\s\S]*?function OnDemandVisual\(\{ msg, onRequestVisual, t, dark \}\) \{[\s\S]*?\n\}\n\n// Optional handwritten one-page handout\.', re.M)
replacement = '''// Customer Brief — formal, client-facing one-page image generated only on demand.
// It uses the already-verified Wani answer; no RAG/search/Sonnet rerun.
function OnDemandVisual({ msg, onRequestVisual, t, dark }) {
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const hasVisual = !!msg._customerBriefData

  const handleClick = async () => {
    if (hasVisual) { setVisible(v => !v); return }
    setRequesting(true); setError('')
    try {
      await onRequestVisual()
      setVisible(true)
    } catch (e) {
      setError(e.message || 'Could not create customer brief.')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div style={{ marginTop:10 }}>
      <button onClick={handleClick} disabled={requesting} style={{
        display:'inline-flex', alignItems:'center', gap:7, padding:'7px 12px', borderRadius:10,
        border:`1px solid ${t.border2}`, background:dark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.72)',
        color:t.text3, cursor:requesting?'wait':'pointer', fontSize:12, fontWeight:600,
        fontFamily:"'Inter',sans-serif"
      }}>
        <span style={{ fontSize:14 }}>📄</span>
        {requesting ? 'Creating customer brief…' : hasVisual ? (visible ? 'Hide customer brief' : 'View customer brief') : 'Customer Brief'}
      </button>
      {error && <div style={{ marginTop:6, fontSize:12, color:'#DC2626' }}>{error}</div>}
      {hasVisual && visible && (
        <div style={{ marginTop:10, maxWidth:620, position:'relative' }}>
          <img src={msg._customerBriefData} alt="Wani customer brief" style={{ width:'100%', height:'auto', display:'block', borderRadius:12, border:`1px solid ${t.border}`, boxShadow:'0 8px 28px rgba(0,0,0,0.10)' }}/>
          <a href={msg._customerBriefData} download={`wani-customer-brief-${Date.now()}.png`} title="Download customer brief" aria-label="Download customer brief" style={{ position:'absolute', top:10, right:10, width:38, height:38, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(20,20,24,0.78)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', fontSize:20, lineHeight:1, boxShadow:'0 3px 12px rgba(0,0,0,0.22)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>↓</a>
        </div>
      )}
    </div>
  )
}

// Optional handwritten one-page handout.'''
nb, n = pat.subn(replacement, b, count=1)
if n != 1:
    raise SystemExit(f'OnDemandVisual block replacement failed: {n}')
b = nb

# 2) Rename handwritten output to Consultant Note in UI.
b = b.replace("{requesting ? 'Creating handout…' : hasHandout ? (visible ? 'Hide handout' : 'View handout') : 'Create Handout'}",
              "{requesting ? 'Creating consultant note…' : hasHandout ? (visible ? 'Hide consultant note' : 'View consultant note') : 'Consultant Note'}")
b = b.replace('alt="Wani handout"', 'alt="Wani consultant note"')
b = b.replace('download={`wani-handout-${Date.now()}.jpg`}', 'download={`wani-consultant-note-${Date.now()}.png`}')
b = b.replace('title="Download handout" aria-label="Download handout"', 'title="Download consultant note" aria-label="Download consultant note"')

# 3) Visual request now persists a branded image instead of HTML visual JSON.
needle = "if (!res.ok) throw new Error(data.error || 'Could not generate a visual for this answer.')"
if needle not in b:
    raise SystemExit('visual request error line not found')
b = b.replace(needle, "if (!res.ok) throw new Error(data.error || 'Could not create customer brief.')\n    const branded = await addExactWaniBranding(data.imageBase64)", 1)
old_assign = "if (msgs[msgIndex]) msgs[msgIndex] = { ...msgs[msgIndex], _visualFormat: data.format, _visualData: data.data }"
if old_assign not in b:
    raise SystemExit('old visual persistence assignment not found')
b = b.replace(old_assign, "if (msgs[msgIndex]) msgs[msgIndex] = { ...msgs[msgIndex], _customerBriefData: branded }", 1)

# 4) Replace old Haiku HTML visual backend with formal image generation.
visual_pat = re.compile(r'// ── ON-DEMAND VISUAL — cheap \(Haiku\)[\s\S]*?async function generateVisualOnDemand\(question, answerText\) \{[\s\S]*?\n\}\n', re.M)
formal_fn = '''// ── ON-DEMAND CUSTOMER BRIEF — formal client-facing image from the already-verified answer.
// No RAG/search/Sonnet rerun. This changes presentation, not factual substance.
async function generateVisualOnDemand(question, answerText) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const prompt = `Create a single-page portrait CUSTOMER BRIEF from the verified SAP answer below.

STYLE:
- clean corporate consulting infographic on a white background
- polished, formal, client-facing; NOT handwritten and NOT playful
- navy / deep blue with restrained green, purple or gold accents
- strong title, clean section headers, professional icons, simple diagrams and compact callout boxes
- generous whitespace and balanced top/bottom margins; do not crowd the page edges
- use approximately 55-70% of the substantive verified answer: enough to be meaningful, but not a wall of text
- prefer 3-4 main sections; avoid repetitive summary/comparison sections when the same point is already obvious above
- preserve the core mechanism, key distinction, practical action, and important caveats
- preserve SAP technical identifiers EXACTLY as supplied; never invent or autocorrect T-codes, tables, fields, app IDs, BAdIs, notes or SPRO paths
- if uncertainty exists in the verified answer, preserve it
- no Wani branding at the top and no slogan/website anywhere
- leave the bottom 8% COMPLETELY BLANK WHITE for Wani branding added later
- DO NOT draw any Wani logo, W mark, copyright symbol, website, footer, signature or watermark

QUESTION:
${(question || '').slice(0, 700)}

VERIFIED ANSWER:
${(answerText || '').slice(0, 9000)}`

  const imageRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
      prompt,
      size: '1024x1536',
      quality: 'medium',
      output_format: 'png',
    }),
  })
  const data = await imageRes.json().catch(() => ({}))
  if (!imageRes.ok) throw new Error(data?.error?.message || 'Customer brief image generation failed')
  const imageBase64 = data?.data?.[0]?.b64_json
  if (!imageBase64) throw new Error('Image API returned no image data')
  return { imageBase64 }
}
'''
nc, n = visual_pat.subn(formal_fn, c, count=1)
if n != 1:
    raise SystemExit(f'visual backend replacement failed: {n}')
c = nc

# 5) Tune Consultant Note to the lighter density agreed in review.
c = c.replace('- aim for 5-8 clearly separated sections when the verified answer supports them',
              '- aim for 3-4 clearly separated sections; keep it concise and visually breathable')
c = c.replace('- include roughly 65-80% of the substantive information from the verified answer, shortened into visual phrases rather than deleting useful facts',
              '- include roughly 45-60% of the substantive information from the verified answer, prioritising the mechanism, key technical facts, practical action, and one important gotcha')
c = c.replace('- make the page easy to scan in 30-45 seconds while still feeling like a useful consultant handout',
              '- make the page easy to scan in about 20-30 seconds while still feeling useful to an SAP consultant\n- avoid a separate Quick Comparison / Summary Comparison table if it repeats points already shown in the main sections')

brain.write_text(b)
chat.write_text(c)
print('visual modes patch applied')
