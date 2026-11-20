// Cloudflare routing for the Vercel-era /api handlers.
// Mirrors vercel.json rewrites + middleware.js so the frontend needs no changes.
import { runVercelHandler } from './vercel-adapter.js'

// Lazy imports keep cold starts small: only the module a request needs is evaluated.
const HANDLERS = {
  'reference-search': () => import('../api/reference-search.js'),
  categorise: () => import('../api/categorise.js'),
  extract: () => import('../api/extract.js'),
  recall: () => import('../api/recall.js'),
  summarise: () => import('../api/summarise.js'),
  'generate-fs-doc': () => import('../api/generate-fs-doc.js'),
  'generate-ppt': () => import('../api/generate-ppt.js'),
  'external-chat': () => import('../api/external-chat.js'),
  discovery: () => import('../api/discovery.js'),
  integrations: () => import('../api/integrations.js'),
}

// Same limits middleware.js enforced on Vercel.
const MAX_BODY_BYTES = {
  'discovery-transcript': 15_000,
  'discovery-find': 4_000,
  'discovery-correct': 8_000,
  'integration-keys': 2_000,
  'integration-workshops': 1_000,
  'integration-ingest': 1_000_000,
  chat: 2_000_000,
  categorise: 30_000,
  extract: 50_000,
  recall: 30_000,
  summarise: 250_000,
  'reference-search': 2_000_000,
  'generate-fs-doc': 600_000,
  'generate-ppt': 600_000,
}

// vercel.json: /api/discovery-<x> → /api/discovery?route=<x>
const DISCOVERY_ALIASES = {
  'discovery-ai': 'ai',
  'discovery-import': 'import',
  'discovery-retention': 'retention',
  'discovery-transcript': 'transcript',
  'discovery-find': 'find',
  'discovery-correct': 'correct',
}

// /api/integration-<x> → /api/integrations?route=<x>
const INTEGRATION_ALIASES = {
  'integration-keys': 'keys',
  'integration-workshops': 'workshops',
  'integration-ingest': 'ingest',
}

let envCopied = false
function exposeEnvToProcess(env) {
  // With nodejs_compat (compat date ≥ 2025-04-01) process.env is already populated
  // from vars and secrets. Copy string bindings defensively in case it is not.
  if (envCopied || typeof process === 'undefined') return
  process.env ||= {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && process.env[key] === undefined) process.env[key] = value
  }
  envCopied = true
}

const jsonError = (status, error) => Response.json({ error }, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})

/** Returns a Response for a handled /api path, or null if this module does not own it. */
export async function routeApi(request, env, ctx) {
  const url = new URL(request.url)
  const match = url.pathname.match(/^\/api\/([A-Za-z0-9-]+)\/?$/)
  if (!match) return null
  let name = match[1]

  exposeEnvToProcess(env)

  // middleware.js: the chat endpoint runs through the reference-search gateway,
  // which owns quota checks and SSE sanitisation, then calls chat.js.
  const maxBodyBytes = MAX_BODY_BYTES[name]
  if (name === 'chat') {
    name = 'reference-search'
    url.searchParams.set('wani_gateway', '1')
  } else if (DISCOVERY_ALIASES[name]) {
    url.searchParams.set('route', DISCOVERY_ALIASES[name])
    name = 'discovery'
  } else if (INTEGRATION_ALIASES[name]) {
    url.searchParams.set('route', INTEGRATION_ALIASES[name])
    name = 'integrations'
  }

  const load = HANDLERS[name]
  if (!load) return null

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (maxBodyBytes && contentLength > maxBodyBytes) return jsonError(413, 'Request body too large')

  const mod = await load()
  return runVercelHandler(mod.default, request, ctx, { url, maxBodyBytes })
}
