from pathlib import Path

p = Path('api/chat.js')
s = p.read_text()


def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'Missing expected block: {label}')
    s = s.replace(old, new, 1)


replace_once(
    "import { INTENT_PROMPTS, CODE_INTENTS, DELIVERABLE_INTENTS } from './intent-prompts.js'\n",
    "import { INTENT_PROMPTS, CODE_INTENTS, DELIVERABLE_INTENTS } from './intent-prompts.js'\nimport { assessEvidenceRouting, attachSelectedTavilyResults } from './evidence-routing.js'\n",
    'evidence router import',
)

replace_once(
    "const { messages, tone = 'balanced', userName, userRole, userModules = [], docWizardStage, deliverableRequested = false, tavilyABTest = false } = body",
    "const { messages, tone = 'balanced', userName, userRole, userModules = [], docWizardStage, deliverableRequested = false } = body",
    'A/B request flag',
)

old = """    // Combine search sources — general Tavily, community Tavily (both filtered), and OpenAI
    const openAISourcesRaw = openAIResult?.sources || []
    const openAISources = (openAISourcesRaw.length > 0)
      ? await filterRelevantResults(openAISourcesRaw, lastMsg).catch(() => openAISourcesRaw)
      : []
    const openAISearchText = openAIResult?.text || ''
    // Citable references = only sources whose CONTENT was actually injected into the
    // prompt. OpenAI sources are deliberately excluded: their text is no longer sent to
    // Sonnet, so listing their URLs here would let it attach [n] citations to pages it
    // never read — the exact failure seen with TC01, where a fabricated table name was
    // given a help.sap.com citation that did not mention it.
    const allSearchResults = [...tavilyFiltered, ...tavilyNotesFiltered]
    const relatedLinks     = openAISources


"""
new = """    // Combine search sources — general Tavily, community Tavily (both filtered), and OpenAI.
    const openAISourcesRaw = openAIResult?.sources || []
    const openAISources = (openAISourcesRaw.length > 0)
      ? await filterRelevantResults(openAISourcesRaw, lastMsg).catch(() => openAISourcesRaw)
      : []
    const openAISearchText = openAIResult?.text || ''

    // Discovery and answer grounding are separate decisions. Tavily always discovers
    // possible further-reading links for substantive SAP questions, but its content is
    // only allowed into Sonnet when the dynamic evidence judge says internal RAG/KB is
    // insufficient, or when the user is pushing back/re-verifying an earlier answer.
    const tavilyCandidates = [...tavilyFiltered, ...tavilyNotesFiltered].filter((r, i, arr) =>
      r?.url && arr.findIndex(x => x?.url === r.url) === i
    )
    const evidenceDecision = await assessEvidenceRouting({
      question: lastMsg,
      messages: allMessages,
      bookChunks,
      knowledgeEntries: relevantKnowledge,
      tavilyResults: tavilyCandidates,
    })
    const selectedTavily = attachSelectedTavilyResults(evidenceDecision, tavilyCandidates)
    const referenceSearchResults = selectedTavily.map(x => x.result)
    const answerSearchResults = evidenceDecision.useTavilyForAnswer ? referenceSearchResults : []
    const allSearchResults = tavilyCandidates
    const relatedLinks = openAISources

"""
replace_once(old, new, 'evidence decision insertion')

replace_once(
    "    debugLog.searchQuery    = searchQuery\n    // List copies for the shared buildDebugDoc renderer (used by all answer paths)\n    debugLog.bookChunkList  = bookChunks\n    debugLog.knowledgeList  = relevantKnowledge\n    debugLog.tavilyList     = tavilyFiltered\n\n    // Pill links always generated from context-aware query\n    const googleLinks = buildPillLinks(searchQuery)\n    const noteRefs    = allSearchResults.length > 0 ? extractNoteNumbers(allSearchResults) : []\n",
    "    debugLog.searchQuery    = searchQuery\n    debugLog.evidenceDecision = evidenceDecision\n    debugLog.tavilySelected = referenceSearchResults.length\n    debugLog.tavilySentToSonnet = answerSearchResults.length\n    // List copies for the shared buildDebugDoc renderer (used by all answer paths)\n    debugLog.bookChunkList  = bookChunks\n    debugLog.knowledgeList  = relevantKnowledge\n    debugLog.tavilyList     = tavilyCandidates\n\n    // Pill links always generated from context-aware query\n    const googleLinks = buildPillLinks(searchQuery)\n    const noteRefs    = answerSearchResults.length > 0 ? extractNoteNumbers(answerSearchResults) : []\n",
    'debug evidence fields',
)

