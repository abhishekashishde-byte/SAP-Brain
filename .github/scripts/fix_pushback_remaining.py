from pathlib import Path
p=Path('api/chat.js')
s=p.read_text()

# Pass correction signal into evidence router.
old="""      knowledgeEntries: relevantKnowledge,
      tavilyResults: tavilyCandidates,
    })
"""
new="""      knowledgeEntries: relevantKnowledge,
      tavilyResults: tavilyCandidates,
      isCorrection,
    })
"""
if old in s:
    s=s.replace(old,new,1)

# Suppress retrieved KB from prompt during pushback, while leaving it available to router/debug.
marker="""    const selectedTavily = attachSelectedTavilyResults(evidenceDecision, tavilyCandidates)
"""
if 'const knowledgeForPrompt' not in s:
    if marker not in s: raise SystemExit('selectedTavily marker not found')
    s=s.replace(marker,marker+"    const knowledgeForPrompt = evidenceDecision.pushback?.detected ? [] : relevantKnowledge\n",1)

if 'knowledgeSuppressedForPushback' not in s:
    s=s.replace("    debugLog.knowledgeChunks = relevantKnowledge.length\n","    debugLog.knowledgeChunks = relevantKnowledge.length\n    debugLog.knowledgeSuppressedForPushback = evidenceDecision.pushback?.detected ? relevantKnowledge.length : 0\n",1)

# Prompt gets only trusted-for-this-turn KB.
s=s.replace("    if (relevantKnowledge.length > 0) {\n      systemPrompt += `\\n\\n📌 VERIFIED FROM REAL PROJECTS", "    if (knowledgeForPrompt.length > 0) {\n      systemPrompt += `\\n\\n📌 VERIFIED FROM REAL PROJECTS",1)
s=s.replace("${relevantKnowledge.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object})`).join('\\n')}","${knowledgeForPrompt.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object})`).join('\\n')}",1)
s=s.replace("bookChunks.length===0 && relevantKnowledge.length===0 && openAISources.length===0 && answerSearchResults.length===0","bookChunks.length===0 && knowledgeForPrompt.length===0 && openAISources.length===0 && answerSearchResults.length===0",1)

# Explicit correction mode for Sonnet.
doc_marker="""    // ── Document context ───────────────────────────────────────────────────
"""
if 'PUSHBACK / RE-VERIFICATION MODE' not in s:
    block="""    // ── Pushback / correction verification mode ─────────────────────────────
    if (evidenceDecision.pushback?.detected) {
      const disputed = (evidenceDecision.pushback.disputedClaims || []).map((c, i) => `${i+1}. ${c}`).join('\\n') || 'The previous answer is being challenged; identify the disputed claim from the conversation.'
      systemPrompt += `\\n\\n🚨 PUSHBACK / RE-VERIFICATION MODE — MANDATORY:\\nThe user has challenged the previous answer. Treat the previous answer and any matching saved KB finding as UNTRUSTED for this turn. Do not defend or repeat it merely because it appears in conversation history or KB.\\n\\nDISPUTED CLAIMS:\\n${disputed}\\n\\nVERIFICATION RULES:\\n- Re-evaluate the claim from independent evidence only: book evidence, directly supporting selected web evidence, or your native web_search.\\n- Same-topic evidence is not enough. It must directly support or contradict the disputed mechanism.\\n- Before stating an exact SAP technical identifier (table-field, T-code, BAdI, SAP Note, Fiori app ID, SPRO path), verify that exact identifier in independent evidence.\\n- If the exact identifier cannot be verified, DO NOT guess another one. Give the functional/mechanism answer you can support and explicitly say the technical identifier remains unverified.\\n- If the user's correction itself is not independently verified, acknowledge it as a lead, not as established fact.\\n- Correct the earlier answer plainly when evidence supports a correction.`
    }

"""
    if doc_marker not in s: raise SystemExit('document marker not found')
    s=s.replace(doc_marker,block+doc_marker,1)

# Remove source-code SAP topic corrections; corrections belong in evidence/KB.
start="""    // ── Permanent hardcoded corrections ────────────────────────────────────────
"""
end="""    // ── Global corrections ─────────────────────────────────────────────────
"""
if start in s and end in s:
    a=s.index(start); b=s.index(end,a); s=s[:a]+s[b:]

# Defense in depth: pushback never enters code-only route.
s=s.replace("    const isRealCode = isCode && !isBapiFmQuestion\n","    const isRealCode = isCode && !isBapiFmQuestion && !evidenceDecision.pushback?.detected\n",1)

p.write_text(s)
print('remaining pushback safeguards applied')
