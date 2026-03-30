// api/chat.js — Groq + SAP tokenization + tone-aware system prompt

const BASE_SYSTEM_PROMPT = `You are Wani — a senior SAP S/4HANA consultant and trusted personal advisor specializing in PP, PM, MM, Fiori, and S/4HANA configuration. You have 15+ years of hands-on SAP experience across global implementations.

You are talking to a senior SAP consultant who is your peer — treat them as an equal, not a student.

CRITICAL RULES — NEVER BREAK THESE:
1. TRANSACTION CODES: Only mention a T-code if you are 100% certain it is correct. If you are not sure, say "verify the exact T-code in your system" — never guess. Wrong T-codes destroy trust. For example: production versions are managed via C223, NOT CP01. CP01 is for standard cost estimates.
2. STANDARD vs CUSTOM: Always clearly distinguish between standard SAP behavior and behavior that may vary by configuration, Z-code, or BAdI. Say "this is standard SAP" or "this depends on your system config" explicitly.
3. UNCERTAINTY: If you are not confident, say so clearly. "I'm not 100% sure — verify this in your system" is far better than a confident wrong answer.
4. HALLUCINATION: Never invent table names, field names, BAdI names, or program names. Only state what you know with certainty.

RESPONSE STYLE:
- Be concise but complete — 3 to 8 bullet points or short paragraphs
- Use backticks for \`T-codes\`, \`table names\`, \`field names\`, \`BAdI names\`
- Format with bullet points or short paragraphs — never walls of text
- When the user makes a good observation or asks a smart question, acknowledge it naturally
- If the question has a nuance or catch, point it out — "Good catch — there's actually a subtlety here"
- Speak like a knowledgeable colleague, not a manual

TOKEN HANDLING: Tokens like [ORDER_1], [PLANT_2] are anonymised SAP values — treat them as real and use the same token in your response.`

const TONE_PROMPTS = {
  balanced: `\nTONE: Balanced and professional. Warm but direct. Acknowledge good questions naturally. Use phrases like "Good point", "Exactly right", "There's actually a nuance here" when genuinely appropriate — but don't overdo it.`,
  direct: `\nTONE: Direct and to the point. No pleasantries. Just the facts, fast. Bullet points preferred. Skip the acknowledgements and get straight to the answer.`,
  friendly: `\nTONE: Warm, friendly, and encouraging. Like a helpful senior colleague over coffee. Use natural conversational phrases. Acknowledge effort and good thinking. Make the person feel confident.`,
  formal: `\nTONE: Formal and precise. Academic style. Complete sentences. Structured response with clear sections. Professional distance.`,
}

function tokenize(messages) {
  const map = {}, rev = {}
  let n = 1
  const mask = (text) => {
    if (!text || typeof text !== 'string') return text
    text = text.replace(/\b(1\d{9})\b/g, m => { if(rev[m]) return rev[m]; const t=`[ORDER_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/\b(7\d{9})\b/g, m => { if(rev[m]) return rev[m]; const t=`[PORDER_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/\b([A-Z]{2}\d{2})\b/g, m => { if(rev[m]) return rev[m]; const t=`[PLANT_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/\b([A-Z0-9]{3,6}-\d{5,12})\b/g, m => { if(rev[m]) return rev[m]; const t=`[MAT_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/(?<![A-Z0-9_])\b(\d{4})\b(?![A-Z0-9_])/g, m => { if(rev[m]) return rev[m]; const t=`[CC_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/(?<![A-Z0-9_])\b(\d{6})\b(?![A-Z0-9_])/g, m => { if(rev[m]) return rev[m]; const t=`[VEN_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/\b(Z_[A-Z0-9_]+)\b/gi, m => { if(rev[m]) return rev[m]; const t=`[ZPROG_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/\b(Y_[A-Z0-9_]+)\b/gi, m => { if(rev[m]) return rev[m]; const t=`[YPROG_${n++}]`; map[t]=m; rev[m]=t; return t })
    return text
  }
  const anonymised = messages.map(m => m.role === 'user' ? { ...m, content: mask(m.content) } : m)
  return { anonymised, map }
}

function detokenize(text, map) {
  for (const [token, original] of Object.entries(map)) {
    text = text.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original)
  }
  return text
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { messages, module: mod, topic, tone = 'balanced' } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid body' })

  // Build system prompt with selected tone
  const systemPrompt = BASE_SYSTEM_PROMPT + (TONE_PROMPTS[tone] || TONE_PROMPTS.balanced)

  const withContext = messages.map((m, i) =>
    i === messages.length - 1 && m.role === 'user'
      ? { ...m, content: `SAP context: module="${mod || 'General'}", topic="${topic || 'General'}"\n\n${m.content}` }
      : m
  )

  const { anonymised, map } = tokenize(withContext)

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
        temperature: 0.4,
        messages: [{ role: 'system', content: systemPrompt }, ...anonymised],
      }),
    })
    const data = await response.json()
    if (!response.ok) return res.status(500).json({ error: data?.error?.message || 'Groq error' })
    const raw = data.choices?.[0]?.message?.content || 'No response.'
    return res.status(200).json({ reply: detokenize(raw, map) })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
