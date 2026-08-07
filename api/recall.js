// api/recall.js — Memory recall and moderated knowledge management
// Authentication and account approval are enforced server-side. User identity
// and administrator status always come from the verified Supabase session.

import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'
import { handleAdminDashboard } from '../lib/adminDashboard.js'

const MAX_TEXT = 12_000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireJsonBody(req, res, 40_000)) return

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const action = typeof req.body.action === 'string' ? req.body.action : 'recall'
  const adminEmails = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2]
    .filter(Boolean)
    .map(email => email.trim().toLowerCase())
  const isAdmin = adminEmails.includes((auth.user.email || '').trim().toLowerCase())

  try {
    if (action === 'admin_dashboard') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleAdminDashboard(res, auth)
    }

    if (action === 'admin_user_access') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleAdminUserAccess(req, res, auth, adminEmails)
    }

    if (action === 'knowledge_snapshot') {
      return await handleKnowledgeSnapshot(res, auth)
    }

    if (action === 'knowledge_delete_local') {
      return await handleDeleteLocal(req, res, auth)
    }

    if (action === 'knowledge_review_queue') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleReviewQueue(res, auth)
    }

    if (action === 'knowledge_review') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleReviewDecision(req, res, auth)
    }

    if (action === 'knowledge_update_global') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleUpdateGlobal(req, res, auth)
    }

    if (action === 'knowledge_archive_global') {
      if (!isAdmin) return res.status(403).json({ error: 'Administrator access required' })
      return await handleArchiveGlobal(req, res, auth)
    }

    if (action === 'knowledge_save_correction_candidate') {
      return await handleCorrectionCandidate(req, res, auth)
    }

    return await handleRecall(req, res, auth)
  } catch (error) {
    console.error(`[recall] ${action} error:`, error.message)
    return res.status(500).json({ error: safeError(error) })
  }
}

async function handleAdminUserAccess(req, res, auth, adminEmails) {
  const userId = parseUuid(req.body.userId)
  const access = ['approve', 'suspend', 'reactivate'].includes(req.body.access) ? req.body.access : null
  if (!userId || !access) return res.status(400).json({ error: 'Invalid user access action' })

  const client = auth.serviceClient
  const { data: userResult, error: userError } = await client.auth.admin.getUserById(userId)
  if (userError) throw userError
  const target = userResult?.user
  const targetEmail = (target?.email || '').trim().toLowerCase()
  if (!target || !targetEmail) return res.status(404).json({ error: 'User not found' })
  if (adminEmails.includes(targetEmail)) return res.status(400).json({ error: 'Administrator access cannot be changed here' })

  const { data: profile, error: profileReadError } = await client
    .from('profiles')
    .select('id,full_name,name,display_name')
    .eq('id', userId)
    .maybeSingle()
  if (profileReadError) throw profileReadError

  const name = profile?.full_name || profile?.name || profile?.display_name || target.user_metadata?.full_name || target.user_metadata?.name || targetEmail.split('@')[0]

  if (access === 'suspend') {
    const { error: approvalError } = await client.from('approved_emails').delete().eq('email', targetEmail)
    if (approvalError) throw approvalError
    const { error: statusError } = await client.from('profiles').update({ access_status: 'suspended' }).eq('id', userId)
    if (statusError) throw statusError
    const { error: sessionError } = await client.from('wani_active_sessions').delete().eq('user_id', userId)
    if (sessionError) throw sessionError
    return res.status(200).json({ updated: true, accessStatus: 'suspended' })
  }

  const { error: approvalError } = await client.from('approved_emails').upsert({
    email: targetEmail,
    full_name: name,
    approved_at: new Date().toISOString(),
  }, { onConflict: 'email' })
  if (approvalError) throw approvalError

  const { error: statusError } = await client.from('profiles').update({ access_status: 'active' }).eq('id', userId)
  if (statusError) throw statusError

  return res.status(200).json({ updated: true, accessStatus: 'active' })
}

