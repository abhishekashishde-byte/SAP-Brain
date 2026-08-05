// Reference search remains temporarily unavailable. This existing function also
// serves as Wani's internal chat security gateway so the Hobby deployment stays
// within Vercel's 12-function limit.

import chatHandler from './chat.js'
import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'

function getAdminEmails() {
  return [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2]
    .filter(Boolean)
    .map(email => email.trim().toLowerCase())
}

function isAdminEmail(email) {
  return getAdminEmails().includes(String(email || '').trim().toLowerCase())
}

const ADMIN_ONLY_EVENT_TYPES = new Set([
  'debug_info',
  'search_results',
  'further_reading',
])

export function sanitizeChatEvent(eventText) {
  const match = eventText.match(/^data:\s*([\s\S]*?)\n\n$/)
  if (!match) return eventText

  let payload
  try {
    payload = JSON.parse(match[1])
  } catch {
    return eventText
  }

  // Raw diagnostics and all source/result panels are administrator-only.
  // The normal answer stream is left unchanged.
  if (ADMIN_ONLY_EVENT_TYPES.has(payload?.type)) return ''

  if (payload?.type === 'done') {
    delete payload.debugDoc
    delete payload.sourceInfo
    delete payload.references
    payload.isCorrection = false
  }

  return `data: ${JSON.stringify(payload)}\n\n`
}

function createSanitizingResponse(res) {
  let buffer = ''

  const write = (chunk, encoding, callback) => {
    const text = Buffer.isBuffer(chunk)
      ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8')
      : String(chunk ?? '')

    const contentType = String(res.getHeader?.('Content-Type') || '')
    if (!contentType.includes('text/event-stream')) {
      return res.write(chunk, encoding, callback)
    }

    buffer += text
    let boundary = buffer.indexOf('\n\n')
    let wrote = true

    while (boundary !== -1) {
      const event = buffer.slice(0, boundary + 2)
      buffer = buffer.slice(boundary + 2)
      const sanitized = sanitizeChatEvent(event)
      if (sanitized) wrote = res.write(sanitized) && wrote
      boundary = buffer.indexOf('\n\n')
    }

    if (typeof encoding === 'function') encoding()
    else if (typeof callback === 'function') callback()
    return wrote
  }

  const end = (chunk, encoding, callback) => {
    if (chunk != null && chunk !== '') write(chunk, encoding)
    if (buffer) {
      const sanitized = sanitizeChatEvent(buffer.endsWith('\n\n') ? buffer : `${buffer}\n\n`)
      if (sanitized) res.write(sanitized)
      buffer = ''
    }
    return res.end(null, typeof encoding === 'string' ? encoding : undefined, typeof encoding === 'function' ? encoding : callback)
  }

  return new Proxy(res, {
    get(target, property) {
      if (property === 'write') return write
      if (property === 'end') return end
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function isChatGatewayRequest(req) {
  if (req.query?.wani_gateway === '1') return true
  try {
    return new URL(req.url || '', 'https://wani.local').searchParams.get('wani_gateway') === '1'
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!isChatGatewayRequest(req)) {
    if (!requireJsonBody(req, res, 20_000)) return
    const auth = await requireApprovedUser(req)
    if (!auth.ok) return sendAuthError(res, auth)
    return res.status(503).json({
      error: 'Reference search is temporarily unavailable while citation validation is being rebuilt',
    })
  }

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const isAdmin = isAdminEmail(auth.user.email)
  if (req.body?.action === 'save_correction' && !isAdmin) {
    return res.status(403).json({ error: 'Administrator access required' })
  }

  return chatHandler(req, isAdmin ? res : createSanitizingResponse(res))
}
