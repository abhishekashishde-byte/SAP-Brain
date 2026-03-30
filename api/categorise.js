const MODULES = {
  "PP – Production Planning": ["Production Orders","Production Versions","Bill of Materials","Routings & Work Centers","MRP & Planning","Demand Management","Capacity Planning","Goods Issue / Confirmation"],
  "PM – Plant Maintenance": ["Maintenance Orders","Maintenance Plans","Functional Locations","Equipment Master","Notifications","Refurbishment Orders","Person Responsible"],
  "MM – Logistics": ["Purchase Orders","Goods Receipt","Stock Transfer","Subcontracting","Inventory Management","Batch Management","MRP Areas"],
  "Fiori / UX": ["Fiori Apps Overview","Launchpad Config","App Authorizations","Custom Tiles","Fiori vs GUI"],
  "S/4HANA General": ["Table Lookups","BAdIs & User Exits","SPRO Configuration","Error Messages","Z-Programs","Migration Topics"],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { message } = req.body
  if (!message) return res.status(400).json({ error: 'No message' })

  const prompt = `You are an SAP expert. Categorize this SAP question into the best module and topic.

Question: "${message}"

Available categories:
${JSON.stringify(MODULES)}

Respond ONLY with valid JSON, no other text:
{"module":"PP – Production Planning","topic":"Production Orders","title":"Short 4-6 word title"}`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 80,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      }),
    })
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    try {
      return res.status(200).json(JSON.parse(text))
    } catch {
      return res.status(200).json({ module: 'S/4HANA General', topic: 'SPRO Configuration', title: message.slice(0, 40) })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
