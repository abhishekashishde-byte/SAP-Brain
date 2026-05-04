// api/generate-fs-doc.js
// Converts Wani FS text output → professionally formatted Word document
// Matches the exact style of the client's FS template:
//   Title color:   #17365D  size:52  (Title style)
//   Heading1 color:#365F91  size:28  bold
//   Heading2 color:#4F81BD  size:26  bold
//   Table header:  #365F91  white text
//   Alt row:       #DCE6F1

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, Footer, Header, PageNumber, SimpleField,
} from 'docx'

// ── Colours matching the uploaded FS template ────────────────────────────────
const C = {
  titleText:   '17365D',
  h1Text:      '365F91',
  h2Text:      '4F81BD',
  tableHeader: '365F91',
  tableAlt:    'DCE6F1',
  tableBorder: 'B8CCE4',
  openPoint:   'C0392B',  // red for ⚠️ NOT DISCUSSED items
  body:        '000000',
}

const FONT = 'Calibri'

// ── Helpers ──────────────────────────────────────────────────────────────────
function border(color = C.tableBorder) {
  const b = { style: BorderStyle.SINGLE, size: 1, color }
  return { top: b, bottom: b, left: b, right: b }
}

const cm = { top: 80, bottom: 80, left: 120, right: 120 }

function title(text) {
  return new Paragraph({
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text, font: FONT, size: 52, color: C.titleText, bold: false })]
  })
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 120 },
    shading: { fill: 'EBF1F7', type: ShadingType.CLEAR },
    children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: C.h1Text })]
  })
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, font: FONT, size: 22, color: C.body, ...opts })]
  })
}

function bodyBold(text) {
  return body(text, { bold: true })
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: FONT, size: 22 })]
  })
}

function numbered(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: FONT, size: 22 })]
  })
}

function spacer() {
  return new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun('')] })
}

function openPoint(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, font: FONT, size: 22, color: C.openPoint, bold: true })]
  })
}

function makeTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0)
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      // Header row
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          borders: border(),
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: C.tableHeader, type: ShadingType.CLEAR },
          margins: cm,
          children: [new Paragraph({
            children: [new TextRun({ text: h, font: FONT, size: 20, bold: true, color: 'FFFFFF' })]
          })]
        }))
      }),
      // Data rows
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => {
          const isOpenPoint = String(cell).startsWith('⚠️')
          return new TableCell({
            borders: border(),
            width: { size: colWidths[ci], type: WidthType.DXA },
            shading: { fill: ri % 2 === 0 ? 'FFFFFF' : C.tableAlt, type: ShadingType.CLEAR },
            margins: cm,
            children: [new Paragraph({
              children: [new TextRun({
                text: String(cell || ''),
                font: FONT, size: 20,
                color: isOpenPoint ? C.openPoint : C.body,
                bold: isOpenPoint,
              })]
            })]
          })
        })
      }))
    ]
  })
}

// ── Parse the FS text output from the model ──────────────────────────────────
function parseFS(fsText) {
  const lines = fsText.replace(/WANI_FS_COMPLETE[\s\S]*$/, '').split('\n')
  const sections = {}
  let currentSection = null
  let buffer = []

  // Extract document header
  const header = {}
  const headerFields = ['FS_TITLE','FS_MODULE','FS_TYPE','FS_VERSION','FS_STATUS','FS_DATE','FS_AUTHOR']
  for (const line of lines) {
    for (const field of headerFields) {
      if (line.startsWith(`${field}:`)) {
        header[field] = line.replace(`${field}:`, '').trim()
      }
    }
  }

  // Extract sections
  for (const line of lines) {
    const sectionMatch = line.match(/^---SECTION (\d+): (.+)---$/)
    if (sectionMatch) {
      if (currentSection) sections[currentSection] = buffer.join('\n').trim()
      currentSection = sectionMatch[2].trim()
      buffer = []
    } else if (currentSection) {
      buffer.push(line)
    }
  }
  if (currentSection) sections[currentSection] = buffer.join('\n').trim()

  return { header, sections }
}

// ── Parse a markdown table from section text ─────────────────────────────────
function parseTable(text) {
  const lines = text.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 2) return null
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  const rows = lines.slice(2).map(l => l.split('|').map(c => c.trim()).filter(Boolean))
  return { headers, rows }
}

