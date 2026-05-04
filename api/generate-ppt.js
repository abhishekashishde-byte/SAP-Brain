// api/generate-ppt.js
// Converts Wani WORKSHOP_PPT text output → professional PowerPoint file
// Design: Midnight Executive palette — navy/ice blue, clean, professional
// Audience: Business users / Maintenance technicians / Production staff

import PptxGenJS from 'pptxgenjs'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  // Midnight Executive palette
  navy:       '1E2761',  // Primary dark — backgrounds, headers
  iceBlue:    'CADCFC',  // Secondary — accents, highlights
  white:      'FFFFFF',
  offWhite:   'F4F7FF',  // Slide backgrounds
  midBlue:    '3D5A99',  // Sub-headers, dividers
  lightBlue:  'E8EEFF',  // Card backgrounds, alt rows
  accent:     '4F8EF7',  // Bullet dots, icon circles
  muted:      '8899BB',  // Footnotes, SAP references
  dark:       '1A1A2E',  // Body text
  placeholder:'C8D8F8',  // Image placeholder background
  placeholderText: '3D5A99', // Image placeholder text

  // Fonts
  fontHead:   'Calibri',
  fontBody:   'Calibri',

  // Slide dimensions (LAYOUT_16x9 = 10" × 5.625")
  W: 10,
  H: 5.625,
}

// ── Parse slide text from model output ───────────────────────────────────────
function parseSlides(pptText) {
  const slides = []
  const slideBlocks = pptText.split(/---SLIDE \d+---/).filter(b => b.trim())

  for (const block of slideBlocks) {
    const slide = {
      number: 0,
      title: '',
      layout: 'CONTENT',
      bullets: [],
      imagePlaceholder: '',
      sapReference: '',
      speakerNote: '',
    }

    for (const line of block.split('\n')) {
      const t = line.trim()
      if (t.startsWith('TITLE:'))            slide.title           = t.replace('TITLE:', '').trim()
      else if (t.startsWith('LAYOUT:'))      slide.layout          = t.replace('LAYOUT:', '').trim()
      else if (t.startsWith('IMAGE_PLACEHOLDER:')) slide.imagePlaceholder = t.replace('IMAGE_PLACEHOLDER:', '').trim()
      else if (t.startsWith('SAP_REFERENCE:'))     slide.sapReference    = t.replace('SAP_REFERENCE:', '').trim()
      else if (t.startsWith('SPEAKER_NOTE:'))      slide.speakerNote     = t.replace('SPEAKER_NOTE:', '').trim()
      else if (t.startsWith('•') || t.startsWith('-')) {
        const bullet = t.replace(/^[•\-]\s*/, '').trim()
        if (bullet) slide.bullets.push(bullet)
      }
      else if (t.startsWith('BULLETS:')) { /* section marker, skip */ }
    }

    if (slide.title || slide.bullets.length > 0) slides.push(slide)
  }

  return slides
}

// ── Extract title from pptText header ────────────────────────────────────────
function extractPresentationTitle(pptText) {
  const lines = pptText.split('\n')
  for (const line of lines) {
    if (line.includes('Workshop') || line.includes('workshop')) {
      return line.replace(/[*#_]/g, '').trim().slice(0, 80)
    }
  }
  return 'SAP Workshop'
}

// ── Slide builders ────────────────────────────────────────────────────────────

function buildTitleSlide(pres, slide) {
  const s = pres.addSlide()
  s.background = { color: D.navy }

  // Large navy backdrop shape for bottom strip
  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 4.5, w: D.W, h: 1.125,
    fill: { color: '151C4A' }, line: { color: '151C4A' }
  })

  // Accent bar left
  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: D.H,
    fill: { color: D.iceBlue }, line: { color: D.iceBlue }
  })

  // Title
  s.addText(slide.title || 'SAP Workshop', {
    x: 0.5, y: 1.2, w: 9, h: 1.6,
    fontSize: 38, fontFace: D.fontHead,
    color: D.white, bold: true,
    align: 'left', valign: 'middle',
    margin: 0,
  })

  // Subtitle from bullets[0] if present
  if (slide.bullets[0]) {
    s.addText(slide.bullets[0], {
      x: 0.5, y: 2.9, w: 8, h: 0.5,
      fontSize: 18, fontFace: D.fontBody,
      color: D.iceBlue, align: 'left', margin: 0,
    })
  }

  // Bottom strip text
  s.addText('Prepared with Wani — SAP AI Assistant', {
    x: 0.5, y: 4.55, w: 9, h: 0.4,
    fontSize: 11, fontFace: D.fontBody,
    color: D.iceBlue, align: 'left', margin: 0,
  })

  // Date placeholder
  s.addText('[DATE]', {
    x: 7.5, y: 4.55, w: 2, h: 0.4,
    fontSize: 11, fontFace: D.fontBody,
    color: D.muted, align: 'right', margin: 0,
  })

  if (slide.speakerNote) s.addNotes(slide.speakerNote)
  return s
}

