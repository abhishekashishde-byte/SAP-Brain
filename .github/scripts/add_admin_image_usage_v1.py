from pathlib import Path

admin_api = Path('lib/adminDashboard.js')
admin_ui = Path('src/pages/AdminDashboard.jsx')

a = admin_api.read_text()
u = admin_ui.read_text()

# Backend: include saved conversations in dashboard query.
old = "  const [usersResult, profilesResult, approvedResult, sessionsResult, creditsResult] = await Promise.all([\n    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),\n    client.from('profiles').select('*'),\n    client.from('approved_emails').select('email,full_name,approved_at'),\n    client.from('wani_active_sessions').select('user_id,last_seen_at,claimed_at'),\n    client.from('wani_credit_usage').select('user_id,created_at'),\n  ])"
new = "  const [usersResult, profilesResult, approvedResult, sessionsResult, creditsResult, conversationsResult] = await Promise.all([\n    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),\n    client.from('profiles').select('*'),\n    client.from('approved_emails').select('email,full_name,approved_at'),\n    client.from('wani_active_sessions').select('user_id,last_seen_at,claimed_at'),\n    client.from('wani_credit_usage').select('user_id,created_at'),\n    client.from('sap_conversations').select('user_id,messages'),\n  ])"
if old not in a:
    raise SystemExit('dashboard Promise.all block not found')
a = a.replace(old, new, 1)

old = "  if (creditsResult.error) throw creditsResult.error\n\n  const users = usersResult.data?.users || []"
new = "  if (creditsResult.error) throw creditsResult.error\n  if (conversationsResult.error) throw conversationsResult.error\n\n  const users = usersResult.data?.users || []"
a = a.replace(old, new, 1)

old = "  const credits = creditsResult.data || []\n  const profileById = new Map(profiles.map(profile => [profile.id, profile]))"
new = "  const credits = creditsResult.data || []\n  const conversations = conversationsResult.data || []\n  const profileById = new Map(profiles.map(profile => [profile.id, profile]))"
a = a.replace(old, new, 1)

# Count persisted image outputs by user. Supports current and legacy field names.
marker = "  const dailyLimit = Number(process.env.WANI_DAILY_LIMIT || 5)"
insert = """  const imageUsageByUser = new Map()\n  for (const conversation of conversations) {\n    const userId = conversation.user_id\n    if (!userId) continue\n    const item = imageUsageByUser.get(userId) || { customerBriefs: 0, consultantNotes: 0, total: 0 }\n    const messages = Array.isArray(conversation.messages) ? conversation.messages : []\n    for (const message of messages) {\n      if (!message || message.role !== 'assistant') continue\n      // New formal mode. _visualData/_visualFormat are the retired HTML visual and do not count as images.\n      if (message._customerBriefData) { item.customerBriefs += 1; item.total += 1 }\n      // Consultant Note currently persists in the legacy _handoutData field for backwards compatibility.\n      if (message._handoutData) { item.consultantNotes += 1; item.total += 1 }\n    }\n    imageUsageByUser.set(userId, item)\n  }\n\n"""
if marker not in a:
    raise SystemExit('dailyLimit marker not found')
a = a.replace(marker, insert + marker, 1)

old = "    const usage = usageByUser.get(user.id) || { today: 0, month: 0, total: 0, lastQuestionAt: null }\n    const userEmail"
new = "    const usage = usageByUser.get(user.id) || { today: 0, month: 0, total: 0, lastQuestionAt: null }\n    const imageUsage = imageUsageByUser.get(user.id) || { customerBriefs: 0, consultantNotes: 0, total: 0 }\n    const userEmail"
a = a.replace(old, new, 1)

old = "      questionsTotal: usage.total,\n      dailyRemaining:"
new = "      questionsTotal: usage.total,\n      customerBriefs: imageUsage.customerBriefs,\n      consultantNotes: imageUsage.consultantNotes,\n      imagesTotal: imageUsage.total,\n      dailyRemaining:"
a = a.replace(old, new, 1)

old = "      questionsMonth: rows.reduce((sum, user) => sum + user.questionsMonth, 0),\n    },"
new = "      questionsMonth: rows.reduce((sum, user) => sum + user.questionsMonth, 0),\n      customerBriefs: rows.reduce((sum, user) => sum + user.customerBriefs, 0),\n      consultantNotes: rows.reduce((sum, user) => sum + user.consultantNotes, 0),\n      imagesTotal: rows.reduce((sum, user) => sum + user.imagesTotal, 0),\n    },"
a = a.replace(old, new, 1)

# UI: overall image metric.
old = "              <Metric label=\"Questions this month\" value={data.summary.questionsMonth} />"
new = "              <Metric label=\"Questions this month\" value={data.summary.questionsMonth} />\n              <Metric label=\"Images generated\" value={data.summary.imagesTotal || 0} hint={`${data.summary.customerBriefs || 0} briefs · ${data.summary.consultantNotes || 0} notes`} />"
if old not in u:
    raise SystemExit('summary metric marker not found')
u = u.replace(old, new, 1)

# Add three image columns to user table.
old = "{['User','Status','Last online','Today','Month','Credits left','Joined'].map(h => ("
new = "{['User','Status','Last online','Today','Month','Customer briefs','Consultant notes','Images','Credits left','Joined'].map(h => ("
u = u.replace(old, new, 1)

old = "                        <td style={{ padding: '13px 14px', fontSize: 13 }}>{u.questionsMonth}</td>\n                        <td style={{ padding: '13px 14px', fontSize: 12 }}>"
new = "                        <td style={{ padding: '13px 14px', fontSize: 13 }}>{u.questionsMonth}</td>\n                        <td style={{ padding: '13px 14px', fontSize: 13 }}>{u.customerBriefs || 0}</td>\n                        <td style={{ padding: '13px 14px', fontSize: 13 }}>{u.consultantNotes || 0}</td>\n                        <td style={{ padding: '13px 14px', fontSize: 13, fontWeight: 700, color: '#C4B5FD' }}>{u.imagesTotal || 0}</td>\n                        <td style={{ padding: '13px 14px', fontSize: 12 }}>"
if old not in u:
    raise SystemExit('user table insertion marker not found')
u = u.replace(old, new, 1)

u = u.replace('minWidth: 920', 'minWidth: 1180', 1)
u = u.replace('<tr><td colSpan="7"', '<tr><td colSpan="10"', 1)

admin_api.write_text(a)
admin_ui.write_text(u)
print('admin image usage patch applied')
