import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!url || !anonKey || !serviceKey) {
    throw new Error('Authentication service is not configured')
  }

  return { url, anonKey, serviceKey }
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

function getJwtSessionId(token) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const sessionId = decoded?.session_id
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId || '')
      ? sessionId
      : null
  } catch {
    return null
  }
}

async function verifyActiveWaniSession(serviceClient, userId, sessionId) {
  const readActiveSession = () => serviceClient
    .from('wani_active_sessions')
    .select('active_session_id')
    .eq('user_id', userId)
    .maybeSingle()

  let { data: activeSession, error: activeError } = await readActiveSession()
  if (activeError) {
    console.error('[auth] active-session lookup failed:', activeError.message)
    return { ok: false, status: 503, error: 'Unable to verify active session' }
  }

  // Smooth rollout for a browser tab that was already open when this feature
  // was deployed. Create the first record without overwriting a concurrent
  // login that may have claimed the account at the same time.
  if (!activeSession) {
    const now = new Date().toISOString()
    const { error: insertError } = await serviceClient
      .from('wani_active_sessions')
      .insert({
        user_id: userId,
        active_session_id: sessionId,
        claimed_at: now,
        last_seen_at: now,
      })

    if (insertError && insertError.code !== '23505') {
      console.error('[auth] active-session initialization failed:', insertError.message)
      return { ok: false, status: 503, error: 'Unable to initialize active session' }
    }

    const reread = await readActiveSession()
    activeSession = reread.data
    activeError = reread.error
    if (activeError) {
      console.error('[auth] active-session recheck failed:', activeError.message)
      return { ok: false, status: 503, error: 'Unable to verify active session' }
    }
  }

  if (activeSession?.active_session_id !== sessionId) {
    return {
      ok: false,
      status: 401,
      error: 'Session replaced by a newer login on another device',
    }
  }

  // Best-effort activity timestamp; failure must not invalidate an otherwise
  // verified session.
  serviceClient
    .from('wani_active_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('active_session_id', sessionId)
    .then(({ error }) => {
      if (error) console.error('[auth] active-session touch failed:', error.message)
    })

  return { ok: true }
}

export async function requireApprovedUser(req) {
  const token = getBearerToken(req)
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required' }
  }

  try {
    const { url, anonKey, serviceKey } = getConfig()
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data, error } = await authClient.auth.getUser(token)
    const user = data?.user
    if (error || !user?.id || !user?.email) {
      return { ok: false, status: 401, error: 'Invalid or expired session' }
    }

    const sessionId = getJwtSessionId(token)
    if (!sessionId) {
      return { ok: false, status: 401, error: 'Session identifier is missing' }
    }

    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: approval, error: approvalError } = await serviceClient
      .from('approved_emails')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()

    // Fail closed: an approval lookup error never grants access.
    if (approvalError) {
      console.error('[auth] approval lookup failed:', approvalError.message)
      return { ok: false, status: 503, error: 'Unable to verify account approval' }
    }
    if (!approval) {
      return { ok: false, status: 403, error: 'Account is not approved' }
    }

    const activeSession = await verifyActiveWaniSession(serviceClient, user.id, sessionId)
    if (!activeSession.ok) return activeSession

    return {
      ok: true,
      user: { id: user.id, email: user.email },
      token,
      sessionId,
      serviceClient,
    }
  } catch (error) {
    console.error('[auth] guard failed:', error.message)
    return { ok: false, status: 503, error: 'Authentication service unavailable' }
  }
}

export function sendAuthError(res, auth) {
  return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' })
}

export function requireJsonBody(req, res, maxBytes = 100_000) {
  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > maxBytes) {
    res.status(413).json({ error: 'Request body too large' })
    return false
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Invalid JSON body' })
    return false
  }
  return true
}
