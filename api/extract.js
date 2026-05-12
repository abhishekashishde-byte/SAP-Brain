// api/extract.js — Passive memory extraction
// Called silently after each assistant reply.
// Stores SAP facts in Supabase memories table.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId, convId, module: mod, topic, userMsg, assistantMsg } = req.body
  if (!userId || !userMsg || !assistantMsg) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const extractPrompt = `You are an SAP knowledge extractor.

Extract discrete, reusable SAP facts from this Q&A exchange. Each fact must be:
- Self-contained (understandable without context)
- Specific (not generic SAP knowledge everyone knows)
- Actionable (useful for answering future SAP questions)

Q: ${userMsg}
A: ${assistantMsg}

Return ONLY a JSON array of fact strings (max 5). If no specific facts worth storing, return [].
Example: ["PM02 orders do not auto-populate Person Responsible from IP10","BAdI WORKORDER_UPDATE can inject Person Responsible from AFIH-INGRP at order creation"]`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: 'user', content: extractPrompt }],
      }),
    })

    const groqData = await groqRes.json()
    const raw = groqData.choices?.[0]?.message?.content?.trim() || '[]'
    const cleaned = raw.replace(/```json|```/g, '').trim()

    let facts = []
    try { facts = JSON.parse(cleaned) } catch { return res.status(200).json({ stored: 0 }) }
    if (!Array.isArray(facts) || facts.length === 0) return res.status(200).json({ stored: 0 })

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.warn('[extract] Missing Supabase service key — facts not stored')
      return res.status(200).json({ stored: 0, note: 'service key missing' })
    }

    // Dedup check — skip facts already stored for this user
    const newFacts = []
    for (const fact of facts) {
      const keywords = fact.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 4).slice(0, 3)
      if (keywords.length > 0) {
        const filters = keywords.map(w => `content.ilike.*${w}*`).join(',')
        try {
          const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/memories?user_id=eq.${userId}&or=(${filters})&limit=1`, {
            headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
          })
          const existing = await checkRes.json()
          if (existing?.length > 0) { console.log('[extract] Skipping duplicate:', fact.slice(0, 50)); continue }
        } catch { /* if check fails, still insert */ }
      }
      newFacts.push(fact)
    }

    if (newFacts.length === 0) return res.status(200).json({ stored: 0, note: 'all duplicates' })

    const rows = newFacts.map(fact => ({
      user_id:    userId,
      content:    fact,
      created_at: new Date().toISOString(),
    }))

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    })

    if (!insertRes.ok) {
      const err = await insertRes.text()
      console.error('[extract] Supabase insert error:', err)
      return res.status(200).json({ stored: 0, note: 'db error' })
    }

    return res.status(200).json({ stored: facts.length })

  } catch (err) {
    console.error('[extract] error:', err.message)
    return res.status(200).json({ stored: 0, error: err.message })
  }
}