// ── Parse bullet points ───────────────────────────────────────────────────────
function parseBullets(text) {
  return text.split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
}

// ── Parse numbered steps ──────────────────────────────────────────────────────
function parseSteps(text) {
  return text.split('\n')
    .filter(l => /^Step \d+:|^\d+\./.test(l.trim()) || l.trim())
    .map(l => l.trim())
    .filter(Boolean)
}

// ── Build section content into docx elements ─────────────────────────────────
function buildSection(title_text, content, tableColWidths) {
  const elements = [h1(title_text), spacer()]
  if (!content || !content.trim()) {
    elements.push(openPoint('⚠️ NOT DISCUSSED — clarify with business before finalising'))
    elements.push(spacer())
    return elements
  }

  // Check if content is primarily a table
  if (content.includes('| ') || content.includes('|')) {
    const parsed = parseTable(content)
    if (parsed && parsed.headers.length > 0) {
      // Auto-distribute column widths if not provided
      const widths = tableColWidths || Array(parsed.headers.length).fill(
        Math.floor(8640 / parsed.headers.length)
      )
      elements.push(makeTable(parsed.headers, parsed.rows, widths))
      elements.push(spacer())
      return elements
    }
  }

  // Check if content has numbered steps
  if (/^Step \d+:/m.test(content)) {
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('⚠️')) {
        elements.push(openPoint(trimmed))
      } else if (/^Step \d+:/.test(trimmed)) {
        elements.push(body(trimmed, { bold: true }))
      } else if (/^(IF|ELSE|THEN|Green =|Yellow =|Red =)/i.test(trimmed)) {
        elements.push(body('  ' + trimmed, { italics: true, color: C.h1Text }))
      } else {
        elements.push(body('  ' + trimmed))
      }
    }
    elements.push(spacer())
    return elements
  }

  // Bullet points
  if (/^[-•*] /m.test(content)) {
    for (const line of parseBullets(content)) {
      if (line.startsWith('⚠️')) {
        elements.push(openPoint(line))
      } else {
        elements.push(bullet(line))
      }
    }
    elements.push(spacer())
    return elements
  }

  // Plain paragraph(s)
  for (const para of content.split('\n\n')) {
    const trimmed = para.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('⚠️')) {
      elements.push(openPoint(trimmed))
    } else {
      elements.push(body(trimmed))
    }
  }
  elements.push(spacer())
  return elements
}

