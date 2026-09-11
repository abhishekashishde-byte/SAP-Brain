from pathlib import Path
import re


def sub_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return updated


# -----------------------------------------------------------------------------
# 1) Make Wani truth-seeking rather than agreeable when a consultant challenges it
# -----------------------------------------------------------------------------
shared_path = Path('api/_shared.js')
shared = shared_path.read_text()

truth_rule = """- TRUTH OVER AGREEMENT — SENIOR CONSULTANT RULE: The user's confidence, repetition, seniority, or statement that you are wrong is NOT evidence by itself. Your job is to get the SAP answer right, not to make the conversation agreeable. Never change a technically supported conclusion merely because the user insists.
- WHEN CHALLENGED: re-check the disputed mechanism against the strongest independent evidence available. If the evidence still supports your original position, say so plainly and professionally — e.g. "I don't think that correction is right for standard SAP" — then explain the exact boundary/mechanism. Do not soften into "you may be right" when the evidence does not support that.
- REPEATED PUSHBACK: if the user challenges the same claim again without adding new evidence, do NOT drift toward their claim. Re-state the scoped conclusion, name what would change your mind, and push back clearly. Repetition is not new evidence.
- REAL SYSTEM OBSERVATION IS DIFFERENT: if the user says they actually tested it and gives a concrete SAP observation (transaction/app used, field/result shown, screenshot, error, configuration value, table content, or reproducible steps), treat that as strong system-specific evidence. Reconcile it with standard SAP by checking release/version, customizing, business function, enhancement/custom code, or UI differences. If their observed result is credible, update the answer for THEIR system while keeping the standard-vs-system distinction explicit.
- USER-CITED SOURCES ARE CLAIMS TO VERIFY: a Note/KBA number, table, T-code, blog, or documentation reference supplied by the user is not automatically true. Verify it before using it to reverse your conclusion.
- CHANGE POSITION ONLY FOR EVIDENCE: when new evidence genuinely disproves your earlier answer, correct it directly and explain what evidence changed the conclusion. Never say "you're right" as a conversational reflex.
- CONCEPTUAL SAP QUESTIONS: before giving a confident mechanism/behaviour answer, distinguish standard SAP behaviour from implementation-specific behaviour and release/configuration differences. A 15+ year consultant should state the boundary on the first answer rather than discover it only after being challenged.
"""

shared = sub_once(
    shared,
    r"(?m)^- If corrected:.*?agreeable\.\n",
    truth_rule,
    'shared truth-over-agreement rule',
)
shared_path.write_text(shared)


# -----------------------------------------------------------------------------
# 2) Strengthen the runtime pushback prompt and repair search/reference generation
# -----------------------------------------------------------------------------
chat_path = Path('api/chat.js')
chat = chat_path.read_text()

pushback_block = r"""    // ── Pushback / correction verification mode ─────────────────────────────
    if (evidenceDecision.pushback?.detected) {
      const disputed = (evidenceDecision.pushback.disputedClaims || []).map((c, i) => `${i+1}. ${c}`).join('\n') || 'The previous answer is being challenged; identify the disputed claim from the conversation.'
      systemPrompt += `

🚨 PUSHBACK / RE-VERIFICATION MODE — MANDATORY:
The user has challenged the previous answer. Treat the previous answer and any matching saved KB finding as UNTRUSTED for this turn. Re-evaluate the claim from evidence; do not defend it merely because you said it before, but equally do not abandon it merely because the user disagrees.

DISPUTED CLAIMS:
${disputed}

EVIDENCE HIERARCHY AND RESPONSE RULES:
- USER DISAGREEMENT IS NOT EVIDENCE. "You're wrong", "are you sure?", or repeated insistence cannot by itself lower a technically supported conclusion.
- Re-evaluate from independent evidence only: book evidence, directly supporting selected web evidence, or your native web_search. Same-topic evidence is not enough; it must support or contradict the disputed mechanism.
- Before stating an exact SAP technical identifier (table-field, T-code, BAdI, SAP Note, Fiori app ID, SPRO path), verify that exact identifier. If it cannot be verified, do not guess another one.
- If independent evidence still supports the previous conclusion, PUSH BACK clearly. Say that you do not think the proposed correction is right for the stated scope/standard SAP, then explain why. Do not say "you may be right" merely to be agreeable.
- If this is a SECOND OR LATER challenge to the same claim and the user has added no new evidence, hold the verified position more firmly. Repetition is not evidence. State what concrete observation/source would change your conclusion.
- If the user supplies a REAL SYSTEM OBSERVATION — e.g. "I tried it", plus the transaction/app, screenshot, field/value, table result, error, configuration, or reproducible steps — treat that as strong system-specific evidence. Investigate whether release/version, customizing, business function, enhancement/custom code, or UI differences explain the mismatch. Do not dismiss observed system behaviour just because generic documentation says otherwise.
- If the user's concrete observation is credible but differs from standard behaviour, say both: what standard SAP does and what their system is demonstrably doing.
- A Note/KBA/table/T-code/source cited by the user is a claim to verify, not automatic proof.
- Change your conclusion only when new evidence warrants it. If the evidence supports a correction, correct the earlier answer plainly and say exactly what changed your mind.
- If evidence remains genuinely mixed, do not capitulate and do not bluff. State the uncertainty and ask for the single concrete system check that would resolve it.`
    }

    // ── Document context ───────────────────────────────────────────────────"""

