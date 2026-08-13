// Dynamic evidence-quality routing for Wani.
// No SAP topic is hard-coded here. A small model judges whether the retrieved
// internal evidence is sufficient for the exact question and independently
// rates the web evidence. On user pushback, disputed prior/KB claims are treated
// as untrusted until independently verified.

function clip(value, max = 700) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function compactConversation(messages = []) {
  return messages.slice(-8).map(m => ({ role: m.role, content: clip(m.content, 500) }))
}
function compactBooks(chunks = []) {
  return chunks.slice(0, 6).map((c, index) => ({ index, source: c.source_book || '', page: c.page_number ?? null, title: c.lesson_title || '', content: clip(c.content || c.chunk_text || c.text, 900) }))
}
function compactKnowledge(entries = []) {
  return entries.slice(0, 6).map((k, index) => ({ index, module: k.module || '', topic: k.topic || '', object: k.object || '', finding: clip(k.finding, 700), similarity: Number.isFinite(Number(k.similarity)) ? Number(k.similarity) : undefined }))
}
function compactTavily(results = []) {
  return results.slice(0, 8).map((r, index) => ({ index, source: r.source || '', title: clip(r.title, 180), url: r.url || '', snippet: clip(r.snippet, 900), providerScore: Number.isFinite(Number(r.score)) ? Number(r.score) : undefined, priorRelevanceScore: Number.isFinite(Number(r.relevanceScore)) ? Number(r.relevanceScore) : undefined }))
}
function safeScore(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0 }

