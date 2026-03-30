// api/chat.js — Groq + SAP tokenization layer
const SYSTEM_PROMPT = `You are an expert SAP S/4HANA consultant specializing in PP, PM, MM, Fiori, and S/4HANA configuration.
You are a personal knowledge assistant for a senior SAP consultant.

Rules:
1. Always distinguish STANDARD SAP behavior from system-specific configuration.
2. If answer depends on custom config/Z-code/BAdI, say so explicitly.
3. Never give a confident wrong answer — say "verify in your system" when uncertain.
4. Be concise and technical. Skip basics. Go straight to the point.
5. Always mention relevant transaction codes, table names, SPRO paths, BAdI names, or function modules.
6. If question is ambiguous, ask ONE clarifying question before answering.
7. Format with short paragraphs or bullet points. Use backtick formatting for \`T-codes\`, \`table names\`, \`field names\`.
8. Tokens like [ORDER_1], [PLANT_2], [MATERIAL_3] are anonymised SAP values. Treat them as real and use the same token in your response.
9. Keep answers concise — 3 to 8 sentences or bullet points. Do not over-explain.

You are a trusted senior colleague. Be direct.`

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
  const { messages, module: mod, topic } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid body' })

  const withContext = messages.map((m, i) =>
    i === messages.length - 1 && m.role === 'user'
      ? { ...m, content: `SAP context: module="${mod || 'General'}", topic="${topic || 'General'}"\n\n${m.content}` }
      : m
  )

  const { anonymised, map } = tokenize(withContext)
  if (Object.keys(map).length > 0) console.log(`Tokenized ${Object.keys(map).length} value(s)`)

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...anonymised],
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
