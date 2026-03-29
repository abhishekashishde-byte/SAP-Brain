// api/chat.js — Vercel serverless function
// Groq API key is server-side only — never exposed to the browser
// SAP-aware tokenization runs here before any message reaches the LLM

// ─────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert SAP S/4HANA consultant specializing in PP (Production Planning), PM (Plant Maintenance), MM/Logistics, Fiori UX, and S/4HANA general configuration.

Your role is to act as a personal knowledge assistant for a senior SAP consultant.

Rules you must follow:
1. Always distinguish between STANDARD SAP behavior vs. behavior that could vary by system configuration.
2. When an answer depends on system-specific setup (Z-programs, BAdIs, custom config), explicitly say so and flag it.
3. If you are not fully certain about something, say "This is standard SAP behavior but verify in your system" — never give a confident wrong answer.
4. Be concise and technical. This user is a senior consultant — skip basics, go straight to the point.
5. When relevant, mention: transaction codes, table names, SPRO paths, BAdI names, or function modules.
6. If the question is ambiguous between system-specific and standard SAP, ask one clarifying question before answering.
7. Format answers clearly — use short paragraphs or bullet points. Use backtick formatting for transaction codes, table names, and field names.
8. You will sometimes see tokens like [ORDER_1], [PLANT_2], [MATERIAL_3] in the user message. These are anonymised placeholders for sensitive data. Treat them as real SAP values and answer accordingly. Use the same token in your response — do not try to guess or reveal the original value.

You are a trusted expert colleague, not a generic AI. Speak accordingly.`


// ─────────────────────────────────────────────
// SAP TOKENIZATION LAYER
// Masks sensitive SAP values before they reach the LLM
// Reverse-maps tokens back in the response
// ─────────────────────────────────────────────

function tokenize(messages) {
  const map = {}
  const reverseMap = {}
  let counter = 1

  function mask(text) {
    if (!text || typeof text !== 'string') return text

    // Production order numbers (10-digit, starting with 1)
    text = text.replace(/\b(1\d{9})\b/g, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[ORDER_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // Process orders (10-digit, starting with 7)
    text = text.replace(/\b(7\d{9})\b/g, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[PROC_ORDER_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // Plant codes (2 uppercase letters + 2 digits e.g. WE01, DE02)
    text = text.replace(/\b([A-Z]{2}\d{2})\b/g, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[PLANT_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // Company codes (standalone 4-digit numbers)
    text = text.replace(/(?<![A-Z0-9_])\b(\d{4})\b(?![A-Z0-9_])/g, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[COMPCODE_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // Material numbers (e.g. MAT-10045892)
    text = text.replace(/\b([A-Z0-9]{3,6}-\d{5,12})\b/g, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[MATERIAL_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // Vendor / customer numbers (standalone 6-digit)
    text = text.replace(/(?<![A-Z0-9_])\b(\d{6})\b(?![A-Z0-9_])/g, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[VENDOR_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // Z-programs and Z-tables
    text = text.replace(/\b(Z_[A-Z0-9_]+)\b/gi, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[ZPROG_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // Y-programs (customer namespace)
    text = text.replace(/\b(Y_[A-Z0-9_]+)\b/gi, (match) => {
      if (reverseMap[match]) return reverseMap[match]
      const token = `[YPROG_${counter++}]`
      map[token] = match
      reverseMap[match] = token
      return token
    })

    // SAP client numbers (e.g. "client 100")
    text = text.replace(/\bclient\s+(\d{3})\b/gi, (match, num) => {
      if (reverseMap[num]) return match.replace(num, reverseMap[num])
      const token = `[CLIENT_${counter++}]`
      map[token] = num
      reverseMap[num] = token
      return match.replace(num, token)
    })

    return text
  }

  // Only mask user messages — assistant messages already anonymised
  const anonymisedMessages = messages.map(m => {
    if (m.role === 'user') {
      return { ...m, content: mask(m.content) }
    }
    return m
  })

  return { anonymisedMessages, map }
}


function detokenize(text, map) {
  if (!text) return text
  for (const [token, original] of Object.entries(map)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(escaped, 'g'), original)
  }
  return text
}


// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages, module: mod, topic } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  // Step 1 — Inject topic context into last user message
  const messagesWithContext = messages.map((m, i) => {
    if (i === messages.length - 1 && m.role === 'user') {
      return {
        ...m,
        content: `Context: SAP topic is "${topic}" within module "${mod}".\n\n${m.content}`
      }
    }
    return m
  })

  // Step 2 — Tokenize: mask sensitive SAP values
  const { anonymisedMessages, map } = tokenize(messagesWithContext)
  const tokenCount = Object.keys(map).length
  if (tokenCount > 0) {
    console.log(`Tokenized ${tokenCount} sensitive value(s) before sending to LLM`)
  }

  // Step 3 — Call Groq
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...anonymisedMessages
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Groq API error:', data)
      return res.status(500).json({ error: 'AI service error', detail: data?.error?.message || 'Unknown error' })
    }

    const rawReply = data.choices?.[0]?.message?.content || 'No response received.'

    // Step 4 — Detokenize: restore original values in response
    const reply = detokenize(rawReply, map)

    return res.status(200).json({ reply })

  } catch (err) {
    console.error('Server error:', err)
    return res.status(500).json({ error: 'Server error', detail: err.message })
  }
}
