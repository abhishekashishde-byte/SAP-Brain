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

  const [usersResult, profilesResult, approvedResult, sessionsResult, creditsResult, costsResult] = await Promise.all([
    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    client.from('profiles').select('*'),
    client.from('approved_emails').select('email,full_name,approved_at'),
    client.from('wani_active_sessions').select('user_id,last_seen_at,claimed_at'),
    client.from('wani_credit_usage').select('user_id,created_at'),
    client.from('wani_cost_log').select('*').order('created_at', { ascending: false }).limit(2000),
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
  const costs = costsResult.error ? [] : (costsResult.data || [])
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
    const approvedValue = Boolean(approvedEntry)
    const accessStatus = isAdmin ? 'active' : profile?.access_status === 'suspended' ? 'suspended' : approvedValue ? 'active' : 'pending'
    return {
      id: user.id,
      name: displayName(profile, user),
      email: user.email || '',
      approved: approvedValue,
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

  const costRows = costs.map(row => ({ ...row, _date: row.created_at ? new Date(row.created_at) : null }))
    .filter(row => row._date && !Number.isNaN(row._date.getTime()))
  const todayCosts = costRows.filter(row => row._date >= todayStart)
  const monthCosts = costRows.filter(row => row._date >= monthStart)
  const sum = (list, key) => list.reduce((total, row) => total + (Number(row[key]) || 0), 0)
  const costMonth = sum(monthCosts, 'anthropic_cost_usd')

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
      questionsToday: rows.reduce((sumValue, user) => sumValue + user.questionsToday, 0),
      questionsMonth: rows.reduce((sumValue, user) => sumValue + user.questionsMonth, 0),
    },
    costs: {
      available: !costsResult.error,
      note: costsResult.error ? 'wani_cost_log is unavailable' : 'Actual persisted Anthropic Claude Sonnet cost only; Groq, Tavily and OpenAI spend is not included.',
      summary: {
        costToday: sum(todayCosts, 'anthropic_cost_usd'),
        costMonth,
        callsToday: todayCosts.length,
        callsMonth: monthCosts.length,
        inputTokensMonth: sum(monthCosts, 'input_tokens'),
        outputTokensMonth: sum(monthCosts, 'output_tokens'),
        avgCostMonth: monthCosts.length ? costMonth / monthCosts.length : 0,
      },
      recent: costRows.slice(0, 100).map(({ _date, ...row }) => row),
    },
    telemetry: {
      costToday: sum(todayCosts, 'anthropic_cost_usd'),
      costScope: 'anthropic_only',
      averageResponseMs: null,
      failedQuestions: null,
      modelUsage: null,
      note: 'Sonnet token/cost telemetry is persisted. End-to-end response time, failures and full-provider spend are not yet persisted.',
    },
    users: rows,
  })
}
