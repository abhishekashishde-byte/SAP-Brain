// api/notify.js — replaces gemini.js (dead file)
// Supabase webhook → email notification to Abhishek
// Events: new user signup (INSERT) + user login (UPDATE) on auth.users
//
// Vercel env vars needed:
//   NOTIFY_GMAIL_USER       = abhishek.ashish.de@gmail.com
//   NOTIFY_GMAIL_PASS       = ovqgdtkequpxbzou
//   NOTIFY_TO               = abhishek.ashish.de@gmail.com
//   SUPABASE_WEBHOOK_SECRET = wani-notify-2026  (or any string you choose)

import nodemailer from 'nodemailer'

export const config = { maxDuration: 10 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Block unauthorized calls
  const secret = req.headers['x-webhook-secret']
  if (process.env.SUPABASE_WEBHOOK_SECRET && secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    console.warn('NOTIFY: Unauthorized call blocked')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const body      = req.body
    const eventType = body?.type || 'INSERT'
    const record    = body?.record || {}

    const email  = record?.email || 'unknown'
    const name   = record?.raw_user_meta_data?.full_name
                || record?.raw_user_meta_data?.name
                || 'Not provided'
    const userId = record?.id || 'unknown'
    const eventAt = record?.last_sign_in_at || record?.created_at || new Date().toISOString()

    const isSignup = eventType === 'INSERT'
    const emoji    = isSignup ? '🎉' : '👋'
    const label    = isSignup ? 'New User Signed Up' : 'User Logged In'

    console.log(`NOTIFY: ${emoji} ${label} — ${email}`)

    const time = new Date(eventAt).toLocaleString('en-DE', {
      timeZone: 'Europe/Berlin',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const html = `
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
    `

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.NOTIFY_GMAIL_USER,
        pass: process.env.NOTIFY_GMAIL_PASS,
      },
    })

    await transporter.sendMail({
      from: `"Wani" <${process.env.NOTIFY_GMAIL_USER}>`,
      to: process.env.NOTIFY_TO,
      subject: `${emoji} Wani: ${label} — ${email}`,
      html,
    })

    console.log(`NOTIFY: Email sent — ${email}`)
    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('NOTIFY ERROR:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
