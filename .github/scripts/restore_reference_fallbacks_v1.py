from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    return text.replace(old, new, 1)

# 1) Make OpenAI web-search source extraction resilient.
shared_path = Path('api/_shared.js')
s = shared_path.read_text()

s = replace_once(
    s,
    "        tools: [{ type: 'web_search_preview' }],\n        input:",
    "        tools: [{ type: 'web_search_preview' }],\n        include: ['web_search_call.action.sources'],\n        input:",
    'OpenAI include sources',
)

old_tail = """    console.log(`OpenAI search OK — sources: ${sources.length}, text: ${text.length}`)\n    console.log('OpenAI search text:', text.slice(0, 300))\n\n    if (text.length === 0) {\n      console.log('OpenAI search: empty response')\n      return []\n    }\n\n    return { text, sources: sources.slice(0, 5) }\n"""
new_tail = """    // Responses API can expose web-search sources in more than one place.\n    // Keep the url_citation annotations above, but also request/collect the\n    // explicit web_search_call.action.sources payload. This prevents a real SAP\n    // source from disappearing merely because one response shape omitted text\n    // annotations.\n    for (const output of data.output || []) {\n      if (output.type !== 'web_search_call') continue\n      const explicitSources = output.action?.sources || output.results || []\n      for (const src of explicitSources) {\n        const url = src?.url || src?.link || ''\n        if (!url) continue\n        sources.push({\n          title: src?.title || src?.name || url,\n          url,\n          snippet: src?.snippet || src?.text || '',\n          source: url.includes('sap.com') ? 'SAP' : 'Web',\n        })\n      }\n    }\n\n    // Final recovery path: some responses contain a cited SAP URL in the output\n    // text even when structured source metadata is absent. Recover those URLs so\n    // the downstream approved-domain gate can still decide whether to expose them.\n    const inlineUrls = text.match(/https?:\\/\\/[^\\s)\\]}>\"']+/g) || []\n    for (const rawUrl of inlineUrls) {\n      const url = rawUrl.replace(/[.,;:!?]+$/, '')\n      sources.push({ title: url, url, snippet: '', source: url.includes('sap.com') ? 'SAP' : 'Web' })\n    }\n\n    const uniqueSources = sources.filter((src, i, arr) =>\n      src?.url && arr.findIndex(x => x?.url === src.url) === i\n    )\n\n    console.log(`OpenAI search OK — sources: ${uniqueSources.length}, text: ${text.length}`)\n    console.log('OpenAI search text:', text.slice(0, 300))\n\n    if (text.length === 0) {\n      console.log('OpenAI search: empty response')\n      return []\n    }\n\n    return { text, sources: uniqueSources.slice(0, 5) }\n"""
s = replace_once(s, old_tail, new_tail, 'OpenAI source recovery')
shared_path.write_text(s)

# 2) Never leave a SAP Q&A answer with a completely empty references area.
# If retrieval genuinely found no approved page, generate a clearly-labelled
# SAP Community SEARCH shortcut from the same rewritten search query. It is not
# evidence and must never be displayed as a Verified Link.
chat_path = Path('api/chat.js')
s = chat_path.read_text()

helper_anchor = """  return out.slice(0, 3)\n}\n\n// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────\n"""
helper_replacement = """  return out.slice(0, 3)\n}\n\nfunction buildSapSearchFallback(query) {\n  const clean = String(query || '').replace(/\\s+/g, ' ').trim().slice(0, 220)\n  if (!clean) return []\n  const url = `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&q=${encodeURIComponent(clean)}`\n  return [{\n    type: 'SAP Search',\n    title: `Search SAP Community: ${clean}`,\n    url,\n    note: 'Keyword search shortcut generated from this question because Wani did not retrieve a verified page. This is a search link, not supporting evidence for the answer.',\n    isSearchFallback: true,\n  }]\n}\n\n// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────\n"""
s = replace_once(s, helper_anchor, helper_replacement, 'SAP search fallback helper')

old_final = """    const finalVerifiedReferences = usedContainerFormat\n      ? mergeVerifiedReferences(containerResult.references, referenceSearchResults, relatedLinks)\n      : []\n"""
new_final = """    const mergedVerifiedReferences = usedContainerFormat\n      ? mergeVerifiedReferences(containerResult.references, referenceSearchResults, relatedLinks)\n      : []\n    const finalVerifiedReferences = usedContainerFormat && mergedVerifiedReferences.length === 0\n      ? buildSapSearchFallback(searchQuery || lastMsg)\n      : mergedVerifiedReferences\n"""
s = replace_once(s, old_final, new_final, 'final reference fallback')

old_debug = """      usedContainerFormat ? `References: ${containerResult.references.length}` : null,\n      usedContainerFormat ? `Follow-ups: ${containerResult.followUps.length}` : null,\n"""
new_debug = """      usedContainerFormat ? `References returned by Sonnet: ${containerResult.references.length}` : null,\n      usedContainerFormat ? `Final public links: ${finalVerifiedReferences.length}` : null,\n      usedContainerFormat ? `Fallback SAP search link used: ${finalVerifiedReferences.some(r => r.isSearchFallback)}` : null,\n      usedContainerFormat ? `Follow-ups: ${containerResult.followUps.length}` : null,\n"""
s = replace_once(s, old_debug, new_debug, 'debug reference lines')
chat_path.write_text(s)

# 3) Visually separate fallback search shortcuts from actual Verified Links.
ui_path = Path('src/components/visuals/AnswerContainer.jsx')
s = ui_path.read_text()

old_vars = """  const { dark } = useTheme()\n  const refsPresent = Array.isArray(references) && references.length > 0\n  const followUpsPresent = Array.isArray(followUps) && followUps.length > 0\n"""
new_vars = """  const { dark } = useTheme()\n  const refs = Array.isArray(references) ? references : []\n  const verifiedRefs = refs.filter(r => !r?.isSearchFallback)\n  const searchRefs = refs.filter(r => r?.isSearchFallback)\n  const followUpsPresent = Array.isArray(followUps) && followUps.length > 0\n"""
s = replace_once(s, old_vars, new_vars, 'reference UI variables')

old_block = """      {refsPresent && (\n        <div style={{ marginTop: 16 }}>\n          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#94A3B8' : '#666', textTransform: 'uppercase', marginBottom: 8 }}>\n            Verified links\n          </div>\n          <ReferencesList refs={references} dark={dark} />\n        </div>\n      )}\n"""
new_block = """      {verifiedRefs.length > 0 && (\n        <div style={{ marginTop: 16 }}>\n          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#94A3B8' : '#666', textTransform: 'uppercase', marginBottom: 8 }}>\n            Verified links\n          </div>\n          <ReferencesList refs={verifiedRefs} dark={dark} />\n        </div>\n      )}\n\n      {searchRefs.length > 0 && (\n        <div style={{ marginTop: 16 }}>\n          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#94A3B8' : '#666', textTransform: 'uppercase', marginBottom: 8 }}>\n            Search SAP\n          </div>\n          <ReferencesList refs={searchRefs} dark={dark} />\n        </div>\n      )}\n"""
s = replace_once(s, old_block, new_block, 'reference UI rendering')
ui_path.write_text(s)

print('Reference recovery + SAP search fallback patch applied')