export async function assessEvidenceRouting({ question, messages = [], bookChunks = [], knowledgeEntries = [], tavilyResults = [], isCorrection = false }) {
  const books = compactBooks(bookChunks), knowledge = compactKnowledge(knowledgeEntries), tavily = compactTavily(tavilyResults)
  const fallbackTop = tavily.slice(0, 2).map((t, rank) => ({ index: t.index, rank: rank + 1, score: safeScore(t.providerScore || (t.priorRelevanceScore ? t.priorRelevanceScore / 5 : 0)), relevance: safeScore(t.priorRelevanceScore ? t.priorRelevanceScore / 5 : 0), authority: 0, support: 0, verifiesDisputedClaim: false, reason: 'Evidence judge unavailable; retained from upstream relevance filter.' }))
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0, max_tokens: 1400, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: `You are Wani's evidence router. Judge evidence quality for the exact SAP question, but do NOT answer it.

Detect pushback/correction using BOTH the latest message and conversation. If the latest user says the prior answer is wrong, incorrect, overcomplicated, asks "are you sure", supplies a correction, or otherwise challenges it, pushback MUST be true.

CRITICAL PUSHBACK RULES:
- Identify the specific disputed claim(s) from the prior assistant answer and latest user correction.
- A consultant KB finding or prior answer that repeats/supports a disputed claim is UNTRUSTED FOR THIS TURN. It may be shown as context but MUST NOT contribute to RAG sufficiency/confidence until independently verified.
- Do not let a high vector similarity make a disputed KB finding authoritative.
- On pushback, Tavily evidence is useful for the answer ONLY if it DIRECTLY verifies or contradicts the disputed claim. Same-topic or adjacent-topic pages are not enough.
- For exact technical claims (table-field, T-code, BAdI, SAP Note, app ID, SPRO path), direct support means the evidence explicitly contains/supports that exact identifier or mechanism. Otherwise support must be low.
- Prefer authoritative SAP sources in authority scoring. A relevant but indirect Community result cannot validate an exact disputed technical identifier.
- Select at most TWO Tavily results. On pushback, do not select a result merely for topical relevance; it must materially help verify the disputed claim.
- If no evidence directly verifies the disputed technical claim, say so in routingReason and leave it unverified for Sonnet rather than endorsing a guess.
- Internal evidence is sufficient only when non-disputed evidence directly covers the requested mechanism.
- If internal evidence is sufficient, Tavily is normally withheld from Sonnet unless pushback is detected.
- Scores are 0.00-1.00. No SAP-topic hardcoding.

Return ONLY JSON:
{"rag":{"score":0,"sufficient":false,"reason":""},"pushback":{"detected":false,"reason":"","disputedClaims":[]},"tavily":[{"index":0,"score":0,"relevance":0,"authority":0,"support":0,"verifiesDisputedClaim":false,"reason":""}],"selectedTavilyIndexes":[],"routingReason":""}` },
      { role: 'user', content: JSON.stringify({ question: clip(question, 1200), classifierCorrectionSignal: isCorrection === true, conversation: compactConversation(messages), internalEvidence: { books, knowledge }, tavily }) }]
    }) })
    if (!response.ok) throw new Error(`Evidence judge HTTP ${response.status}`)
    const data = await response.json(), raw = data.choices?.[0]?.message?.content?.trim() || '{}', parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const pushbackDetected = isCorrection === true || parsed.pushback?.detected === true
    const ratings = Array.isArray(parsed.tavily) ? parsed.tavily.map(r => ({ index: Number(r.index), score: safeScore(r.score), relevance: safeScore(r.relevance), authority: safeScore(r.authority), support: safeScore(r.support), verifiesDisputedClaim: r.verifiesDisputedClaim === true, reason: clip(r.reason, 300) })).filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < tavily.length) : []
    const ratingByIndex = new Map(ratings.map(r => [r.index, r]))
    const requested = Array.isArray(parsed.selectedTavilyIndexes) ? parsed.selectedTavilyIndexes.map(Number).filter(Number.isInteger) : []
    const selectedIndexes = [...new Set(requested)]
      .filter(i => i >= 0 && i < tavily.length && ratingByIndex.has(i))
      .filter(i => {
        if (!pushbackDetected) return true
        const r = ratingByIndex.get(i)
        // On pushback, a result must do more than share the same topic: it has to
        // directly verify/contradict the disputed claim with strong support.
        return r.verifiesDisputedClaim === true && r.support >= 0.70 && r.relevance >= 0.70
      })
      .slice(0, 2)
    const selected = selectedIndexes.map((index, rank) => ({ ...ratingByIndex.get(index), rank: rank + 1 }))
    // A classifier-level correction is a hard safety signal: disputed KB cannot make RAG sufficient.
    const ragSufficient = pushbackDetected ? false : parsed.rag?.sufficient === true
    const ragScore = pushbackDetected ? 0 : safeScore(parsed.rag?.score)
    return { rag: { score: ragScore, sufficient: ragSufficient, reason: clip(pushbackDetected ? `Pushback detected; disputed prior/KB claims excluded from sufficiency. ${parsed.rag?.reason || ''}` : parsed.rag?.reason, 500) }, pushback: { detected: pushbackDetected, reason: clip(parsed.pushback?.reason || (isCorrection ? 'Classifier detected a user correction.' : ''), 500), disputedClaims: Array.isArray(parsed.pushback?.disputedClaims) ? parsed.pushback.disputedClaims.map(x => clip(x, 300)).slice(0, 5) : [] }, tavilyRatings: ratings, selectedTavily: selected, useTavilyForAnswer: !ragSufficient || pushbackDetected, routingReason: clip(parsed.routingReason, 500), judge: 'gpt-4o-mini', fallback: false }
  } catch (error) {
    console.error('[EVIDENCE ROUTER] Judge failed:', error.message)
    return { rag: { score: 0, sufficient: false, reason: 'Evidence judge unavailable; internal evidence was not auto-approved.' }, pushback: { detected: isCorrection === true, reason: isCorrection ? 'Classifier detected correction; conservative fallback applied.' : 'Not evaluated because evidence judge failed.', disputedClaims: [] }, tavilyRatings: fallbackTop, selectedTavily: isCorrection ? [] : fallbackTop, useTavilyForAnswer: true, routingReason: isCorrection ? 'Correction fallback: do not trust disputed internal evidence or indirect web results.' : 'Fallback route: use already-filtered web evidence because internal sufficiency could not be judged.', judge: 'fallback', fallback: true }
  }
}

export function attachSelectedTavilyResults(decision, tavilyResults = []) {
  return (decision?.selectedTavily || []).map(s => ({ ...s, result: tavilyResults[s.index] || null })).filter(s => s.result)
}
