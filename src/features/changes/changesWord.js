// Word documents for a change: the functional specification and the test document.
// Built in the browser with the docx library (A4, Calibri, real Word tables and lists).

const FONT = 'Calibri'
const PAGE_DXA = 11906 - 2 * 1134 // A4 width minus 2 cm margins
const strip = s => String(s ?? '').replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
const today = () => new Date().toLocaleDateString('de-DE')
const safe = s => String(s || 'Change').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60)

async function kit() {
  const d = await import('docx')
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat } = d
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC5CE' }
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }
  // Inline: `code` in Consolas, **bold** in bold.
  const runs = (text, base = {}) => String(text ?? '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map(part =>
    part.startsWith('`') && part.endsWith('`') ? new TextRun({ text: part.slice(1, -1), font: 'Consolas', size: (base.size || 22) - 2, ...base, bold: base.bold })
      : part.startsWith('**') && part.endsWith('**') ? new TextRun({ text: part.slice(2, -2), font: FONT, size: 22, ...base, bold: true })
        : new TextRun({ text: part, font: FONT, size: 22, ...base }))
  const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: runs(text, opts.run) })
  const h = (text, level = 1) => new Paragraph({ heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, spacing: { before: level === 1 ? 320 : 220, after: 120 }, keepNext: true,
    children: [new TextRun({ text, font: FONT, bold: true, size: level === 1 ? 28 : 24, color: level === 1 ? '1F3A5F' : '2F5F8F' })] })
  const cell = (content, { head = false, width, fill } = {}) => new TableCell({
    width: width ? { size: Math.round(PAGE_DXA * width / 100), type: WidthType.DXA } : undefined,
    shading: head || fill ? { type: ShadingType.CLEAR, color: 'auto', fill: head ? 'E8EDF3' : fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: (Array.isArray(content) ? content : String(content ?? '').split('\n')).map(line =>
      line instanceof Paragraph ? line : new Paragraph({ spacing: { after: 40 }, children: runs(line, { size: 20, bold: head }) })),
  })
  const table = (head, rows, widths) => new Table({
    width: { size: PAGE_DXA, type: WidthType.DXA }, borders,
    columnWidths: widths.map(w => Math.round(PAGE_DXA * w / 100)),
    rows: [
      ...(head ? [new TableRow({ tableHeader: true, cantSplit: true, children: head.map((x, i) => cell(x, { head: true, width: widths[i] })) })] : []),
      ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((x, i) => (x && x.__cell) ? x.__cell : cell(x, { width: widths[i] })) })),
    ],
  })
  // Body text from Wani: paragraphs, "- " bullets, "1. " steps, "| a | b |" tables, "⚠ Open:" lines.
  const body = text => {
    const out = []
    const lines = String(text || '').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (/^\s*\|.*\|\s*$/.test(l)) {
        const rows = []
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim())
          if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells)
          i++
        }
        i--
        const n = Math.max(...rows.map(r => r.length))
        const norm = rows.map(r => [...r, ...Array(n - r.length).fill('')])
        out.push(table(norm[0], norm.slice(1), Array(n).fill(100 / n)), new Paragraph({ spacing: { after: 80 }, children: [] }))
      } else if (/^\s*[-•*]\s+/.test(l)) out.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: runs(l.replace(/^\s*[-•*]\s+/, '')) }))
      else if (/^\s*\d+[.)]\s+/.test(l)) out.push(new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { after: 60 }, children: runs(l.replace(/^\s*\d+[.)]\s+/, '')) }))
      else if (/^\s*⚠/.test(l)) out.push(p(l.trim(), { run: { color: 'B42318', bold: true } }))
      else if (l.trim()) out.push(p(l))
    }
    return out
  }
  const numbering = { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
  ] }
  return { d, p, h, cell, table, body, runs, numbering }
}

async function save(doc, d, name) {
  const blob = await d.Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name + '.docx'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function frame(d, numbering, headerText, children) {
  const { Document, Header, Footer, Paragraph, TextRun, AlignmentType, PageNumber } = d
  return new Document({
    numbering,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: headerText, font: FONT, size: 16, color: '808080' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '808080' })] })] }) },
      children,
    }],
  })
}

const titleBlock = ({ d, runs }, kind, ch) => [
  new d.Paragraph({ spacing: { after: 60 }, children: [new d.TextRun({ text: kind, font: FONT, size: 22, color: '5B6B7F', bold: true, allCaps: true })] }),
  new d.Paragraph({ spacing: { after: 240 }, children: runs(strip(ch.title), { size: 40, bold: true, color: '1F3A5F' }) }),
]