// ── Main document builder ─────────────────────────────────────────────────────
function buildFSDocument(fsText) {
  const { header, sections } = parseFS(fsText)

  const today = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
  const fsTitle = header.FS_TITLE || 'Functional Specification'
  const fsModule = header.FS_MODULE || ''
  const fsType = header.FS_TYPE || 'Z-Program'

  const children = [
    // ── TITLE BLOCK ──────────────────────────────────────────────────────────
    title('Functional Specification (FS)'),
    title(fsTitle),
    spacer(),

    // ── DOCUMENT INFO TABLE ──────────────────────────────────────────────────
    makeTable(
      ['Field', 'Value'],
      [
        ['Module', fsModule],
        ['Type', fsType],
        ['Version', header.FS_VERSION || '1.0'],
        ['Status', header.FS_STATUS || 'Draft'],
        ['Date', header.FS_DATE || today],
        ['Prepared by', header.FS_AUTHOR || 'Wani AI'],
      ],
      [2800, 5800]
    ),
    spacer(),
    spacer(),

    // ── SECTIONS ─────────────────────────────────────────────────────────────
    ...buildSection('1. Business Background & Requirement',
      sections['BUSINESS BACKGROUND & REQUIREMENT']),

    ...buildSection('2. Purpose of the Program/Report',
      sections['PURPOSE OF THE PROGRAM/REPORT']),

    ...buildSection('3. Relevance',
      sections['RELEVANCE']),

    ...buildSection('4. Advantages',
      sections['ADVANTAGES']),
  ]

  // Section 5 — Input (table)
  children.push(...buildSection('5. Input (Selection Screen)',
    sections['INPUT (SELECTION SCREEN)'],
    [2200, 1600, 1400, 1800, 1600]  // Field Label | SAP Field | Table | Type | Default
  ))

  // Section 6 — Output (table)
  children.push(...buildSection('6. Output (ALV Report Columns)',
    sections['OUTPUT (ALV REPORT COLUMNS)'],
    [2200, 1600, 1800, 3000]  // Column Header | SAP Field | Source Table | Description
  ))

  // Section 7 — Data Source (table)
  children.push(...buildSection('7. Data Source (Tables & Fields)',
    sections['DATA SOURCE (TABLES & FIELDS)'],
    [1400, 2200, 2200, 2800]  // Table | Description | Key Fields | Purpose
  ))

  // Section 8 — Table Linking Logic (table)
  children.push(...buildSection('8. Table Linking Logic',
    sections['TABLE LINKING LOGIC'],
    [1600, 1600, 1600, 1600, 1000, 1200]  // From | From Field | To | To Field | Join | Notes
  ))

  // Section 9 — Logic (steps)
  children.push(...buildSection('9. Program Logic (Step by Step)',
    sections['PROGRAM LOGIC (STEP BY STEP)']))

  // Section 10 — Error Handling (table)
  children.push(...buildSection('10. Error Handling & Edge Cases',
    sections['ERROR HANDLING & EDGE CASES'],
    [2800, 2800, 3000]  // Scenario | What Happens | Message
  ))

  // Section 11 — Authorization (table)
  children.push(...buildSection('11. Authorization',
    sections['AUTHORIZATION'],
    [2200, 1600, 2000, 2800]  // Auth Object | Field | Value | Purpose
  ))

  // Section 12 — Performance
  children.push(...buildSection('12. Performance Considerations',
    sections['PERFORMANCE CONSIDERATIONS']))

  // Section 13 — Test Scenarios (table)
  children.push(...buildSection('13. Test Scenarios',
    sections['TEST SCENARIOS'],
    [400, 1800, 1800, 2200, 2000, 800]  // # | Scenario | Test Data | Steps | Expected | P/F
  ))

  // Section 14 — Open Points (table)
  children.push(...buildSection('14. Open Points & Risks',
    sections['OPEN POINTS & RISKS'],
    [400, 1800, 2200, 1200, 1200, 800]  // # | Topic | Question | Impact | Owner | Status
  ))

  // Section 15 — Assumptions
  children.push(...buildSection('15. Assumptions',
    sections['ASSUMPTIONS']))

  // Section 16 — Out of Scope
  children.push(...buildSection('16. Out of Scope',
    sections['OUT OF SCOPE']))

  // Section 17 — Change Log (table)
  children.push(...buildSection('17. Change Log',
    sections['CHANGE LOG'],
    [1200, 1600, 1800, 4000]  // Version | Date | Changed By | Description
  ))

  // ── FOOTER NOTE ──────────────────────────────────────────────────────────
  children.push(spacer())
  children.push(new Paragraph({
    spacing: { before: 200 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.h1Text, space: 1 } },
    children: [new TextRun({
      text: 'Generated by Wani — SAP AI Assistant  |  ask-wani.com  |  Review all sections marked ⚠️ before client submission.',
      font: FONT, size: 18, color: '888888', italics: true,
    })]
  }))

  return new Document({
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
        },
        {
          reference: 'numbers',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
        }
      ]
    },
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: FONT, color: C.h1Text },
          paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: FONT, color: C.h2Text },
          paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.h1Text, space: 1 } },
            spacing: { before: 0, after: 80 },
            children: [
              new TextRun({ text: `Functional Specification  |  ${fsTitle}  |  ${fsModule}`, font: FONT, size: 18, color: '888888' }),
            ]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC', space: 1 } },
            spacing: { before: 80 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${fsTitle}  |  Version ${header.FS_VERSION || '1.0'}  |  Status: ${header.FS_STATUS || 'Draft'}  |  Page `, font: FONT, size: 18, color: '888888' }),
            ]
          })]
        })
      },
      children,
    }]
  })
}

// ── Vercel handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { fsText, fileName } = req.body
  if (!fsText?.trim()) return res.status(400).json({ error: 'fsText is required' })

  try {
    const doc = buildFSDocument(fsText)
    const buffer = await Packer.toBuffer(doc)
    const safeName = (fileName || 'Wani_FS').replace(/[^a-zA-Z0-9_-]/g, '_')

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`)
    res.setHeader('Content-Length', buffer.length)
    res.status(200).send(buffer)
  } catch (err) {
    console.error('FS Doc generation error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