function buildSectionBreak(pres, slide) {
  const s = pres.addSlide()
  s.background = { color: D.midBlue }

  // Accent shape
  s.addShape(pres.ShapeType.rect, {
    x: 0.5, y: 2.2, w: 0.12, h: 1.2,
    fill: { color: D.iceBlue }, line: { color: D.iceBlue }
  })

  s.addText(slide.title, {
    x: 0.85, y: 2.0, w: 8.5, h: 1.6,
    fontSize: 34, fontFace: D.fontHead,
    color: D.white, bold: true,
    align: 'left', valign: 'middle', margin: 0,
  })

  if (slide.bullets[0]) {
    s.addText(slide.bullets[0], {
      x: 0.85, y: 3.7, w: 8.5, h: 0.5,
      fontSize: 16, fontFace: D.fontBody,
      color: D.iceBlue, align: 'left', margin: 0,
    })
  }

  if (slide.speakerNote) s.addNotes(slide.speakerNote)
  return s
}

function buildContentSlide(pres, slide, withImage = true) {
  const s = pres.addSlide()
  s.background = { color: D.offWhite }

  // Top navy header bar
  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: D.W, h: 0.85,
    fill: { color: D.navy }, line: { color: D.navy }
  })

  // Accent dot in header
  s.addShape(pres.ShapeType.ellipse, {
    x: 0.28, y: 0.2, w: 0.45, h: 0.45,
    fill: { color: D.iceBlue }, line: { color: D.iceBlue }
  })

  // Slide title in header
  s.addText(slide.title, {
    x: 0.85, y: 0.05, w: 8.8, h: 0.75,
    fontSize: 22, fontFace: D.fontHead,
    color: D.white, bold: true,
    align: 'left', valign: 'middle', margin: 0,
  })

  if (withImage && slide.imagePlaceholder) {
    // Two-column layout: bullets left, image placeholder right
    const bulletW = 4.8
    const imgX = 5.2
    const imgW = 4.5
    const imgY = 1.05
    const imgH = 3.5

    // Bullets
    if (slide.bullets.length > 0) {
      const bulletItems = slide.bullets.slice(0, 3).map((b, i) => ({
        text: b,
        options: {
          bullet: i < slide.bullets.length - 1 ? { indent: 15 } : { indent: 15 },
          breakLine: i < slide.bullets.length - 1,
          fontSize: 15,
          fontFace: D.fontBody,
          color: D.dark,
          paraSpaceAfter: 10,
        }
      }))

      s.addText(bulletItems, {
        x: 0.4, y: 1.05, w: bulletW, h: 3.6,
        valign: 'top', margin: [8, 0, 0, 0],
      })
    }

    // Image placeholder box
    s.addShape(pres.ShapeType.rect, {
      x: imgX, y: imgY, w: imgW, h: imgH,
      fill: { color: D.placeholder }, line: { color: D.iceBlue, width: 1.5 }
    })

    // Camera icon placeholder
    s.addText('📸', {
      x: imgX, y: imgY + 0.6, w: imgW, h: 0.6,
      fontSize: 28, align: 'center', margin: 0,
    })

    // Placeholder instruction text
    const placeholderLabel = slide.imagePlaceholder
      .replace('📸 INSERT SCREENSHOT:', '').replace('📸', '').trim()
    s.addText(placeholderLabel || 'Insert screenshot here', {
      x: imgX + 0.15, y: imgY + 1.3, w: imgW - 0.3, h: 1.8,
      fontSize: 11, fontFace: D.fontBody,
      color: D.placeholderText, align: 'center',
      valign: 'top', italic: true,
      wrap: true, margin: 0,
    })

    s.addText('[ INSERT SCREENSHOT ]', {
      x: imgX, y: imgY + imgH - 0.55, w: imgW, h: 0.45,
      fontSize: 10, fontFace: D.fontBody,
      color: D.white, align: 'center', bold: true,
      fill: { color: D.accent }, margin: 0,
    })

  } else {
    // Full-width bullets only
    if (slide.bullets.length > 0) {
      const bulletItems = slide.bullets.slice(0, 3).map((b, i) => ({
        text: b,
        options: {
          bullet: { indent: 15 },
          breakLine: i < slide.bullets.length - 1,
          fontSize: 17,
          fontFace: D.fontBody,
          color: D.dark,
          paraSpaceAfter: 14,
        }
      }))

      s.addText(bulletItems, {
        x: 0.6, y: 1.1, w: 8.8, h: 4.1,
        valign: 'top', margin: [10, 0, 0, 0],
      })
    }
  }

  // SAP reference footnote
  if (slide.sapReference) {
    s.addShape(pres.ShapeType.rect, {
      x: 0, y: 5.25, w: D.W, h: 0.375,
      fill: { color: D.lightBlue }, line: { color: D.iceBlue, width: 0.5 }
    })
    s.addText(`SAP Reference: ${slide.sapReference}`, {
      x: 0.4, y: 5.27, w: 9.2, h: 0.33,
      fontSize: 10, fontFace: D.fontBody,
      color: D.muted, align: 'left',
      italic: true, margin: 0,
    })
  }

  if (slide.speakerNote) s.addNotes(slide.speakerNote)
  return s
}