export async function downloadFsDocx(ch) {
  const k = await kit()
  const fs = ch.fs || {}
  const sections = fs.sections || []
  const children = [
    ...titleBlock(k, 'Functional specification', ch),
    k.table(null, [
      ['Change no.', String(ch.number)], ['Title', strip(ch.title)], ['Module', ch.module || ''], ['Customer ticket / CR', ch.ticket_ref || ''],
      ['Solution type', fs.meta?.solution_type || ch.standard?.design?.solution_type || ''], ['Version', fs.version || '0.1'], ['Date', today()], ['Status', 'Draft'],
    ].map(([a, b]) => [{ __cell: k.cell(a, { width: 30, fill: 'F4F6F9' }) }, b]), [30, 70]),
    new k.d.Paragraph({ spacing: { after: 200 }, children: [] }),
  ]
  sections.forEach((s, i) => children.push(k.h(`${i + 1}. ${strip(s.title)}`), ...k.body(s.body)))
  children.push(k.h(`${sections.length + 1}. Approval`), k.table(['Role', 'Name', 'Date', 'Signature'],
    [['Business owner', '', '', ''], ['Functional consultant', '', '', ''], ['Developer', '', '', '']], [28, 28, 18, 26]))
  await save(frame(k.d, k.numbering, `FS ${ch.number} · ${strip(ch.title)}`, children), k.d, `FS_${ch.number}_${safe(ch.title)}`)
}

const RESULT_FILL = { pass: 'E3F4E8', fail: 'FBE4E4', blocked: 'FFF3D6' }
export async function downloadTestDocx(ch) {
  const k = await kit()
  const t = ch.tests || {}
  const cases = t.cases || []
  const count = r => cases.filter(c => (c.result || 'not run') === r).length
  const children = [
    ...titleBlock(k, 'Test document', ch),
    k.table(null, [
      ['Change no.', String(ch.number)], ['Title', strip(ch.title)], ['Module', ch.module || ''], ['Customer ticket / CR', ch.ticket_ref || ''],
      ['FS version', ch.fs?.version || ''], ['Date', today()],
      ['Result', `${cases.length} test cases · ${count('pass')} passed · ${count('fail')} failed · ${count('blocked')} blocked · ${count('not run')} not run`],
    ].map(([a, b]) => [{ __cell: k.cell(a, { width: 30, fill: 'F4F6F9' }) }, b]), [30, 70]),
  ]
  if (ch.code_check?.verdict) children.push(k.h('1. Code check against the FS'), k.p(`Verdict: ${ch.code_check.verdict}. ${ch.code_check.summary || ''}`),
    ...(ch.code_check.coverage?.length ? [k.table(['FS requirement', 'Status', 'Note'], ch.code_check.coverage.map(r => [r.requirement, r.status, [r.where, r.note].filter(Boolean).join(' — ')]), [50, 15, 35])] : []))
  const n = ch.code_check?.verdict ? 2 : 1
  if (t.regression_scope?.length) children.push(k.h(`${n}. Regression scope`), k.table(['Area', 'Why it could be affected', 'What was retested'], t.regression_scope.map(r => [r.area, r.why, r.retest]), [25, 40, 35]))
  const m = n + (t.regression_scope?.length ? 1 : 0)
  children.push(k.h(`${m}. Test cases`))
  for (const c of cases) {
    const res = c.result || 'not run'
    children.push(k.h(`${c.id} — ${strip(c.title)}`, 2), k.table(null, [
      ['Type', c.type || ''], ['Preconditions', c.preconditions || ''],
      ['Steps', (c.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')], ['Expected result', c.expected || ''],
      ...(c.data ? [['Test data', c.data]] : []),
      ['Result', { __cell: k.cell(res.toUpperCase(), { width: 75, fill: RESULT_FILL[res] }) }], ['Remarks / evidence', c.remarks || ''],
    ].map(([a, b]) => [{ __cell: k.cell(a, { width: 25, fill: 'F4F6F9' }) }, b]), [25, 75]))
  }
  children.push(k.h(`${m + 1}. Sign-off`), k.table(['Role', 'Name', 'Date', 'Signature'],
    [['Tester', '', '', ''], ['Functional consultant', '', '', ''], ['Business owner', '', '', '']], [28, 28, 18, 26]))
  await save(frame(k.d, k.numbering, `Test document ${ch.number} · ${strip(ch.title)}`, children), k.d, `Test_${ch.number}_${safe(ch.title)}`)
}