async function handleKnowledgeSnapshot(res, auth) {
  const client = auth.serviceClient
  const [{ data: local, error: localError }, { data: global, error: globalError }] = await Promise.all([
    client
      .from('wani_knowledge')
      .select('id,module,topic,object,finding,confidence,created_at,admin_review_status,admin_reviewed_at,admin_review_note')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false }),
    client
      .from('wani_global_knowledge')
      .select('id,module,topic,object,finding,confidence,approved_at,source_user_id')
      .eq('active', true)
      .order('approved_at', { ascending: false }),
  ])

  if (localError) throw localError
  if (globalError) throw globalError

  const globalEntries = (global || []).map(entry => ({
    id: entry.id,
    module: entry.module,
    topic: entry.topic,
    object: entry.object,
    finding: entry.finding,
    confidence: entry.confidence,
    approved_at: entry.approved_at,
    promoted_by_me: entry.source_user_id === auth.user.id,
  }))

  return res.status(200).json({
    localEntries: local || [],
    globalEntries,
  })
}

async function handleDeleteLocal(req, res, auth) {
  const id = parseUuid(req.body.id)
  if (!id) return res.status(400).json({ error: 'Invalid knowledge entry' })

  const { error } = await auth.serviceClient
    .from('wani_knowledge')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.user.id)

  if (error) throw error
  return res.status(200).json({ deleted: true })
}

async function handleReviewQueue(res, auth) {
  const { data, error } = await auth.serviceClient.rpc('admin_list_wani_knowledge_reviews')
  if (error) throw error
  return res.status(200).json({ entries: data || [] })
}

async function handleReviewDecision(req, res, auth) {
  const id = parseUuid(req.body.id)
  const decision = req.body.decision === 'approve'
    ? 'approve'
    : req.body.decision === 'reject'
      ? 'reject'
      : null

  if (!id || !decision) return res.status(400).json({ error: 'Invalid review decision' })

  const module = cleanOptional(req.body.module, 200)
  const topic = cleanOptional(req.body.topic, 200)
  const object = cleanOptional(req.body.object, 200)
  const finding = cleanOptional(req.body.finding, MAX_TEXT)
  const note = cleanOptional(req.body.note, 2_000)

  if (decision === 'approve' && (!finding || finding.length < 3)) {
    return res.status(400).json({ error: 'A global finding is required' })
  }

  const embedding = decision === 'approve' ? await embed(finding) : null
  if (decision === 'approve' && !embedding) {
    return res.status(503).json({ error: 'Could not prepare the global knowledge entry' })
  }

  const { data, error } = await auth.serviceClient.rpc('admin_review_wani_knowledge', {
    p_local_id: id,
    p_action: decision,
    p_reviewer_id: auth.user.id,
    p_module: module,
    p_topic: topic,
    p_object: object,
    p_finding: finding,
    p_note: note,
    p_embedding: embedding,
  })

  if (error) throw error
  return res.status(200).json({ reviewed: true, result: data })
}

async function handleUpdateGlobal(req, res, auth) {
  const id = parseUuid(req.body.id)
  const module = cleanOptional(req.body.module, 200)
  const topic = cleanOptional(req.body.topic, 200)
  const object = cleanOptional(req.body.object, 200)
  const finding = cleanRequired(req.body.finding, MAX_TEXT)

  if (!id || !finding) return res.status(400).json({ error: 'Invalid global knowledge entry' })

  const embedding = await embed(finding)
  if (!embedding) return res.status(503).json({ error: 'Could not update the semantic index' })

  const { data, error } = await auth.serviceClient
    .from('wani_global_knowledge')
    .update({ module, topic, object, finding, embedding })
    .eq('id', id)
    .eq('active', true)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Global knowledge entry not found' })
  return res.status(200).json({ updated: true })
}

async function handleArchiveGlobal(req, res, auth) {
  const id = parseUuid(req.body.id)
  if (!id) return res.status(400).json({ error: 'Invalid knowledge entry' })

  const { data, error } = await auth.serviceClient
    .from('wani_global_knowledge')
    .update({ active: false })
    .eq('id', id)
    .eq('active', true)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Global knowledge entry not found' })
  return res.status(200).json({ archived: true })
}

