// Cloudflare staging adapter for Wani's existing Vercel-style Node API handlers.
// This is migration code: it MUST pass live integration tests before domain cutover.
import { createServer } from 'node:http'
import { handleAsNodeRequest } from 'cloudflare:node'

const PORT = 8273
const loaders = {
  '/api/chat': () => import('../api/chat.js'),
  '/api/external-chat': () => import('../api/external-chat.js'),
  '/api/extract': () => import('../api/extract.js'),
  '/api/recall': () => import('../api/recall.js'),
  '/api/categorise': () => import('../api/categorise.js'),
  '/api/summarise': () => import('../api/summarise.js'),
  '/api/reference-search': () => import('../api/reference-search.js'),
  '/api/generate-fs-doc': () => import('../api/generate-fs-doc.js'),
  '/api/generate-ppt': () => import('../api/generate-ppt.js'),
  '/api/Notify': () => import('../api/Notify.js'),
  '/api/discovery': () => import('../api/discovery.js'),
}
const discoveryRewrites = {
  '/api/discovery-ai': 'ai',
  '/api/discovery-import': 'import',
  '/api/discovery-transcript': 'transcript',
  '/api/discovery-retention': 'retention',
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'https://wani.invalid')
    const path = discoveryRewrites[url.pathname] ? '/api/discovery' : url.pathname
    const load = loaders[path]
    if (!load) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unknown Wani API route' }))
      return
    }

    req.query = Object.fromEntries(url.searchParams.entries())
    if (discoveryRewrites[url.pathname]) req.query.route = discoveryRewrites[url.pathname]

    // Vercel parses JSON bodies before handing them to its API functions.
    // Preserve raw bytes for file and multipart handlers.
    const MAX_BODY = 15 * 1024 * 1024
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY) {
        res.writeHead(413, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Payload too large' }))
        return
      }
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks)
    const contentType = String(req.headers['content-type'] || '').toLowerCase()
    if (contentType.includes('application/json')) {
      try { req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {} }
      catch {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')))
    } else {
      req.body = raw
    }

    res.status = code => { res.statusCode = code; return res }
    res.json = value => {
      if (!res.headersSent) res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(value))
      return res
    }
    res.send = value => {
      if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return res.json(value)
      res.end(value == null ? '' : value)
      return res
    }
    const mod = await load()
    if (typeof mod.default !== 'function') throw new Error('Invalid API handler')
    await mod.default(req, res)
    if (!res.writableEnded) res.end()
  } catch (error) {
    console.error('[wani-cloudflare] API error', error?.message)
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'Internal server error' }))
  }
})
server.listen(PORT)

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return handleAsNodeRequest(PORT, request)
    return env.ASSETS.fetch(request)
  },
}
