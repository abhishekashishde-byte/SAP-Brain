// api/reference-search.js — v1 HARDENED LOOKUP
// Purpose: reliable DB lookup for SAP objects before Gemini/Claude
// Focus: tables / tcodes / fiori / fields / common SAP aliases

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { question = '' } = req.body || {}
    const q = String(question).trim()
    const qLower = q.toLowerCase()

    if (!q) {
      return res.status(400).json({ error: 'Missing question' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Missing Supabase env vars' })
    }

    // ───────────────────────────────────────────────────────────────────────
    // 1. INTENT
    // ───────────────────────────────────────────────────────────────────────
    const intent = detectIntent(qLower)

    // ───────────────────────────────────────────────────────────────────────
    // 2. ALIAS EXTRACTION
    // ───────────────────────────────────────────────────────────────────────
    const aliasCandidates = buildAliasCandidates(qLower)

    // ───────────────────────────────────────────────────────────────────────
    // 3. SEARCH SAP_OBJECTS
    // ───────────────────────────────────────────────────────────────────────
    const objectResults = await searchSapObjects({
      SUPABASE_URL,
      SUPABASE_KEY,
      qLower,
      aliasCandidates,
      limit: 12,
    })

    // ───────────────────────────────────────────────────────────────────────
    // 4. SEARCH SAP_FIELDS (for field-style queries)
    // ───────────────────────────────────────────────────────────────────────
    const fieldResults = await searchSapFields({
      SUPABASE_URL,
      SUPABASE_KEY,
      qLower,
      aliasCandidates,
      limit: 12,
    })

    // ───────────────────────────────────────────────────────────────────────
    // 5. SCORE RESULTS
    // ───────────────────────────────────────────────────────────────────────
    const scoredObjects = objectResults.map(r => ({
      ...r,
      _score: scoreObject(r, qLower, aliasCandidates),
    })).sort((a, b) => b._score - a._score)

    const scoredFields = fieldResults.map(r => ({
      ...r,
      _score: scoreField(r, qLower, aliasCandidates),
    })).sort((a, b) => b._score - a._score)

    // ───────────────────────────────────────────────────────────────────────
    // 6. RESPONSE SHAPE
    // ───────────────────────────────────────────────────────────────────────
    if (intent === 'FIELD_LOOKUP' && scoredFields.length) {
      const top = scoredFields[0]
      return res.status(200).json({
        intent,
        confidence: normalizeScore(top._score),
        match: top,
        matches: scoredFields.slice(0, 6),
      })
    }

    // If object query and we found objects
    if (scoredObjects.length) {
      const top = scoredObjects[0]

      // If query sounds broad, return multiple
      if (isBroadQuery(qLower) || scoredObjects.length > 1 && top._score < 75) {
        return res.status(200).json({
          intent,
          confidence: normalizeScore(top._score),
          matches: scoredObjects.slice(0, 6),
        })
      }

      return res.status(200).json({
        intent,
        confidence: normalizeScore(top._score),
        match: top,
        matches: scoredObjects.slice(0, 6),
      })
    }

    // fallback to field if object failed
    if (scoredFields.length) {
      const top = scoredFields[0]
      return res.status(200).json({
        intent: 'FIELD_LOOKUP',
        confidence: normalizeScore(top._score),
        match: top,
        matches: scoredFields.slice(0, 6),
      })
    }

    // no hit
    return res.status(200).json({
      intent,
      confidence: 0,
      match: null,
      matches: [],
    })

  } catch (err) {
    console.error('REFERENCE SEARCH ERROR:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function detectIntent(q) {
  if (/\bfield\b|\baufnr\b|\bmatnr\b|\bwerks\b|\bwhat is .* in .*table\b/.test(q)) {
    return 'FIELD_LOOKUP'
  }

  if (/\btable\b|\btcode\b|\bfiori\b|\bapp\b|\bwhich table\b|\bwhich tcode\b|\bwhich app\b/.test(q)) {
    return 'REFERENCE'
  }

  if (/\bdifference\b|\bvs\b|\bcompare\b/.test(q)) {
    return 'COMPARISON'
  }

  return 'REFERENCE'
}

function isBroadQuery(q) {
  return /\bwhich\b|\bwhat are\b|\blist\b|\brelevant\b|\bpossible\b|\ball\b/.test(q)
}

function normalizeScore(score) {
  if (score >= 95) return 0.95
  if (score >= 85) return 0.85
  if (score >= 75) return 0.75
  if (score >= 65) return 0.65
  if (score >= 55) return 0.55
  if (score >= 45) return 0.45
  return 0.35
}

function buildAliasCandidates(q) {
  const aliases = new Set()

  // Raw keywords
  q.split(/\s+/).forEach(w => {
    if (w.length > 2) aliases.add(w)
  })

  // Strong SAP aliases
  const aliasMap = {
    'production version': ['mkal', 'production version', 'verid', 'c223', 'c220'],
    'production order': ['aufk', 'afko', 'production order', 'co01', 'co02', 'co03'],
    'process order': ['aufk', 'afko', 'process order', 'cor1', 'cor2', 'cor3'],
    'equipment': ['equi', 'equz', 'equipment', 'ie01', 'ie02', 'ie03'],
    'functional location': ['iflot', 'functional location', 'il01', 'il02', 'il03'],
    'notification': ['qmel', 'notification', 'iw21', 'iw22', 'iw23'],
    'maintenance order': ['aufk', 'maintenance order', 'iw31', 'iw32', 'iw33'],
    'routing': ['plko', 'plpo', 'routing', 'ca01', 'ca02', 'ca03'],
    'bom': ['mast', 'stko', 'stpo', 'bom', 'cs01', 'cs02', 'cs03'],
    'material master': ['mara', 'marc', 'mard', 'material master', 'mm01', 'mm02', 'mm03'],
    'storage location': ['t001l', 'mard', 'storage location'],
    'plant': ['t001w', 'plant'],
    'purchase order': ['ekko', 'ekpo', 'purchase order', 'me21n', 'me22n', 'me23n'],
    'sales order': ['vbak', 'vbap', 'sales order', 'va01', 'va02', 'va03'],
    'delivery': ['likp', 'lips', 'delivery', 'vl01n', 'vl02n', 'vl03n'],
    'invoice': ['vbrk', 'vbrp', 'invoice', 'vf01'],
    'work center': ['crhd', 'work center', 'cr01', 'cr02', 'cr03'],
    'production version lot size': ['mkalv', 'lot size', 'production version lot size'],
  }

  for (const [phrase, values] of Object.entries(aliasMap)) {
    if (q.includes(phrase)) {
      values.forEach(v => aliases.add(v))
    }
  }

  // Common field-like tokens
  const uppercaseTokens = q.match(/\b[a-z]{3,10}\b/g) || []
  uppercaseTokens.forEach(t => aliases.add(t))

  return Array.from(aliases)
}

async function searchSapObjects({ SUPABASE_URL, SUPABASE_KEY, qLower, aliasCandidates, limit = 12 }) {
  const orParts = []

  for (const term of aliasCandidates.slice(0, 12)) {
    const esc = encodeURIComponent(term)
    orParts.push(`tech_name.ilike.*${esc}*`)
    orParts.push(`title.ilike.*${esc}*`)
    orParts.push(`short_desc.ilike.*${esc}*`)
    orParts.push(`keywords.ilike.*${esc}*`)
    orParts.push(`module.ilike.*${esc}*`)
  }

  const url = `${SUPABASE_URL}/rest/v1/sap_objects?select=*&or=(${orParts.join(',')})&limit=${limit}`

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })

  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function searchSapFields({ SUPABASE_URL, SUPABASE_KEY, qLower, aliasCandidates, limit = 12 }) {
  const orParts = []

  for (const term of aliasCandidates.slice(0, 12)) {
    const esc = encodeURIComponent(term)
    orParts.push(`field_name.ilike.*${esc}*`)
    orParts.push(`table_name.ilike.*${esc}*`)
    orParts.push(`short_desc.ilike.*${esc}*`)
    orParts.push(`common_meaning.ilike.*${esc}*`)
  }

  const url = `${SUPABASE_URL}/rest/v1/sap_fields?select=*&or=(${orParts.join(',')})&limit=${limit}`

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })

  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

