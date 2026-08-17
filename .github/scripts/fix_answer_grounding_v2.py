from pathlib import Path
p=Path('api/chat.js'); s=p.read_text()

def replace_once(old,new,label):
    global s
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 anchor, found {n}')
    s=s.replace(old,new,1)

# PM transaction anchors for correct module/search context.
s=s.replace("'F1511', 'F1511A', 'F2023', 'IW31', 'IW32', 'IW33', 'IP10', 'IP11',","'F1511', 'F1511A', 'F2023', 'IW31', 'IW32', 'IW33', 'IA03', 'IA05', 'IA06', 'IA11', 'IA12', 'IP10', 'IP11',",1)

replace_once(
"const tavilyCandidates = [...tavilyFiltered, ...tavilyNotesFiltered].filter((r, i, arr) =>\n      r?.url && arr.findIndex(x => x?.url === r.url) === i\n    )",
"const tavilyCandidates = [...tavilyFiltered, ...tavilyNotesFiltered, ...tavilyRaw, ...tavilyNotesRaw].filter((r, i, arr) =>\n      r?.url && isApprovedUrl(r.url) && arr.findIndex(x => x?.url === r.url) === i\n    )\n    const tavilyDisplayCandidates = [...tavilyFiltered, ...tavilyNotesFiltered, ...tavilyRaw, ...tavilyNotesRaw].filter((r, i, arr) =>\n      r?.url && isApprovedUrl(r.url) && arr.findIndex(x => x?.url === r.url) === i\n    )",
"tavily candidate lanes")

replace_once("const referenceSearchResults = tavilyCandidates.slice(0, 4)\n    const allSearchResults = tavilyCandidates","const referenceSearchResults = tavilyDisplayCandidates.slice(0, 4)\n    const allSearchResults = tavilyDisplayCandidates","display lane")
replace_once("const hasDirectGrounding = bookChunks.length > 0 || knowledgeForPrompt.length > 0 || answerSearchResults.length > 0","const hasDirectGrounding = evidenceDecision.rag?.sufficient === true || answerSearchResults.length > 0","direct grounding")
replace_once("if (bookChunks.length===0 && knowledgeForPrompt.length===0 && openAISources.length===0 && answerSearchResults.length===0) {","if (evidenceDecision.rag?.sufficient !== true && answerSearchResults.length===0) {","insufficient grounding condition")
replace_once("⚠️ ZERO GROUNDING THIS TURN: no book chunks, no saved knowledge, no search sources — nothing was actually retrieved for this question. You are answering purely from your own training. If the answer requires stating a specific table field, TDOBJECT/TDID value, T-code, BAdI, or other named technical object, you must flag it as unverified (\"verify in your system\") rather than stating it with confidence — this is the exact situation the grounding rule above exists for.","⚠️ INSUFFICIENT GROUNDING THIS TURN: the evidence router did not find sufficiently direct internal or selected-web evidence for the exact question. Related KB rows are context only, not proof. Do not convert them into a specific mechanism for a different T-code/object. If exact SAP behavior is needed, validate it first with your native web_search; if you still cannot verify it, say so explicitly instead of filling the gap from training.","grounding warning text")
replace_once("- You MAY use your native web_search to try to verify the exact identifier. If you do, every factual claim learned from it must be accompanied by an inline citation to the source you actually found. A search having run is not proof by itself.","- BEFORE producing the final answer, you MUST use your native web_search at least once to verify the exact identifier and the exact behavior being asked about. Search for the exact identifier itself, not merely a similar transaction or generic process. Every factual claim learned from it must be accompanied by an inline citation to the source you actually found. A search having run is not proof by itself.","mandatory native verification")
replace_once("- If direct verification still fails, say plainly: \"I couldn't verify the exact behavior of <identifier> from a reliable source.\" Then separate what the user has OBSERVED in their own system from clearly labeled HYPOTHESES / checks.","- If direct verification still fails after that search, say plainly: \"I couldn't verify the exact behavior of <identifier> from a reliable source.\" Then separate what the user has OBSERVED in their own system from clearly labeled HYPOTHESES / checks. Do not provide a detailed mechanism as if confirmed.","verification failure behavior")
replace_once("debugLog.tavilyRaw      = tavilyRaw.length\n    debugLog.tavilyFiltered = tavilyFiltered.length","debugLog.tavilyRaw      = tavilyRaw.length\n    debugLog.tavilyRawCommunity = tavilyNotesRaw.length\n    debugLog.tavilyFiltered = tavilyFiltered.length","debug raw counts")

p.write_text(s)
print('answer-grounding v2 applied successfully')
