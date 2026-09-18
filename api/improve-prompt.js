// api/improve-prompt.js
// Fast, optional SAP prompt suggestion. It NEVER answers the question and NEVER
// consumes Wani's answer quota because it is a separate endpoint from /api/chat.

function recentContext(messages = []) {
  return messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-4)
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 900)}`)
    .join('\n')
}

function obviousContinuation(text = '') {
  const t = text.trim().toLowerCase()
  return /^(yes|no|ok|okay|sure|thanks|thank you|correct|right|continue|go ahead|do it|ja|nein|danke)[.! ]*$/.test(t)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { prompt = '', messages = [], module = null, topic = null } = req.body || {}
    const original = String(prompt).trim()
    if (!original || original.length < 8 || obviousContinuation(original)) {
      return res.status(200).json({ suggest: false, reason: 'clear_or_continuation' })
    }

    // Keep this lane intentionally tiny and fast. No RAG, Tavily, embeddings or KB.
    const context = recentContext(messages)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1800)

    let response
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          temperature: 0,
          max_tokens: 180,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are a conservative SAP prompt editor for Wani.
Return JSON only: {"suggest":boolean,"suggestion":string,"confidence":number,"reason":string}.

RULES:
- This is ONLY an optional suggestion. Never answer the SAP question.
- Preserve the user's exact intent. Never change SAP objects, transaction codes, tables, fields, modules, versions, quantities, dates, error text, desired outcome, or assumptions.
- Enrich rather than reinterpret. Fix wording and add context ONLY when directly supported by the user's prompt or recent conversation.
- Follow-up questions are high risk. Resolve words like "this", "it", "that", "same", "there", "second one" only when recent context makes the reference unambiguous.
- If there are two plausible interpretations, suggest=false. Never guess.
- If the prompt is already clear enough for a competent SAP consultant, suggest=false.
- If the user is simply confirming/declining/continuing, suggest=false.
- Do not turn a short question into a long consultant brief. Keep the suggestion concise.
- confidence is 0..1. Only set suggest=true when confidence >= 0.92 AND the suggestion materially improves retrieval/answer accuracy.
- Never introduce facts that the user did not provide.`
            },
            {
              role: 'user',
              content: `SAP module hint: ${module || 'none'}\nTopic hint: ${topic || 'none'}\n\nRECENT CONTEXT:\n${context || '(new conversation)'}\n\nCURRENT PROMPT:\n${original}`
            }
          ]
        })
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) return res.status(200).json({ suggest: false, reason: 'improver_unavailable' })
    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content || '{}'
    let parsed
    try { parsed = JSON.parse(raw) } catch { return res.status(200).json({ suggest: false, reason: 'invalid_result' }) }

    const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : ''
    const confidence = Number(parsed.confidence || 0)
    const changed = suggestion && suggestion.toLowerCase() !== original.toLowerCase()

    if (parsed.suggest !== true || confidence < 0.92 || !changed || suggestion.length > 700) {
      return res.status(200).json({ suggest: false, reason: parsed.reason || 'not_needed' })
    }

    return res.status(200).json({ suggest: true, suggestion, confidence, reason: parsed.reason || 'clarity' })
  } catch (err) {
    // Prompt improvement must never block the normal Wani flow.
    return res.status(200).json({ suggest: false, reason: err?.name === 'AbortError' ? 'timeout' : 'unavailable' })
  }
}
