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
