// api/reference-search.js — v3 FULL FORCE MATCH + FALLBACK SEARCH
// Purpose:
// 1. Catch direct SAP object names like MKAL / EQUI / AUFK
// 2. Search sap_objects reliably using normalized terms
// 3. Return structure compatible with chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { question = '' } = req.body || {}
    const rawQuestion = String(question || '').trim()

    if (!rawQuestion) {
      return res.status(400).json({ error: 'Missing question' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Missing Supabase env vars' })
    }

    const q = rawQuestion.toLowerCase()

    // ───────────────────────────────────────────────────────────────────────
    // 1. INTENT DETECTION
    // ───────────────────────────────────────────────────────────────────────
    const intent = detectIntent(q)

    // ───────────────────────────────────────────────────────────────────────
    // 2. FORCE DIRECT SAP OBJECT MATCH (VERY IMPORTANT)
    // catches MKAL / EQUI / AUFK / AFKO / MARA / MARD etc.
    // ───────────────────────────────────────────────────────────────────────
    const directCodeMatches = rawQuestion.match(/\b[A-Z0-9]{3,8}\b/g) || []

    for (const code of directCodeMatches) {
      const exact = await fetchSapObjectsExact(SUPABASE_URL, SUPABASE_KEY, code)
      if (exact.length) {
        return res.status(200).json({
          intent,
          confidence: 0.95,
          match: exact[0],
          matches: exact.slice(0, 6),
        })
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // 3. BUILD SEARCH TERMS
    // ───────────────────────────────────────────────────────────────────────
    const searchTerms = buildSearchTerms(q)

    // ───────────────────────────────────────────────────────────────────────
    // 4. SEARCH sap_objects
    // ───────────────────────────────────────────────────────────────────────
    const objectResults = await fetchSapObjectsFuzzy(
      SUPABASE_URL,
      SUPABASE_KEY,
      searchTerms
    )

    const scoredObjects = objectResults
      .map(row => ({
        ...row,
        _score: scoreObject(row, q, searchTerms),
      }))
      .sort((a, b) => b._score - a._score)

    if (scoredObjects.length) {
      const top = scoredObjects[0]

      return res.status(200).json({
        intent,
        confidence: normalizeScore(top._score),
        match: top,
        matches: scoredObjects.slice(0, 6),
      })
    }

    // ───────────────────────────────────────────────────────────────────────
    // 5. SEARCH sap_fields (optional fallback)
    // ───────────────────────────────────────────────────────────────────────
    const fieldResults = await fetchSapFieldsFuzzy(
      SUPABASE_URL,
      SUPABASE_KEY,
      searchTerms
    )

    const scoredFields = fieldResults
      .map(row => ({
        ...row,
        _score: scoreField(row, q, searchTerms),
      }))
      .sort((a, b) => b._score - a._score)

    if (scoredFields.length) {
      const top = scoredFields[0]

      return res.status(200).json({
        intent: 'FIELD_LOOKUP',
        confidence: normalizeScore(top._score),
        match: top,
        matches: scoredFields.slice(0, 6),
      })
    }

    // ───────────────────────────────────────────────────────────────────────
    // 6. NO HIT
    // ───────────────────────────────────────────────────────────────────────
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
  if (/\bfield\b|\baufnr\b|\bmatnr\b|\bwerks\b/.test(q)) return 'FIELD_LOOKUP'
  if (/\btable\b|\btcode\b|\bfiori\b|\bapp\b|\btble\b/.test(q)) return 'REFERENCE'
  if (/\bdifference\b|\bvs\b|\bcompare\b/.test(q)) return 'COMPARISON'
  return 'REFERENCE'
}

function buildSearchTerms(q) {
  const terms = new Set()

  q.split(/\s+/).forEach(w => {
    if (w.length > 2) terms.add(w)
  })

  // Strong aliases
  const aliasMap = {
    'production version': ['production', 'version', 'mkal', 'verid', 'c223', 'c220'],
    'equipment': ['equipment', 'equi', 'equz', 'ie03'],
    'storage location': ['storage', 'location', 't001l', 'mard'],
    'production order': ['production', 'order', 'afko', 'aufk', 'co03'],
    'routing': ['routing', 'plko', 'plpo', 'ca03'],
    'bom': ['bom', 'mast', 'stko', 'stpo', 'cs03'],
    'material master': ['material', 'master', 'mara', 'marc', 'mard'],
    'notification': ['notification', 'qmel', 'iw23'],
    'functional location': ['functional', 'location', 'iflot', 'il03'],
  }

  for (const [phrase, values] of Object.entries(aliasMap)) {
    if (q.includes(phrase)) {
      values.forEach(v => terms.add(v))
    }
  }

  return Array.from(terms).slice(0, 12)
}

async function fetchSapObjectsExact(SUPABASE_URL, SUPABASE_KEY, code) {
  const url = `${SUPABASE_URL}/rest/v1/sap_objects?select=*&tech_name=eq.${encodeURIComponent(code)}&limit=6`

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

async function fetchSapObjectsFuzzy(SUPABASE_URL, SUPABASE_KEY, searchTerms) {
  if (!searchTerms.length) return []

  const orParts = []

  for (const term of searchTerms) {
    const esc = encodeURIComponent(term)
    orParts.push(`tech_name.ilike.*${esc}*`)
    orParts.push(`title.ilike.*${esc}*`)
    orParts.push(`short_desc.ilike.*${esc}*`)
    orParts.push(`keywords.ilike.*${esc}*`)
    orParts.push(`module.ilike.*${esc}*`)
  }

  const url = `${SUPABASE_URL}/rest/v1/sap_objects?select=*&or=(${orParts.join(',')})&limit=20`

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

async function fetchSapFieldsFuzzy(SUPABASE_URL, SUPABASE_KEY, searchTerms) {
  if (!searchTerms.length) return []

  const orParts = []

  for (const term of searchTerms) {
    const esc = encodeURIComponent(term)
    orParts.push(`field_name.ilike.*${esc}*`)
    orParts.push(`table_name.ilike.*${esc}*`)
    orParts.push(`short_desc.ilike.*${esc}*`)
    orParts.push(`common_meaning.ilike.*${esc}*`)
  }

  const url = `${SUPABASE_URL}/rest/v1/sap_fields?select=*&or=(${orParts.join(',')})&limit=20`

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

function scoreObject(row, q, terms) {
  let score = 0

  const tech = (row.tech_name || '').toLowerCase()
  const title = (row.title || '').toLowerCase()
  const desc = (row.short_desc || '').toLowerCase()
  const kw = (row.keywords || '').toLowerCase()

  for (const t of terms) {
    const term = t.toLowerCase()

    if (tech === term) score += 100
    if (tech.includes(term)) score += 45
    if (title.includes(term)) score += 35
    if (desc.includes(term)) score += 25
    if (kw.includes(term)) score += 25
  }

  // hard boosts
  if (q.includes('production version') && tech === 'mkal') score += 150
  if (q.includes('equipment') && tech === 'equi') score += 150
  if (q.includes('storage location') && tech === 't001l') score += 150
  if (q.includes('storage location') && tech === 'mard') score += 130
  if (q.includes('production order') && tech === 'afko') score += 150
  if (q.includes('production order') && tech === 'aufk') score += 130
  if (q.includes('routing') && tech === 'plko') score += 150
  if (q.includes('routing') && tech === 'plpo') score += 130
  if (q.includes('bom') && tech === 'mast') score += 150
  if (q.includes('bom') && tech === 'stko') score += 130
  if (q.includes('bom') && tech === 'stpo') score += 130

  return score
}

function scoreField(row, q, terms) {
  let score = 0

  const field = (row.field_name || '').toLowerCase()
  const table = (row.table_name || '').toLowerCase()
  const desc = (row.short_desc || '').toLowerCase()
  const meaning = (row.common_meaning || '').toLowerCase()

  for (const t of terms) {
    const term = t.toLowerCase()

    if (field === term) score += 100
    if (field.includes(term)) score += 45
    if (table.includes(term)) score += 35
    if (desc.includes(term)) score += 25
    if (meaning.includes(term)) score += 25
  }

  return score
}

function normalizeScore(score) {
  if (score >= 140) return 0.95
  if (score >= 100) return 0.85
  if (score >= 75) return 0.75
  if (score >= 55) return 0.65
  if (score >= 40) return 0.50
  return 0.35
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { prompt, useSearch = false, imageBase64 = null, imageType = null, documentText = null } = req.body
    if (!prompt && !imageBase64) return res.status(400).json({ error: 'Prompt or image required' })

    // Discover available models
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    const listRes = await fetch(listUrl)
    const listData = await listRes.json()
    if (!listRes.ok) return res.status(400).json({ error: `Key error: ${JSON.stringify(listData)}` })

    const allModels = listData.models || []
    const model = allModels.find(m => m.supportedGenerationMethods?.includes('generateContent'))
    if (!model) return res.status(404).json({ error: 'No Gemini models available.' })

    const modelPath = model.name
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${process.env.GEMINI_API_KEY}`

    // Build parts
    const parts = []
    if (imageBase64 && imageType) {
      parts.push({ inline_data: { mime_type: imageType, data: imageBase64 } })
    }
    if (documentText) {
      parts.push({ text: `Document content:\n${documentText.slice(0, 8000)}\n\n` })
    }
    if (prompt) parts.push({ text: prompt })

    // Detect image generation/editing request
    const isImageEdit = imageBase64 && /\b(change|edit|make|convert|add|remove|replace|background|light|dark|color|style|improve|redesign)\b/i.test(prompt)

    const body = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
        ...(isImageEdit ? { responseModalities: ['TEXT', 'IMAGE'] } : {}),
      },
    }

    if (useSearch && !imageBase64) {
      body.tools = [{ google_search: {} }]
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    // Read as text first to avoid JSON parse failures on large responses
    const rawText = await response.text()

    if (!response.ok) {
      // Try without search if that caused error
      if (useSearch) {
        delete body.tools
        const retry = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const retryText = await retry.text()
        if (retry.ok) {
          return res.status(200).json(parseResponse(retryText))
        }
      }
      return res.status(response.status).json({ error: rawText.slice(0, 500) })
    }

    return res.status(200).json(parseResponse(rawText))

  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` })
  }
}

function parseResponse(rawText) {
  try {
    const data = JSON.parse(rawText)
    const parts = data.candidates?.[0]?.content?.parts || []
    const result = { content: '', images: [] }

    for (const part of parts) {
      if (part.text) result.content += part.text
      if (part.inline_data) {
        result.images.push({
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        })
      }
    }

    if (!result.content && result.images.length === 0) {
      result.content = 'No response from Gemini.'
    }

    return result
  } catch (e) {
    return { content: `Parse error: ${e.message}. Raw: ${rawText.slice(0, 200)}`, images: [] }
  }
}
// ^^^ Gemini code merged from gemini.js — kept for future use
