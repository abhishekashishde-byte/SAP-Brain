import { next, rewrite } from '@vercel/functions'

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

const MAX_CONTENT_LENGTH = {
  '/api/chat': 2_000_000,
  '/api/categorise': 30_000,
  '/api/extract': 50_000,
  '/api/recall': 30_000,
  '/api/summarise': 250_000,
  '/api/reference-search': 2_000_000,
  '/api/generate-fs-doc': 600_000,
  '/api/generate-ppt': 600_000,
}

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

export default async function middleware(request) {
  const url = new URL(request.url)
  const pathname = url.pathname
  if (!PRIVATE_API_PATHS.has(pathname)) return next()

  const contentLength = Number(request.headers.get('content-length') || 0)
  const maxLength = MAX_CONTENT_LENGTH[pathname]
  if (maxLength && contentLength > maxLength) {
    return jsonError(413, 'Request body too large')
  }

  // Authentication is intentionally NOT repeated here. Every protected API handler
  // already calls requireApprovedUser(), which validates the Supabase JWT, approved
  // email and Wani active session. Doing the same work in middleware first created a
  // second, independent auth failure point and produced intermittent 401s before the
  // request ever reached /api/chat. Keep middleware limited to routing/body-size only.
  //
  // /api/chat is still routed through reference-search because that gateway owns quota
  // handling/sanitisation and then invokes chatHandler. The Authorization header is
  // preserved by Vercel rewrite and is validated exactly once inside the gateway.
  if (pathname === '/api/chat') {
    const gatewayUrl = new URL(request.url)
    gatewayUrl.pathname = '/api/reference-search'
    gatewayUrl.searchParams.set('wani_gateway', '1')
    return rewrite(gatewayUrl)
  }

  return next()
}
