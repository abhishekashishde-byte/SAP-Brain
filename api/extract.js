// api/extract.js — Passive memory extraction
// Called silently after each assistant reply.
// Pulls SAP facts from the latest Q&A pair and stores them as embeddings
// in Supabase pgvector (table: sap_memories).
//
// Supabase setup required — run migration in /supabase/migrations/001_sap_memories.sql

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId, convId, module: mod, topic, userMsg, assistantMsg } = req.body
  if (!userId || !userMsg || !assistantMsg) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // ── 1. Ask Groq to pull discrete SAP facts from this Q&A pair ─────────────
    const extractPrompt = `You are an SAP knowledge extractor.

Extract discrete, reusable SAP facts from this Q&A exchange. Each fact must be:
- Self-contained (understandable without context)
- Specific (not generic SAP knowledge everyone knows)
- Actionable (useful for answering future SAP questions)

Q: ${userMsg}
A: ${assistantMsg}

Return ONLY a JSON array of fact strings (max 5). If no specific facts worth storing, return [].
Example: ["PM02 orders do not auto-populate Person Responsible from IP10 — field AUFK-VERANTWORTL stays blank","BAdI WORKORDER_UPDATE can inject Person Responsible from AFIH-INGRP at order creation"]`

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

    // ── 2. Embed each fact using Groq's embedding endpoint ────────────────────
    // Groq doesn't have embeddings yet — use OpenAI-compatible endpoint via Supabase's
    // built-in embeddings, or fall back to storing facts as text only (text search).
    // We store without vectors initially; a nightly Supabase Edge Function can embed.
    // This keeps Vercel serverless fast and avoids OpenAI dependency.

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY // server-side only key

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      // Graceful degradation — log but don't fail the chat
      console.warn('[extract] Missing Supabase service key — facts not stored')
      return res.status(200).json({ stored: 0, note: 'service key missing' })
    }

    // ── 3. Upsert facts into sap_memories ─────────────────────────────────────
    const rows = facts.map(fact => ({
      user_id:   userId,
      conv_id:   convId || null,
      module:    mod    || null,
      topic:     topic  || null,
      fact,
      embedding: null,   // populated later by Supabase Edge Function
      created_at: new Date().toISOString(),
    }))

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/sap_memories`, {
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
    // Never let memory extraction crash the caller
    console.error('[extract] error:', err.message)
    return res.status(200).json({ stored: 0, error: err.message })
  }
}
