from pathlib import Path

p = Path('api/chat.js')
s = p.read_text()

# 1) Make correction detection robust and prevent prose corrections from becoming CODE_ANALYSIS.
old = """    // isCode should not trigger on 'function module' questions — those are Q&A not code
    const hasFmPhrase = /\\b(function module|bapi|rfc module)\\b/i.test(question)
    const isCode  = result.isCode  === true || (!hasFmPhrase && /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |\\bFUNCTION\\b/i.test(question))
    const isError = result.isError === true || /\\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\\.)\\b/i.test(question)
    const isCorrectionRegex = /\\b(actually|that('s| is) (wrong|incorrect|not right)|you('re| are) wrong|wrong answer|incorrect answer|it should be|the correct|please (note|correct)|i('m| am) correcting)\\b/i.test(question)
    const isCorrection = result.isCorrection === true || isCorrectionRegex
"""
new = """    // Correction/pushback is a conversation act, not code. A model can mistake terse
    // consultant prose containing SAP-ish words for CODE_ANALYSIS, so only strong actual
    // code syntax (or the explicit attachment marker) is allowed to override a correction.
    const hasFmPhrase = /\\b(function module|bapi|rfc module)\\b/i.test(question)
    const isCorrectionRegex = /(?:\\b(?:actually|still wrong|wrong again|wrong answer|incorrect answer|not correct|not right|that(?:'s| is) wrong|that(?:'s| is) incorrect|you(?:'re| are) wrong|u are wrong|u r wrong|you are still wrong|it should be|the correct(?: answer)?|please (?:note|correct)|i(?:'m| am) correcting|no[, —-]+(?:that|this|you)|we have to)\\b)/i.test(question)
    const isCorrection = result.isCorrection === true || isCorrectionRegex
    const strongCodeSyntax = /\\[ATTACHED_CODE\\b|(?:^|\\n)\\s*(?:REPORT|CLASS|METHOD|FORM|FUNCTION)\\s+\\w+|(?:^|\\n)\\s*(?:DATA|TYPES|CONSTANTS)\\s*:|\\bLOOP\\s+AT\\s+\\w+|\\bSELECT\\s+.+\\s+FROM\\s+\\w+|\\bENDLOOP\\.|\\bENDMETHOD\\.|\\bENDIF\\./im.test(question)
    const modelSaysCode = result.isCode === true || result.intent === 'CODE_ANALYSIS'
    const isCode = !hasFmPhrase && (strongCodeSyntax || (modelSaysCode && !isCorrection && /[;{}]|\\n/.test(question)))
    const isError = result.isError === true || /\\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\\.)\\b/i.test(question)
"""
if old not in s:
    raise SystemExit('classifier block not found')
s = s.replace(old, new, 1)

# Hard correction override after the normal intent overrides: inherit SAP Q&A behavior rather
# than routing the challenge as code/deliverable. This is topic-agnostic.
needle = """    if (isTeachMeKeyword && !isCode && !isError) { intent = 'TEACH_ME'; confidence = 0.9 }
"""
insert = needle + """    // A challenge to the previous SAP answer stays in the SAP Q&A lane unless the
    // user actually pasted code/error content. The evidence router will then perform
    // claim-level re-verification using conversation context.
    if (isCorrection && !strongCodeSyntax && !isError) {
      intent = 'SAP_QA'
      secondaryIntent = null
      confidence = Math.max(confidence, 0.95)
    }
"""
if needle not in s:
    raise SystemExit('teach-me marker not found')
s = s.replace(needle, insert, 1)

# 2) Pass the classifier correction signal into the evidence router.
old = """      knowledgeEntries: relevantKnowledge,
      tavilyResults: tavilyCandidates,
    })
"""
new = """      knowledgeEntries: relevantKnowledge,
      tavilyResults: tavilyCandidates,
      isCorrection,
    })
"""
if old not in s:
    raise SystemExit('evidence router call not found')
s = s.replace(old, new, 1)

# 3) Suppress saved KB from the answer prompt on pushback. It remains visible to the router
# for dispute detection/debug, but cannot reinforce itself as authoritative evidence.
marker = """    const selectedTavily = attachSelectedTavilyResults(evidenceDecision, tavilyCandidates)
"""
replacement = marker + """    const knowledgeForPrompt = evidenceDecision.pushback?.detected ? [] : relevantKnowledge
"""
if marker not in s:
    raise SystemExit('selected tavily marker not found')
