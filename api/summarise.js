import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireJsonBody(req, res, 150_000)) return

  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const { messages, module: mod, topic } = req.body
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    return res.status(400).json({ error: 'Invalid messages' })
  }

  const safeMessages = messages
    .filter(message => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map(message => ({ role: message.role, content: message.content.trim().slice(0, 4_000) }))
    .filter(message => message.content)

  if (safeMessages.length === 0) return res.status(400).json({ error: 'Invalid messages' })

  const conversation = safeMessages
    .map(message => `${message.role === 'user' ? 'Consultant' : 'Wani'}: ${message.content}`)
    .join('\n\n')

  const safeModule = typeof mod === 'string' ? mod.slice(0, 100) : 'SAP'
  const safeTopic = typeof topic === 'string' ? topic.slice(0, 200) : 'conversation'
  const prompt = `Create a concise technical summary of this SAP ${safeModule} / ${safeTopic} conversation.
Keep important transaction codes, table names, configuration decisions, conclusions, and open questions.
Format it as structured bullet points.

Conversation:
${conversation}

Technical Summary:`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return res.status(502).json({ error: 'Summary provider failed' })
    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content?.trim() || ''
    return res.status(200).json({ summary: summary || null })
  } catch (error) {
    console.error('[summarise] error:', error.message)
    return res.status(500).json({ error: 'Unable to create summary' })
  }
}
