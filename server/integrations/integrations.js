// Integrations: connection keys and transcript intake from the user's other apps (first: Ana).
//
//   keys      (signed-in Wani user)  GET list · POST create (key returned once) · DELETE ?id= revoke
//   workshops (connection key)       GET the user's active workshops, for the picker in Ana
//   ingest    (connection key)       POST a meeting transcript into a workshop, ready for analysis
//
// A transcript sent here is only saved. Analysis still starts in Wani, where the consultant reviews it.
import { createClient } from '@supabase/supabase-js'
import { requireApprovedUser, sendAuthError, requireJsonBody } from '../shared/_auth.js'

const KEY_PREFIX = 'wani_ak_'
const MAX_TEXT_CHARS = 800_000
const MAX_KEYS = 10
const json = (res, code, body) => { res.setHeader('Cache-Control', 'no-store'); return res.status(code).json(body) }
const clean = (v, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : ''

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw Error('Integration service is not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return KEY_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Resolves a connection key to its owner. The owner must still be an approved Wani user.
async function requireKey(req) {
  const header = req.headers.authorization || ''
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!key.startsWith(KEY_PREFIX) || key.length < 40) return { ok: false, status: 401, error: 'Wani connection key required' }
  const db = serviceClient()
  const { data: row, error } = await db.from('wani_integration_keys').select('id,user_id,revoked_at').eq('key_hash', await sha256(key)).maybeSingle()
  if (error) return { ok: false, status: 503, error: 'Cannot verify the connection key' }
  if (!row || row.revoked_at) return { ok: false, status: 401, error: 'This Wani connection key is not valid. Create a new one in Wani.' }
  const { data: userData } = await db.auth.admin.getUserById(row.user_id)
  const email = userData?.user?.email?.toLowerCase()
  if (!email) return { ok: false, status: 401, error: 'The Wani account for this key no longer exists' }
  const { data: approval, error: approvalError } = await db.from('approved_emails').select('email').eq('email', email).maybeSingle()
  if (approvalError) return { ok: false, status: 503, error: 'Unable to verify account approval' }
  if (!approval) return { ok: false, status: 403, error: 'The Wani account for this key is not approved' }
  await db.from('wani_integration_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id)
  return { ok: true, db, userId: row.user_id, keyId: row.id }
}

async function keys(req, res) {
  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)
  const db = auth.serviceClient
  const columns = 'id,label,key_prefix,created_at,last_used_at,revoked_at'
  if (req.method === 'GET') {
    const { data, error } = await db.from('wani_integration_keys').select(columns).eq('user_id', auth.user.id).order('created_at', { ascending: false })
    if (error) return json(res, 500, { error: 'Could not load connection keys' })
    return json(res, 200, { keys: data || [] })
  }
  if (req.method === 'POST') {
    if (!requireJsonBody(req, res, 2_000)) return
    const { count } = await db.from('wani_integration_keys').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id).is('revoked_at', null)
    if ((count || 0) >= MAX_KEYS) return json(res, 409, { error: `You already have ${MAX_KEYS} active keys. Revoke one first.` })
    const key = newKey()
    const { data, error } = await db.from('wani_integration_keys')
      .insert({ user_id: auth.user.id, label: clean(req.body.label, 60) || 'Ana', key_prefix: key.slice(0, KEY_PREFIX.length + 6), key_hash: await sha256(key) })
      .select(columns).single()
    if (error) return json(res, 500, { error: 'Could not create the connection key' })
    return json(res, 201, { key, record: data })
  }
  if (req.method === 'DELETE') {
    const id = clean(req.query?.id, 60)
    if (!id) return json(res, 400, { error: 'Key id required' })
    const { error } = await db.from('wani_integration_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id).is('revoked_at', null)
    if (error) return json(res, 500, { error: 'Could not revoke the key' })
    return json(res, 200, { ok: true })
  }
  return json(res, 405, { error: 'Method not allowed' })
}

async function workshops(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET required' })
  const auth = await requireKey(req)
  if (!auth.ok) return json(res, auth.status, { error: auth.error })
  const { data, error } = await auth.db.from('discovery_workshops')
    .select('id,client_name,title,project_name,call_date,status')
    .eq('owner_id', auth.userId).neq('status', 'archived')
    .order('updated_at', { ascending: false }).limit(50)
  if (error) return json(res, 500, { error: 'Could not load workshops' })
  return json(res, 200, { workshops: data || [] })
}

async function ingest(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST required' })
  if (!requireJsonBody(req, res, 1_000_000)) return
  const auth = await requireKey(req)
  if (!auth.ok) return json(res, auth.status, { error: auth.error })
  const body = req.body
  const workshopId = clean(body.workshopId, 60)
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const consentText = clean(body.consent?.text, 500)
  const consentAt = clean(body.consent?.at, 40)
  const source = /^[a-z][a-z0-9_-]{1,20}$/.test(body.source || '') ? body.source : 'ana'
  const sourceRef = clean(body.sourceRef, 120) || null
  const retentionDays = [7, 30, 90].includes(Number(body.retentionDays)) ? Number(body.retentionDays) : null
  if (!workshopId) return json(res, 400, { error: 'Choose a Wani workshop' })
  if (text.length < 40) return json(res, 400, { error: 'The transcript is empty or too short' })
  if (text.length > MAX_TEXT_CHARS) return json(res, 413, { error: 'The transcript is too long for one import' })
  // Wani never analyses a transcript without recorded consent; the sending app must pass its consent record.
  if (!consentText || !consentAt || Number.isNaN(Date.parse(consentAt))) return json(res, 400, { error: 'Recording consent is required' })

  const db = auth.db
  const { data: workshop } = await db.from('discovery_workshops').select('id,owner_id').eq('id', workshopId).maybeSingle()
  if (!workshop || workshop.owner_id !== auth.userId) return json(res, 404, { error: 'Workshop not found' })
  if (sourceRef) {
    const { data: existing } = await db.from('discovery_transcripts').select('id').eq('workshop_id', workshopId).eq('source', source).eq('source_ref', sourceRef).maybeSingle()
    if (existing) return json(res, 200, { transcriptId: existing.id, duplicate: true })
  }

  const path = `${auth.userId}/${workshopId}/${crypto.randomUUID()}.txt`
  const upload = await db.storage.from('discovery-transcripts').upload(path, new Blob([text], { type: 'text/plain' }), { contentType: 'text/plain; charset=utf-8', upsert: false })
  if (upload.error) return json(res, 500, { error: 'Could not store the transcript' })
  const startedAt = clean(body.startedAt, 40)
  const { data: row, error } = await db.from('discovery_transcripts').insert({
    workshop_id: workshopId,
    consent_given_at: new Date(consentAt).toISOString(),
    consent_text: consentText,
    file_path: path,
    status: 'uploaded',
    delete_after: retentionDays ? new Date(Date.now() + retentionDays * 86400000).toISOString().slice(0, 10) : null,
    source,
    source_title: clean(body.title, 200) || null,
    source_ref: sourceRef,
    source_started_at: startedAt && !Number.isNaN(Date.parse(startedAt)) ? new Date(startedAt).toISOString() : null,
  }).select('id').single()
  if (error) {
    await db.storage.from('discovery-transcripts').remove([path])
    return json(res, 500, { error: 'Could not save the transcript' })
  }
  return json(res, 201, { transcriptId: row.id, duplicate: false })
}

const routes = { keys, workshops, ingest }
export default async function handler(req, res) {
  const route = typeof req.query?.route === 'string' ? req.query.route : null
  const action = routes[route]
  if (!action) return json(res, 404, { error: 'Unknown integration route' })
  try { return await action(req, res) } catch (e) {
    console.error('[integrations]', route, e.message)
    return json(res, 503, { error: 'Integration service unavailable' })
  }
}
