from pathlib import Path

brain_path = Path('src/pages/Brain.jsx')
chat_path = Path('api/chat.js')
quota_path = Path('src/quotaVisualGuard.js')
gateway_path = Path('api/reference-search.js')

brain = brain_path.read_text()
chat = chat_path.read_text()
quota = quota_path.read_text()
gateway = gateway_path.read_text()


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# ── Brain.jsx: shared image-theme metadata ───────────────────────────────────
anchor = """const BG_THEME_LIST = [
  { key:'aurora',   label:'Aurora' },
  { key:'ember',    label:'Ember' },
  { key:'graphite', label:'Graphite' },
  { key:'light',    label:'Light' },
]
"""
insert = anchor + """
// Image outputs inherit the same profile theme as the Wani workspace. These
// values are used only for local UI/branding; api/chat.js keeps its own strict
// whitelist so an arbitrary client string can never become an image prompt.
const IMAGE_THEME_UI = {
  aurora: {
    footerBg:'#100B1C', footerInk:'#F4F1FF', invertMark:true,
    downloadBg:'rgba(72,61,145,0.92)', downloadBorder:'rgba(206,203,246,0.65)', downloadInk:'#FFFFFF',
  },
  ember: {
    footerBg:'#180D09', footerInk:'#FFF0E9', invertMark:true,
    downloadBg:'rgba(153,60,29,0.92)', downloadBorder:'rgba(245,196,179,0.68)', downloadInk:'#FFFFFF',
  },
  graphite: {
    footerBg:'#151513', footerInk:'#F0EFE9', invertMark:true,
    downloadBg:'rgba(68,68,65,0.94)', downloadBorder:'rgba(211,209,199,0.62)', downloadInk:'#FFFFFF',
  },
  light: {
    footerBg:'#F5F8FD', footerInk:'#0C3158', invertMark:false,
    downloadBg:'rgba(12,68,124,0.90)', downloadBorder:'rgba(255,255,255,0.78)', downloadInk:'#FFFFFF',
  },
}
"""
brain = replace_once(brain, anchor, insert, 'insert IMAGE_THEME_UI')

# Store an explicit safe key alongside the existing resolved background object.
old = """  const [profile, setProfile]             = useState(null)
  const dark = profile?.theme !== 'light'
  const t = dark ? T.dark : T.light
  const bgTheme = BG_THEMES[profile?.theme] || BG_THEMES.aurora
"""
new = """  const [profile, setProfile]             = useState(null)
  const activeThemeKey = Object.prototype.hasOwnProperty.call(BG_THEMES, profile?.theme) ? profile.theme : 'aurora'
  const dark = activeThemeKey !== 'light'
  const t = dark ? T.dark : T.light
  const bgTheme = BG_THEMES[activeThemeKey]
"""
brain = replace_once(brain, old, new, 'activeThemeKey')

# Theme-aware download badges on already-generated images.
old = """function OnDemandVisual({ msg, onRequestVisual, t, dark }) {
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const hasVisual = !!msg._customerBriefData
"""
new = """function OnDemandVisual({ msg, onRequestVisual, t, dark }) {
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const hasVisual = !!msg._customerBriefData
  const visualTheme = IMAGE_THEME_UI[msg._customerBriefTheme] || (dark ? IMAGE_THEME_UI.aurora : IMAGE_THEME_UI.light)
"""
brain = replace_once(brain, old, new, 'customer brief theme ui')

old = """<a href={msg._customerBriefData} download={`wani-customer-brief-${Date.now()}.png`} title=\"Download customer brief\" aria-label=\"Download customer brief\" style={{ position:'absolute', top:10, right:10, width:38, height:38, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(20,20,24,0.78)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', fontSize:20, lineHeight:1, boxShadow:'0 3px 12px rgba(0,0,0,0.22)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>↓</a>"""
new = """<a href={msg._customerBriefData} download={`wani-customer-brief-${Date.now()}.jpg`} title=\"Download customer brief\" aria-label=\"Download customer brief\" style={{ position:'absolute', top:10, right:10, width:38, height:38, borderRadius:'50%', border:`1px solid ${visualTheme.downloadBorder}`, background:visualTheme.downloadBg, color:visualTheme.downloadInk, display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', fontSize:20, lineHeight:1, boxShadow:'0 3px 12px rgba(0,0,0,0.22)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>↓</a>"""
brain = replace_once(brain, old, new, 'customer brief download badge')