function scoreObject(row, qLower, aliases) {
  let score = 0

  const tech = (row.tech_name || '').toLowerCase()
  const title = (row.title || '').toLowerCase()
  const desc = (row.short_desc || '').toLowerCase()
  const kw = (row.keywords || '').toLowerCase()
  const type = (row.object_type || '').toLowerCase()

  for (const a of aliases) {
    const aa = a.toLowerCase()

    if (tech === aa) score += 80
    if (tech.includes(aa)) score += 40
    if (title.includes(aa)) score += 35
    if (desc.includes(aa)) score += 25
    if (kw.includes(aa)) score += 25
    if (type.includes(aa)) score += 20
  }

  // Strong object boosts
  if (qLower.includes('production version') && tech === 'mkal') score += 120
  if (qLower.includes('production version') && tech === 'mkalv') score += 60
  if (qLower.includes('equipment') && tech === 'equi') score += 120
  if (qLower.includes('storage location') && tech === 't001l') score += 120
  if (qLower.includes('storage location') && tech === 'mard') score += 100
  if (qLower.includes('production order') && tech === 'afko') score += 120
  if (qLower.includes('production order') && tech === 'aufk') score += 110
  if (qLower.includes('routing') && tech === 'plko') score += 120
  if (qLower.includes('routing') && tech === 'plpo') score += 110
  if (qLower.includes('bom') && tech === 'mast') score += 120
  if (qLower.includes('bom') && tech === 'stko') score += 110
  if (qLower.includes('bom') && tech === 'stpo') score += 110

  return score
}

function scoreField(row, qLower, aliases) {
  let score = 0

  const field = (row.field_name || '').toLowerCase()
  const table = (row.table_name || '').toLowerCase()
  const desc = (row.short_desc || '').toLowerCase()
  const meaning = (row.common_meaning || '').toLowerCase()

  for (const a of aliases) {
    const aa = a.toLowerCase()

    if (field === aa) score += 80
    if (field.includes(aa)) score += 45
    if (table.includes(aa)) score += 35
    if (desc.includes(aa)) score += 25
    if (meaning.includes(aa)) score += 25
  }

  return score
}
