// api/reference-search.js — v2 FULL IMPROVED
// Better SAP object / field / alias lookup with confidence scoring

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { question } = req.body
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase config missing' })
    }

    const q = question.trim()
    const qLower = q.toLowerCase()

    // ───────────────────────────────────────────────────────────────────────
    // 1. INTENT DETECTION
    // ───────────────────────────────────────────────────────────────────────
    const isFieldLookup =
      /\bfield\b|\bstores\b|\bwhat is\b.*\bin\b|\bmeaning of\b/.test(qLower)

    const isReferenceLookup =
      /\btable\b|\btcode\b|\bfiori\b|\bapp\b|\bwhich table\b|\bwhich tcode\b|\bwhich app\b/.test(qLower)

    const isComparison =
      /\bdifference\b|\bvs\b|\bcompare\b/.test(qLower)

    // ───────────────────────────────────────────────────────────────────────
    // 2. TERM EXTRACTION
    // ───────────────────────────────────────────────────────────────────────
    const extracted = extractSearchTerms(q)
    const {
      tcodes,
      fieldNames,
      sapWords,
      objectHints,
    } = extracted

    // ───────────────────────────────────────────────────────────────────────
    // 3. FIELD LOOKUP FIRST
    // ───────────────────────────────────────────────────────────────────────
    if (fieldNames.length || isFieldLookup) {
      const fieldResult = await searchFields({
        SUPABASE_URL,
        SUPABASE_KEY,
        q,
        qLower,
        fieldNames,
        sapWords,
      })

      if (fieldResult?.match || fieldResult?.matches?.length) {
        return res.status(200).json(fieldResult)
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // 4. OBJECT / TABLE / TCODE / APP LOOKUP
    // ───────────────────────────────────────────────────────────────────────
    const objectResult = await searchObjects({
      SUPABASE_URL,
      SUPABASE_KEY,
      q,
      qLower,
      tcodes,
      sapWords,
      objectHints,
      isReferenceLookup,
      isComparison,
    })

    if (objectResult?.match || objectResult?.matches?.length) {
      return res.status(200).json(objectResult)
    }

    // ───────────────────────────────────────────────────────────────────────
    // 5. ALIAS LOOKUP (important fallback)
    // ───────────────────────────────────────────────────────────────────────
    const aliasResult = await searchAliases({
      SUPABASE_URL,
      SUPABASE_KEY,
      q,
      qLower,
      sapWords,
    })

    if (aliasResult?.match || aliasResult?.matches?.length) {
      return res.status(200).json(aliasResult)
    }

    return res.status(200).json({
      confidence: 0,
      intent: isFieldLookup ? 'FIELD_LOOKUP' : 'REFERENCE',
      match: null,
      matches: [],
      message: 'No confident SAP reference found',
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function extractSearchTerms(text = '') {
  const upperText = text.toUpperCase()

  const tcodes = [...new Set(upperText.match(/\b[A-Z]{1,4}\d{2,3}N?\b/g) || [])]
  const fieldNames = [...new Set(upperText.match(/\b[A-Z][A-Z0-9_]{2,14}\b/g) || [])]

  const stopWords = new Set([
    'WHAT','IS','THE','FOR','IN','OF','TO','USED','USE','TABLE','FIELD','TCODE',
    'FIORI','APP','WHICH','DIFFERENCE','BETWEEN','AND','STORES','WHERE','MEANING'
  ])

  const sapWords = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !stopWords.has(w.toUpperCase()))
    .filter(w => w.length > 2)

  const objectHints = []
  if (text.toLowerCase().includes('storage location')) objectHints.push('storage location')
  if (text.toLowerCase().includes('equipment')) objectHints.push('equipment')
  if (text.toLowerCase().includes('production version')) objectHints.push('production version')
  if (text.toLowerCase().includes('mrp area')) objectHints.push('mrp area')
  if (text.toLowerCase().includes('planner group')) objectHints.push('planner group')
  if (text.toLowerCase().includes('functional location')) objectHints.push('functional location')
  if (text.toLowerCase().includes('notification')) objectHints.push('notification')
  if (text.toLowerCase().includes('maintenance order')) objectHints.push('maintenance order')

  return {
    tcodes,
    fieldNames,
    sapWords: [...new Set(sapWords)],
    objectHints: [...new Set(objectHints)],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function searchFields({ SUPABASE_URL, SUPABASE_KEY, q, qLower, fieldNames, sapWords }) {
  let candidates = []

  // 1. direct field match
  if (fieldNames.length) {
    const direct = await supabaseGet(
      `${SUPABASE_URL}/rest/v1/sap_fields?field_name=in.(${fieldNames.map(x => `"${x}"`).join(',')})&select=*`,
      SUPABASE_KEY
    )
    candidates.push(...direct)
  }

  // 2. description search
  for (const word of sapWords.slice(0, 5)) {
    const descMatches = await supabaseGet(
      `${SUPABASE_URL}/rest/v1/sap_fields?or=(short_desc.ilike.*${encodeURIComponent(word)}*,common_meaning.ilike.*${encodeURIComponent(word)}*)&select=*`,
      SUPABASE_KEY
    )
    candidates.push(...descMatches)
  }

  candidates = dedupeBy(candidates, x => `${x.table_name}_${x.field_name}`)

  if (!candidates.length) return null

  const scored = candidates
    .map(c => ({
      ...c,
      _score: scoreFieldMatch(c, qLower),
    }))
    .sort((a, b) => b._score - a._score)

  const best = scored[0]
  if (!best || best._score < 0.45) return null

  if (scored.length > 1 && scored[1]._score > 0.55) {
    return {
      confidence: best._score,
      intent: 'MULTI_FIELD_LOOKUP',
      match: null,
      matches: scored.slice(0, 6),
    }
  }

  return {
    confidence: best._score,
    intent: 'FIELD_LOOKUP',
    match: best,
    matches: [],
  }
}

function scoreFieldMatch(field, qLower) {
  let score = 0

  const fieldName = (field.field_name || '').toLowerCase()
  const tableName = (field.table_name || '').toLowerCase()
  const shortDesc = (field.short_desc || '').toLowerCase()
  const commonMeaning = (field.common_meaning || '').toLowerCase()

  if (qLower.includes(fieldName)) score += 0.55
  if (qLower.includes(tableName)) score += 0.15

  const words = qLower.split(/\s+/)
  for (const w of words) {
    if (shortDesc.includes(w)) score += 0.08
    if (commonMeaning.includes(w)) score += 0.08
  }

  return Math.min(score, 0.99)
}

// ─────────────────────────────────────────────────────────────────────────────
// OBJECT SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function searchObjects({
  SUPABASE_URL,
  SUPABASE_KEY,
  q,
  qLower,
  tcodes,
  sapWords,
  objectHints,
  isReferenceLookup,
  isComparison,
}) {
  let candidates = []

  // 1. direct tech_name match
  const upperWords = [...new Set((q.toUpperCase().match(/\b[A-Z][A-Z0-9_]{2,14}\b/g) || []))]
  if (upperWords.length) {
    const direct = await supabaseGet(
      `${SUPABASE_URL}/rest/v1/sap_objects?tech_name=in.(${upperWords.map(x => `"${x}"`).join(',')})&select=*`,
      SUPABASE_KEY
    )
    candidates.push(...direct)
  }

  // 2. title / description search
  for (const word of [...sapWords, ...objectHints].slice(0, 6)) {
    const matches = await supabaseGet(
      `${SUPABASE_URL}/rest/v1/sap_objects?or=(title.ilike.*${encodeURIComponent(word)}*,short_desc.ilike.*${encodeURIComponent(word)}*)&select=*`,
      SUPABASE_KEY
    )
    candidates.push(...matches)
  }

  candidates = dedupeBy(candidates, x => `${x.object_type}_${x.tech_name}`)

  if (!candidates.length) return null

  const scored = candidates
    .map(c => ({
      ...c,
      _score: scoreObjectMatch(c, qLower),
    }))
    .sort((a, b) => b._score - a._score)

  const best = scored[0]
  if (!best || best._score < 0.45) return null

  // comparison or broad multi lookup
  if (isComparison || (scored.length > 1 && scored[1]._score > 0.58)) {
    return {
      confidence: best._score,
      intent: isComparison ? 'COMPARISON' : 'MULTI_OBJECT_LOOKUP',
      match: null,
      matches: scored.slice(0, 6),
    }
  }

  return {
    confidence: best._score,
    intent: isReferenceLookup ? 'REFERENCE' : 'OBJECT_LOOKUP',
    match: best,
    matches: [],
  }
}

function scoreObjectMatch(obj, qLower) {
  let score = 0

  const techName = (obj.tech_name || '').toLowerCase()
  const title = (obj.title || '').toLowerCase()
  const shortDesc = (obj.short_desc || '').toLowerCase()
  const objectType = (obj.object_type || '').toLowerCase()

  if (qLower.includes(techName)) score += 0.65
  if (qLower.includes(title)) score += 0.45

  const words = qLower.split(/\s+/)
  for (const w of words) {
    if (title.includes(w)) score += 0.08
    if (shortDesc.includes(w)) score += 0.06
  }

  if (qLower.includes('table') && objectType === 'table') score += 0.18
  if (qLower.includes('tcode') && objectType === 'tcode') score += 0.18
  if (qLower.includes('fiori') && objectType === 'fiori') score += 0.18
  if (qLower.includes('app') && objectType === 'fiori') score += 0.12

  return Math.min(score, 0.99)
}

// ─────────────────────────────────────────────────────────────────────────────
// ALIAS SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function searchAliases({ SUPABASE_URL, SUPABASE_KEY, q, qLower, sapWords }) {
  let aliasCandidates = []

  for (const word of sapWords.slice(0, 6)) {
    const rows = await supabaseGet(
      `${SUPABASE_URL}/rest/v1/sap_aliases?alias.ilike.*${encodeURIComponent(word)}*&select=*`,
      SUPABASE_KEY
    )
    aliasCandidates.push(...rows)
  }

  aliasCandidates = dedupeBy(aliasCandidates, x => `${x.object_type}_${x.tech_name}_${x.alias}`)

  if (!aliasCandidates.length) return null

  const scoredAliases = aliasCandidates
    .map(a => ({
      ...a,
      _score: scoreAliasMatch(a, qLower),
    }))
    .sort((a, b) => b._score - a._score)

  const bestAlias = scoredAliases[0]
  if (!bestAlias || bestAlias._score < 0.45) return null

  const objectRows = await supabaseGet(
    `${SUPABASE_URL}/rest/v1/sap_objects?tech_name=eq.${encodeURIComponent(bestAlias.tech_name)}&object_type=eq.${encodeURIComponent(bestAlias.object_type)}&select=*`,
    SUPABASE_KEY
  )

  const obj = objectRows?.[0]
  if (!obj) return null

  return {
    confidence: bestAlias._score,
    intent: 'REFERENCE',
    match: obj,
    matches: [],
    via_alias: bestAlias.alias,
  }
}

function scoreAliasMatch(aliasRow, qLower) {
  let score = 0
  const alias = (aliasRow.alias || '').toLowerCase()

  if (qLower.includes(alias)) score += 0.75

  const words = qLower.split(/\s+/)
  for (const w of words) {
    if (alias.includes(w)) score += 0.08
  }

  return Math.min(score, 0.99)
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
async function supabaseGet(url, key) {
  try {
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    })
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function dedupeBy(arr, keyFn) {
  const seen = new Set()
  const out = []

  for (const item of arr) {
    const k = keyFn(item)
    if (!seen.has(k)) {
      seen.add(k)
      out.push(item)
    }
  }

  return out
}
