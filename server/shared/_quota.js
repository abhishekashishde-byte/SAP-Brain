import { randomUUID } from 'node:crypto'

export const FREE_DAILY_CREDITS = 5
export const FREE_MONTHLY_CREDITS = 20
export const QUOTA_TIMEZONE = 'Europe/Berlin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function shouldConsumeCredit(body) {
  return !body?.action
}

export function getQuotaRequestId(req) {
  const raw = Array.isArray(req.headers?.['x-wani-request-id'])
    ? req.headers['x-wani-request-id'][0]
    : req.headers?.['x-wani-request-id']
  const candidate = String(raw || '').trim()
  return UUID_PATTERN.test(candidate) ? candidate : randomUUID()
}

function parseQuotaPayload(data) {
  const value = Array.isArray(data) ? data[0] : data
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return value && typeof value === 'object' ? value : null
}

function datePartsInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

export async function getWaniCreditUsage(serviceClient, userId) {
  const { year, month, day } = datePartsInTimeZone(new Date(), QUOTA_TIMEZONE)
  const usageDay = `${year}-${month}-${day}`
  const usageMonth = `${year}-${month}-01`

  const { data, error } = await serviceClient
    .from('wani_credit_usage')
    .select('usage_day')
    .eq('user_id', userId)
    .eq('usage_month', usageMonth)

  if (error) {
    const quotaError = new Error('Unable to read free-credit usage')
    quotaError.code = error.code
    quotaError.detail = error.message
    throw quotaError
  }

  const rows = Array.isArray(data) ? data : []
  const dailyUsed = rows.filter(row => row.usage_day === usageDay).length
  const monthlyUsed = rows.length

  return {
    allowed: dailyUsed < FREE_DAILY_CREDITS && monthlyUsed < FREE_MONTHLY_CREDITS,
    duplicate: false,
    reason: monthlyUsed >= FREE_MONTHLY_CREDITS
      ? 'monthly'
      : dailyUsed >= FREE_DAILY_CREDITS ? 'daily' : null,
    daily_used: dailyUsed,
    daily_remaining: Math.max(FREE_DAILY_CREDITS - dailyUsed, 0),
    daily_limit: FREE_DAILY_CREDITS,
    monthly_used: monthlyUsed,
    monthly_remaining: Math.max(FREE_MONTHLY_CREDITS - monthlyUsed, 0),
    monthly_limit: FREE_MONTHLY_CREDITS,
    daily_reset_at: null,
    monthly_reset_at: null,
  }
}

export async function consumeWaniCredit(serviceClient, userId, requestId) {
  const { data, error } = await serviceClient.rpc('consume_wani_credit', {
    p_user_id: userId,
    p_request_id: requestId,
    p_daily_limit: FREE_DAILY_CREDITS,
    p_monthly_limit: FREE_MONTHLY_CREDITS,
    p_timezone: QUOTA_TIMEZONE,
  })

  if (error) {
    const quotaError = new Error('Unable to verify free-credit allowance')
    quotaError.code = error.code
    quotaError.detail = error.message
    throw quotaError
  }

  const quota = parseQuotaPayload(data)
  if (!quota || typeof quota.allowed !== 'boolean') {
    throw new Error('Credit service returned an invalid response')
  }
  return quota
}
