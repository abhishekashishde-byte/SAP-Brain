// api/chat.js — v3: true SSE streaming, keepalive, personal name injection

import {
  BASE_SYSTEM_PROMPT, TONE_ADDITIONS,
  isComplexQuestion, tokenize, detokenize,
} from './_shared.js'

async function fetchMemories(userId, query, mod) {
  if (!process.env.SUPABASE_SERVICE_KEY) return []
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const KEY = process.env.SUPABASE_SERVICE_KEY
    const terms = extractSAPTerms(query)
    if (!terms.length) return []
    const filters = terms.map(t => `fact.ilike.*${encodeURIComponent(t)}*`).join(',')
    const modFilter = mod ? `&module=eq.${encodeURIComponent(mod)}` : ''
    const url = `${SUPABASE_URL}/rest/v1/sap_memories?user_id=eq.${userId}${modFilter}&or=(${filters})&order=created_at.desc&limit=6`
    const res = await fetch(url, { headers:{ 'apikey':KEY, 'Authorization':`Bearer ${KEY}` } })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(r=>r.fact).filter(Boolean) : []
  } catch { return [] }
}

function extractSAPTerms(text) {
  const terms = []
  const tcodes = text.match(/\b([A-Z]{1,4}\d{2,3}N?)\b/g) || []
  terms.push(...tcodes)
  const nouns = ['settlement','valuation','refurbish','routing','bom','mrp','capacity','person responsible','functional location','equipment','notification','production version','batch','split valuation','costing','variance']
  const lower = text.toLowerCase()
  nouns.forEach(n => { if (lower.includes(n)) terms.push(n) })
  return [...new Set(terms)].slice(0,6)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const { messages, module: mod, topic, tone='balanced', userId, userName } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error:'Invalid body' })

  // Build system prompt — inject name if available
  let systemPrompt = BASE_SYSTEM_PROMPT
  if (userName) {
    systemPrompt += `\n\nUSER NAME: The user's name is ${userName}. Address them by name occasionally — e.g. "Good question, ${userName}" or "Exactly, ${userName}" — but naturally, not on every message. Max once per response.`
  }
  systemPrompt += TONE_ADDITIONS[tone] || TONE_ADDITIONS.balanced

  // Inject memories
  const lastMsg = messages[messages.length-1]?.content || ''
  if (userId) {
    const memories = await fetchMemories(userId, lastMsg, mod)
    if (memories.length) {
      systemPrompt += `\n\nRELEVANT FACTS FROM PAST CONVERSATIONS (use as silent context):\n${memories.map((f,i)=>`${i+1}. ${f}`).join('\n')}`
    }
  }

  // Add topic context
  const withContext = messages.map((m,i) =>
    i===messages.length-1 && m.role==='user'
      ? { ...m, content:`SAP context: module="${mod||'General'}", topic="${topic||'General'}"\n\n${m.content}` }
      : m
  )

  const { anonymised, map } = tokenize(withContext)

  const useClaudeKey = process.env.ANTHROPIC_API_KEY
  const useGroqKey   = process.env.GROQ_API_KEY
  const complex      = isComplexQuestion(lastMsg)

  // ── SSE streaming response ──────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  // Keepalive ping every 15s so screen-off/tab-hidden doesn't kill the connection
  const keepalive = setInterval(() => res.write(': ping\n\n'), 15000)

  try {
    let modelUsed = ''

    if (complex && useClaudeKey) {
      // ── Claude streaming ──
      modelUsed = 'claude'
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': useClaudeKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1200,
          stream: true,
          system: systemPrompt,
          messages: anonymised,
        }),
      })

      if (!claudeRes.ok) {
        const err = await claudeRes.json()
        throw new Error(err?.error?.message || 'Claude error')
      }

      let fullText = ''
      const reader = claudeRes.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') continue
          try {
            const evt = JSON.parse(raw)
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              const chunk = evt.delta.text
              fullText += chunk
              send({ type:'chunk', text: detokenize(chunk, map) })
            }
          } catch {}
        }
      }
      send({ type:'done', model:'claude', full: detokenize(fullText, map) })

    } else if (useGroqKey) {
      // ── Groq streaming ──
      modelUsed = 'groq'
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useGroqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1200,
          temperature: 0.2,
          stream: true,
          messages: [{ role:'system', content:systemPrompt }, ...anonymised],
        }),
      })

      if (!groqRes.ok) {
        const err = await groqRes.json()
        throw new Error(err?.error?.message || 'Groq error')
      }

      let fullText = ''
      const reader = groqRes.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') continue
          try {
            const evt = JSON.parse(raw)
            const chunk = evt.choices?.[0]?.delta?.content
            if (chunk) {
              fullText += chunk
              send({ type:'chunk', text: detokenize(chunk, map) })
            }
          } catch {}
        }
      }
      send({ type:'done', model:'groq', full: detokenize(fullText, map) })

    } else {
      send({ type:'error', error:'No API keys configured' })
    }

  } catch (err) {
    send({ type:'error', error: err.message })
  } finally {
    clearInterval(keepalive)
    res.end()
  }
}
