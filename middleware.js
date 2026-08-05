import { next } from '@vercel/functions'

const PRIVATE_API_PATHS = new Set([
  '/api/chat',
  '/api/categorise',
  '/api/extract',
  '/api/recall',
  '/api/summarise',
  '/api/reference-search',
  '/api/generate-fs-doc',
  '/api/generate-ppt',
])

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/api/chat',
    '/api/categorise',
    '/api/extract',
    '/api/recall',
    '/api/summarise',
    '/api/reference-search',
    '/api/generate-fs-doc',
    '/api/generate-ppt',
  ],
}

function jsonError(status, error) {
  return Response.json(
    { error },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

function getBearerToken(request) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  return token || null
}

export default async function middleware(request) {
  const pathname = new URL(request.url).pathname
  if (!PRIVATE_API_PATHS.has(pathname)) return next()

  const token = getBearerToken(request)
  if (!token) return jsonError(401, 'Authentication required')

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('[api-auth-middleware] Supabase configuration is incomplete')
    return jsonError(503, 'Authentication service unavailable')
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(7_000),
    })

    if (!userResponse.ok) return jsonError(401, 'Invalid or expired session')

    const user = await userResponse.json()
    const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : ''
    if (!user?.id || !email) return jsonError(401, 'Invalid or expired session')

    const approvalResponse = await fetch(
      `${supabaseUrl}/rest/v1/approved_emails?select=email&email=eq.${encodeURIComponent(email)}&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        signal: AbortSignal.timeout(7_000),
      },
    )

    if (!approvalResponse.ok) {
      console.error('[api-auth-middleware] Approval lookup failed:', approvalResponse.status)
      return jsonError(503, 'Unable to verify account approval')
    }

    const approvals = await approvalResponse.json()
    if (!Array.isArray(approvals) || approvals.length === 0) {
      return jsonError(403, 'Account is not approved')
    }

    return next({
      headers: {
        'x-wani-user-id': user.id,
        'x-wani-user-email': email,
      },
    })
  } catch (error) {
    console.error('[api-auth-middleware] Authentication check failed:', error.message)
    return jsonError(503, 'Authentication service unavailable')
  }
}
