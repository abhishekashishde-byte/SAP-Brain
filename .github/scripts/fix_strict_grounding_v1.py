from pathlib import Path

p = Path('api/chat.js')
s = p.read_text()

old = """    const searchQueryPromise = (!isDeliverable && needsSearch)\n      ? rewriteForSearch(lastMsg, recentContext).catch(() => lastMsg)\n      : Promise.resolve(lastMsg)\n"""
new = """    // Preserve exact SAP-looking identifiers in search. A query rewriter may add\n    // useful context, but it must never search only for an inferred/related concept\n    // while dropping the exact object the consultant typed (e.g. C223_D).\n    const exactSearchIdentifiers = Array.from(new Set(\n      (lastMsg.match(/\\b[A-Z][A-Z0-9_\\/-]{2,}\\b/g) || [])\n        .filter(x => !['SAP','ECC','S4HANA','HANA'].includes(x) && (/\\d|_/.test(x) || x.length <= 8))\n    )).slice(0, 6)\n    const searchQueryPromise = (!isDeliverable && needsSearch)\n      ? rewriteForSearch(lastMsg, recentContext)\n          .then(q => exactSearchIdentifiers.length\n            ? `${q} ${exactSearchIdentifiers.filter(id => !q.includes(id)).map(id => `\\"${id}\\"`).join(' ')}`.trim()\n            : q)\n          .catch(() => lastMsg)\n      : Promise.resolve(lastMsg)\n"""
if s.count(old) != 1:
    raise SystemExit(f'search query anchor count={s.count(old)}')
s = s.replace(old, new, 1)

old2 = """    const answerSearchResults = evidenceDecision.useTavilyForAnswer ? referenceSearchResults : []\n    const allSearchResults = tavilyCandidates\n    const relatedLinks = openAISources\n"""
new2 = """    const answerSearchResults = evidenceDecision.useTavilyForAnswer ? referenceSearchResults : []\n    const allSearchResults = tavilyCandidates\n    const relatedLinks = openAISources\n\n    // Direct-evidence gate for obscure/exact SAP identifiers. The evidence judge may\n    // correctly reject same-topic search results; when that happens, do NOT let model\n    // training fill the gap with a plausible-sounding mechanism. This is intentionally\n    // generic: it protects T-codes, fields, programs, BAdIs, Notes, etc., not one C223_D case.\n    const hasDirectGrounding = bookChunks.length > 0 || knowledgeForPrompt.length > 0 || answerSearchResults.length > 0\n    const exactSapIdentifiers = exactSearchIdentifiers\n    const strictGroundingMode = !hasDirectGrounding && needsSearch && exactSapIdentifiers.length > 0\n"""
if s.count(old2) != 1:
    raise SystemExit(f'evidence anchor count={s.count(old2)}')
s = s.replace(old2, new2, 1)

old3 = """    debugLog.tavilySentToSonnet = answerSearchResults.length\n    // List copies for the shared buildDebugDoc renderer (used by all answer paths)\n"""
new3 = """    debugLog.tavilySentToSonnet = answerSearchResults.length\n    debugLog.strictGroundingMode = strictGroundingMode\n    debugLog.exactSapIdentifiers = exactSapIdentifiers\n    // List copies for the shared buildDebugDoc renderer (used by all answer paths)\n"""
if s.count(old3) != 1:
    raise SystemExit(f'debug anchor count={s.count(old3)}')
s = s.replace(old3, new3, 1)

marker = "    // ── Pushback / correction verification mode ─────────────────────────────\n"
strict_block = """    if (strictGroundingMode) {\n      systemPrompt += `\\n\\n🛑 STRICT DIRECT-EVIDENCE GATE — MANDATORY, HIGHER PRIORITY THAN NORMAL ANSWERING STYLE:\nThe question contains exact SAP identifier(s): ${exactSapIdentifiers.join(', ')}. Wani retrieved NO direct book/KB/selected-web evidence that validates the behavior of those exact identifiers. Same-topic pages that merely mention a related object do NOT count.\n\nYou MUST obey all of these rules:\n- Do NOT infer what an identifier does from its name, suffix, naming pattern, a similar transaction, or general SAP convention. In particular, a suffix such as _D is NOT evidence of display-only behavior.\n- Do NOT state a program name, transaction type, screen logic, implicit filter, table-field meaning, validity rule, lock rule, consistency rule, or causal mechanism for the exact identifier as fact unless direct evidence supports that exact claim.\n- You MAY use your native web_search to try to verify the exact identifier. If you do, every factual claim learned from it must be accompanied by an inline citation to the source you actually found. A search having run is not proof by itself.\n- If direct verification still fails, say plainly: \\"I couldn't verify the exact behavior of <identifier> from a reliable source.\\" Then separate what the user has OBSERVED in their own system from clearly labeled HYPOTHESES / checks.\n- The user's observed system behavior is evidence about their system and must not be overridden by a generic naming assumption.\n- Never upgrade a hypothesis into \\"the root cause\\" without direct supporting evidence. Use \\"possible cause\\", \\"worth checking\\", or \\"unverified\\" instead.\n- It is better to give a shorter, explicit uncertainty than a detailed invented explanation.`\n    }\n\n"""
if s.count(marker) != 1:
    raise SystemExit(f'pushback marker count={s.count(marker)}')
s = s.replace(marker, strict_block + marker, 1)

p.write_text(s)
print('strict grounding v1 applied')
