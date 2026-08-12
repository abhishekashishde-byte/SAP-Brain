// Dynamic evidence-quality routing for Wani.
// No SAP topic is hard-coded here. A small model judges whether the retrieved
// internal evidence is sufficient for the exact question and independently
// rates the web evidence. Tavily can therefore be retained for references
// without being allowed to influence Sonnet when RAG/KB is already strong.

function clip(value, max = 700) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function compactConversation(messages = []) {
  return messages.slice(-8).map(m => ({
    role: m.role,
    content: clip(m.content, 500),
  }))
}

function compactBooks(chunks = []) {
  return chunks.slice(0, 6).map((c, index) => ({
    index,
    source: c.source_book || '',
    page: c.page_number ?? null,
    title: c.lesson_title || '',
    content: clip(c.content || c.chunk_text || c.text, 900),
  }))
}

function compactKnowledge(entries = []) {
  return entries.slice(0, 6).map((k, index) => ({
    index,
    module: k.module || '',
    topic: k.topic || '',
    object: k.object || '',
    finding: clip(k.finding, 700),
    similarity: Number.isFinite(Number(k.similarity)) ? Number(k.similarity) : undefined,
  }))
}

function compactTavily(results = []) {
  return results.slice(0, 8).map((r, index) => ({
    index,
    source: r.source || '',
    title: clip(r.title, 180),
    url: r.url || '',
    snippet: clip(r.snippet, 900),
    providerScore: Number.isFinite(Number(r.score)) ? Number(r.score) : undefined,
    priorRelevanceScore: Number.isFinite(Number(r.relevanceScore)) ? Number(r.relevanceScore) : undefined,
  }))
}

function safeScore(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export async function assessEvidenceRouting({
  question,
  messages = [],
  bookChunks = [],
  knowledgeEntries = [],
  tavilyResults = [],
}) {
  const books = compactBooks(bookChunks)
  const knowledge = compactKnowledge(knowledgeEntries)
  const tavily = compactTavily(tavilyResults)

  // Safe fallback: if the judge is unavailable, do not pretend RAG is strong.
  // Keep at most two already-filtered Tavily results so the answer can still be
  // grounded instead of silently trusting an unverified internal retrieval.
  const fallbackTop = tavily.slice(0, 2).map((t, rank) => ({
    index: t.index,
    rank: rank + 1,
    score: safeScore(t.providerScore || (t.priorRelevanceScore ? t.priorRelevanceScore / 5 : 0)),
    relevance: safeScore(t.priorRelevanceScore ? t.priorRelevanceScore / 5 : 0),
    authority: 0,
    support: 0,
    reason: 'Evidence judge unavailable; retained from upstream relevance filter.',
  }))

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'system',
          content: `You are Wani's evidence router. Judge evidence quality for the exact SAP question, but do NOT answer the SAP question.

Your job has four independent parts:
1) Decide whether the INTERNAL evidence (book RAG + verified consultant KB) is sufficient for Sonnet to answer accurately without seeing Tavily content.
2) Rate every Tavily result for relevance to the exact question, source authority, and how directly its snippet supports a useful claim.
3) Select at most TWO Tavily results for references/further reading. A result may be useful as a reference even when internal evidence is already sufficient.
4) Detect whether the latest user message is pushback/re-verification of an earlier answer: repeated same question, "are you sure", correction, challenge, request for proof, or dissatisfaction. Use the supplied conversation; do not infer pushback from technical difficulty alone.

IMPORTANT:
- Do not use hard-coded rules by SAP module, transaction type, table question, Fiori question, etc.
- Judge the actual retrieved evidence against the actual question.
- Internal evidence is sufficient only when it directly covers the requested mechanism/answer, not merely the same broad topic.
- A high-quality Tavily link does NOT make internal RAG sufficient; score them separately.
- If internal evidence is sufficient, Tavily should normally be withheld from Sonnet unless pushback/re-verification is detected.
- If internal evidence is insufficient, the selected Tavily evidence may be sent to Sonnet.
- Scores are 0.00-1.00.

Return ONLY JSON with this shape:
{
  "rag": {
    "score": 0.0,
    "sufficient": false,
    "reason": "short explanation"
  },
  "pushback": {
    "detected": false,
    "reason": "short explanation"
  },
  "tavily": [
    {
      "index": 0,
      "score": 0.0,
      "relevance": 0.0,
      "authority": 0.0,
      "support": 0.0,
      "reason": "short explanation"
    }
  ],
  "selectedTavilyIndexes": [0, 2],
  "routingReason": "short explanation"
}`
        }, {
          role: 'user',
          content: JSON.stringify({
            question: clip(question, 1200),
            conversation: compactConversation(messages),
            internalEvidence: { books, knowledge },
            tavily,
          }),
        }],
      }),
    })

    if (!response.ok) throw new Error(`Evidence judge HTTP ${response.status}`)
    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())

    const ratings = Array.isArray(parsed.tavily) ? parsed.tavily
      .map(r => ({
        index: Number(r.index),
        score: safeScore(r.score),
        relevance: safeScore(r.relevance),
        authority: safeScore(r.authority),
        support: safeScore(r.support),
        reason: clip(r.reason, 300),
      }))
      .filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < tavily.length)
      : []

    const ratingByIndex = new Map(ratings.map(r => [r.index, r]))
    const requested = Array.isArray(parsed.selectedTavilyIndexes)
      ? parsed.selectedTavilyIndexes.map(Number).filter(Number.isInteger)
      : []

    // The model decides quality; code only enforces uniqueness and the max-two contract.
    const selectedIndexes = [...new Set(requested)]
      .filter(i => i >= 0 && i < tavily.length && ratingByIndex.has(i))
      .slice(0, 2)

    const selected = selectedIndexes.map((index, rank) => ({
      ...ratingByIndex.get(index),
      rank: rank + 1,
    }))

    const ragScore = safeScore(parsed.rag?.score)
    const ragSufficient = parsed.rag?.sufficient === true
    const pushbackDetected = parsed.pushback?.detected === true

    return {
      rag: {
        score: ragScore,
        sufficient: ragSufficient,
        reason: clip(parsed.rag?.reason, 500),
      },
      pushback: {
        detected: pushbackDetected,
        reason: clip(parsed.pushback?.reason, 500),
      },
      tavilyRatings: ratings,
      selectedTavily: selected,
      useTavilyForAnswer: !ragSufficient || pushbackDetected,
      routingReason: clip(parsed.routingReason, 500),
      judge: 'gpt-4o-mini',
      fallback: false,
    }
  } catch (error) {
    console.error('[EVIDENCE ROUTER] Judge failed:', error.message)
    return {
      rag: {
        score: 0,
        sufficient: false,
        reason: 'Evidence judge unavailable; internal evidence was not auto-approved.',
      },
      pushback: { detected: false, reason: 'Not evaluated because evidence judge failed.' },
      tavilyRatings: fallbackTop,
      selectedTavily: fallbackTop,
      useTavilyForAnswer: true,
      routingReason: 'Fallback route: use already-filtered web evidence because internal sufficiency could not be judged.',
      judge: 'fallback',
      fallback: true,
    }
  }
}

export function attachSelectedTavilyResults(decision, tavilyResults = []) {
  return (decision?.selectedTavily || []).map(s => ({
    ...s,
    result: tavilyResults[s.index] || null,
  })).filter(s => s.result)
}