old = """function OnDemandHandout({ msg, onRequestHandout, t, dark }) {
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const hasHandout = !!msg._handoutData
"""
new = """function OnDemandHandout({ msg, onRequestHandout, t, dark }) {
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const hasHandout = !!msg._handoutData
  const visualTheme = IMAGE_THEME_UI[msg._handoutTheme] || (dark ? IMAGE_THEME_UI.aurora : IMAGE_THEME_UI.light)
"""
brain = replace_once(brain, old, new, 'consultant note theme ui')
brain = replace_once(brain, "setError(e.message || 'Could not create handout.')", "setError(e.message || 'Could not create consultant note.')", 'consultant note error wording')

old = """<a href={msg._handoutData} download={`wani-consultant-note-${Date.now()}.png`} title=\"Download consultant note\" aria-label=\"Download consultant note\" style={{ position:'absolute', top:10, right:10, width:38, height:38, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(20,20,24,0.78)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', fontSize:20, lineHeight:1, boxShadow:'0 3px 12px rgba(0,0,0,0.22)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>↓</a>"""
new = """<a href={msg._handoutData} download={`wani-consultant-note-${Date.now()}.jpg`} title=\"Download consultant note\" aria-label=\"Download consultant note\" style={{ position:'absolute', top:10, right:10, width:38, height:38, borderRadius:'50%', border:`1px solid ${visualTheme.downloadBorder}`, background:visualTheme.downloadBg, color:visualTheme.downloadInk, display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', fontSize:20, lineHeight:1, boxShadow:'0 3px 12px rgba(0,0,0,0.22)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>↓</a>"""
brain = replace_once(brain, old, new, 'consultant note download badge')

# Replace stale pre-image comment and make exact branding theme aware.
old = """  // On-demand visual — called only when the reader clicks \"View as visual\"
  // on an already-finished answer. Restructures that answer's own text via
  // a separate, cheap (Haiku) call; never touches or re-runs the main
  // answer. Result is cached onto the message (both in local state and
  // persisted) so re-viewing it later never re-calls the API.
  const addExactWaniBranding = async (imageBase64) => {
"""
new = """  // Customer Brief / Consultant Note branding. Image generation uses the
  // selected profile theme; this browser-side pass adds the exact Wani mark so
  // the image model never redraws or clips the brand asset.
  const addExactWaniBranding = async (imageBase64, themeKey = activeThemeKey) => {
"""
brain = replace_once(brain, old, new, 'branding comment/signature')

old = """    const footerH = Math.round(canvas.height * 0.065)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, canvas.height - footerH, canvas.width, footerH)

    const markH = Math.round(footerH * 0.56)
    const markW = Math.round((waniMark.naturalWidth / waniMark.naturalHeight) * markH)
    const fontSize = Math.max(16, Math.round(footerH * 0.29))
    ctx.font = `500 ${fontSize}px Inter, Arial, sans-serif`
    ctx.fillStyle = '#171717'
    ctx.textBaseline = 'middle'
"""
new = """    const brandTheme = IMAGE_THEME_UI[themeKey] || IMAGE_THEME_UI.aurora
    const footerH = Math.round(canvas.height * 0.065)
    ctx.fillStyle = brandTheme.footerBg
    ctx.fillRect(0, canvas.height - footerH, canvas.width, footerH)

    const markH = Math.round(footerH * 0.56)
    const markW = Math.round((waniMark.naturalWidth / waniMark.naturalHeight) * markH)
    const fontSize = Math.max(16, Math.round(footerH * 0.29))
    ctx.font = `500 ${fontSize}px Inter, Arial, sans-serif`
    ctx.fillStyle = brandTheme.footerInk
    ctx.textBaseline = 'middle'
"""
brain = replace_once(brain, old, new, 'theme-aware footer')