chat = sub_once(
    chat,
    r"    // ── Pushback / correction verification mode[^\n]*\n.*?    // ── Document context[^\n]*",
    pushback_block,
    'runtime pushback block',
    re.S,
)

reference_helpers = r"""function mergeVerifiedReferences(_modelReferences = [], ...retrievedGroups) {
  const out = []
  const seen = new Set()
  const add = (ref, fallbackNote = '') => {
    const url = typeof ref?.url === 'string' ? ref.url.trim() : ''
    if (!url || !isApprovedUrl(url) || seen.has(url)) return
    seen.add(url)
    const type = ref.type || referenceTypeFromSource(ref.source, url)
    out.push({
      type,
      source: ref.source || type,
      title: ref.title || url,
      url,
      note: ref.note || fallbackNote,
    })
  }

  // Reliability rule: only URLs returned by Wani's actual retrieval lanes become
  // clickable "verified" pages. A model-written URL, even on an SAP domain, can
  // still be a plausible-looking but nonexistent path, so it is not accepted here.
  for (const group of retrievedGroups) {
    for (const ref of Array.isArray(group) ? group : []) {
      add(ref, 'SAP source retrieved by Wani for this question.')
      if (out.length >= 3) return out
    }
  }
  return out.slice(0, 3)
}

const SEARCH_STOPWORDS = new Set(`
a an and are as at be because been but by can could did do does for from had has have how i if in into is it its me my no not of on or our please should so than that the their them then there these they this to us was we were what when where which who why will with would you your
actually answer correct correction explain give tell show think sure wrong right question user still really maybe just about more using use used possible standard way need want wants asking asked
aber als am an auf aus bei bitte das dass dein deine dem den der die ein eine einem einen einer es für hat haben ich im in ist kann können mit noch oder sein sind so über um und von war was welche welcher welches wenn wer wie warum wo zu zum zur
`.trim().split(/\s+/))

function compactSapSearchKeywords(query) {
  const normalized = String(query || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[“”"'`?,.!:;()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''

  const kept = []
  const seen = new Set()
  for (const part of normalized.split(' ')) {
    const token = part.replace(/^[^A-Za-z0-9_\/-]+|[^A-Za-z0-9_\/-]+$/g, '')
    if (!token) continue
    const lower = token.toLowerCase()
    if (lower === 'sap') continue
    const technical = /[0-9_\/-]/.test(token) || /^[A-Z][A-Z0-9_-]{1,11}$/.test(token)
    if (!technical && (SEARCH_STOPWORDS.has(lower) || lower.length < 3)) continue
    if (seen.has(lower)) continue
    seen.add(lower)
    kept.push(token)
    if (kept.length >= 10) break
  }

  const result = kept.join(' ').trim()
  return (result || normalized.split(' ').slice(0, 8).join(' ')).slice(0, 140)
}

function buildSearchShortcuts(query) {
  const keywords = compactSapSearchKeywords(query)
  if (!keywords) return []
  const googleQuery = /^SAP\b/i.test(keywords) ? keywords : `SAP ${keywords}`
  const enc = encodeURIComponent(keywords)
  const googleEnc = encodeURIComponent(googleQuery)
  return [
    {
      type: 'Google', source: 'Google', title: `Google: ${keywords.slice(0, 70)}`,
      url: `https://www.google.com/search?q=${googleEnc}`,
      note: 'Keyword search shortcut. This is not supporting evidence for the answer.',
      isSearchFallback: true,
    },
    {
      type: 'SAP Community', source: 'SAP Community', title: `SAP Community: ${keywords.slice(0, 70)}`,
      url: `https://community.sap.com/t5/forums/searchpage/tab/message?advanced=false&allow_punctuation=false&q=${enc}`,
      note: 'Keyword search shortcut on SAP Community. This is not supporting evidence for the answer.',
      isSearchFallback: true,
    },
    {
      type: 'SAP Help', source: 'SAP Help', title: `SAP Help: ${keywords.slice(0, 70)}`,
      url: `https://help.sap.com/docs/search?q=${enc}`,
      note: 'Keyword search shortcut on SAP Help. This is not supporting evidence for the answer.',
      isSearchFallback: true,
    },
  ]
}

function buildSapSearchFallback(query) {
  return buildSearchShortcuts(query)
}

// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────"""

