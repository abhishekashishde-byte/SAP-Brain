from pathlib import Path
p=Path('api/chat.js')
s=p.read_text()

# 1) Keep Tavily discovery/display independent from the evidence judge.
old="""    const selectedTavily = attachSelectedTavilyResults(evidenceDecision, tavilyCandidates)\n    const knowledgeForPrompt = evidenceDecision.pushback?.detected ? [] : relevantKnowledge\n    const referenceSearchResults = selectedTavily.map(x => x.result)\n    const answerSearchResults = evidenceDecision.useTavilyForAnswer ? referenceSearchResults : []\n    const allSearchResults = tavilyCandidates\n"""
new="""    const selectedTavily = attachSelectedTavilyResults(evidenceDecision, tavilyCandidates)\n    const knowledgeForPrompt = evidenceDecision.pushback?.detected ? [] : relevantKnowledge\n\n    // Two independent Tavily lanes:\n    // - DISPLAY: every result that already passed Wani's same-topic relevance filter\n    //   remains eligible for Verified Links. The second evidence judge must never make\n    //   authentic, relevant SAP findings disappear from the answer-level UI.\n    // - GROUNDING: only evidence-router-selected results may enter Sonnet's prompt.\n    // This preserves the product rule: low-rated Tavily findings stay visible but cannot\n    // influence the answer.\n    const referenceSearchResults = tavilyCandidates\n    const selectedGroundingResults = selectedTavily.map(x => x.result)\n    const answerSearchResults = evidenceDecision.useTavilyForAnswer ? selectedGroundingResults : []\n    const allSearchResults = tavilyCandidates\n"""
assert old in s, 'Tavily lane anchor not found'
s=s.replace(old,new,1)

# 2) Make debug language reflect display-vs-grounding separation.
s=s.replace("`Tavily selected for references: ${dl.tavilySelected ?? 0}`", "`Tavily shown as Verified Links: ${dl.tavilySelected ?? 0}`")
s=s.replace("`Tavily selected for references: ${referenceSearchResults.length}`", "`Tavily shown as Verified Links: ${referenceSearchResults.length}`")

# 3) Add hard first-turn verification rule for SAP questions classified as needing search.
anchor="""    if (answerSearchResults.length > 0) {\n      const sourceRef = answerSearchResults.map((r, i) => `[${i+1}] ${r.title} — ${r.url}`).join('\\n')\n      systemPrompt += `\\n\\nSOURCE REFERENCES:\\n${sourceRef}\\n\\nCITATION RULES: Weave citations INLINE using [1] [2] notation. Do NOT add a Sources section at the end. This rule applies identically when you use your own web_search tool mid-answer — those results also get cited inline as [1] [2], never as a manually-typed list of raw URLs at the end of your answer. The UI renders a proper sources panel automatically from whatever you cite inline; a hand-typed link dump duplicates it and looks broken.`\n    }\n"""
assert anchor in s, 'Source refs anchor not found'
addition=anchor+"""\n    // If classification says this SAP answer needs live verification, do not leave\n    // Sonnet's native search optional. It must independently check the answer on the\n    // FIRST turn, even when Book RAG or selected Tavily evidence already exists. This\n    // specifically protects exact T-codes, tables, fields, BAdIs, app IDs and behavior\n    // claims from an upstream evidence judge being confidently wrong.\n    const forceSonnetVerification = !isDeliverable && needsSearch && SAP_QA_INTENTS.has(intent)\n    if (forceSonnetVerification) {\n      systemPrompt += `\\n\\n🌐 LIVE VERIFICATION REQUIRED — MANDATORY FOR THIS TURN:\\nBefore writing the final answer, you MUST use your native web_search tool at least once. Do not treat Book RAG, Tavily scoring, saved knowledge, or your training memory as a substitute for this independent check. Verify the central SAP mechanism and every exact technical identifier you intend to rely on (especially T-codes, tables/fields, BAdIs, app IDs, SAP Notes, and SPRO paths). If live search conflicts with retrieved context, surface the conflict and prefer directly verified evidence. If a specific identifier cannot be verified, do not present it as fact.`\n    }\n"""
s=s.replace(anchor,addition,1)

# 4) Force the only available Anthropic tool (web_search) when verification is required.
old="""  if (opts.enableWebSearch) {\n    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]\n  }\n"""
new="""  if (opts.enableWebSearch) {\n    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]\n    // Anthropic tool_choice `any` guarantees at least one tool call. Because web_search\n    // is the only tool in this request, this guarantees a real verification search on\n    // turns Wani explicitly classified as needing live verification.\n    if (opts.forceWebSearch) body.tool_choice = { type: 'any' }\n  }\n"""
assert old in s, 'streamClaude tool anchor not found'
s=s.replace(old,new,1)

old="""        { enableWebSearch: process.env.WANI_DISABLE_SEARCH !== 'true' }\n"""
new="""        {\n          enableWebSearch: process.env.WANI_DISABLE_SEARCH !== 'true',\n          forceWebSearch: forceSonnetVerification && process.env.WANI_DISABLE_SEARCH !== 'true',\n        }\n"""
assert old in s, 'streamClaude call anchor not found'
s=s.replace(old,new,1)

# 5) Improve debug so a zero search on a forced turn is unmistakably a failure.
s=s.replace("`Verification searches used: ${dl.sonnetVerificationSearches || 0}`", "`Verification searches used: ${dl.sonnetVerificationSearches || 0}${dl.forceSonnetVerification ? ' (MANDATORY)' : ''}`")
s=s.replace("`Verification searches used: ${debugLog.sonnetVerificationSearches ?? 0}`", "`Verification searches used: ${debugLog.sonnetVerificationSearches ?? 0}${debugLog.forceSonnetVerification ? ' (MANDATORY)' : ''}`")
# record flag before model invocation
needle="""      const sonnetResult = await streamClaude(\n"""
assert needle in s, 'Sonnet invocation anchor not found'
s=s.replace(needle,"""      debugLog.forceSonnetVerification = forceSonnetVerification\n      const sonnetResult = await streamClaude(\n""",1)

p.write_text(s)
print('Tavily display lane and mandatory Sonnet verification repaired')
