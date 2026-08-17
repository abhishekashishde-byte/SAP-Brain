// api/categorise.js — AI topic detection with clean title generation

import { requireApprovedUser, requireJsonBody, sendAuthError } from './_auth.js'

const MODULES = {
  "PP – Production Planning": ["Production Orders","Production Versions","Bill of Materials","Routings & Work Centers","MRP & Planning","Demand Management","Capacity Planning","Goods Issue / Confirmation"],
  "PM – Plant Maintenance": ["Maintenance Orders","Maintenance Plans","Functional Locations","Equipment Master","Notifications","Refurbishment Orders","Person Responsible"],
  "MM – Materials Management": ["Purchase Orders","Goods Receipt","Stock Transfer","Subcontracting","Inventory Management","Batch Management","MRP Areas","Vendor Master","Info Records","Source Lists","Scheduling Agreements"],
  "SD – Sales & Distribution": ["Sales Orders","Quotations & Inquiries","Pricing & Conditions","Delivery & Shipping","Billing & Invoicing","Credit Management","Customer Master","Sales Configuration","Output & Forms","Rebates & Settlements"],
  "FI – Financial Accounting": ["General Ledger","Accounts Payable","Accounts Receivable","Asset Accounting","Bank Accounting","Year-End Closing","Document Posting","Tax Configuration","Dunning","Payment Runs"],
  "CO – Controlling": ["Cost Centers","Internal Orders","Profit Centers","Product Costing","Profitability Analysis","Overhead Management","Settlement & Allocation","Budget Planning","Variance Analysis","Activity Types"],
  "QM – Quality Management": ["Inspection Plans","Quality Notifications","Usage Decision","Control Charts","Certificates","Quality in Procurement","Quality in Production"],
  "CS – Customer Service": ["Service Orders","Service Notifications","Repairs Processing","Warranties","Service Contracts","Field Service"],
  "PS – Project System": ["WBS Elements","Networks & Activities","Project Planning","Project Budgeting","Project Settlement","Milestones"],
  "HR – Human Resources": ["Personnel Administration","Organisational Management","Payroll","Time Management","Recruitment","Training & Events","Travel Management"],
  "Fiori / UX": ["Fiori Apps Overview","Launchpad Config","App Authorizations","Custom Tiles","Fiori vs GUI"],
  "S/4HANA General": ["Table Lookups","BAdIs & User Exits","SPRO Configuration","Error Messages","Z-Programs","Migration Topics"],
}

function fallback(message) {
  return { module: 'S/4HANA General', topic: 'SPRO Configuration', title: message.slice(0, 40).replace(/\b[A-Z]{2,4}\d{2,3}N?\b/g, '').trim() || 'SAP Question' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireJsonBody(req, res, 30_000)) return
  const auth = await requireApprovedUser(req)
  if (!auth.ok) return sendAuthError(res, auth)

  const { message, answer } = req.body
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'No message' })
  if (message.length > 8_000 || (answer != null && (typeof answer !== 'string' || answer.length > 16_000))) return res.status(400).json({ error: 'Content is too long' })

  const prompt = `You are an SAP expert. Analyse this SAP question${answer ? ' and the answer given' : ''} and return a JSON object.\n\nQuestion: "${message}"\n${answer ? `\nAnswer given:\n"${answer}"\n` : ''}\nRules for the title:\n- Write a clean, descriptive topic title (4-6 words max)\n- DO NOT include transaction codes in the title\nAvailable modules and topics:\n${JSON.stringify(MODULES)}\nRespond ONLY with valid JSON:\n{"module":"PM – Plant Maintenance","topic":"Maintenance Orders","title":"Maintenance Order Creation Process"}`

  try {
    // The previous hard-coded Groq model can return provider 404 when retired/unavailable.
    // Try current models in order; categorisation is non-critical, so never turn this into a 503 for the UI.
    const models = [process.env.GROQ_CATEGORISE_MODEL, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'].filter(Boolean)
    let data = null
    for (const model of [...new Set(models)]) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model, max_tokens: 100, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
      })
      if (response.ok) { data = await response.json(); break }
      console.error('[categorise] Provider request failed:', response.status, 'model:', model)
      if (![400, 404, 410, 422].includes(response.status)) break
    }
    if (!data) return res.status(200).json(fallback(message))

    const text = data.choices?.[0]?.message?.content?.trim() || ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      if (!MODULES[parsed.module]) { parsed.module = 'S/4HANA General'; parsed.topic = 'SPRO Configuration' }
      if (!MODULES[parsed.module]?.includes(parsed.topic)) parsed.topic = MODULES[parsed.module][0]
      if (parsed.title) parsed.title = String(parsed.title).replace(/\b[A-Z]{2,4}\d{2,3}N?\b/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
      return res.status(200).json(parsed)
    } catch { return res.status(200).json(fallback(message)) }
  } catch (error) {
    console.error('[categorise] Error:', error.message)
    return res.status(200).json(fallback(message))
  }
}
