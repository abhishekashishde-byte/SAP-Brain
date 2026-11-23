// Implementation status report (.docx).
// Narrative (summary, discussed, decisions, open points, risks, what is left) comes
// from Wani; the figures (coverage per area, open to-dos) come straight from the
// captured data so they are always exact.
import { gather } from './exports.js'
import { discoveryCatalog } from './catalog.js'
import { getAreaTitle } from './i18n.js'

const T = {
  en: {
    report: 'Implementation status report', customer: 'Customer', project: 'Project', date: 'Report date', consultant: 'Consultant',
    sessions: 'Sessions so far', legacy: 'Legacy system', summary: 'Summary', status: 'Overall status',
    on_track: 'On track', attention: 'Needs attention', at_risk: 'At risk', coverage: 'Progress by area',
    area: 'Area', fields: 'Fields', questions: 'Questions', decisions: 'Decisions', done: 'Done',
    discussed: 'What has been discussed', decisionsTaken: 'Decisions taken', decision: 'Decision',
    open: 'Open points', point: 'Point', owner: 'Owner', due: 'Due', none: 'No open points.',
    todos: 'Open action items', action: 'Action', risks: 'Risks', risk: 'Risk', mitigation: 'Mitigation',
    left: 'Overview — what is still left', audience: { client: 'Customer version', internal: 'Internal version' },
  },
  de: {
    report: 'Statusbericht Implementierung', customer: 'Kunde', project: 'Projekt', date: 'Berichtsdatum', consultant: 'Berater',
    sessions: 'Bisherige Termine', legacy: 'Altsystem', summary: 'Zusammenfassung', status: 'Gesamtstatus',
    on_track: 'Im Plan', attention: 'Aufmerksamkeit erforderlich', at_risk: 'Gefährdet', coverage: 'Fortschritt nach Bereich',
    area: 'Bereich', fields: 'Felder', questions: 'Fragen', decisions: 'Entscheidungen', done: 'Erledigt',
    discussed: 'Was bisher besprochen wurde', decisionsTaken: 'Getroffene Entscheidungen', decision: 'Entscheidung',
    open: 'Offene Punkte', point: 'Punkt', owner: 'Verantwortlich', due: 'Fällig', none: 'Keine offenen Punkte.',
    todos: 'Offene Aufgaben', action: 'Aufgabe', risks: 'Risiken', risk: 'Risiko', mitigation: 'Maßnahme',
    left: 'Überblick – was noch offen ist', audience: { client: 'Kundenversion', internal: 'Interne Version' },
  },
}

// Coverage per area from the same dataset the Excel export uses.
export function coverageByArea(workshop, entries, todos, audience, extras, language = 'en') {
  const { rows } = gather(workshop, entries, todos, audience, extras)
  const localized = Object.fromEntries(discoveryCatalog.areas.map(a => [a.title, getAreaTitle(a, language)]))
  const byArea = new Map()
  for (const [area, , type, total, completed] of rows.Coverage.slice(1)) {
    const a = byArea.get(area) || { area, fields: [0, 0], questions: [0, 0], decisions: [0, 0] }
    const key = type === 'Fields' ? 'fields' : type === 'Questions' ? 'questions' : 'decisions'
    a[key][0] += Number(completed) || 0; a[key][1] += Number(total) || 0
    byArea.set(area, a)
  }
  return [...byArea.values()].map(a => ({ ...a, area: localized[a.area] || a.area }))
}

