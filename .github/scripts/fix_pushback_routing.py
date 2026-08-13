from pathlib import Path

# ---- api/chat.js: correction must win over accidental code classification ----
p = Path('api/chat.js')
s = p.read_text()

old = """    // isCode should not trigger on 'function module' questions — those are Q&A not code\n    const hasFmPhrase = /\\b(function module|bapi|rfc module)\\b/i.test(question)\n    const isCode  = result.isCode  === true || (!hasFmPhrase && /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |\\bFUNCTION\\b/i.test(question))\n    const isError = result.isError === true || /\\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\\.)\\b/i.test(question)\n    const isCorrectionRegex = /\\b(actually|that('s| is) (wrong|incorrect|not right)|you('re| are) wrong|wrong answer|incorrect answer|it should be|the correct|please (note|correct)|i('m| am) correcting)\\b/i.test(question)\n    const isCorrection = result.isCorrection === true || isCorrectionRegex\n"""
new = """    // Detect correction/pushback BEFORE code classification. A sentence such as\n    // \"you are still wrong, go to edit material master...\" is SAP correction context,\n    // not ABAP merely because the classifier happened to set isCode=true.\n    const isCorrectionRegex = /\\b(actually|still wrong|you(?:'re| are| r|re)?\\s*(?:still\\s*)?(?:wrong|incorrect)|u\\s*(?:are|r)?\\s*(?:still\\s*)?(?:wrong|incorrect)|that(?:'s| is) (?:wrong|incorrect|not right)|wrong answer|incorrect answer|it should be|the correct|please (?:note|correct)|i(?:'m| am) correcting|no[, —-]+.*(?:wrong|incorrect))\\b/i.test(question)\n    const isCorrection = result.isCorrection === true || isCorrectionRegex\n\n    // isCode should not trigger on 'function module' questions — those are Q&A not code.\n    // On a correction turn, only treat it as code when the message itself contains strong\n    // code structure. A model-only isCode flag cannot override explicit pushback.\n    const hasFmPhrase = /\\b(function module|bapi|rfc module)\\b/i.test(question)\n    const hasStrongCodePayload = /(?:^|\\n)\\s*(?:REPORT\\s+\\w+|CLASS\\s+\\w+|METHOD\\s+\\w+|FUNCTION\\s+\\w+|FORM\\s+\\w+|DATA\\s*:\\s*\\w+|SELECT\\s+.+\\s+FROM\\s+\\w+|LOOP\\s+AT\\s+\\w+)/im.test(question)\n    const isCode = hasStrongCodePayload || (!isCorrection && (result.isCode === true || (!hasFmPhrase && /METHOD |CLASS |LOOP AT |SELECT |DATA:|FIELD-SYMBOL|ENDLOOP|ENDIF|FORM |\\bFUNCTION\\b/i.test(question))))\n    const isError = result.isError === true || /\\b(dump|ST22|SM21|short dump|ABAP runtime|Runtime Error|DBIF_|SAPSQL_|TSV_TNEW|message class|message no\\.)\\b/i.test(question)\n"""
if old not in s:
    raise SystemExit('classification block not found')
s = s.replace(old, new, 1)

anchor = """    if (isCode && !hasFmPhrase) { intent = 'CODE_ANALYSIS';   confidence = 1.0 }\n    if (isError)          { intent = 'ERROR_ANALYSIS';   confidence = 1.0 }\n"""
replacement = """    if (isCode && !hasFmPhrase) { intent = 'CODE_ANALYSIS';   confidence = 1.0 }\n    if (isError)          { intent = 'ERROR_ANALYSIS';   confidence = 1.0 }\n    // Correction turns inherit the SAP Q&A path unless the user actually pasted code\n    // or an SAP runtime error. This keeps the prior SAP context/evidence path active\n    // instead of switching to the code-only Sonnet route.\n    if (isCorrection && !hasStrongCodePayload && !isError) {\n      intent = 'SAP_QA'\n      confidence = Math.max(confidence, 0.95)\n      secondaryIntent = null\n    }\n"""
if anchor not in s:
    raise SystemExit('intent override anchor not found')
s = s.replace(anchor, replacement, 1)

# Strengthen classifier instruction too, so model and deterministic guard agree.
prompt_anchor = "isCorrection: true if user is correcting previous answer\\nneedsSearch: true if question needs live/specific data verification"
prompt_repl = "isCorrection: true if user is correcting/challenging a previous answer, including 'you are wrong', 'still wrong', 'are you sure', or supplying the correct mechanism\\nIMPORTANT: a correction/challenge about an SAP answer is SAP_QA/PROCESS_QA context, NOT CODE_ANALYSIS unless the latest message actually contains pasted program code.\\nneedsSearch: true if question needs live/specific data verification"
if prompt_anchor not in s:
    raise SystemExit('classifier prompt anchor not found')
s = s.replace(prompt_anchor, prompt_repl, 1)
p.write_text(s)

# ---- lib/evidence-routing.js: pushback web evidence must be directly supportive ----
p = Path('lib/evidence-routing.js')
s = p.read_text()
old = """    const selectedIndexes = [...new Set(requested)].filter(i => i >= 0 && i < tavily.length && ratingByIndex.has(i)).filter(i => !pushbackDetected || ratingByIndex.get(i).verifiesDisputedClaim).slice(0, 2)\n"""
new = """    const selectedIndexes = [...new Set(requested)]\n      .filter(i => i >= 0 && i < tavily.length && ratingByIndex.has(i))\n      .filter(i => {\n        if (!pushbackDetected) return true\n        const r = ratingByIndex.get(i)\n        // On pushback, a result must do more than share the same topic: it has to\n        // directly verify/contradict the disputed claim with strong support.\n        return r.verifiesDisputedClaim === true && r.support >= 0.70 && r.relevance >= 0.70\n      })\n      .slice(0, 2)\n"""
if old not in s:
    raise SystemExit('selectedIndexes block not found')
s = s.replace(old, new, 1)

# Make the fallback conservative even when the judge fails: never send indirect web\n# evidence on a correction turn.
old2 = "selectedTavily: isCorrection ? [] : fallbackTop"
if old2 not in s:
    raise SystemExit('fallback selection anchor not found')
# already conservative; leave behavior but tag is verified by assertion below
p.write_text(s)

print('pushback routing fixes applied')
