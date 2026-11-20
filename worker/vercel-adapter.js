// Runs an unchanged Vercel/Node-style `handler(req, res)` inside a Cloudflare Worker.
//
// The Wani API handlers in /api were written for Vercel serverless functions. This
// adapter gives them the small req/res surface they actually use (method, url,
// headers, query, parsed body; status/setHeader/write/end/json/send) and turns the
// result into a streamed Fetch API Response, so Server-Sent Events from /api/chat
// reach the browser chunk by chunk exactly as they did on Vercel.

const encoder = new TextEncoder()

function toBytes(chunk, encoding) {
  if (chunk == null) return null
  if (chunk instanceof Uint8Array) return chunk // includes Node Buffer
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  if (typeof chunk === 'string' && encoding && encoding !== 'utf8' && encoding !== 'utf-8' && typeof Buffer !== 'undefined') {
    return Buffer.from(chunk, encoding)
  }
  return encoder.encode(String(chunk))
}

function buildHeaders(request) {
  const headers = {}
  for (const [key, value] of request.headers) headers[key.toLowerCase()] = value

  // Vercel supplied these automatically; Cloudflare exposes the same data differently.
  const ip = request.headers.get('cf-connecting-ip')
  if (ip) {
    headers['x-real-ip'] ??= ip
    headers['x-forwarded-for'] ??= ip
  }
  const cf = request.cf || {}
  if (cf.city && !headers['x-vercel-ip-city']) headers['x-vercel-ip-city'] = encodeURIComponent(cf.city)
  if (cf.country && !headers['x-vercel-ip-country']) headers['x-vercel-ip-country'] = cf.country
  if (cf.regionCode && !headers['x-vercel-ip-country-region']) headers['x-vercel-ip-country-region'] = cf.regionCode
  return headers
}

function parseBody(text, contentType) {
  if (!text) return undefined
  const type = (contentType || '').toLowerCase()
  if (type.includes('application/json')) {
    try { return JSON.parse(text) } catch { return text }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text))
  }
  return text
}

function buildQuery(searchParams) {
  const query = {}
  for (const [key, value] of searchParams) {
    if (key in query) query[key] = [].concat(query[key], value)
    else query[key] = value
  }
  return query
}

/**
 * @param {Function} handler  Vercel-style default export `(req, res) => …`
 * @param {Request} request   Incoming Worker request
 * @param {ExecutionContext} ctx
 * @param {{ url?: URL, maxBodyBytes?: number }} options
 */