export async function downloadStatusReport({ workshop, report, coverage, todos, sessions, audience, language }) {
  const d = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType } = d
  const t = T[language === 'de' ? 'de' : 'en']
  const FONT = 'Calibri'
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D4D4D8' }
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }
  const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: [new TextRun({ text: String(text ?? ''), font: FONT, size: 22, ...(opts.run || {}) })] })
  const h = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ heading: level, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, font: FONT, bold: true, size: level === HeadingLevel.HEADING_1 ? 28 : 24, color: '111111' })] })
  const bullet = text => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: String(text ?? ''), font: FONT, size: 22 })] })
  const PAGE_DXA = 11906 - 2 * 1134 // A4 width minus margins, in twentieths of a point
  const cell = (text, { head = false, width } = {}) => new TableCell({
    width: width ? { size: Math.round(PAGE_DXA * width / 100), type: WidthType.DXA } : undefined,
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F4F5' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), font: FONT, size: 20, bold: head })] })],
  })
  const table = (head, rows, widths) => new Table({
    width: { size: PAGE_DXA, type: WidthType.DXA }, borders,
    columnWidths: (widths || (head || rows[0] || []).map(() => 100 / (head || rows[0] || [1]).length)).map(w => Math.round(PAGE_DXA * w / 100)),
    rows: [...(head ? [new TableRow({ tableHeader: true, children: head.map((x, i) => cell(x, { head: true, width: widths?.[i] })) })] : []),
      ...rows.map(r => new TableRow({ children: r.map((x, i) => cell(x, { width: widths?.[i] })) }))],
  })
  const pct = ([done, total]) => total ? `${done}/${total} (${Math.round(done / total * 100)}%)` : '–'
  const locale = language === 'de' ? 'de-DE' : 'en-GB'
  const fmt = v => { if (!v) return ''; const dt = new Date(String(v).length <= 10 ? v + 'T12:00:00' : v); return isNaN(dt) ? String(v) : dt.toLocaleDateString(locale) }
  const today = fmt(new Date().toISOString())
  const statusLabel = t[report.overall_status] || ''

  const meta = [
    [t.customer, workshop.client_name], [t.project, workshop.project_name], [t.consultant, workshop.consultant_name],
    [t.legacy, workshop.legacy_system], [t.date, today],
    [t.sessions, (sessions || []).map(s => fmt(s.date)).filter(Boolean).join(', ')],
  ].filter(([, v]) => v)

  const children = [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: t.audience[audience] || '', font: FONT, size: 18, color: '71717A' })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: report.title || t.report, font: FONT, size: 40, bold: true })] }),
    table(null, meta, [28, 72]),
    h(t.summary),
    new Paragraph({ spacing: { after: 120 }, children: [
      new TextRun({ text: `${t.status}: `, font: FONT, size: 22, bold: true }),
      new TextRun({ text: statusLabel, font: FONT, size: 22, bold: true, color: report.overall_status === 'at_risk' ? 'B91C1C' : report.overall_status === 'attention' ? 'B45309' : '15803D' }),
      new TextRun({ text: report.status_reason ? ` — ${report.status_reason}` : '', font: FONT, size: 22 }),
    ] }),
    p(report.executive_summary),
  ]

  if (coverage?.length) {
    children.push(h(t.coverage), table([t.area, t.fields, t.questions, t.decisions],
      coverage.map(c => [c.area, pct(c.fields), pct(c.questions), pct(c.decisions)]), [34, 22, 22, 22]))
  }
  if (report.discussed?.length) {
    children.push(h(t.discussed))
    for (const x of report.discussed) {
      children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: x.area, font: FONT, size: 22, bold: true })] }), p(x.summary))
    }
  }
  if (report.decisions?.length) {
    children.push(h(t.decisionsTaken), table([t.area, t.decision], report.decisions.map(x => [x.area, x.decision]), [28, 72]))
  }
  children.push(h(t.open))
  if (report.open_points?.length) {
    children.push(table([t.area, t.point, t.owner, t.due], report.open_points.map(x => [x.area, x.point, x.owner, x.due]), [20, 50, 16, 14]))
  } else children.push(p(t.none))
  const openTodos = (todos || []).filter(x => !x.done)
  if (openTodos.length) {
    children.push(h(t.todos, HeadingLevel.HEADING_2), table([t.action, t.owner, t.due], openTodos.map(x => [x.text, x.owner || '', fmt(x.due_date)]), [60, 22, 18]))
  }
  if (report.risks?.length) {
    children.push(h(t.risks), table([t.risk, t.mitigation], report.risks.map(x => [x.risk, x.mitigation]), [55, 45]))
  }
  if (report.remaining_overview?.length) {
    children.push(h(t.left))
    for (const x of report.remaining_overview) children.push(bullet(x))
  }

  const doc = new Document({
    creator: 'Wani', title: report.title || t.report,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  })
  const blob = await Packer.toBlob(doc)
  const safe = s => String(s || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')
  const name = `${safe(workshop.client_name) || 'Customer'}_${language === 'de' ? 'Statusbericht' : 'Status_report'}_${new Date().toISOString().slice(0, 10)}.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
