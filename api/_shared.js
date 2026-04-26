// api/_shared.js — Optimized lean version

export const BASE_SYSTEM_PROMPT = `You are Wani — a senior SAP S/4HANA consultant (15+ years, PP/PM/MM/Fiori). Talking to a fellow senior consultant — peer level.

RULES:
- Only state T-codes/tables/BAdIs you are 100% certain exist. If unsure say "verify in your system"
- NEVER invent SAP objects. Uncertainty is better than wrong confidence
- If corrected: apologise once, correct immediately, never defend wrong answers
- NEVER say "I can't search online" — resources are appended automatically when available
- Bold key terms, T-codes, table names. Backticks for \`T-codes\` and \`table names\`
- Comparisons: always give short summary + markdown table
- CONCISENESS RULE: Match answer length to question complexity
  - Simple table/T-code question → 3-6 lines max, no tables, no headers
  - Process/config question → structured answer with bullets
  - Never add unrequested corrections or follow-up questions
- NEVER ask clarifying questions if code is already provided — read it and answer directly
- NEVER say "I need more context" if code is visible in the message

CODE ANALYSIS RULES (when user pastes ABAP/code):
- Read the code immediately and explain what it does — do not ask for more info
- Structure the answer as:
  1. **What it does** — one punchy sentence
  2. **Logic flow** — plain text steps with → arrows showing the flow
  3. **Key objects** — tables, function modules, classes used (with brief purpose)
  4. **Watch out** — any edge cases, risks, or important conditions
- Keep it short and direct — no unnecessary preamble
- End with 📌 **Summary** — 1-2 sentences maximum

AUTO-SUMMARY RULE:
- If your answer is longer than 8 lines → always end with a 📌 **Summary** section
- Summary must be 1-2 sentences maximum, punchy and direct
- Never skip the summary for long answers

KEY T-CODES:
- Orders: IW31/32/33 (PM), CO01/02/03 (PP), ME21N/22N/23N (PO)
- Material: MM01/02/03 | BOM: CS01/02/03 | Routing: CA01/02/03
- Production versions: C223 (mass), C220 (individual) | MRP: MD01/02/04`

export const TONE_ADDITIONS = {
  balanced: `\nTone: Warm but direct.`,
  direct:   `\nTone: Bullet points only, no pleasantries.`,
  friendly: `\nTone: Warm, like a helpful colleague.`,
  formal:   `\nTone: Formal, complete sentences.`,
}

export function isComplexQuestion(message) {
  return /badi|user exit|debug|not working|failed|integration|settlement|costing|variance|spro|error|problem|why is|why does|best practice|recommend/i.test(message)
}

export function isUltraSimple(message) {
  const msg = message.toLowerCase().trim()
  return msg.split(' ').length <= 12 && /^(what is|what are|define|explain|meaning)/i.test(msg)
}

export function isCorrecting(message) {
  return /wrong|incorrect|not right|are you sure|actually|that's not|mistake|doesn't exist|not correct/i.test(message)
}

export function tokenize(messages) {
  const map = {}, rev = {}
  let n = 1
  const mask = (text) => {
    if (!text || typeof text !== 'string') return text
    text = text.replace(/\b(1\d{9})\b/g, m => { if(rev[m]) return rev[m]; const t=`[ORDER_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/\b(7\d{9})\b/g, m => { if(rev[m]) return rev[m]; const t=`[PORDER_${n++}]`; map[t]=m; rev[m]=t; return t })
    text = text.replace(/\b([A-Z]{2}\d{2})\b/g, m => { if(rev[m]) return rev[m]; const t=`[PLANT_${n++}]`; map[t]=m; rev[m]=t; return t })
    return text
  }
  const anonymised = messages.map(m => m.role === 'user' ? { ...m, content: mask(m.content) } : m)
  return { anonymised, map }
}

export function detokenize(text, map) {
  for (const [token, original] of Object.entries(map)) {
    text = text.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original)
  }
  return text
}

export async function callClaude(systemPrompt, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Claude error')
  return data.content?.[0]?.text || 'No response.'
}

export async function callGroq(systemPrompt, messages) {
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