old = """    ctx.fillText(label, x, cy)
    ctx.drawImage(waniMark, x + labelW + gap, cy - markH / 2, markW, markH)
    return canvas.toDataURL('image/jpeg', 0.88)
"""
new = """    ctx.fillText(label, x, cy)
    ctx.save()
    if (brandTheme.invertMark) ctx.filter = 'invert(1)'
    ctx.drawImage(waniMark, x + labelW + gap, cy - markH / 2, markW, markH)
    ctx.restore()
    return canvas.toDataURL('image/jpeg', 0.90)
"""
brain = replace_once(brain, old, new, 'theme-aware mark contrast')

# Send only the safe theme key, brand with same key, and persist metadata with image.
old = "body: JSON.stringify({ action: 'generate_handout', question: questionText, answerText }),"
new = "body: JSON.stringify({ action: 'generate_handout', question: questionText, answerText, themeKey: activeThemeKey }),"
brain = replace_once(brain, old, new, 'handout request theme')
brain = replace_once(brain, "const branded = await addExactWaniBranding(data.imageBase64)", "const branded = await addExactWaniBranding(data.imageBase64, activeThemeKey)", 'handout branding theme')
brain = replace_once(brain, "msgs[msgIndex] = { ...msgs[msgIndex], _handoutData: branded }", "msgs[msgIndex] = { ...msgs[msgIndex], _handoutData: branded, _handoutTheme: activeThemeKey }", 'handout persistence theme')

old = "body: JSON.stringify({ action: 'generate_visual', question: questionText, answerText }),"
new = "body: JSON.stringify({ action: 'generate_visual', question: questionText, answerText, themeKey: activeThemeKey }),"
brain = replace_once(brain, old, new, 'customer brief request theme')
# second branding call remains after the first replacement above
old = "const branded = await addExactWaniBranding(data.imageBase64)"
new = "const branded = await addExactWaniBranding(data.imageBase64, activeThemeKey)"
brain = replace_once(brain, old, new, 'customer brief branding theme')
brain = replace_once(brain, "msgs[msgIndex] = { ...msgs[msgIndex], _customerBriefData: branded }", "msgs[msgIndex] = { ...msgs[msgIndex], _customerBriefData: branded, _customerBriefTheme: activeThemeKey }", 'customer brief persistence theme')

# ── api/chat.js: strict server-side theme whitelist ───────────────────────────
anchor = """// ── ON-DEMAND HANDOUT — image generation from the already-verified answer.
"""
theme_server = """// Image palettes are server-owned. The client sends only one of the profile
// theme keys; unknown values fall back to Aurora and are never interpolated into
// prompts directly. This keeps theme customization deterministic and safe.
const IMAGE_THEME_PROFILES = {
  aurora: {
    name: 'Aurora',
    page: 'deep midnight indigo / near-black violet canvas (#0C0A1A to #140B1F)',
    text: 'high-contrast soft lavender and near-white text (#F4F1FF / #CECBF6)',
    accents: 'violet, periwinkle and muted lavender accents (#7F77DD / #AFA9EC); no orange or bright cyan unless semantically necessary',
    cards: 'slightly lighter translucent indigo panels with subtle violet borders',
    footer: 'the same deep midnight indigo background',
  },
  ember: {
    name: 'Ember',
    page: 'deep warm espresso / burnt-brown canvas (#140B08 to #1C0F0A)',
    text: 'high-contrast warm cream text (#FFF0E9 / #F5C4B3)',
    accents: 'coral, terracotta and warm orange accents (#F0997B / #D85A30); avoid purple-blue styling',
    cards: 'slightly lighter warm-brown panels with restrained coral borders',
    footer: 'the same deep warm espresso background',
  },
  graphite: {
    name: 'Graphite',
    page: 'deep neutral graphite / charcoal canvas (#0D0D0C to #141412)',
    text: 'high-contrast warm off-white and light stone text (#F0EFE9 / #D3D1C7)',
    accents: 'silver, slate and restrained warm-gray accents (#B4B2A9 / #888780); avoid purple or saturated colors',
    cards: 'slightly lighter charcoal panels with subtle silver-gray borders',
    footer: 'the same neutral graphite background',
  },
  light: {
    name: 'Light',
    page: 'clean white to very pale ice-blue canvas (#FFFFFF / #F5F8FD)',
    text: 'deep navy and dark blue text (#0C3158 / #0C447C)',
    accents: 'SAP-like blue with restrained soft violet accents (#185FA5 / #7F77DD); keep the overall page bright and airy',
    cards: 'white or very pale blue cards with fine blue-gray borders',
    footer: 'very pale ice-blue (#F5F8FD)',
  },
}

function resolveImageTheme(themeKey) {
  const key = typeof themeKey === 'string' && Object.prototype.hasOwnProperty.call(IMAGE_THEME_PROFILES, themeKey)
    ? themeKey
    : 'aurora'
  return { key, ...IMAGE_THEME_PROFILES[key] }
}

""" + anchor
chat = replace_once(chat, anchor, theme_server, 'server image themes')