replace_once(
    """    if (tavilyFiltered.length > 0) {
      const tavilyText = tavilyFiltered.map((r, i) =>
        `[T${i+1}] ${r.source} — ${r.title}\n${r.snippet}`
      ).join('\n\n')
      systemPrompt += `\n\nSAP COMMUNITY & BLOGS (from Tavily — SAP sources only):\n${tavilyText}`
    }

    if (allSearchResults.length > 0) {
      const sourceRef = allSearchResults.map((r, i) => `[${i+1}] ${r.title} — ${r.url}`).join('\n')
      systemPrompt += `\n\nSOURCE REFERENCES:\n${sourceRef}\n\nCITATION RULES: Weave citations INLINE using [1] [2] notation. Do NOT add a Sources section at the end. This rule applies identically when you use your own web_search tool mid-answer — those results also get cited inline as [1] [2], never as a manually-typed list of raw URLs at the end of your answer. The UI renders a proper sources panel automatically from whatever you cite inline; a hand-typed link dump duplicates it and looks broken.`
    }

    if (bookChunks.length===0 && relevantKnowledge.length===0 && openAISources.length===0 && tavilyFiltered.length===0) {
""",
    """    if (answerSearchResults.length > 0) {
      const tavilyText = answerSearchResults.map((r, i) =>
        `[T${i+1}] ${r.source} — ${r.title}\n${r.snippet}`
      ).join('\n\n')
      systemPrompt += `\n\nSAP COMMUNITY & BLOGS (selected Tavily evidence — SAP sources only):\n${tavilyText}`
    }

    if (answerSearchResults.length > 0) {
      const sourceRef = answerSearchResults.map((r, i) => `[${i+1}] ${r.title} — ${r.url}`).join('\n')
      systemPrompt += `\n\nSOURCE REFERENCES:\n${sourceRef}\n\nCITATION RULES: Weave citations INLINE using [1] [2] notation. Do NOT add a Sources section at the end. This rule applies identically when you use your own web_search tool mid-answer — those results also get cited inline as [1] [2], never as a manually-typed list of raw URLs at the end of your answer. The UI renders a proper sources panel automatically from whatever you cite inline; a hand-typed link dump duplicates it and looks broken.`
    }

    if (bookChunks.length===0 && relevantKnowledge.length===0 && openAISources.length===0 && answerSearchResults.length===0) {
""",
    'step 7 Tavily gate',
)

replace_once(
    "      // ALL SAP Q&A → Sonnet answers directly with books + Tavily injected\n      // No merger. No GPT-4o. Sonnet IS the final answer.\n      modelUsed = 'sonnet-direct'\n      debugLog.routing = 'sonnet-direct (books + tavily injected)'\n",
    "      // ALL SAP Q&A → Sonnet answers directly. Tavily content is gated by the\n      // evidence judge; selected Tavily links are retained separately for further reading.\n      modelUsed = 'sonnet-direct'\n      debugLog.routing = evidenceDecision.useTavilyForAnswer\n        ? 'sonnet-direct (RAG/KB + selected Tavily evidence)'\n        : 'sonnet-direct (RAG/KB only; Tavily retained for references)'\n",
    'dynamic Sonnet route label',
)

replace_once(
    """      // Inject Tavily results directly into Sonnet's prompt
      if (tavilyFiltered.length > 0) {
        const tavilyText = tavilyFiltered.map((r, i) =>
          `[Web ${i+1}] ${r.title}\nURL: ${r.url}\n${(r.snippet || '').slice(0, 1000)}`
        ).join('\n\n')
        enrichedSystemPrompt += `\n\n🔍 WEB SEARCH RESULTS — cite relevant ones with URL inline:\n${tavilyText}\n\nWhen using web content, cite it as: [Title](URL)`
      }
""",
    """      // Inject only dynamically selected Tavily evidence when internal RAG/KB
      // was judged insufficient or pushback/re-verification was detected.
      if (answerSearchResults.length > 0) {
        const tavilyText = answerSearchResults.map((r, i) =>
          `[Web ${i+1}] ${r.title}\nURL: ${r.url}\n${(r.snippet || '').slice(0, 1000)}`
        ).join('\n\n')
        enrichedSystemPrompt += `\n\n🔍 SELECTED WEB EVIDENCE — cite relevant ones with URL inline:\n${tavilyText}\n\nWhen using web content, cite it as: [Title](URL)`
      }
""",
    'direct Tavily injection gate',
)

