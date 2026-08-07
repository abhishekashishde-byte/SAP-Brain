const ONLINE_WINDOW_MS = 90 * 1000

function berlinParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function startOfBerlinDay(now = new Date()) {
  const p = berlinParts(now)
  return new Date(`${p.year}-${p.month}-${p.day}T00:00:00+02:00`)
}

function startOfBerlinMonth(now = new Date()) {
  const p = berlinParts(now)
  return new Date(`${p.year}-${p.month}-01T00:00:00+02:00`)
}

function latestIso(...values) {
  const valid = values.filter(Boolean).map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()))
  if (!valid.length) return null
  return new Date(Math.max(...valid.map(date => date.getTime()))).toISOString()
}

function displayName(profile, user) {
  return profile?.full_name || profile?.name || profile?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')?.[0] || 'User'
}

function configuredAdminEmails() {
  return [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean).map(value => value.trim().toLowerCase())
}

export async function handleAdminDashboard(res, auth) {
  const email = (auth.user.email || '').trim().toLowerCase()
  const adminEmails = configuredAdminEmails()
  if (!adminEmails.includes(email)) return res.status(403).json({ error: 'Administrator access required' })

  const client = auth.serviceClient
  const now = new Date()
  const todayStart = startOfBerlinDay(now)
  const monthStart = startOfBerlinMonth(now)

  const [usersResult, profilesResult, approvedResult, sessionsResult, creditsResult] = await Promise.all([
    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    client.from('profiles').select('*'),
    client.from('approved_emails').select('email,full_name,approved_at'),
    client.from('wani_active_sessions').select('user_id,last_seen_at,claimed_at'),
    client.from('wani_credit_usage').select('user_id,created_at'),
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
  const profileById = new Map(profiles.map(profile => [profile.id, profile]))
  const approvedByEmail = new Map(approved.map(entry => [(entry.email || '').trim().toLowerCase(), entry]))
  const sessionByUser = new Map(sessions.map(session => [session.user_id, session]))

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
  const admins = new Set(adminEmails)

  const rows = users.map(user => {
    const profile = profileById.get(user.id)
    const session = sessionByUser.get(user.id)
    const usage = usageByUser.get(user.id) || { today: 0, month: 0, total: 0, lastQuestionAt: null }
    const userEmail = (user.email || '').trim().toLowerCase()
    const approvedEntry = approvedByEmail.get(userEmail)
    const lastSeenAt = latestIso(profile?.last_seen_at, session?.last_seen_at, usage.lastQuestionAt, user.last_sign_in_at)
    const isOnline = Boolean(session?.last_seen_at) && now.getTime() - new Date(session.last_seen_at).getTime() <= ONLINE_WINDOW_MS
    const isAdmin = admins.has(userEmail)
    const approved = Boolean(approvedEntry)
    const accessStatus = isAdmin ? 'active' : profile?.access_status === 'suspended' ? 'suspended' : approved ? 'active' : 'pending'
    return {
      id: user.id,
      name: displayName(profile, user),
      email: user.email || '',
      approved,
      accessStatus,
      isAdmin,
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

  return res.status(200).json({
    generatedAt: now.toISOString(),
    limits: { daily: dailyLimit, monthly: monthlyLimit },
    summary: {
      totalUsers: rows.length,
      approvedUsers: rows.filter(user => user.accessStatus === 'active').length,
      suspendedUsers: rows.filter(user => user.accessStatus === 'suspended').length,
      pendingUsers: rows.filter(user => user.accessStatus === 'pending').length,
      activeToday: rows.filter(user => user.lastOnlineAt && new Date(user.lastOnlineAt) >= todayStart).length,
      onlineNow: rows.filter(user => user.online).length,
      questionsToday: rows.reduce((sum, user) => sum + user.questionsToday, 0),
      questionsMonth: rows.reduce((sum, user) => sum + user.questionsMonth, 0),
    },
    telemetry: { costToday: null, averageResponseMs: null, failedQuestions: null, modelUsage: null, note: 'Main-chat token/cost telemetry is not persisted yet; values are intentionally not estimated.' },
    users: rows,
  })
}
