// Reference search is temporarily disabled because the previous file contained
// two merged default handlers and could not compile. Keep this route closed
// until a single, source-validated implementation is restored.

import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireJsonBody(req, res, 20_000)) return

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  return res.status(503).json({
    error: 'Reference search is temporarily unavailable while citation validation is being rebuilt',
  })
}
