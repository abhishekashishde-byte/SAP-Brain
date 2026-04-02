// api/recall.js — Retrieve relevant memories for context injection
// Called at the start of /api/chat before sending to LLM.
// Does text-based similarity search (ILIKE) until pgvector embeddings are populated.
// Once embeddings exist, switches to cosine similarity via match_sap_memories RPC.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId, query, module: mod, limit = 5 } = req.body
  if (!userId || !query) return res.status(400).json({ error: 'Missing userId or query' })

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ memories: [] })
  }

  try {
    // ── Text-based keyword search (phase 1 — no embedding needed) ─────────────
    // Extract key SAP terms from the query for matching
    const terms = extractSAPTerms(query)

    if (terms.length === 0) return res.status(200).json({ memories: [] })

    // Build OR filter for ILIKE across fact text
    const filters = terms.map(t => `fact.ilike.*${encodeURIComponent(t)}*`).join(',')
    const moduleFilter = mod ? `&module=eq.${encodeURIComponent(mod)}` : ''

    const url = `${SUPABASE_URL}/rest/v1/sap_memories?user_id=eq.${userId}${moduleFilter}&or=(${filters})&order=created_at.desc&limit=${limit}`

    const memRes = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    })

    if (!memRes.ok) return res.status(200).json({ memories: [] })

    const rows = await memRes.json()
    const memories = Array.isArray(rows) ? rows.map(r => r.fact).filter(Boolean) : []

    return res.status(200).json({ memories })

  } catch (err) {
    console.error('[recall] error:', err.message)
    return res.status(200).json({ memories: [] })
  }
}

// Pull SAP-relevant tokens from a user message for keyword matching
function extractSAPTerms(text) {
  const terms = []

  // T-codes and order types (e.g. IW31, PM02, CO01)
  const tcodes = text.match(/\b([A-Z]{1,4}\d{2,3}N?)\b/g) || []
  terms.push(...tcodes)

  // Table names (e.g. AUFK, AFIH, MARA)
  const tables = text.match(/\b([A-Z]{3,6})\b/g) || []
  terms.push(...tables.filter(t => t.length >= 3 && t.length <= 6))

  // BAdI / user exit names
  const badis = text.match(/\b(BADI|BADIIMPL|[A-Z_]{5,30})\b/gi) || []
  terms.push(...badis.slice(0, 3))

  // Key SAP nouns (lower-cased for ILIKE)
  const sapNouns = [
    'settlement','valuation','refurbish','routing','bom','mrp','capacity',
    'person responsible','functional location','equipment','notification',
    'production version','batch','split valuation','costing','variance',
  ]
  const lower = text.toLowerCase()
  sapNouns.forEach(noun => { if (lower.includes(noun)) terms.push(noun) })

  // Deduplicate and cap
  return [...new Set(terms)].slice(0, 6)
}
