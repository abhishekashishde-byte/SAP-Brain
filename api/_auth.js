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

    return {
      ok: true,
      user: { id: user.id, email: user.email },
      token,
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
