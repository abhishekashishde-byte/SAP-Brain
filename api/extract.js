// api/extract.js — Passive memory extraction
// Stores facts only for the user identified by the verified Supabase session.

import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireJsonBody(req, res, 50_000)) return

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const { convId, module: mod, topic, userMsg, assistantMsg } = req.body
  if (typeof userMsg !== 'string' || typeof assistantMsg !== 'string' || !userMsg.trim() || !assistantMsg.trim()) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (userMsg.length > 8_000 || assistantMsg.length > 16_000) {
    return res.status(400).json({ error: 'Message content is too long' })
  }

  const userId = auth.user.id

  try {
    const extractPrompt = `You are an SAP knowledge extractor.

Extract discrete, reusable SAP facts from this Q&A exchange. Each fact must be self-contained, specific, and actionable.

Q: ${userMsg}
A: ${assistantMsg}

Return ONLY a JSON array of fact strings (max 5). If no specific facts are worth storing, return [].`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: 'user', content: extractPrompt }],
      }),
    })

    if (!groqRes.ok) {
      console.error('[extract] provider request failed:', groqRes.status)
      return res.status(200).json({ stored: 0 })
    }

    const groqData = await groqRes.json()
    const raw = groqData.choices?.[0]?.message?.content?.trim() || '[]'
    let facts
    try {
      facts = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return res.status(200).json({ stored: 0 })
    }

    if (!Array.isArray(facts)) return res.status(200).json({ stored: 0 })
    facts = facts
      .filter(fact => typeof fact === 'string')
      .map(fact => fact.trim())
      .filter(fact => fact.length >= 10 && fact.length <= 2_000)
      .slice(0, 5)
    if (facts.length === 0) return res.status(200).json({ stored: 0 })

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Memory service unavailable' })
    }

    const newFacts = []
    for (const fact of facts) {
      const keywords = fact.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4).slice(0, 3)
      if (keywords.length > 0) {
        const filters = keywords.map(w => `content.ilike.*${encodeURIComponent(w)}*`).join(',')
        try {
          const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/memories?user_id=eq.${encodeURIComponent(userId)}&or=(${filters})&limit=1`, {
            headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
          })
          const existing = checkRes.ok ? await checkRes.json() : []
          if (existing?.length > 0) continue
        } catch {
          // Dedup failure must not change ownership; insertion remains scoped to auth user.
        }
      }
      newFacts.push(fact)
    }

    if (newFacts.length === 0) return res.status(200).json({ stored: 0, note: 'all duplicates' })

    const rows = newFacts.map(content => ({
      user_id: userId,
      content,
      source: 'passive_extraction',
      conversation_id: typeof convId === 'string' ? convId.slice(0, 200) : null,
      module: typeof mod === 'string' ? mod.slice(0, 100) : null,
      topic: typeof topic === 'string' ? topic.slice(0, 200) : null,
      created_at: new Date().toISOString(),
    }))

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    })

    if (!insertRes.ok) {
      console.error('[extract] Supabase insert failed:', insertRes.status)
      return res.status(200).json({ stored: 0, note: 'db error' })
    }

    return res.status(200).json({ stored: newFacts.length })
  } catch (error) {
    console.error('[extract] error:', error.message)
    return res.status(200).json({ stored: 0 })
  }
}
