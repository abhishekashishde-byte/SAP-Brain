// api/notify.js
// Handles two events:
// 1. Supabase webhook — user signup/login → email to Abhishek
// 2. Waitlist form submission → email to Abhishek with Approve/Reject buttons
// 3. Approval/Rejection logic — one click from email

import nodemailer from 'nodemailer'
import crypto from 'crypto'

export const config = { maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const GMAIL_USER   = process.env.NOTIFY_GMAIL_USER
const GMAIL_PASS   = process.env.NOTIFY_GMAIL_PASS
const NOTIFY_TO    = process.env.NOTIFY_TO
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET
const BASE_URL     = 'https://ask-wani.com'

// ── SEND EMAIL HELPER ─────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  })
  await transporter.sendMail({
    from: `"Wani" <${GMAIL_USER}>`,
    to,
    subject,
    html,
  })
}

// ── SUPABASE HELPER ───────────────────────────────────────────────────────────
async function supabaseQuery(table, method, body, match) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`
  if (match) url += `?${match}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── GET: Approve or Reject from email button click ────────────────────────
  if (req.method === 'GET') {
    const { action, email, token } = req.query

    if (!action || !email || !token) {
      return res.status(400).send('<h2>Invalid link.</h2>')
    }

    // Verify token matches what we stored
    const checkRes = await supabaseQuery('waitlist', 'GET', null,
      `email=eq.${encodeURIComponent(email)}&select=token,full_name,status`)
    const rows = await checkRes.json()

    if (!rows || rows.length === 0) {
      return res.status(404).send('<h2>Application not found.</h2>')
    }

    const applicant = rows[0]

    if (applicant.token !== token) {
      return res.status(401).send('<h2>Invalid or expired link.</h2>')
    }

    if (applicant.status !== 'pending') {
      return res.status(200).send(`<h2>This application has already been ${applicant.status}.</h2>`)
    }

    if (action === 'approve') {
      // Add to approved_emails table
      await supabaseQuery('approved_emails', 'POST', {
        email,
        full_name: applicant.full_name,
        approved_at: new Date().toISOString(),
      })

      // Update waitlist status
      await supabaseQuery('waitlist', 'PATCH', { status: 'approved' },
        `email=eq.${encodeURIComponent(email)}`)

      // Send access email to applicant
      await sendEmail({
        to: email,
        subject: 'Your Wani access is approved',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;">
            <div style="background:#111827;padding:18px 24px;border-radius:12px 12px 0 0;">
              <span style="color:white;font-size:20px;font-weight:800;">𝕎 Wani</span>
            </div>
            <div style="padding:24px;background:#f9f9f9;border-radius:0 0 12px 12px;">
              <p style="font-size:15px;color:#111;">Hi ${applicant.full_name},</p>
              <p style="font-size:15px;color:#333;line-height:1.6;">
                Your Wani access has been approved. You can sign up here:
              </p>
              <div style="text-align:center;margin:24px 0;">
                <a href="https://ask-wani.com" style="background:#4F46E5;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
                  Access Wani →
                </a>
              </div>
              <p style="font-size:13px;color:#888;">Welcome aboard.</p>
              <p style="font-size:13px;color:#888;">— Wani Team</p>
            </div>
          </div>
        `,
      })

      return res.status(200).send(`
        <div style="font-family:Inter,Arial,sans-serif;max-width:400px;margin:80px auto;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <h2 style="color:#111;">${email} approved.</h2>
          <p style="color:#666;">Access email sent to the applicant.</p>
        </div>
      `)
    }

    if (action === 'reject') {
      // Update waitlist status
      await supabaseQuery('waitlist', 'PATCH', { status: 'rejected' },
        `email=eq.${encodeURIComponent(email)}`)

      return res.status(200).send(`
        <div style="font-family:Inter,Arial,sans-serif;max-width:400px;margin:80px auto;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">❌</div>
          <h2 style="color:#111;">${email} rejected.</h2>
          <p style="color:#666;">Application marked as rejected.</p>
        </div>
      `)
    }

    return res.status(400).send('<h2>Invalid action.</h2>')
  }

  // ── POST: Webhook or waitlist submission ──────────────────────────────────
  const secret = req.headers['x-webhook-secret']
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    console.warn('NOTIFY: Unauthorized call blocked')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const body = req.body

    // ── WAITLIST SUBMISSION ──────────────────────────────────────────────────
    if (body?.type === 'WAITLIST') {
      const { full_name, email, sap_experience, sap_module } = body.record || {}

      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex')

      // Save to waitlist table with token
      await supabaseQuery('waitlist', 'POST', {
        full_name, email, sap_experience, sap_module,
        status: 'pending', token,
        created_at: new Date().toISOString(),
      })

      // Build approve/reject URLs
      const approveUrl = `${BASE_URL}/api/Notify?action=approve&email=${encodeURIComponent(email)}&token=${token}`
      const rejectUrl  = `${BASE_URL}/api/Notify?action=reject&email=${encodeURIComponent(email)}&token=${token}`

      console.log(`NOTIFY: Sending waitlist email to ${NOTIFY_TO} for ${email}`)
      console.log(`NOTIFY: Gmail user: ${GMAIL_USER}, pass length: ${GMAIL_PASS?.length}`)
      await sendEmail({
        to: NOTIFY_TO,
        subject: `🙋 New Wani Waitlist Application — ${email}`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#f9f9f9;border-radius:14px;overflow:hidden;">
            <div style="background:#111827;padding:18px 24px;">
              <span style="color:white;font-size:20px;font-weight:800;">𝕎 Wani</span>
            </div>
            <div style="padding:24px;">
              <h2 style="margin:0 0 20px;color:#111;font-size:18px;">🙋 New Waitlist Application</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;font-size:13px;width:120px;">Name</td>
                  <td style="padding:10px 0;font-weight:600;font-size:14px;">${full_name}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;font-size:13px;">Email</td>
                  <td style="padding:10px 0;font-weight:600;font-size:14px;">${email}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;font-size:13px;">Experience</td>
                  <td style="padding:10px 0;font-size:14px;">${sap_experience} years</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#888;font-size:13px;">Module</td>
                  <td style="padding:10px 0;font-size:14px;">${sap_module}</td>
                </tr>
              </table>

              <div style="margin-top:24px;display:flex;gap:12px;">
                <a href="${approveUrl}" style="flex:1;display:block;text-align:center;background:#16a34a;color:white;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                  ✅ Approve Access
                </a>
                <a href="${rejectUrl}" style="flex:1;display:block;text-align:center;background:#dc2626;color:white;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                  ❌ Reject
                </a>
              </div>
            </div>
          </div>
        `,
      })

      console.log(`NOTIFY: Waitlist application received — ${email}`)
      console.log(`NOTIFY: Waitlist email sent successfully to ${NOTIFY_TO}`)
      return res.status(200).json({ ok: true })
    }

    // ── SUPABASE AUTH WEBHOOK — user signup/login ────────────────────────────
    const eventType = body?.type || 'INSERT'
    const record    = body?.record || {}
    const email     = record?.email || 'unknown'
    const name      = record?.raw_user_meta_data?.full_name
                   || record?.raw_user_meta_data?.name
                   || 'Not provided'
    const userId    = record?.id || 'unknown'
    const eventAt   = record?.last_sign_in_at || record?.created_at || new Date().toISOString()

    const isSignup  = eventType === 'INSERT'

    if (!isSignup) {
      const lastSignIn = new Date(record?.last_sign_in_at || 0).getTime()
      const secondsSinceLogin = (Date.now() - lastSignIn) / 1000
      if (secondsSinceLogin > 10) {
        console.log(`NOTIFY: Skipping duplicate UPDATE — ${secondsSinceLogin.toFixed(0)}s since login`)
        return res.status(200).json({ ok: true, skipped: true })
      }
    }

    // For new signups — generate token, save to waitlist, send Approve/Reject email
    if (isSignup) {
      const token = crypto.randomBytes(32).toString('hex')

      // Save to waitlist table
      await supabaseQuery('waitlist', 'POST', {
        full_name: name,
        email,
        sap_experience: 'unknown',
        sap_module: 'unknown',
        status: 'pending',
        token,
        created_at: new Date().toISOString(),
      }).catch(() => {}) // ignore if already exists

      const approveUrl = `${BASE_URL}/api/Notify?action=approve&email=${encodeURIComponent(email)}&token=${token}`
      const rejectUrl  = `${BASE_URL}/api/Notify?action=reject&email=${encodeURIComponent(email)}&token=${token}`

      const time = new Date(eventAt).toLocaleString('en-DE', {
        timeZone: 'Europe/Berlin',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })

      await sendEmail({
        to: NOTIFY_TO,
        subject: `🎉 New Signup — ${email}`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#f9f9f9;border-radius:14px;overflow:hidden;">
            <div style="background:#111827;padding:18px 24px;">
              <span style="color:white;font-size:20px;font-weight:800;">𝕎 Wani</span>
            </div>
            <div style="padding:24px;">
              <h2 style="margin:0 0 20px;color:#111;font-size:18px;">🎉 New Direct Signup</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;font-size:13px;width:80px;">Name</td>
                  <td style="padding:10px 0;font-weight:600;font-size:14px;">${name}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;font-size:13px;">Email</td>
                  <td style="padding:10px 0;font-weight:600;font-size:14px;">${email}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#888;font-size:13px;">Time</td>
                  <td style="padding:10px 0;font-size:13px;">${time} (Berlin)</td>
                </tr>
              </table>
              <div style="margin-top:24px;display:flex;gap:12px;">
                <a href="${approveUrl}" style="flex:1;display:block;text-align:center;background:#16a34a;color:white;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                  ✅ Approve Access
                </a>
                <a href="${rejectUrl}" style="flex:1;display:block;text-align:center;background:#dc2626;color:white;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                  ❌ Reject
                </a>
              </div>
            </div>
          </div>
        `,
      })

      console.log(`NOTIFY: New signup email with approve/reject sent for ${email}`)
      return res.status(200).json({ ok: true })
    }

    // Login notification — simple email, no approve/reject needed
    const emoji  = '👋'
    const label  = 'User Logged In'

    const time = new Date(eventAt).toLocaleString('en-DE', {
      timeZone: 'Europe/Berlin',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    await sendEmail({
      to: NOTIFY_TO,
      subject: `${emoji} Wani: ${label} — ${email}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#f9f9f9;border-radius:14px;overflow:hidden;">
          <div style="background:#111827;padding:18px 24px;">
            <span style="color:white;font-size:22px;font-weight:800;">𝕎 Wani</span>
          </div>
          <div style="padding:24px;">
            <div style="font-size:22px;margin-bottom:4px;">${emoji}</div>
            <h2 style="margin:0 0 20px;color:#111;font-size:18px;">${label}</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px 0;color:#888;font-size:13px;width:80px;">Name</td>
                <td style="padding:10px 0;font-weight:600;font-size:14px;">${name}</td>
              </tr>
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px 0;color:#888;font-size:13px;">Email</td>
                <td style="padding:10px 0;font-weight:600;font-size:14px;">${email}</td>
              </tr>
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px 0;color:#888;font-size:13px;">Time</td>
                <td style="padding:10px 0;font-size:13px;">${time} (Berlin)</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;font-size:13px;">ID</td>
                <td style="padding:10px 0;font-size:11px;color:#aaa;font-family:monospace;">${userId}</td>
              </tr>
            </table>
          </div>
          <div style="padding:14px 24px;background:#f0f0f0;font-size:11px;color:#aaa;text-align:center;">
            Wani Activity · ask-wani.com
          </div>
        </div>
      `,
    })

    console.log(`NOTIFY: Email sent — ${label} — ${email}`)
    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('NOTIFY ERROR:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
