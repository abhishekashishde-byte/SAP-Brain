// Program map for large pasted programs.
// The first time a big program is pasted, the answer model reads all of it. On later
// turns the program is replaced by a map (its blocks with line ranges and the SAP
// objects each block uses) plus the exact sections the planner chose for the current
// question, with real line numbers. Splitting code into blocks is plain parsing; which
// blocks matter is decided by the planner (model judgement).

export const LARGE_PROGRAM_CHARS = 20_000
const CODE_RE = /\[ATTACHED_CODE(?:\s+lang=(\S+))?[^\]]*\]\n?([\s\S]*?)\n?\[\/ATTACHED_CODE\]/

// Block openers/closers for ABAP (the common case) plus a generic fallback.
const BLOCKS = [
  { kind: 'FORM', open: /^\s*FORM\s+([\w/]+)/i, close: /^\s*ENDFORM\b/i },
  { kind: 'METHOD', open: /^\s*METHOD\s+([\w~/]+)/i, close: /^\s*ENDMETHOD\b/i },
  { kind: 'FUNCTION', open: /^\s*FUNCTION\s+([\w/]+)/i, close: /^\s*ENDFUNCTION\b/i },
  { kind: 'MODULE', open: /^\s*MODULE\s+([\w/]+)/i, close: /^\s*ENDMODULE\b/i },
  { kind: 'CLASS', open: /^\s*CLASS\s+([\w/]+)\s+DEFINITION/i, close: /^\s*ENDCLASS\b/i },
]
const EVENT = /^\s*(START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|AT SELECTION-SCREEN[^.]*|TOP-OF-PAGE|LOAD-OF-PROGRAM)\s*\./i

function objectsIn(lines) {
  const text = lines.join('\n')
  const found = new Set()
  const add = (re, fmt) => { for (const m of text.matchAll(re)) found.add(fmt(m)) }
  add(/\bFROM\s+([A-Z][\w/]{2,29})\b/gi, m => m[1].toUpperCase())
  add(/\b(?:UPDATE|INSERT|MODIFY|DELETE\s+FROM)\s+([A-Z][\w/]{2,29})\b/gi, m => m[1].toUpperCase())
  add(/CALL\s+FUNCTION\s+'([\w/]+)'/gi, m => m[1].toUpperCase())
  add(/\b(BAPI_[\w]+)/gi, m => m[1].toUpperCase())
  add(/CALL\s+METHOD\s+([\w=>~\-/]+)/gi, m => m[1])
  add(/GET\s+BADI\s+\w+\s*(?:FILTERS[^.]*)?/gi, m => m[0].trim())
  return [...found].filter(o => !/^(TABLE|INTO|THE|TO|OF)$/i.test(o)).slice(0, 12)
}

export function mapProgram(code) {
  const lines = String(code).split('\n')
  const blocks = []
  let open = null
  lines.forEach((line, i) => {
    if (open) {
      if (open.def.close.test(line)) { blocks.push({ ...open.block, end: i + 1 }); open = null }
      return
    }
    for (const def of BLOCKS) {
      const m = line.match(def.open)
      if (m) { open = { def, block: { kind: def.kind, name: m[1], start: i + 1 } }; return }
    }
    const e = line.match(EVENT)
    if (e) blocks.push({ kind: 'EVENT', name: e[1].toUpperCase(), start: i + 1, end: i + 1 })
  })
  if (open) blocks.push({ ...open.block, end: lines.length })
  // Events run until the next block or event.
  blocks.sort((a, b) => a.start - b.start)
  blocks.forEach((b, i) => { if (b.kind === 'EVENT') b.end = (blocks[i + 1]?.start || lines.length + 1) - 1 })
  // Header (declarations, selection screen) before the first block.
  const first = blocks[0]?.start || lines.length + 1
  if (first > 1) blocks.unshift({ kind: 'HEADER', name: 'declarations / selection screen', start: 1, end: first - 1 })
  // Programs that don't parse into blocks: fixed windows so they can still be selected.
  if (blocks.length <= 1 && lines.length > 300) {
    blocks.length = 0
    for (let s = 1; s <= lines.length; s += 200) blocks.push({ kind: 'LINES', name: `lines ${s}-${Math.min(s + 199, lines.length)}`, start: s, end: Math.min(s + 199, lines.length) })
  }
  for (const b of blocks) b.objects = objectsIn(lines.slice(b.start - 1, b.end))
  const nameMatch = String(code).match(/^\s*(?:REPORT|PROGRAM|FUNCTION-POOL|CLASS-POOL|CLASS)\s+([\w/]+)/im)
  return { name: nameMatch?.[1] || 'program', lineCount: lines.length, blocks, lines }
}

export function renderMap(p, id) {
  return `PROGRAM P${id}: ${p.name} (${p.lineCount} lines)\n` + p.blocks.map(b =>
    `  ${b.kind} ${b.name} — lines ${b.start}-${b.end}${b.objects.length ? ` — uses ${b.objects.join(', ')}` : ''}`).join('\n')
}

// Finds large programs pasted in earlier user messages (not the newest one,
// which the model reads in full).
export function findLargePrograms(allMessages) {
  const out = []
  const lastUser = allMessages.map(m => m.role).lastIndexOf('user')
  allMessages.forEach((m, i) => {
    if (m.role !== 'user' || i === lastUser) return
    const c = String(m.content || '').match(CODE_RE)
    if (c && c[2].length >= LARGE_PROGRAM_CHARS) out.push({ msgIndex: i, lang: c[1] || 'code', ...mapProgram(c[2]) })
  })
  return out
}

const numbered = (lines, start, end) => lines.slice(start - 1, end).map((l, k) => `${String(start + k).padStart(5)}  ${l}`).join('\n')

// Replaces each large earlier program with its map plus the chosen sections.
// sections: [{program: <id starting at 1>, start, end}] chosen by the planner.
export function applyProgramMaps(allMessages, programs, sections, maxLines = 900) {
  if (!programs.length) return allMessages
  const byProgram = new Map()
  let budget = maxLines
  for (const s of Array.isArray(sections) ? sections : []) {
    const p = programs[(Number(s.program) || 1) - 1]
    if (!p) continue
    const start = Math.max(1, Math.floor(Number(s.start) || 1))
    const end = Math.min(p.lineCount, Math.floor(Number(s.end) || start), start + budget - 1)
    if (end < start || budget <= 0) continue
    budget -= end - start + 1
    if (!byProgram.has(p.msgIndex)) byProgram.set(p.msgIndex, [])
    byProgram.get(p.msgIndex).push([start, end])
  }
  return allMessages.map((m, i) => {
    const pIdx = programs.findIndex(p => p.msgIndex === i)
    if (pIdx < 0) return m
    const p = programs[pIdx]
    const ranges = (byProgram.get(i) || []).sort((a, b) => a[0] - b[0])
    const shown = ranges.length
      ? ranges.map(([s, e]) => `--- lines ${s}-${e} ---\n${numbered(p.lines, s, e)}`).join('\n')
      : '(no sections selected for this question — ask the consultant or name the block you need)'
    const replacement = `[LARGE PROGRAM — the full ${p.lineCount}-line program was pasted earlier and read in full then. To keep cost down, only its map and the sections relevant to the current question are shown here. Line numbers are real. Do not guess code that is not shown; if you need another block, say which one.]\n${renderMap(p, pIdx + 1)}\n\nRELEVANT SECTIONS:\n${shown}`
    return { ...m, content: String(m.content).replace(CODE_RE, () => `[ATTACHED_CODE lang=${p.lang}]\n${replacement}\n[/ATTACHED_CODE]`) }
  })
}
