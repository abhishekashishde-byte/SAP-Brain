// api/chat.js — Smart routing: Claude for complex SAP, Groq for simple questions

const BASE_SYSTEM_PROMPT = `You are Wani — a senior SAP S/4HANA consultant with 15+ years of hands-on implementation experience across PP, PM, MM, Fiori, and S/4HANA. You are talking to a fellow senior SAP consultant — treat them as a peer.

ABSOLUTE RULES — NEVER BREAK:
1. TRANSACTION CODES: Only state a T-code if you are 100% certain. If unsure say "verify in your system". Wrong T-codes are worse than no T-codes.
2. ORDER TYPES vs T-CODES: PM order types (PM01, PM02 etc.) are 4-character keys in SPRO — NOT transaction codes. T-codes are typed in the SAP command bar (IW31, CO01 etc).
3. NEVER INVENT: Never invent table names, field names, BAdI names, FM names. Only state what you know with certainty.
4. UNCERTAINTY: "Not certain — verify in your system" is always better than a confident wrong answer.

SAP KNOWLEDGE ANCHORS:
- Maintenance orders: IW31 (create), IW32 (change), IW33 (display), IW38 (mass change)
- Production orders: CO01 (create), CO02 (change), CO03 (display)
- Production versions: C223 (mass maintenance), C220 (individual)
- Purchase orders: ME21N (create), ME22N (change), ME23N (display)
- Material master: MM01, MM02, MM03 | BOM: CS01, CS02, CS03 | Routing: CA01, CA02, CA03
- PM order types standard: PM01 (corrective), PM03 (inspection), PM04 (refurbishment) — exact list depends on implementation
- MRP: MD01 (run), MD02 (single item), MD04 (stock/requirements list)

RESPONSE STYLE:
- Concise — 3 to 8 bullet points or short paragraphs max
- Backticks for \`T-codes\`, \`table names\`, \`field names\`, \`BAdI names\`
- Acknowledge good observations naturally — "Good catch", "Exactly", "There's a nuance here"
- Speak like a knowledgeable colleague, not a textbook

TOKENS: [ORDER_1], [PLANT_2] etc. are anonymised SAP values — treat as real, use same token in response.`

const TONE_ADDITIONS = {
  balanced: `\nTONE: Warm but direct. Acknowledge smart questions naturally.`,
  direct:   `\nTONE: Direct and fast. Bullet points only. Skip pleasantries.`,
  friendly: `\nTONE: Warm and encouraging. Like a helpful colleague over coffee.`,
  formal:   `\nTONE: Formal and precise. Complete sentences. Structured.`,
}

// Classify question complexity — simple goes to Groq (free), complex goes to Claude (paid)
function isComplexQuestion(message) {
  const complex = [
    /why/i, /how does/i, /difference between/i, /when should/i, /impact/i,
    /badi/i, /user exit/i, /debug/i, /error/i, /not working/i, /issue/i,
    /configure/i, /customiz/i, /z-program/i, /zprog/i, /enhancement/i,
    /cross.module/i, /integration/i, /settlement/i, /valuation/i,
    /refurbish/i, /split valuation/i, /costing/i, /variance/i,
    /mrp.area/i, /planning/i, /sequence/i, /routing/i, /capacity/i,
    /compare/i, /versus/i, /vs\b/i, /pros and cons/i, /advantage/i,
    /table/i, /field/i, /spro/i, /configuration/i, /behavior/i,
  ]
  return complex.some(pattern => pattern.test(message))
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

async function callClaude(systemPrompt, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: systemPrompt,
      messages,
    }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Claude error')
  return data.content?.[0]?.text || 'No response.'
}

async function callGroq(systemPrompt, messages) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1200,
      temperature: 0.2,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Groq error')
  return data.choices?.[0]?.message?.content || 'No response.'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { messages, module: mod, topic, tone = 'balanced' } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid body' })

  const systemPrompt = BASE_SYSTEM_PROMPT + (TONE_ADDITIONS[tone] || TONE_ADDITIONS.balanced)

  // Add topic context to last user message
  const withContext = messages.map((m, i) =>
    i === messages.length - 1 && m.role === 'user'
      ? { ...m, content: `SAP context: module="${mod || 'General'}", topic="${topic || 'General'}"\n\n${m.content}` }
      : m
  )

  // Tokenize sensitive values
  const { anonymised, map } = tokenize(withContext)

  // Decide which model to use
  const lastUserMessage = messages[messages.length - 1]?.content || ''
  const useClaudeKey = process.env.ANTHROPIC_API_KEY
  const useGroqKey = process.env.GROQ_API_KEY
  const complex = isComplexQuestion(lastUserMessage)

  // Route: Claude for complex if key available, Groq for simple or as fallback
  let raw = ''
  let modelUsed = ''

  try {
    if (complex && useClaudeKey) {
      raw = await callClaude(systemPrompt, anonymised)
      modelUsed = 'claude'
    } else if (useGroqKey) {
      raw = await callGroq(systemPrompt, anonymised)
      modelUsed = 'groq'
    } else if (useClaudeKey) {
      // Groq key missing — fall back to Claude for everything
      raw = await callClaude(systemPrompt, anonymised)
      modelUsed = 'claude'
    } else {
      return res.status(500).json({ error: 'No API keys configured' })
    }
  } catch (err) {
    // If primary fails, try the other
    try {
      if (modelUsed !== 'groq' && useGroqKey) {
        raw = await callGroq(systemPrompt, anonymised)
      } else if (modelUsed !== 'claude' && useClaudeKey) {
        raw = await callClaude(systemPrompt, anonymised)
      } else {
        return res.status(500).json({ error: err.message })
      }
    } catch (fallbackErr) {
      return res.status(500).json({ error: fallbackErr.message })
    }
  }

  return res.status(200).json({ reply: detokenize(raw, map), model: modelUsed })
}
