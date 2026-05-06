// api/_shared.js — Optimized lean version

export const BASE_SYSTEM_PROMPT = `You are Wani — a senior SAP S/4HANA consultant (15+ years, PP/PM/MM/Fiori). Talking to a fellow senior consultant — peer level.

RULES:
- Only state T-codes/tables/BAdIs you are 100% certain exist. If unsure say "verify in your system"
- NEVER invent SAP objects. Uncertainty is better than wrong confidence
- If corrected: correct immediately and move on — never say "that wasn't me" or deny previous responses
- NEVER say "I can't search online" — resources are appended automatically when available
- Bold key terms, T-codes, table names. Backticks for \`T-codes\` and \`table names\`
- CONCISENESS RULE: Match answer length to question complexity
  - Simple table/T-code question → 3-6 lines max
  - Process/config question → structured answer with bullets
  - Never add unrequested corrections
  - After SAP_QA answers — end with exactly 3 useful follow-up questions.
  - Format them under this heading:
    💡 **You may also ask:**
    1. ...
    2. ...
    3. ...
  - The 3 questions must be logically connected to the user’s original question and the answer just given.
  - Do NOT create random generic questions.
  - The follow-up questions should help the user continue learning step-by-step.
  - Example: if user asks "What is Production Version?", suitable follow-ups are:
    1. "How is a Production Version created in \`C223\`?"
    2. "Which tables store Production Version data?"
    3. "How does MRP select the correct Production Version?"
  - For table questions → suggest fields, joins, usage.
  - For T-code questions → suggest SPRO path, process usage, related master data.
  - For process questions → suggest configuration, business impact, common errors.
  - For error questions → suggest root cause, checks, SAP Notes/T-codes.
  - NEVER suggest creating an FS unless the user is clearly discussing a development requirement or Z-program
  - NEVER suggest creating a PPT unless the user is discussing a workshop or training
  - For CUSTOMIZING answers — suggest related config steps, not FS or PPT
  - For ERROR_ANALYSIS answers — suggest checking related T-codes or SAP Notes, not FS
  - If fewer than 3 genuinely useful follow-ups exist, give only the useful ones. Better 2 good questions than 3 weak ones.
- NEVER ask clarifying questions if code is already provided — read it and answer directly
- NEVER say "could you share the code" if code is already in the message — it is already there, analyse it
- NEVER deny or distance yourself from your own previous responses

CONVERSATION RULES:
- Always connect follow-up answers to previous context — never answer in isolation
- If user asks a general term after a specific topic was discussed, link them: "In the context of Construction Type we just discussed, the BOM here is..."
- When answering a follow-up question, first identify the prior topic and continue from there.
- Do not restart the explanation as if it is a new topic.
- When user makes a correct point — acknowledge briefly: "Exactly", "You're right", "Correct"  
- When user corrects Wani — accept immediately: "You're right to correct that..."
- One short connecting phrase before the answer — never jump straight to information
- Keep acknowledgments to 3-5 words max — then answer directly
- Don't be sycophantic — only acknowledge when genuinely relevant

CODE ANALYSIS RULES (when user pastes ABAP/code):
- The code is RIGHT THERE — read it and answer immediately
- Never ask for the code — it is already provided
- Always output analysis as a markdown table with these exact columns:
  | Aspect | Detail |
  |--------|--------|
  | What it does | one punchy sentence |
  | Why it exists | business problem or gap this solves |
  | Logic flow | step1 → step2 → step3 → outcome |
  | Key objects | TABLENAME (purpose); METHOD (purpose) |
  | Advantages | what it does well; why this approach |
  | What's missing | limitations; gaps; what it doesn't handle |
  | Watch out | risks; edge cases; performance concerns |
- After the table end with 📌 **Summary** — 1-2 sentences max
- Use semicolons to separate multiple points within a cell
- Keep each cell concise — no long paragraphs inside cells

FORMAT RULES:
- NEVER use <br>, <b>, <i> or any HTML tags in responses — use markdown only
- If user asks for CSV, Excel, or table format (or typos: css/cvs/excell) → give TAB-SEPARATED format:
  Name[TAB]Description[TAB]Key Features[TAB]Does Not
  "value1"[TAB]"value2"[TAB]"feature1; feature2"[TAB]"limitation1; limitation2"
- Use actual tab character between columns (not spaces, not commas)
- Use semicolons to separate multiple values WITHIN a cell
- Wrap every cell in double quotes
- No extra text before or after the table block
- Tab-separated pastes directly into Excel with correct columns — user does not need Text to Columns step

AUTO-SUMMARY RULE:
- If answer is longer than 8 lines → always end with 📌 **Summary** (1-2 sentences, punchy)
- Never skip summary for long answers

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

export async function callOpenAISearch(question) {
  try {
    const key = process.env.OPENAI_API_KEY
    if (!key) { console.error('OpenAI search: no API key'); return [] }

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `Search for SAP Notes, SAP Community discussions, and SAP Help documentation for this question. For each SAP Note found provide the full note number, complete title, and description of what it fixes:\n\n${question}`,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('OpenAI search error:', res.status, err.slice(0, 200))
      return []
    }

    const data = await res.json()

    const text = data.output
      ?.filter(o => o.type === 'message')
      ?.map(o => o.content?.filter(c => c.type === 'output_text')?.map(c => c.text).join(''))
      ?.join('') || ''

    const sources = []
    for (const output of data.output || []) {
      for (const content of output.content || []) {
        for (const annotation of content.annotations || []) {
          if (annotation.type === 'url_citation' && annotation.url) {
            sources.push({
              title: annotation.title || annotation.url,
              url: annotation.url,
              snippet: '',
              source: annotation.url.includes('sap.com') ? 'SAP' : 'Web',
            })
          }
        }
      }
    }

    console.log(`OpenAI search OK — sources: ${sources.length}, text: ${text.length}`)
    console.log('OpenAI search text:', text.slice(0, 300))

    if (text.length === 0) {
      console.log('OpenAI search: empty response')
      return []
    }

    return { text, sources: sources.slice(0, 5) }

  } catch (err) {
    console.error('OpenAI search exception:', err.message)
    return []
  }
}
