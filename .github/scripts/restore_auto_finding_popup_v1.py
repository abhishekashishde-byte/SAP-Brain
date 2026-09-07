from pathlib import Path

chat_path = Path('api/chat.js')
brain_path = Path('src/pages/Brain.jsx')
chat = chat_path.read_text()
brain = brain_path.read_text()

old = '''async function suggestFinding(messages, module) {
  try {
    const conversation = messages.slice(-10).filter(m => m.role && m.content)
      .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 400)}`).join('\\n')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', max_tokens: 300, temperature: 0,
        messages: [{ role: 'user', content: `Scan this SAP conversation for ONE finding worth saving.\\nReturn JSON: {"found":true,"module":"PM","topic":"Migration","object":"MKAL","finding":"specific fact","confidence":"verified"}\\nOr: {"found":false}\\n\\nConversation:\\n${conversation}` }]
      })
    })
    const data = await res.json()
    return JSON.parse(data.choices?.[0]?.message?.content?.replace(/```json|```/g, '').trim() || '{}')
  } catch { return { found: false } }
}
'''

new = '''async function suggestFinding(messages, module) {
  try {
    const conversation = messages.slice(-10).filter(m => m.role && m.content)
      .map(m => `${m.role === 'user' ? 'Consultant' : 'Wani'}: ${m.content.slice(0, 700)}`).join('\\n')

    // This is only a SUGGESTION for the consultant to approve/edit — it never saves
    // automatically. Prefer a reliable structured extractor here so the popup does not
    // silently disappear because a classifier returned prose around the JSON.
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 260,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: `You are deciding whether an SAP consultant conversation has produced ONE useful understanding worth offering to save to Wani's consultant knowledge base.

Return exactly one JSON object.

Use found=true when the conversation contains a specific reusable SAP fact, resolved behavior, implementation decision, gotcha, confirmed distinction, or a correction that materially improves future answers. A consultant correcting Wani and establishing the right behavior is especially worth suggesting.

Use found=false for greetings, unresolved speculation, generic explanations with no reusable insight, or when the latest exchange did not establish anything new.

IMPORTANT:
- This is only a popup suggestion. The consultant will explicitly approve/edit before anything is saved.
- Do not invent a fact. The finding must be directly supported by the conversation.
- Keep finding to one clear standalone sentence.
- Prefer the supplied module when sensible: ${module || 'unknown'}.
- topic should be 1-4 words; object should be the most specific SAP object/app/T-code/table/process mentioned.
- confidence is "verified" only when the consultant explicitly confirmed/corrected it or the exchange clearly established it; otherwise use "candidate".

Shape when found:
{"found":true,"module":"PM","topic":"Fiori Apps","object":"W0017","finding":"specific reusable fact","confidence":"verified"}

Otherwise:
{"found":false}

Conversation:
${conversation}`
        }]
      })
    })

    if (!res.ok) {
      console.error('[SUGGEST FINDING] OpenAI HTTP', res.status)
      return { found: false }
    }
    const data = await res.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content?.trim() || '{}')
    if (parsed?.found !== true || !parsed?.finding || String(parsed.finding).trim().length < 12) return { found: false }
    return {
      found: true,
      module: parsed.module || module || 'SAP',
      topic: parsed.topic || 'Consultant Finding',
      object: parsed.object || 'SAP',
      finding: String(parsed.finding).trim(),
      confidence: parsed.confidence === 'verified' ? 'verified' : 'candidate',
    }
  } catch (e) {
    console.error('[SUGGEST FINDING] Exception:', e.message)
    return { found: false }
  }
}
'''

if old not in chat:
    raise SystemExit('suggestFinding block not found')
chat = chat.replace(old, new, 1)

old_brain = '''  const checkForFindings = async (msgs) => {
    if (msgs.length < 4) return
    try {
'''
new_brain = '''  const checkForFindings = async (msgs) => {
    // A complete first Q&A already has two messages and can establish a valuable
    // consultant insight. Waiting for four messages made the automatic save-understanding
    // popup appear to be broken in short but meaningful conversations.
    if (msgs.length < 2) return
    try {
'''
if old_brain not in brain:
    raise SystemExit('checkForFindings guard not found')
brain = brain.replace(old_brain, new_brain, 1)

chat_path.write_text(chat)
brain_path.write_text(brain)
