from pathlib import Path

p = Path('api/chat.js')
s = p.read_text()

old = """    const selectedTavily = attachSelectedTavilyResults(evidenceDecision, tavilyCandidates)\n    const knowledgeForPrompt = evidenceDecision.pushback?.detected ? [] : relevantKnowledge\n    const referenceSearchResults = selectedTavily.map(x => x.result)\n    const answerSearchResults = evidenceDecision.useTavilyForAnswer ? referenceSearchResults : []\n    const allSearchResults = tavilyCandidates\n    const relatedLinks = openAISources\n"""
new = """    const selectedTavily = attachSelectedTavilyResults(evidenceDecision, tavilyCandidates)\n    const knowledgeForPrompt = evidenceDecision.pushback?.detected ? [] : relevantKnowledge\n\n    // IMPORTANT: keep answer-grounding and user-facing Verified Links as two\n    // independent lanes. The evidence judge decides what Sonnet may see; it must\n    // never erase relevant authentic SAP pages from the answer UI.\n    const groundingSearchResults = selectedTavily.map(x => x.result)\n    const answerSearchResults = evidenceDecision.useTavilyForAnswer ? groundingSearchResults : []\n\n    // Tavily candidates here have ALREADY passed the separate same-topic relevance\n    // filter and are restricted to approved SAP domains. They remain visible as\n    // Verified Links even when their evidence/support rating is too low for Sonnet.\n    // This restores Wani's original discovery value without weakening grounding.\n    const referenceSearchResults = tavilyCandidates.slice(0, 4)\n    const allSearchResults = tavilyCandidates\n    const relatedLinks = openAISources\n"""
if s.count(old) != 1:
    raise SystemExit(f'lane anchor count={s.count(old)}')
s = s.replace(old, new, 1)

old2 = """    debugLog.evidenceDecision = evidenceDecision\n    debugLog.tavilySelected = referenceSearchResults.length\n    debugLog.tavilySentToSonnet = answerSearchResults.length\n"""
new2 = """    debugLog.evidenceDecision = evidenceDecision\n    debugLog.tavilySelected = groundingSearchResults.length\n    debugLog.tavilyDisplayed = referenceSearchResults.length\n    debugLog.tavilySentToSonnet = answerSearchResults.length\n"""
if s.count(old2) != 1:
    raise SystemExit(f'debug count anchor={s.count(old2)}')
s = s.replace(old2, new2, 1)

old3 = """      `Tavily selected for references: ${referenceSearchResults.length}`,\n      `Tavily sent to Sonnet: ${answerSearchResults.length}`,\n"""
new3 = """      `Tavily selected for answer grounding: ${groundingSearchResults.length}`,\n      `Tavily shown as Verified Links: ${referenceSearchResults.length}`,\n      `Tavily sent to Sonnet: ${answerSearchResults.length}`,\n"""
if s.count(old3) != 1:
    raise SystemExit(f'debug doc counter anchor={s.count(old3)}')
s = s.replace(old3, new3, 1)

old4 = """        const selected = (evidenceDecision?.selectedTavily || []).some(x => x.index === r.index)\n        const sent = selected && evidenceDecision?.useTavilyForAnswer\n        return `    [T${r.index+1}] score ${r.score.toFixed(2)} | relevance ${r.relevance.toFixed(2)} | authority ${r.authority.toFixed(2)} | support ${r.support.toFixed(2)} — ${sent ? 'SENT TO SONNET' : selected ? 'REFERENCE ONLY' : 'DROPPED'} — ${src.source || 'Web'} — ${src.title || ''}\\n        ${r.reason || ''}`\n"""
new4 = """        const selected = (evidenceDecision?.selectedTavily || []).some(x => x.index === r.index)\n        const sent = selected && evidenceDecision?.useTavilyForAnswer\n        const displayed = referenceSearchResults.some(x => x.url === src.url)\n        return `    [T${r.index+1}] score ${r.score.toFixed(2)} | relevance ${r.relevance.toFixed(2)} | authority ${r.authority.toFixed(2)} | support ${r.support.toFixed(2)} — ${sent ? 'SENT TO SONNET + DISPLAYED' : displayed ? 'DISPLAY ONLY (NOT SENT TO SONNET)' : 'NOT DISPLAYED'} — ${src.source || 'Web'} — ${src.title || ''}\\n        ${r.reason || ''}`\n"""
if s.count(old4) != 1:
    raise SystemExit(f'rating label anchor={s.count(old4)}')
s = s.replace(old4, new4, 1)

old5 = """        tavilyFiltered: debugLog.tavilyFiltered || 0,\n        tavilyNotes:    debugLog.tavilyNotes  || 0,\n"""
new5 = """        tavilyFiltered: debugLog.tavilyFiltered || 0,\n        tavilyNotes:    debugLog.tavilyNotes  || 0,\n        tavilyDisplayed: debugLog.tavilyDisplayed || 0,\n"""
if s.count(old5) != 1:
    raise SystemExit(f'sourceInfo anchor={s.count(old5)}')
s = s.replace(old5, new5, 1)

p.write_text(s)
print('restored independent Tavily display lane')