chat = replace_once(chat, "async function generateHandoutOnDemand(question, answerText) {", "async function generateHandoutOnDemand(question, answerText, themeKey) {", 'handout signature')
chat = replace_once(chat, """  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const prompt = `Create a single-page portrait handwritten consultant cheat-sheet from the verified SAP answer below.
""", """  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
  const theme = resolveImageTheme(themeKey)

  const prompt = `Create a single-page portrait handwritten consultant cheat-sheet from the verified SAP answer below.

MANDATORY WANI THEME — ${theme.name.toUpperCase()}:
- page/canvas: ${theme.page}
- body text: ${theme.text}
- marker/accent colors: ${theme.accents}
- boxes/cards: ${theme.cards}
- the entire visual must unmistakably belong to this theme; do not revert to a generic white-paper or default blue/purple design
""", 'handout prompt theme')

chat = chat.replace('- clean white paper, hand-drawn/sketchnote look', '- hand-drawn/sketchnote look on the THEMED page/canvas specified above', 1)
chat = chat.replace('- colorful marker headings, boxes, arrows, checkmarks, small relevant doodles', '- theme-matched marker headings, boxes, arrows, checkmarks and small relevant doodles; keep strong text/background contrast', 1)
chat = chat.replace('- leave the bottom 8% of the page COMPLETELY BLANK WHITE: no text, borders, icons, drawings, footer, logo, signature, watermark, copyright, or decoration there. This area is reserved for branding added later by Wani.', '- leave the bottom 8% of the page COMPLETELY BLANK using the SAME solid footer background specified by the theme: no text, borders, icons, drawings, logo, signature, watermark, copyright, or decoration there. This area is reserved for exact branding added later by Wani.', 1)

chat = replace_once(chat, "async function generateVisualOnDemand(question, answerText) {", "async function generateVisualOnDemand(question, answerText, themeKey) {", 'customer brief signature')
# This exact api-key snippet now occurs once in generateVisualOnDemand because the handout one was expanded above.
old = """  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
  const prompt = `Create a single-page portrait CUSTOMER BRIEF from the verified SAP answer below.
"""
new = """  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
  const theme = resolveImageTheme(themeKey)
  const prompt = `Create a single-page portrait CUSTOMER BRIEF from the verified SAP answer below.

MANDATORY WANI THEME — ${theme.name.toUpperCase()}:
- page/canvas: ${theme.page}
- body text: ${theme.text}
- accent palette: ${theme.accents}
- cards/panels: ${theme.cards}
- the entire brief must unmistakably belong to this theme; do not revert to a generic white/blue consulting template
"""
chat = replace_once(chat, old, new, 'customer brief prompt theme')
chat = chat.replace('- clean corporate consulting infographic on a white background', '- clean corporate consulting infographic using the THEMED page/canvas specified above', 1)
chat = chat.replace('- navy / deep blue with restrained green, purple or gold accents', '- use ONLY the theme palette above for decorative colors; semantic warning/success colors may be used sparingly when genuinely needed', 1)
chat = chat.replace('- leave the bottom 8% COMPLETELY BLANK WHITE for Wani branding added later', '- leave the bottom 8% COMPLETELY BLANK using the SAME solid footer background specified by the theme, for exact Wani branding added later', 1)

