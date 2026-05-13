export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { messages, module: mod, topic } = req.body

  const conversation = messages
    .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content}`)
    .join('\n\n')

  const prompt = `Create a concise technical summary of this SAP ${mod} / ${topic} conversation.
Keep all important: transaction codes, table names, config steps, conclusions, and open questions.
Format as structured bullet points a consultant can reference quickly.

Conversation:
${conversation}

Technical Summary:`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      }),
    })
    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content?.trim() || ''
    if (!summary) return res.status(200).json({ summary: null })
    return res.status(200).json({ summary })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
