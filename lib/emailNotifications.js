// Transactional email notifications for Wani account and quota events.
function cleanEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function adminRecipients() {
  const configured = String(process.env.WANI_ADMIN_NOTIFICATION_EMAILS || '')
    .split(',')
    .map(cleanEmail)
    .filter(Boolean)
  const fallbacks = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2]
    .map(cleanEmail)
    .filter(Boolean)
  return [...new Set([...configured, ...fallbacks])]
}

function appUrl() {
  return String(process.env.WANI_APP_URL || 'https://administrator.ask-wani.com').replace(/\/$/, '')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function locationLabel(location) {
  return String(location?.display || '').trim() || 'Unavailable'
}

export function emailNotificationsConfigured() {
  return Boolean(process.env.RESEND_API_KEY && adminRecipients().length)
}

async function sendEmail({ to, subject, html, text }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean)
  if (!process.env.RESEND_API_KEY || recipients.length === 0) {
    console.warn('[email] notification skipped: RESEND_API_KEY or recipient missing')
    return { sent: false, skipped: 'not_configured' }
  }

  const from = process.env.WANI_EMAIL_FROM || 'Wani <onboarding@resend.dev>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from, to: recipients, subject, html, text }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`)
  }

  return { sent: true }
}

async function sendOnce(client, { key, kind, userId = null, recipient = null, metadata = {}, send }) {
  if (!emailNotificationsConfigured() && !recipient) return { sent: false, skipped: 'not_configured' }

  const { error: reserveError } = await client.from('wani_notification_log').insert({
    notification_key: key,
    kind,
    user_id: userId,
    recipient,
    metadata,
  })

  if (reserveError) {
    if (reserveError.code === '23505') return { sent: false, skipped: 'duplicate' }
    console.error('[email] notification reservation failed:', reserveError.message)
    return { sent: false, skipped: 'reservation_failed' }
  }

  try {
    const result = await send()
    if (!result?.sent) {
      await client.from('wani_notification_log').delete().eq('notification_key', key)
    }
    return result
  } catch (error) {
    await client.from('wani_notification_log').delete().eq('notification_key', key)
    console.error('[email] send failed:', error.message)
    return { sent: false, error: error.message }
  }
}

function emailFrame(title, bodyHtml, buttonLabel = null, buttonHref = null) {
  const button = buttonLabel && buttonHref
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(buttonHref)}" style="display:inline-block;padding:11px 18px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(buttonLabel)}</a></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Arial,sans-serif;color:#111827"><div style="max-width:620px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#6d5ce7;text-transform:uppercase;margin-bottom:10px">Wani Admin</div><h2 style="margin:0 0 18px;font-size:22px">${escapeHtml(title)}</h2>${bodyHtml}${button}</div></body></html>`
}

export async function notifySignup(client, user, location = null) {
  if (!user?.id || !user?.email) return { sent: false, skipped: 'missing_user' }
  const email = cleanEmail(user.email)
  const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0]
  const approveUrl = `${appUrl()}/?admin=users&pending=${encodeURIComponent(user.id)}`
  const recipients = adminRecipients()
  const approxLocation = locationLabel(location)

  return sendOnce(client, {
    key: `signup:${user.id}`,
    kind: 'signup',
    userId: user.id,
    recipient: recipients.join(','),
    metadata: { email, name },
    send: () => sendEmail({
      to: recipients,
      subject: `Wani signup awaiting approval — ${name}`,
      text: `New Wani signup\n\nName: ${name}\nEmail: ${email}\nApprox. location: ${approxLocation}\nUser ID: ${user.id}\n\nOpen the Wani Admin Dashboard to approve: ${approveUrl}`,
      html: emailFrame(
        'New signup awaiting approval',
        `<p><strong>${escapeHtml(name)}</strong> has created a Wani account.</p><p style="line-height:1.7"><strong>Email:</strong> ${escapeHtml(email)}<br><strong>Approx. location:</strong> ${escapeHtml(approxLocation)}<br><strong>User ID:</strong> ${escapeHtml(user.id)}</p>`,
        'Open Admin Dashboard',
        approveUrl,
      ),
    }),
  })
}