function buildTableSlide(pres, slide) {
  const s = pres.addSlide()
  s.background = { color: D.offWhite }

  // Header bar
  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: D.W, h: 0.85,
    fill: { color: D.navy }, line: { color: D.navy }
  })
  s.addShape(pres.ShapeType.ellipse, {
    x: 0.28, y: 0.2, w: 0.45, h: 0.45,
    fill: { color: D.iceBlue }, line: { color: D.iceBlue }
  })
  s.addText(slide.title, {
    x: 0.85, y: 0.05, w: 8.8, h: 0.75,
    fontSize: 22, fontFace: D.fontHead,
    color: D.white, bold: true,
    align: 'left', valign: 'middle', margin: 0,
  })

  // Build table from bullets — each bullet is a row
  if (slide.bullets.length > 0) {
    const tableRows = [
      // Header row
      [{ text: 'Item', options: { bold: true, fill: { color: D.navy }, color: D.white, fontSize: 13 } },
       { text: 'Details', options: { bold: true, fill: { color: D.navy }, color: D.white, fontSize: 13 } }]
    ]
    slide.bullets.forEach((b, i) => {
      // Try to split on : or —
      const parts = b.split(/[:—–]/)
      const left = parts[0]?.trim() || b
      const right = parts.slice(1).join(':').trim() || ''
      tableRows.push([
        { text: left, options: { fontSize: 13, fill: { color: i % 2 === 0 ? D.white : D.lightBlue }, color: D.dark } },
        { text: right, options: { fontSize: 13, fill: { color: i % 2 === 0 ? D.white : D.lightBlue }, color: D.dark } }
      ])
    })

    s.addTable(tableRows, {
      x: 0.5, y: 1.0, w: 9, h: Math.min(4.2, 0.5 + tableRows.length * 0.55),
      border: { pt: 0.5, color: D.iceBlue },
      colW: [3.5, 5.5],
    })
  }

  if (slide.sapReference) {
    s.addShape(pres.ShapeType.rect, {
      x: 0, y: 5.25, w: D.W, h: 0.375,
      fill: { color: D.lightBlue }, line: { color: D.iceBlue, width: 0.5 }
    })
    s.addText(`SAP Reference: ${slide.sapReference}`, {
      x: 0.4, y: 5.27, w: 9.2, h: 0.33,
      fontSize: 10, fontFace: D.fontBody,
      color: D.muted, align: 'left', italic: true, margin: 0,
    })
  }

  if (slide.speakerNote) s.addNotes(slide.speakerNote)
  return s
}

