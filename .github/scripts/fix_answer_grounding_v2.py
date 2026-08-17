from pathlib import Path
p=Path('api/chat.js'); s=p.read_text()
old="'F1511', 'F1511A', 'F2023', 'IW31', 'IW32', 'IW33', 'IP10', 'IP11',"
new="'F1511', 'F1511A', 'F2023', 'IW31', 'IW32', 'IW33', 'IA03', 'IA05', 'IA06', 'IA11', 'IA12', 'IP10', 'IP11',"
if old in s: s=s.replace(old,new,1)
old="""    const tavilyCandidates = [...tavilyFiltered, ...tavilyNotesFiltered].filter((r, i, arr) =>
      r?.url && arr.findIndex(x => x?.url === r.url) === i
    )
    const evidenceDecision = await assessEvidenceRouting({
"""
new="""    const tavilyCandidates = [...tavilyFiltered, ...tavilyNotesFiltered, ...tavilyRaw, ...tavilyNotesRaw].filter((r, i, arr) =>
      r?.url && isApprovedUrl(r.url) && arr.findIndex(x => x?.url === r.url) === i
    )
    const tavilyDisplayCandidates = [...tavilyFiltered, ...tavilyNotesFiltered, ...tavilyRaw, ...tavilyNotesRaw].filter((r, i, arr) =>
      r?.url && isApprovedUrl(r.url) && arr.findIndex(x => x?.url === r.url) === i
    )
    const evidenceDecision = await assessEvidenceRouting({
"""
assert s.count(old)==1, s.count(old); s=s.replace(old,new,1)
old="""    const referenceSearchResults = tavilyCandidates.slice(0, 4)
    const allSearchResults = tavilyCandidates
"""; new="""    const referenceSearchResults = tavilyDisplayCandidates.slice(0, 4)
    const allSearchResults = tavilyDisplayCandidates
"""; assert s.count(old)==1; s=s.replace(old,new,1)
old="    const hasDirectGrounding = bookChunks.length > 0 || knowledgeForPrompt.length > 0 || answerSearchResults.length > 0\n"; new="    const hasDirectGrounding = evidenceDecision.rag?.sufficient === true || answerSearchResults.length > 0\n"; assert s.count(old)==1; s=s.replace(old,new,1)
old="""    if (bookChunks.length===0 && knowledgeForPrompt.length===0 && openAISources.length===0 && answerSearchResults.length===0) {
      systemPrompt += `\n\n⚠️ ZERO GROUNDING THIS TURN: no book chunks, no saved knowledge, no search sources — nothing was actually retrieved for this question. You are answering purely from your own training. If the answer requires stating a specific table field, TDOBJECT/TDID value, T-code, BAdI, or other named technical object, you must flag it as unverified (\"verify in your system\") rather than stating it with confidence — this is the exact situation the grounding rule above exists for.`
    }
"""; new="""    if (evidenceDecision.rag?.sufficient !== true && answerSearchResults.length===0) {
      systemPrompt += `\n\n⚠️ INSUFFICIENT GROUNDING THIS TURN: the evidence router did not find sufficiently direct internal or selected-web evidence for the exact question. Related KB rows are context only, not proof. Do not convert them into a specific mechanism for a different T-code/object. If exact SAP behavior is needed, validate it first with your native web_search; if you still cannot verify it, say so explicitly instead of filling the gap from training.`
    }
"""; assert s.count(old)==1; s=s.replace(old,new,1)
old="""- You MAY use your native web_search to try to verify the exact identifier. If you do, every factual claim learned from it must be accompanied by an inline citation to the source you actually found. A search having run is not proof by itself.
- If direct verification still fails, say plainly: \"I couldn't verify the exact behavior of <identifier> from a reliable source.\" Then separate what the user has OBSERVED in their own system from clearly labeled HYPOTHESES / checks.
"""; new="""- BEFORE producing the final answer, you MUST use your native web_search at least once to verify the exact identifier and the exact behavior being asked about. Search for the exact identifier itself, not merely a similar transaction or generic process. Every factual claim learned from it must be accompanied by an inline citation to the source you actually found. A search having run is not proof by itself.
- If direct verification still fails after that search, say plainly: \"I couldn't verify the exact behavior of <identifier> from a reliable source.\" Then separate what the user has OBSERVED in their own system from clearly labeled HYPOTHESES / checks. Do not provide a detailed mechanism as if confirmed.
"""; assert s.count(old)==1; s=s.replace(old,new,1)
old="""    debugLog.tavilyRaw      = tavilyRaw.length
    debugLog.tavilyFiltered = tavilyFiltered.length
"""; new="""    debugLog.tavilyRaw      = tavilyRaw.length
    debugLog.tavilyRawCommunity = tavilyNotesRaw.length
    debugLog.tavilyFiltered = tavilyFiltered.length
"""; assert s.count(old)==1; s=s.replace(old,new,1)
p.write_text(s)
print('answer-grounding v2 applied')
