// Single source of truth for "is this user an administrator?".
// Used by chat (shows the Admin pill), /api/recall and the admin dashboard, so they
// can never disagree. Tolerates how secrets are often pasted: "ADMIN_EMAIL_1=…",
// quotes, <…>, spaces, or a comma-separated list.
const OWNER_EMAILS = ['abhishek.ashish.de@gmail.com']

export function adminEmails() {
  return [...new Set(
    [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2, ...OWNER_EMAILS]
      .filter(Boolean)
      .flatMap(value => String(value).replace(/^\s*ADMIN_EMAIL_\d\s*=\s*/i, '').split(/[,;\s]+/))
      .map(email => email.replace(/["'<>]/g, '').trim().toLowerCase())
      .filter(email => email.includes('@'))
  )]
}

export function isAdminEmail(email) {
  return adminEmails().includes(String(email || '').trim().toLowerCase())
}
