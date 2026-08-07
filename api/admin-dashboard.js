// Admin dashboard data for Wani.
// Read-only endpoint. Administrator identity comes from the verified Supabase
// session plus server-only ADMIN_EMAIL_1 / ADMIN_EMAIL_2 configuration.

import { requireApprovedUser, sendAuthError } from './_auth.js'

const DAY_MS = 24 * 60 * 60 * 1000
const ONLINE_WINDOW_MS = 90 * 1000

function startOfBerlinDay(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  return new Date(`${date}T00:00:00+02:00`)
}

function startOfBerlinMonth(now = new Date()) {
  const day = startOfBerlinDay(now)
  day.setUTCDate(1)
  return day
}

function latestIso(...values) {
  const valid = values
    .filter(Boolean)
    .map(v => new Date(v))
    .filter(d => !Number.isNaN(d.getTime()))
  if (!valid.length) return null
  return new Date(Math.max(...valid.map(d => d.getTime()))).toISOString()
}

function displayName(profile, user) {
  return profile?.full_name || profile?.name || profile?.display_name ||
    user?.user_metadata?.full_name || user?.user_metadata?.name ||
    user?.email?.split('@')?.[0] || 'User'
}

function adminEmails() {
  return [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2]
    .filter(Boolean)
    .map(v => v.trim().toLowerCase())
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const email = (auth.user.email || '').trim().toLowerCase()
  if (!adminEmails().includes(email)) {
    return res.status(403).json({ error: 'Administrator access required' })
  }

  try {
    const client = auth.serviceClient
    const now = new Date()
    const todayStart = startOfBerlinDay(now)
    const monthStart = startOfBerlinMonth(now)

    const [usersResult, profilesResult, approvedResult, sessionsResult, creditsResult] = await Promise.all([
      client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      client.from('profiles').select('*'),
      client.from('approved_emails').select('email,full_name,approved_at'),
      client.from('wani_active_sessions').select('user_id,last_seen_at,claimed_at'),
      client.from('wani_credit_usage').select('user_id,usage_day,usage_month,created_at'),
    ])

    if (usersResult.error) throw usersResult.error
    if (profilesResult.error) throw profilesResult.error
    if (approvedResult.error) throw approvedResult.error
    if (sessionsResult.error) throw sessionsResult.error
    if (creditsResult.error) throw creditsResult.error

    const users = usersResult.data?.users || []
    const profiles = profilesResult.data || []
    const approved = approvedResult.data || []
    const sessions = sessionsResult.data || []
    const credits = creditsResult.data || []

    const profileById = new Map(profiles.map(p => [p.id, p]))
    const approvedByEmail = new Map(approved.map(a => [(a.email || '').trim().toLowerCase(), a]))
    const sessionByUser = new Map(sessions.map(s => [s.user_id, s]))

    const usageByUser = new Map()
    for (const row of credits) {
      const item = usageByUser.get(row.user_id) || { today: 0, month: 0, total: 0, lastQuestionAt: null }
      item.total += 1
      const created = row.created_at ? new Date(row.created_at) : null
      if (created && !Number.isNaN(created.getTime())) {
        if (created >= todayStart) item.today += 1
        if (created >= monthStart) item.month += 1
        if (!item.lastQuestionAt || created > new Date(item.lastQuestionAt)) item.lastQuestionAt = created.toISOString()
      }
      usageByUser.set(row.user_id, item)
    }

    const dailyLimit = Number(process.env.WANI_DAILY_LIMIT || 5)
    const monthlyLimit = Number(process.env.WANI_MONTHLY_LIMIT || 20)
    const admins = new Set(adminEmails())

    const rows = users.map(user => {
      const profile = profileById.get(user.id)
      const session = sessionByUser.get(user.id)
      const usage = usageByUser.get(user.id) || { today: 0, month: 0, total: 0, lastQuestionAt: null }
      const userEmail = (user.email || '').trim().toLowerCase()
      const approvedEntry = approvedByEmail.get(userEmail)
      const lastSeenAt = latestIso(
        profile?.last_seen_at,
        session?.last_seen_at,
        usage.lastQuestionAt,
        user.last_sign_in_at,
      )
      const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0
      const isOnline = Boolean(session?.last_seen_at) && now.getTime() - new Date(session.last_seen_at).getTime() <= ONLINE_WINDOW_MS
      const isAdmin = admins.has(userEmail)

      return {
        id: user.id,
        name: displayName(profile, user),
        email: user.email || '',
        approved: Boolean(approvedEntry),
        approvedAt: approvedEntry?.approved_at || null,
        createdAt: user.created_at || null,
        lastSignInAt: user.last_sign_in_at || null,
        lastOnlineAt: lastSeenAt,
        online: isOnline,
        questionsToday: usage.today,
        questionsMonth: usage.month,
        questionsTotal: usage.total,
        dailyRemaining: isAdmin ? null : Math.max(dailyLimit - usage.today, 0),
        monthlyRemaining: isAdmin ? null : Math.max(monthlyLimit - usage.month, 0),
        unlimited: isAdmin,
      }
    }).sort((a, b) => {
      const av = a.lastOnlineAt ? new Date(a.lastOnlineAt).getTime() : 0
      const bv = b.lastOnlineAt ? new Date(b.lastOnlineAt).getTime() : 0
      return bv - av
    })

    const activeToday = rows.filter(u => u.lastOnlineAt && new Date(u.lastOnlineAt) >= todayStart).length
    const onlineNow = rows.filter(u => u.online).length
    const approvedUsers = rows.filter(u => u.approved).length
    const questionsToday = rows.reduce((sum, u) => sum + u.questionsToday, 0)
    const questionsMonth = rows.reduce((sum, u) => sum + u.questionsMonth, 0)

    return res.status(200).json({
      generatedAt: now.toISOString(),
      limits: { daily: dailyLimit, monthly: monthlyLimit },
      summary: {
        totalUsers: rows.length,
        approvedUsers,
        activeToday,
        onlineNow,
        questionsToday,
        questionsMonth,
      },
      telemetry: {
        costToday: null,
        averageResponseMs: null,
        failedQuestions: null,
        modelUsage: null,
        note: 'Main-chat token/cost telemetry is not persisted yet; values are intentionally not estimated.',
      },
      users: rows,
    })
  } catch (error) {
    console.error('[admin-dashboard] failed:', error.message)
    return res.status(500).json({ error: 'Could not load admin dashboard' })
  }
}