export async function notifyLogin(client, user, sessionId, location = null) {
  if (!user?.id || !user?.email || !sessionId) return { sent: false, skipped: 'missing_user' }
  const email = cleanEmail(user.email)
  const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0]
  const recipients = adminRecipients()
  const approxLocation = locationLabel(location)

  return sendOnce(client, {
    key: `login:${sessionId}`,
    kind: 'login',
    userId: user.id,
    recipient: recipients.join(','),
    metadata: { email, name },
    send: () => sendEmail({
      to: recipients,
      subject: `Wani login — ${name}`,
      text: `${name} (${email}) logged in to Wani. Approx. location: ${approxLocation}.`,
      html: emailFrame('User logged in', `<p><strong>${escapeHtml(name)}</strong> logged in to Wani.</p><p style="line-height:1.7"><strong>Email:</strong> ${escapeHtml(email)}<br><strong>Approx. location:</strong> ${escapeHtml(approxLocation)}</p>`),
    }),
  })
}

function berlinDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function berlinMonth() {
  return berlinDate().slice(0, 7)
}

export async function notifyQuotaReached(client, user, quota) {
  if (!user?.id || !user?.email || !quota || quota.allowed !== false) return { sent: false, skipped: 'not_limit' }
  const reason = quota.reason === 'monthly' ? 'monthly' : 'daily'
  const period = reason === 'monthly' ? berlinMonth() : berlinDate()
  const email = cleanEmail(user.email)
  const recipients = adminRecipients()
  const dailyUsed = Number(quota.daily_used || 0)
  const monthlyUsed = Number(quota.monthly_used || 0)
  const monthlyRemaining = Number(quota.monthly_remaining || 0)

  return sendOnce(client, {
    key: `quota:${reason}:${user.id}:${period}`,
    kind: `quota_${reason}`,
    userId: user.id,
    recipient: recipients.join(','),
    metadata: { email, reason, dailyUsed, monthlyUsed, monthlyRemaining },
    send: () => sendEmail({
      to: recipients,
      subject: `Wani ${reason} limit reached — ${email}`,
      text: `${email} reached the Wani ${reason} credit limit. Daily used: ${dailyUsed}. Monthly used: ${monthlyUsed}. Monthly remaining: ${monthlyRemaining}.`,
      html: emailFrame(
        `${reason === 'daily' ? 'Daily' : 'Monthly'} credit limit reached`,
        `<p><strong>${escapeHtml(email)}</strong> has reached the ${reason} Wani credit limit.</p><p style="line-height:1.7"><strong>Daily used:</strong> ${dailyUsed}<br><strong>Monthly used:</strong> ${monthlyUsed}<br><strong>Monthly remaining:</strong> ${monthlyRemaining}</p>`,
      ),
    }),
  })
}

export async function notifyApprovalToUser(client, user) {
  if (!user?.id || !user?.email || !process.env.RESEND_API_KEY) return { sent: false, skipped: 'not_configured' }
  const email = cleanEmail(user.email)
  const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0]
  const loginUrl = appUrl()

  return sendOnce(client, {
    key: `approved:${user.id}`,
    kind: 'approved',
    userId: user.id,
    recipient: email,
    metadata: { email, name },
    send: () => sendEmail({
      to: email,
      subject: 'Your Wani access is approved',
      text: `Hi ${name}, your Wani access has been approved. You can now sign in at ${loginUrl}.`,
      html: emailFrame('Your Wani access is approved', `<p>Hi ${escapeHtml(name)},</p><p>Your Wani access has been approved. You can now sign in and start using Wani.</p>`, 'Open Wani', loginUrl),
    }),
  })
}
