// Reference search remains temporarily unavailable. This existing function also
// serves as Wani's internal chat security gateway so the Hobby deployment stays
// within Vercel's 12-function limit.

import chatHandler from './chat.js'
import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'
import {
  FREE_DAILY_CREDITS,
  FREE_MONTHLY_CREDITS,
  consumeWaniCredit,
  getQuotaRequestId,
  getWaniCreditUsage,
  shouldConsumeCredit,
} from './_quota.js'

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

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function publicCreditUsage(quota) {
  if (!quota) return null
  return {
    dailyUsed: toNumber(quota.daily_used),
    dailyRemaining: toNumber(quota.daily_remaining),
    dailyLimit: toNumber(quota.daily_limit) || FREE_DAILY_CREDITS,
    monthlyUsed: toNumber(quota.monthly_used),
    monthlyRemaining: toNumber(quota.monthly_remaining),
    monthlyLimit: toNumber(quota.monthly_limit) || FREE_MONTHLY_CREDITS,
    dailyResetAt: quota.daily_reset_at || null,
    monthlyResetAt: quota.monthly_reset_at || null,
  }
}

function currentUiMessageCount(quota) {
  return toNumber(quota?.daily_used) >= FREE_DAILY_CREDITS ? 50 : 0
}

export function sanitizeChatEvent(eventText, quota = null) {
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
    payload.isUnlimited = false

    if (quota) {
      // Brain.jsx currently has a legacy hard-coded 50-message usage bar. Keep it
      // hidden until the real five-credit daily limit is reached, then show its
      // existing "Daily limit reached" state. Actual counts are supplied below.
      payload.messageCount = currentUiMessageCount(quota)
      payload.dailyLimit = FREE_DAILY_CREDITS
      payload.creditUsage = publicCreditUsage(quota)
    }
  }

  return `data: ${JSON.stringify(payload)}\n\n`
}

function createSanitizingResponse(res, quota = null) {
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
      const sanitized = sanitizeChatEvent(event, quota)
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
      const sanitized = sanitizeChatEvent(buffer.endsWith('\n\n') ? buffer : `${buffer}\n\n`, quota)
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

function quotaMessage(quota, serviceError = false) {
  if (serviceError) {
    return 'Wani is temporarily unable to verify your free credits. Please try again in a moment.'
  }

  if (quota?.reason === 'monthly') {
    return `You have used all ${FREE_MONTHLY_CREDITS} free questions for this month. Your monthly allowance resets at the beginning of the next month.`
  }

  const monthlyRemaining = toNumber(quota?.monthly_remaining)
  const monthlyText = monthlyRemaining === 1
    ? '1 monthly credit remains.'
    : `${monthlyRemaining} monthly credits remain.`
  return `You have used all ${FREE_DAILY_CREDITS} free questions for today. ${monthlyText} Your daily allowance resets at midnight Berlin time.`
}

function sendQuotaStream(res, quota, serviceError = false) {
  const text = quotaMessage(quota, serviceError)
  const usage = publicCreditUsage(quota)

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = payload => res.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({ type: 'start', intent: serviceError ? 'ERROR' : 'LIMIT' })
  send({ type: 'chunk', text })
  send({
    type: 'done',
    full: text,
    model: serviceError ? 'quota-error' : 'limit',
    deliverableType: 'NONE',
    isCorrection: false,
    isUnlimited: false,
    messageCount: serviceError ? 0 : currentUiMessageCount(quota),
    dailyLimit: FREE_DAILY_CREDITS,
    creditUsage: usage,
  })
  return res.end()
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

  // Lightweight, non-consuming status call used by the floating credit indicator.
  // Admin status is returned explicitly so the frontend never guesses from public env vars.
  if (req.body?.action === 'get_credit_usage') {
    if (isAdmin) {
      return res.status(200).json({ isUnlimited: true, creditUsage: null })
    }

    try {
      const quota = await getWaniCreditUsage(auth.serviceClient, auth.user.id)
      return res.status(200).json({
        isUnlimited: false,
        creditUsage: publicCreditUsage(quota),
      })
    } catch (error) {
      console.error('[quota] status lookup failed:', error.code || error.message)
      return res.status(503).json({ error: 'Unable to read free-credit usage' })
    }
  }

  if (req.body?.action === 'save_correction' && !isAdmin) {
    return res.status(403).json({ error: 'Administrator access required' })
  }

  let quota = null
  if (!isAdmin && shouldConsumeCredit(req.body)) {
    try {
      quota = await consumeWaniCredit(
        auth.serviceClient,
        auth.user.id,
        getQuotaRequestId(req),
      )
    } catch (error) {
      console.error('[quota] credit check failed:', error.code || error.message)
      return sendQuotaStream(res, null, true)
    }

    if (!quota.allowed) return sendQuotaStream(res, quota)
  }

  return chatHandler(req, isAdmin ? res : createSanitizingResponse(res, quota))
}