function buildClosingSlide(pres, slide) {
  const s = pres.addSlide()
  s.background = { color: D.navy }

  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: D.H,
    fill: { color: D.iceBlue }, line: { color: D.iceBlue }
  })

  s.addText(slide.title, {
    x: 0.5, y: 1.4, w: 9, h: 1.0,
    fontSize: 32, fontFace: D.fontHead,
    color: D.white, bold: true,
    align: 'left', margin: 0,
  })

  if (slide.bullets.length > 0) {
    const bulletItems = slide.bullets.map((b, i) => ({
      text: b,
      options: {
        bullet: { indent: 15 },
        breakLine: i < slide.bullets.length - 1,
        fontSize: 16,
        fontFace: D.fontBody,
        color: D.iceBlue,
        paraSpaceAfter: 8,
      }
    }))
    s.addText(bulletItems, {
      x: 0.5, y: 2.5, w: 9, h: 2.5,
      valign: 'top', margin: 0,
    })
  }

  s.addText('ask-wani.com', {
    x: 7.5, y: 5.1, w: 2.2, h: 0.35,
    fontSize: 10, fontFace: D.fontBody,
    color: D.muted, align: 'right', margin: 0,
  })

  if (slide.speakerNote) s.addNotes(slide.speakerNote)
  return s
}

// ── Main builder ──────────────────────────────────────────────────────────────
async function buildPPT(pptText, presTitle) {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.author = 'Wani — SAP AI Assistant'
  pres.title = presTitle || 'SAP Workshop'
  pres.subject = 'SAP Workshop Presentation'

  const slides = parseSlides(pptText)

  for (const slide of slides) {
    const layout = slide.layout?.toUpperCase()

    if (layout === 'TITLE_SLIDE') {
      buildTitleSlide(pres, slide)
    } else if (layout === 'SECTION_BREAK') {
      buildSectionBreak(pres, slide)
    } else if (layout === 'TABLE') {
      buildTableSlide(pres, slide)
    } else if (layout === 'CONTENT_WITH_IMAGE' || (slide.imagePlaceholder && layout !== 'CONTENT')) {
      buildContentSlide(pres, slide, true)
    } else if (layout === 'CONTENT') {
      // If has image placeholder, show it; otherwise full-width
      buildContentSlide(pres, slide, !!slide.imagePlaceholder)
    } else {
      // Default — use image if placeholder present
      buildContentSlide(pres, slide, !!slide.imagePlaceholder)
    }
  }

  // Add a final "Thank You" slide if last slide isn't already closing
  const lastSlide = slides[slides.length - 1]
  if (lastSlide && !['TITLE_SLIDE', 'SECTION_BREAK'].includes(lastSlide.layout)) {
    buildClosingSlide(pres, {
      title: 'Thank You',
      bullets: ['Questions & Discussion', '[Contact Name]', '[Go-Live Date: TBD]'],
      speakerNote: 'Open floor for questions. Confirm next steps and action owners.',
    })
  }

  return pres.write({ outputType: 'nodebuffer' })
}

// ── Vercel handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { pptText, fileName } = req.body
  if (!pptText?.trim()) return res.status(400).json({ error: 'pptText is required' })

  try {
    const presTitle = extractPresentationTitle(pptText)
    const buffer = await buildPPT(pptText, presTitle)
    const safeName = (fileName || 'Wani_Workshop').replace(/[^a-zA-Z0-9_\-]/g, '_')

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pptx"`)
    res.setHeader('Content-Length', buffer.length)
    res.status(200).send(buffer)
  } catch (err) {
    console.error('PPT generation error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