replace_once(
    "      const runTavilyAB = Boolean(isAdmin && tavilyABTest)\n      send({ type: 'model_label', label: runTavilyAB ? 'A — WITH Tavily' : '' })\n",
    "      send({ type: 'model_label', label: 'by Claude Sonnet' })\n",
    'A/B model label',
)

start = s.find('      // ── PRIVATE ADMIN TAVILY A/B EXPERIMENT')
end = s.find('      // Sonnet answers directly — THIS is the final answer', start)
if start == -1 or end == -1:
    raise SystemExit('Could not locate pre-Sonnet A/B block')
s = s[:start] + s[end:]

start = s.find('      if (tavilyABPromise) {')
end = s.find('      debugLog.rawClaudeAnswer = fullAnswer', start)
if start == -1 or end == -1:
    raise SystemExit('Could not locate post-Sonnet A/B block')
s = s[:start] + s[end:]

replace_once(
    """    if (allSearchResults.length > 0) {
      send({ type: 'search_results', results: allSearchResults })
    }

    const isSubstantialAnswer = /\b(T-code|SPRO|table|BAdI|BAPI|transaction|configuration|SAP|S\/4HANA|ABAP|Fiori|order|material|routing|BOM|settlement|movement|notification|equipment)\b/i.test(fullAnswer || '')
    const allFurtherReading = isSubstantialAnswer ? [...allSearchResults, ...googleLinks].slice(0, 9) : []
""",
    """    if (referenceSearchResults.length > 0) {
      send({ type: 'search_results', results: referenceSearchResults })
    }

    const isSubstantialAnswer = /\b(T-code|SPRO|table|BAdI|BAPI|transaction|configuration|SAP|S\/4HANA|ABAP|Fiori|order|material|routing|BOM|settlement|movement|notification|equipment)\b/i.test(fullAnswer || '')
    const allFurtherReading = isSubstantialAnswer ? referenceSearchResults.slice(0, 2) : []
""",
    'top two references only',
)

shared_anchor = """    ...((dl.knowledgeCandidates || []).length
        ? dl.knowledgeCandidates.map(c => `    score ${c.score} — ${c.finding}`)
        : ['    (none returned by match_wani_knowledge — table empty for this user, RLS blocking, or RPC rejected threshold 0)']),
    '',
    '4. WEB SEARCH',
"""
shared_insert = """    ...((dl.knowledgeCandidates || []).length
        ? dl.knowledgeCandidates.map(c => `    score ${c.score} — ${c.finding}`)
        : ['    (none returned by match_wani_knowledge — table empty for this user, RLS blocking, or RPC rejected threshold 0)']),
    '',
    '3c. EVIDENCE QUALITY / ROUTING',
    '─────────────────────────────────────────────────────────',
    `RAG/KB score: ${dl.evidenceDecision?.rag?.score ?? 'n/a'} / 1.00`,
    `RAG/KB sufficient: ${dl.evidenceDecision?.rag?.sufficient ?? 'n/a'}`,
    `RAG/KB reason: ${dl.evidenceDecision?.rag?.reason || '(not evaluated)'}`,
    `Pushback/re-verification detected: ${dl.evidenceDecision?.pushback?.detected ?? false}`,
    `Pushback reason: ${dl.evidenceDecision?.pushback?.reason || '(none)'}`,
    `Tavily selected for references: ${dl.tavilySelected ?? 0}`,
    `Tavily sent to Sonnet: ${dl.tavilySentToSonnet ?? 0}`,
    `Answer evidence: ${dl.evidenceDecision?.useTavilyForAnswer ? 'RAG/KB + SELECTED TAVILY' : 'RAG/KB ONLY'}`,
    `Routing reason: ${dl.evidenceDecision?.routingReason || '(not evaluated)'}`,
    ...((dl.evidenceDecision?.tavilyRatings || []).map(r => {
      const src = (dl.tavilyList || [])[r.index] || {}
      const selected = (dl.evidenceDecision?.selectedTavily || []).some(x => x.index === r.index)
      const sent = selected && dl.evidenceDecision?.useTavilyForAnswer
      return `    [T${r.index+1}] score ${r.score.toFixed(2)} | relevance ${r.relevance.toFixed(2)} | authority ${r.authority.toFixed(2)} | support ${r.support.toFixed(2)} — ${sent ? 'SENT TO SONNET' : selected ? 'REFERENCE ONLY' : 'DROPPED'} — ${src.source || 'Web'} — ${src.title || ''}\n        ${r.reason || ''}`
    })),
    '',
    '4. WEB SEARCH',
"""
replace_once(shared_anchor, shared_insert, 'shared debug evidence block')