# Actions receive a key, never free-form palette text.
old = """      const { question = '', answerText = '' } = body
      if (!answerText.trim()) return res.status(400).json({ error: 'Missing answerText' })
      const result = await generateHandoutOnDemand(question, answerText)
"""
new = """      const { question = '', answerText = '', themeKey = 'aurora' } = body
      if (!answerText.trim()) return res.status(400).json({ error: 'Missing answerText' })
      const result = await generateHandoutOnDemand(question, answerText, themeKey)
"""
chat = replace_once(chat, old, new, 'handout action theme')
old = """      const { question = '', answerText = '' } = body
      if (!answerText.trim()) return res.status(400).json({ error: 'Missing answerText' })
      const result = await generateVisualOnDemand(question, answerText)
"""
new = """      const { question = '', answerText = '', themeKey = 'aurora' } = body
      if (!answerText.trim()) return res.status(400).json({ error: 'Missing answerText' })
      const result = await generateVisualOnDemand(question, answerText, themeKey)
"""
chat = replace_once(chat, old, new, 'customer brief action theme')

# Update stale comments so future maintenance does not reintroduce the old HTML/Haiku model.
chat = chat.replace('// ── ON-DEMAND VISUAL — cheap (Haiku) restructuring of an already-written\n// answer, only called when the reader clicks "View as visual". Never part\n// of the main answer pipeline — see ON_DEMAND_VISUAL_PROMPT in _shared.js.', '// ── ON-DEMAND CUSTOMER BRIEF — image generation from an already-verified answer.\n// Never part of the main RAG/search/Sonnet pipeline.')
chat = chat.replace('// ── ACTIONS: generate_visual — on-demand only, triggered by the "View as\n  // visual" button on an already-completed answer. Cheap non-streaming call,\n  // never part of the main pipeline. ─────────────────────────────────────────', '// ── ACTION: generate_visual — on-demand Customer Brief image from an already-\n  // completed verified answer; never part of the main answer pipeline. ─────────')

# ── Quota visual guard: current button names ─────────────────────────────────
old = """const VISUAL_BUTTON_LABELS = new Set([
  'View as visual',
  'Hide visual',
  'Building visual…',
  'Building visual...',
])
"""
new = """const VISUAL_BUTTON_LABELS = new Set([
  'Customer Brief',
  'View customer brief',
  'Hide customer brief',
  'Creating customer brief…',
  'Creating customer brief...',
  'Consultant Note',
  'View consultant note',
  'Hide consultant note',
  'Creating consultant note…',
  'Creating consultant note...',
])
"""
quota = replace_once(quota, old, new, 'quota button labels')

# The gateway's safety block must cover BOTH image-generation actions.
old = "if (!isAdmin && req.body?.action === 'generate_visual' && isQuotaAnswerText(req.body?.answerText)) {"
new = "if (!isAdmin && ['generate_visual', 'generate_handout'].includes(req.body?.action) && isQuotaAnswerText(req.body?.answerText)) {"
gateway = replace_once(gateway, old, new, 'quota image action guard')
gateway = gateway.replace("error: 'Visuals are unavailable for a free-credit limit message.'", "error: 'Image outputs are unavailable for a free-credit limit message.'", 1)

brain_path.write_text(brain)
chat_path.write_text(chat)
quota_path.write_text(quota)
gateway_path.write_text(gateway)

print('Theme consistency patch applied')
print('Brain theme keys:', brain.count('_customerBriefTheme'), brain.count('_handoutTheme'))
print('Server theme profile refs:', chat.count('IMAGE_THEME_PROFILES'))