export async function runVercelHandler(handler, request, ctx, options = {}) {
  const url = options.url || new URL(request.url)
  const headers = buildHeaders(request)

  let rawBody = ''
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    rawBody = await request.text()
    if (options.maxBodyBytes && encoder.encode(rawBody).byteLength > options.maxBodyBytes) {
      return Response.json({ error: 'Request body too large' }, {
        status: 413,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      })
    }
  }

  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    query: buildQuery(url.searchParams),
    body: parseBody(rawBody, headers['content-type']),
    rawBody,
    cookies: {},
    // Minimal event-emitter surface; nothing in Wani relies on request events.
    on() { return req },
    once() { return req },
    off() { return req },
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const outHeaders = new Headers()
  const listeners = { close: [], finish: [] }
  let clientGone = false

  let resolveResponse
  const responsePromise = new Promise(resolve => { resolveResponse = resolve })

  const res = {
    statusCode: 200,
    statusMessage: '',
    headersSent: false,
    writableEnded: false,
    finished: false,

    status(code) { res.statusCode = code; return res },
    setHeader(name, value) {
      if (res.headersSent) return res
      outHeaders.delete(name)
      for (const v of [].concat(value)) outHeaders.append(name, String(v))
      return res
    },
    getHeader(name) { return outHeaders.get(name) ?? undefined },
    getHeaders() { return Object.fromEntries(outHeaders) },
    hasHeader(name) { return outHeaders.has(name) },
    removeHeader(name) { outHeaders.delete(name); return res },
    writeHead(code, message, headers) {
      res.statusCode = code
      const h = typeof message === 'object' ? message : headers
      if (h) for (const [k, v] of Object.entries(h)) res.setHeader(k, v)
      commit()
      return res
    },
    flushHeaders() { commit() },

    write(chunk, encoding, callback) {
      if (res.writableEnded) return false
      commit()
      const bytes = toBytes(chunk, typeof encoding === 'string' ? encoding : undefined)
      if (bytes && bytes.byteLength && !clientGone) {
        writer.write(bytes).catch(() => markClientGone())
      }
      const cb = typeof encoding === 'function' ? encoding : callback
      if (typeof cb === 'function') queueMicrotask(cb)
      return true
    },
    end(chunk, encoding, callback) {
      if (res.writableEnded) return res
      if (typeof chunk === 'function') { callback = chunk; chunk = null }
      if (chunk != null && chunk !== '') res.write(chunk, encoding)
      commit()
      res.writableEnded = true
      res.finished = true
      if (!clientGone) writer.close().catch(() => {})
      const cb = typeof encoding === 'function' ? encoding : callback
      if (typeof cb === 'function') queueMicrotask(cb)
      emit('finish')
      return res
    },

    json(data) {
      if (!outHeaders.has('Content-Type')) outHeaders.set('Content-Type', 'application/json; charset=utf-8')
      return res.end(JSON.stringify(data))
    },
    send(data) {
      if (data == null) return res.end()
      if (typeof data === 'object' && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) return res.json(data)
      if (!outHeaders.has('Content-Type')) {
        outHeaders.set('Content-Type', typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/octet-stream')
      }
      return res.end(data)
    },
    redirect(statusOrUrl, maybeUrl) {
      const status = typeof statusOrUrl === 'number' ? statusOrUrl : 307
      const location = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl
      res.statusCode = status
      res.setHeader('Location', location)
      return res.end()
    },

    on(event, fn) { (listeners[event] ||= []).push(fn); return res },
    once(event, fn) { return res.on(event, fn) },
    off() { return res },
    removeListener() { return res },
  }

  function emit(event) {
    for (const fn of listeners[event] || []) {
      try { fn() } catch (error) { console.error('[adapter] listener failed', error?.message) }
    }
  }

  function markClientGone() {
    if (clientGone) return
    clientGone = true
    emit('close')
  }

  function commit() {
    if (res.headersSent) return
    res.headersSent = true
    const status = res.statusCode || 200
    const noBody = status === 204 || status === 304 || request.method === 'HEAD'
    if (noBody) writer.close().catch(() => {})
    resolveResponse(new Response(noBody ? null : readable, {
      status,
      statusText: res.statusMessage || undefined,
      headers: outHeaders,
    }))
  }

  const run = (async () => {
    try {
      await handler(req, res)
    } catch (error) {
      console.error('[adapter] handler threw', error?.stack || error?.message || error)
      if (!res.headersSent) {
        res.statusCode = 500
        outHeaders.set('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'Internal server error' }))
        return
      }
    }
    // Handlers that stream may return before they finish writing; Vercel kept the
    // function alive until res.end(). Only close here if the handler returned without
    // ending and without having started a response at all.
    if (!res.headersSent) res.end()
  })()

  // Keep the isolate alive for the whole handler, even after the Response is returned.
  ctx.waitUntil(run.then(() => endedPromise(res)))

  return responsePromise
}

// Resolves once res.end() has been called, so waitUntil covers streaming that
// continues after the handler's promise settles. Bounded to avoid holding forever.
function endedPromise(res) {
  if (res.writableEnded) return Promise.resolve()
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 15 * 60_000)
    const done = () => { clearTimeout(timer); resolve() }
    res.once('finish', done)
    res.once('close', done)
  })
}