full_anchor = """      ...((debugLog.knowledgeCandidates || []).length
          ? debugLog.knowledgeCandidates.map(c => `    score ${c.score} — ${c.finding}`)
          : ['    (none returned — table empty for this user, RLS blocking, or RPC rejected threshold 0)']),
      '',
      '4a. WEB SEARCH — TAVILY GENERAL (unrestricted)',
"""
full_insert = """      ...((debugLog.knowledgeCandidates || []).length
          ? debugLog.knowledgeCandidates.map(c => `    score ${c.score} — ${c.finding}`)
          : ['    (none returned — table empty for this user, RLS blocking, or RPC rejected threshold 0)']),
      '',
      '3c. EVIDENCE QUALITY / ROUTING',
      '─────────────────────────────────────────────────────────',
      `RAG/KB score: ${evidenceDecision?.rag?.score ?? 'n/a'} / 1.00`,
      `RAG/KB sufficient: ${evidenceDecision?.rag?.sufficient ?? 'n/a'}`,
      `RAG/KB reason: ${evidenceDecision?.rag?.reason || '(not evaluated)'}`,
      `Pushback/re-verification detected: ${evidenceDecision?.pushback?.detected ?? false}`,
      `Pushback reason: ${evidenceDecision?.pushback?.reason || '(none)'}`,
      `Tavily selected for references: ${referenceSearchResults.length}`,
      `Tavily sent to Sonnet: ${answerSearchResults.length}`,
      `Answer evidence: ${evidenceDecision?.useTavilyForAnswer ? 'RAG/KB + SELECTED TAVILY' : 'RAG/KB ONLY'}`,
      `Routing reason: ${evidenceDecision?.routingReason || '(not evaluated)'}`,
      ...((evidenceDecision?.tavilyRatings || []).map(r => {
        const src = tavilyCandidates[r.index] || {}
        const selected = (evidenceDecision?.selectedTavily || []).some(x => x.index === r.index)
        const sent = selected && evidenceDecision?.useTavilyForAnswer
        return `    [T${r.index+1}] score ${r.score.toFixed(2)} | relevance ${r.relevance.toFixed(2)} | authority ${r.authority.toFixed(2)} | support ${r.support.toFixed(2)} — ${sent ? 'SENT TO SONNET' : selected ? 'REFERENCE ONLY' : 'DROPPED'} — ${src.source || 'Web'} — ${src.title || ''}\n        ${r.reason || ''}`
      })),
      '',
      '4a. WEB SEARCH — TAVILY GENERAL (unrestricted)',
"""
replace_once(full_anchor, full_insert, 'full debug evidence block')

s = s.replace(
    "          knowledgeChunks:    debugLog.knowledgeChunks,\n          timing: {",
    "          knowledgeChunks:    debugLog.knowledgeChunks,\n          evidenceDecision:    debugLog.evidenceDecision || null,\n          timing: {",
)
s = s.replace(
    "            bookRerank: debugLog.bookRerank || null,\n            bookChunkDetails:",
    "            bookRerank: debugLog.bookRerank || null,\n            evidenceDecision: debugLog.evidenceDecision || null,\n            bookChunkDetails:",
)
s = s.replace("      ...(debugLog.tavilyAB ? { tavilyAB: debugLog.tavilyAB } : {}),\n", '')
s = s.replace("tavilyResults: (tavilyFiltered || []).map(r => ({", "tavilyResults: (tavilyCandidates || []).map(r => ({")

p.write_text(s)

bp = Path('src/pages/Brain.jsx')
b = bp.read_text()
b = b.replace(', tavilyABTest:true', '')
b = b.replace("              if (evt.tavilyAB?.withoutTavilyDebugDoc) localABDebugDocWithoutTavily = evt.tavilyAB.withoutTavilyDebugDoc\n", '')
b = b.replace("        {!isStreaming && msg._dualText && (", "        {false && !isStreaming && msg._dualText && (")
b = b.replace("                    {(dualStreaming || dualText) && !isLoading ? (", "                    {false && (dualStreaming || dualText) && !isLoading ? (")
b = b.replace("        ...(localDualText ? { _dualText: localDualText, _dualLabel: localDualLabel } : {}),\n", '')
bp.write_text(b)
