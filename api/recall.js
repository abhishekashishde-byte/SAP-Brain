// api/recall.js — Retrieve relevant memories for context injection
// Authentication and account approval are enforced server-side. The user ID
// always comes from the verified Supabase session, never from request input.

import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireJsonBody(req, res, 20_000)) return

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const { query, module: mod } = req.body
  const requestedLimit = Number(req.body.limit ?? 5)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(10, Math.max(1, Math.trunc(requestedLimit)))
    : 5

  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Missing query' })
  }
  if (query.length > 4_000) {
    return res.status(400).json({ error: 'Query is too long' })
  }
  if (mod != null && typeof mod !== 'string') {
    return res.status(400).json({ error: 'Invalid module' })
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[recall] Supabase service configuration missing')
    return res.status(503).json({ error: 'Memory service unavailable' })
  }

  try {
    const terms = extractSAPTerms(query)
    if (terms.length === 0) return res.status(200).json({ memories: [] })

    const filters = terms
      .map(term => `content.ilike.*${encodeURIComponent(term)}*`)
      .join(',')
    const moduleFilter = mod?.trim()
      ? `&module=eq.${encodeURIComponent(mod.trim())}`
      : ''
    const userId = encodeURIComponent(auth.user.id)
    const url = `${SUPABASE_URL}/rest/v1/memories?user_id=eq.${userId}&or=(${filters})${moduleFilter}&order=created_at.desc&limit=${limit}`

    const memRes = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    })

    if (!memRes.ok) {
      console.error('[recall] database request failed:', memRes.status)
      return res.status(200).json({ memories: [] })
    }

    const rows = await memRes.json()
    const memories = Array.isArray(rows)
      ? rows.map(row => row.content).filter(content => typeof content === 'string' && content.trim())
      : []

    return res.status(200).json({ memories })
  } catch (error) {
    console.error('[recall] error:', error.message)
    return res.status(200).json({ memories: [] })
  }
}

function extractSAPTerms(text) {
  const terms = []

  const tcodes = text.match(/\b([A-Z]{1,4}\d{2,3}N?)\b/g) || []
  terms.push(...tcodes)

  const tables = text.match(/\b([A-Z]{3,6})\b/g) || []
  terms.push(...tables.filter(term => term.length >= 3 && term.length <= 6))

  const badis = text.match(/\b(BADI|BADIIMPL|[A-Z_]{5,30})\b/gi) || []
  terms.push(...badis.slice(0, 3))

  const sapNouns = [
    'settlement', 'valuation', 'refurbish', 'routing', 'bom', 'mrp', 'capacity',
    'person responsible', 'functional location', 'equipment', 'notification',
    'production version', 'batch', 'split valuation', 'costing', 'variance',
  ]
  const lower = text.toLowerCase()
  sapNouns.forEach(noun => {
    if (lower.includes(noun)) terms.push(noun)
  })

  return [...new Set(terms)].slice(0, 6)
}
