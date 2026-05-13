// api/categorise.js — AI topic detection with clean title generation

const MODULES = {
  "PP – Production Planning": [
    "Production Orders","Production Versions","Bill of Materials",
    "Routings & Work Centers","MRP & Planning","Demand Management",
    "Capacity Planning","Goods Issue / Confirmation",
  ],
  "PM – Plant Maintenance": [
    "Maintenance Orders","Maintenance Plans","Functional Locations",
    "Equipment Master","Notifications","Refurbishment Orders","Person Responsible",
  ],
  "MM – Materials Management": [
    "Purchase Orders","Goods Receipt","Stock Transfer","Subcontracting",
    "Inventory Management","Batch Management","MRP Areas",
    "Vendor Master","Info Records","Source Lists","Scheduling Agreements",
  ],
  "SD – Sales & Distribution": [
    "Sales Orders","Quotations & Inquiries","Pricing & Conditions",
    "Delivery & Shipping","Billing & Invoicing","Credit Management",
    "Customer Master","Sales Configuration","Output & Forms","Rebates & Settlements",
  ],
  "FI – Financial Accounting": [
    "General Ledger","Accounts Payable","Accounts Receivable",
    "Asset Accounting","Bank Accounting","Year-End Closing",
    "Document Posting","Tax Configuration","Dunning","Payment Runs",
  ],
  "CO – Controlling": [
    "Cost Centers","Internal Orders","Profit Centers","Product Costing",
    "Profitability Analysis","Overhead Management","Settlement & Allocation",
    "Budget Planning","Variance Analysis","Activity Types",
  ],
  "QM – Quality Management": [
    "Inspection Plans","Quality Notifications","Usage Decision",
    "Control Charts","Certificates","Quality in Procurement","Quality in Production",
  ],
  "CS – Customer Service": [
    "Service Orders","Service Notifications","Repairs Processing",
    "Warranties","Service Contracts","Field Service",
  ],
  "PS – Project System": [
    "WBS Elements","Networks & Activities","Project Planning",
    "Project Budgeting","Project Settlement","Milestones",
  ],
  "HR – Human Resources": [
    "Personnel Administration","Organisational Management","Payroll",
    "Time Management","Recruitment","Training & Events","Travel Management",
  ],
  "Fiori / UX": [
    "Fiori Apps Overview","Launchpad Config","App Authorizations","Custom Tiles","Fiori vs GUI",
  ],
  "S/4HANA General": [
    "Table Lookups","BAdIs & User Exits","SPRO Configuration",
    "Error Messages","Z-Programs","Migration Topics",
  ],

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { message } = req.body
  if (!message) return res.status(400).json({ error: 'No message' })

  const prompt = `You are an SAP expert. Analyse this SAP question and return a JSON object.

Question: "${message}"

Rules for the title:
- Write a clean, descriptive topic title (4-6 words max)
- DO NOT include transaction codes (like IW31, CO01, ME21N etc.) in the title
- DO NOT include T-code names — focus on the SAP concept or process
- Examples of good titles: "Maintenance Order Settlement", "Production Version Selection", "BAdI vs User Exit", "MRP Planning Run"
- Examples of bad titles: "IW31 Work Order", "CO01 Production Order Creation", "ME21N Purchase Order"

Available modules and topics:
${JSON.stringify(MODULES)}

Respond ONLY with valid JSON, no other text:
{"module":"PM – Plant Maintenance","topic":"Maintenance Orders","title":"Maintenance Order Creation Process"}`

  try {
    // Use Groq for categorisation — it's fast and free, accuracy is fine for classification
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      }),
    })
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''

    // Clean JSON — sometimes model adds backticks
    const cleaned = text.replace(/```json|```/g, '').trim()

    try {
      const parsed = JSON.parse(cleaned)
      // Validate module exists
      if (!MODULES[parsed.module]) {
        parsed.module = 'S/4HANA General'
        parsed.topic = 'SPRO Configuration'
      }
      // Validate topic exists in module
      if (!MODULES[parsed.module]?.includes(parsed.topic)) {
        parsed.topic = MODULES[parsed.module][0]
      }
      // Ensure title has no T-codes (strip 4-char uppercase+digit patterns)
      if (parsed.title) {
        parsed.title = parsed.title.replace(/\b[A-Z]{2,4}\d{2,3}N?\b/g, '').replace(/\s+/g, ' ').trim()
      }
      return res.status(200).json(parsed)
    } catch {
      return res.status(200).json({
        module: 'S/4HANA General',
        topic: 'SPRO Configuration',
        title: message.slice(0, 40).replace(/\b[A-Z]{2,4}\d{2,3}N?\b/g, '').trim()
      })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
