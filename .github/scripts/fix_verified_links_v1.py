from pathlib import Path

# ── Server: verified links must come from retrieved links, not only model JSON ──
p = Path('api/chat.js')
s = p.read_text()

anchor = """function stripUnapprovedLinks(text) {\n  if (!text) return { text, removed: [] }\n"""
if anchor not in s:
    raise SystemExit('server anchor not found')

# Insert helpers immediately before Supabase section, after stripUnapprovedLinks function.
marker = "\n// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────\n"
if marker not in s:
    raise SystemExit('supabase marker not found')

helper = r'''
// Public Verified Links must be deterministic. The model may return an empty
// references array even when Wani retrieved valid SAP pages, so merge its
// references with the actual retrieved/validated search results before sending
// the answer to the browser. Never invent a URL here.
function referenceTypeFromSource(source = '', url = '') {
  const value = `${source} ${url}`.toLowerCase()
  if (value.includes('community.sap.com') || value.includes('sap community')) return 'SAP Community'
  if (value.includes('blogs.sap.com') || value.includes('sap blog')) return 'SAP Blog'
  if (value.includes('help.sap.com') || value.includes('sap help')) return 'SAP Help'
  if (value.includes('me.sap.com') || value.includes('support.sap.com') || value.includes('sap support')) return 'SAP Support'
  if (value.includes('fioriappslibrary')) return 'SAP Fiori Library'
  if (value.includes('learning.sap.com')) return 'SAP Learning'
  return 'SAP'
}

function mergeVerifiedReferences(modelReferences = [], ...retrievedGroups) {
  const out = []
  const seen = new Set()
  const add = (ref, fallbackNote = '') => {
    const url = typeof ref?.url === 'string' ? ref.url.trim() : ''
    if (!url || !isApprovedUrl(url) || seen.has(url)) return
    seen.add(url)
    out.push({
      type: ref.type || referenceTypeFromSource(ref.source, url),
      title: ref.title || url,
      url,
      note: ref.note || fallbackNote,
    })
  }

  // Keep valid model references first (often produced from Sonnet's own
  // self-verification search), then fill any gaps from Wani's real search lanes.
  for (const ref of Array.isArray(modelReferences) ? modelReferences : []) add(ref)
  for (const group of retrievedGroups) {
    for (const ref of Array.isArray(group) ? group : []) {
      add(ref, 'SAP source retrieved by Wani for this question.')
      if (out.length >= 3) return out
    }
  }
  return out.slice(0, 3)
}
'''
if 'function mergeVerifiedReferences(' not in s:
    s = s.replace(marker, '\n' + helper + marker, 1)

old = """    // ── STEP 14: Send done ────────────────────────────────────────────────\n    const DELIVERABLE_TYPES_FINAL = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','FIORI_REC','WORKSHOP_PPT','CUSTOMIZING','BEST_PRACTICES','EXCEL_VALIDATION','GENERAL_DOC'])\n"""
new = """    // ── STEP 14: Send done ────────────────────────────────────────────────\n    // Do not make public links depend on Sonnet remembering to populate its hidden\n    // references JSON. If Wani found approved SAP pages, merge those real URLs in.\n    const finalVerifiedReferences = usedContainerFormat\n      ? mergeVerifiedReferences(containerResult.references, referenceSearchResults, relatedLinks)\n      : []\n\n    const DELIVERABLE_TYPES_FINAL = new Set(['FS_SPEC','TECH_SPEC','TEST_CASES','GAP_ANALYSIS','WORKSHOP_PLAN','WORKSHOP_TOPICS','FORMS_SPEC','SLIDE_CONTENT','FIORI_REC','WORKSHOP_PPT','CUSTOMIZING','BEST_PRACTICES','EXCEL_VALIDATION','GENERAL_DOC'])\n"""
if old not in s:
    raise SystemExit('step14 anchor not found')
s = s.replace(old, new, 1)

old = """        references: containerResult.references || [],\n        followUps: containerResult.followUps || [],\n"""
new = """        references: finalVerifiedReferences,\n        followUps: containerResult.followUps || [],\n"""
if old not in s:
    raise SystemExit('done references anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)

# ── Client: recover links in already-saved messages that have [] references ──
p = Path('src/pages/Brain.jsx')
s = p.read_text()

old = """  const [codeExpanded, setCodeExpanded] = useState(false)\n\n  const inlineFormat = (text) => {\n"""
new = r'''  const [codeExpanded, setCodeExpanded] = useState(false)

  // Backward-compatible recovery for answers saved while the server sometimes
  // emitted `_references: []` despite having real web results. Prefer the stored
  // container references; only fall back to URLs Wani actually persisted from its
  // search lanes. Keep the same SAP-domain allow-list client-side as a safety net.
  const approvedSapHosts = [
    'community.sap.com','blogs.sap.com','help.sap.com','me.sap.com','support.sap.com',
    'launchpad.support.sap.com','fioriappslibrary.hana.ondemand.com','api.sap.com','learning.sap.com',
  ]
  const isApprovedSavedLink = (url) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '')
      return approvedSapHosts.some(d => host === d || host.endsWith('.' + d))
    } catch { return false }
  }
  const storedReferences = Array.isArray(msg._references) ? msg._references.filter(r => isApprovedSavedLink(r?.url)) : []
  const storedLinkFallback = [
    ...(Array.isArray(msg._links) ? msg._links : []),
    ...(Array.isArray(msg._sourceInfo?.relatedLinks) ? msg._sourceInfo.relatedLinks : []),
  ]
    .filter((r, i, arr) => r?.url && isApprovedSavedLink(r.url) && arr.findIndex(x => x?.url === r.url) === i)
    .slice(0, 3)
    .map(r => ({ type:r.type || r.source || 'SAP', title:r.title || r.url, url:r.url, note:r.note || 'SAP source retrieved by Wani for this question.' }))
  const displayReferences = storedReferences.length > 0 ? storedReferences : storedLinkFallback

  const inlineFormat = (text) => {
'''
if old not in s:
    raise SystemExit('client state anchor not found')
s = s.replace(old, new, 1)

old = """              references={msg._references}\n              followUps={msg._followUps}\n"""
new = """              references={displayReferences}\n              followUps={msg._followUps}\n"""
if old not in s:
    raise SystemExit('AnswerContainer references anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)

print('verified-links recovery applied')