chat = sub_once(
    chat,
    r"function mergeVerifiedReferences\(modelReferences = \[\], \.\.\.retrievedGroups\) \{.*?\n// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────",
    reference_helpers,
    'verified reference/search helper block',
    re.S,
)

chat = sub_once(
    chat,
    r"function buildPillLinks\(searchQuery\) \{.*?\n\}",
    "function buildPillLinks(searchQuery) {\n  return buildSearchShortcuts(searchQuery)\n}",
    'supplemental pill links',
    re.S,
)

chat = sub_once(
    chat,
    r"    const allFurtherReading = isSubstantialAnswer \? publicSearchResults\.slice\(0, 2\) : \[\]",
    """    const allFurtherReading = isSubstantialAnswer
      ? [...publicSearchResults.slice(0, 3), ...googleLinks]
          .filter((ref, index, arr) => ref?.url && arr.findIndex(x => x?.url === ref.url) === index)
          .slice(0, 6)
      : []""",
    'further reading aggregation',
)

final_refs = r"""    const mergedVerifiedReferences = usedContainerFormat
      ? mergeVerifiedReferences(containerResult.references, referenceSearchResults, relatedLinks)
      : []
    const basePublicReferences = usedContainerFormat
      ? (mergedVerifiedReferences.length === 0 ? buildSapSearchFallback(searchQuery || lastMsg) : mergedVerifiedReferences)
      : publicSearchResults
    const finalVerifiedReferences = isSubstantialAnswer
      ? [...basePublicReferences, ...googleLinks]
          .filter((ref, index, arr) => ref?.url && arr.findIndex(x => x?.url === ref.url) === index)
          .slice(0, 6)
      : basePublicReferences"""

chat = sub_once(
    chat,
    r"    const mergedVerifiedReferences = usedContainerFormat\n.*?      : publicSearchResults",
    final_refs,
    'terminal reference recovery',
    re.S,
)

# Rename the now-broader comment without touching the variable name used throughout the file.
chat = chat.replace('// Pill links always generated from context-aware query\n    const googleLinks = buildPillLinks(searchQuery)',
                    '// Search shortcuts are always generated from a compact, context-aware keyword query\n    const googleLinks = buildPillLinks(searchQuery)', 1)

chat_path.write_text(chat)


# -----------------------------------------------------------------------------
# 3) Public gateway: curated links are product output, not admin-only diagnostics
# -----------------------------------------------------------------------------
gateway_path = Path('api/reference-search.js')
gateway = gateway_path.read_text()

gateway = sub_once(
    gateway,
    r"const ADMIN_ONLY_EVENT_TYPES = new Set\(\[.*?\]\)",
    "const ADMIN_ONLY_EVENT_TYPES = new Set(['debug_info'])",
    'public source event visibility',
    re.S,
)

gateway = gateway.replace(
    '  // Raw diagnostics and all source/result panels are administrator-only.\n  // The normal answer stream is left unchanged.\n',
    '  // Raw diagnostics remain administrator-only. Curated search results and further-reading\n  // links are product output and must remain visible to normal users.\n',
    1,
)

if '    delete payload.references\n' not in gateway:
    raise SystemExit('references stripping line not found')
gateway = gateway.replace('    delete payload.references\n', '', 1)

gateway_path.write_text(gateway)

print('Wani consultant truth + public link repair applied')