s = s.replace(marker, replacement, 1)

# Debug visibility for suppression.
old = """    debugLog.knowledgeChunks = relevantKnowledge.length
"""
new = """    debugLog.knowledgeChunks = relevantKnowledge.length
    debugLog.knowledgeSuppressedForPushback = evidenceDecision.pushback?.detected ? relevantKnowledge.length : 0
"""
s = s.replace(old, new, 1)

# Replace the KB prompt injection to use only trusted-for-this-turn knowledge.
s = s.replace("if (relevantKnowledge.length > 0) {\n      systemPrompt +=", "if (knowledgeForPrompt.length > 0) {\n      systemPrompt +=", 1)
s = s.replace("${relevantKnowledge.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object})`).join('\\n')}", "${knowledgeForPrompt.map(k => `- ${k.finding} (${k.module} > ${k.topic} > ${k.object})`).join('\\n')}", 1)

# Zero-grounding logic must use trusted KB, not quarantined KB.
s = s.replace("bookChunks.length===0 && relevantKnowledge.length===0 && openAISources.length===0 && answerSearchResults.length===0", "bookChunks.length===0 && knowledgeForPrompt.length===0 && openAISources.length===0 && answerSearchResults.length===0", 1)

# 4) Add explicit pushback verification mode before document context.
push_marker = """    // ── Document context ───────────────────────────────────────────────────
"""
push_block = """    // ── Pushback / correction verification mode ─────────────────────────────
    if (evidenceDecision.pushback?.detected) {
      const disputed = (evidenceDecision.pushback.disputedClaims || []).map((c, i) => `${i+1}. ${c}`).join('\\n') || 'The previous answer is being challenged; identify the disputed claim from the conversation.'
      systemPrompt += `\\n\\n🚨 PUSHBACK / RE-VERIFICATION MODE — MANDATORY:\\nThe user has challenged the previous answer. Treat the previous answer and any matching saved KB finding as UNTRUSTED for this turn. Do not defend or repeat it merely because it appears in conversation history or KB.\\n\\nDISPUTED CLAIMS:\\n${disputed}\\n\\nVERIFICATION RULES:\\n- Re-evaluate the claim from independent evidence only: book evidence, directly supporting selected web evidence, or your native web_search.\\n- Same-topic evidence is not enough. It must directly support or contradict the disputed mechanism.\\n- Before stating an exact SAP technical identifier (table-field, T-code, BAdI, SAP Note, Fiori app ID, SPRO path), verify that exact identifier in independent evidence.\\n- If the exact identifier cannot be verified, DO NOT guess another one. Give the functional/mechanism answer you can support and explicitly say the technical identifier remains unverified.\\n- If the user's correction itself is not independently verified, acknowledge it as a lead, not as established fact.\\n- Correct the earlier answer plainly when evidence supports a correction.`
    }

""" + push_marker
if push_marker not in s:
    raise SystemExit('document context marker not found')
s = s.replace(push_marker, push_block, 1)

# 5) Remove topic-specific permanent hardcoding from the answer prompt. Corrections belong
# in evidence/KB flows, not source code.
old = """    // ── Permanent hardcoded corrections ────────────────────────────────────────
    systemPrompt += `\\n\\n⚠️ PERMANENT CORRECTIONS — ALWAYS APPLY:\\n- MRP Area exists indicator field is MARC-DIBER (NOT MARC-KZAUN — KZAUN is unrelated to MRP Areas)\\n- MDMA table stores MRP Area data for materials\\n- Standard SAP report for mass update of MRP area indicator contains DIBER in its name`

"""
if old in s:
    s = s.replace(old, '', 1)

# 6) Defense in depth: pushback prose can never enter code route unless actual code syntax exists.
old = """    const isRealCode = isCode && !isBapiFmQuestion
"""
new = """    const isRealCode = isCode && !isBapiFmQuestion && !evidenceDecision.pushback?.detected
"""
if old not in s:
    raise SystemExit('isRealCode marker not found')
s = s.replace(old, new, 1)

p.write_text(s)
print('pushback architecture patched')