async function handleCorrectionCandidate(req, res, auth) {
  const userMsg = cleanRequired(req.body.userMsg, 8_000)
  const assistantMsg = cleanRequired(req.body.assistantMsg, 8_000)
  if (!userMsg || !assistantMsg) return res.status(400).json({ error: 'Missing correction context' })

  const candidate = await extractCorrectionCandidate(userMsg, assistantMsg)
  if (!candidate?.finding || candidate.finding.length < 10) {
    return res.status(422).json({ error: 'Could not identify a reusable SAP correction' })
  }

  const embedding = await embed(candidate.finding)
  if (!embedding) return res.status(503).json({ error: 'Could not index the correction' })

  const { error } = await auth.serviceClient.from('wani_knowledge').insert({
    user_id: auth.user.id,
    module: candidate.module,
    topic: candidate.topic,
    object: candidate.object,
    finding: candidate.finding,
    confidence: 'user_verified',
    embedding,
    admin_review_status: 'pending',
  })

  if (error) throw error
  return res.status(200).json({ saved: true, scope: 'local', pendingGlobalReview: true })
}

async function handleRecall(req, res, auth) {
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

    const filters = terms.map(term => `content.ilike.*${encodeURIComponent(term)}*`).join(',')
    const moduleFilter = mod?.trim() ? `&module=eq.${encodeURIComponent(mod.trim())}` : ''
    const userId = encodeURIComponent(auth.user.id)
    const url = `${SUPABASE_URL}/rest/v1/memories?user_id=eq.${userId}&or=(${filters})${moduleFilter}&order=created_at.desc&limit=${limit}`

    const memRes = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    })

    if (!memRes.ok) {
      console.error('[recall] database request failed:', memRes.status)
      return res.status(200).json({ memories: [] })
    }

    const rows = await memRes.json()
    const memories = Array.isArray(rows) ? rows.map(row => row.content).filter(content => typeof content === 'string' && content.trim()) : []
    return res.status(200).json({ memories })
  } catch (error) {
    console.error('[recall] error:', error.message)
    return res.status(200).json({ memories: [] })
  }
}

async function embed(text) {
  if (!process.env.OPENAI_API_KEY || !text) return null
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8_000) }),
  })

  if (!response.ok) {
    console.error('[recall] embedding failed:', response.status)
    return null
  }

  const data = await response.json()
  return data.data?.[0]?.embedding || null
}

async function extractCorrectionCandidate(userMsg, assistantMsg) {
  if (!process.env.GROQ_API_KEY) return null

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 240,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Extract only the reusable SAP correction supplied by the consultant. Return ONLY JSON with these keys: {"module":"","topic":"","object":"","finding":""}. The finding must be a clear standalone fact. Do not repeat the incorrect answer.\n\nConsultant correction: ${userMsg.slice(0, 4000)}\n\nPrevious answer: ${assistantMsg.slice(0, 2000)}`,
      }],
    }),
  })

  if (!response.ok) return null
  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content || '{}'

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      module: cleanOptional(parsed.module, 200),
      topic: cleanOptional(parsed.topic, 200),
      object: cleanOptional(parsed.object, 200),
      finding: cleanRequired(parsed.finding, MAX_TEXT),
    }
  } catch {
    return null
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
  sapNouns.forEach(noun => { if (lower.includes(noun)) terms.push(noun) })
  return [...new Set(terms)].slice(0, 6)
}

function cleanRequired(value, maxLength) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (!cleaned || cleaned.length > maxLength) return null
  return cleaned
}

function cleanOptional(value, maxLength) {
  if (value == null || value === '') return null
  return cleanRequired(value, maxLength)
}

function parseUuid(value) {
  if (typeof value !== 'string') return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null
}

function safeError(error) {
  const message = String(error?.message || '')
  if (/already reviewed|not found|missing|access cannot be changed/i.test(message)) return message
  return 'Knowledge operation failed'
}
