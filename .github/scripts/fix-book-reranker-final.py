from pathlib import Path
import re

p = Path('api/chat.js')
s = p.read_text()

pat = re.compile(r"        response_format: \{\n          type: 'json_schema',[\s\S]*?        \},\n        messages: \[\{ role: 'user', content: `You are a conservative reranker")
repl = "        response_format: { type: 'json_object' },\n        messages: [{ role: 'user', content: `You are a conservative reranker"
s, n = pat.subn(repl, s, count=1)
if n != 1:
    raise SystemExit(f'Could not replace Groq structured-output block: {n}')

old = """    if (!response.ok) {
      console.log('[BOOK RERANK] Groq HTTP', response.status, '— keeping pgvector candidates')
      return chunks
    }"""
new = """    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      console.log('[BOOK RERANK] Groq HTTP', response.status, errBody.slice(0, 500), '— keeping pgvector candidates')
      return Object.assign(chunks, { _rerankDetails: { status: 'fallback', reason: `Groq HTTP ${response.status}: ${errBody.slice(0, 180)}`, ratings: [], keptIndices: chunks.map((_, i) => i) } })
    }"""
if old not in s:
    raise SystemExit('Groq HTTP fallback block not found')
s = s.replace(old, new, 1)

s = s.replace("|FUNCTION /i.test(question)", "|\\bFUNCTION\\b/i.test(question)")
s = s.replace("|FUNCTION /i.test(m.content || '')", "|\\bFUNCTION\\b/i.test(m.content || '')")

old_dbg = """      '3. BOOK RAG',
      '─────────────────────────────────────────────────────────',
      `Chunks found: ${debugLog.bookChunks || 0}`,
      ...(bookChunks || []).map((c, i) =>
        `[${i+1}] ${c.source_book}, p.${c.page_number}\\n    Title: ${c.lesson_title || 'n/a'}\\n    Content: ${c.content?.slice(0, 300) || ''}`
      ),"""
new_dbg = """      '3. BOOK RAG',
      '─────────────────────────────────────────────────────────',
      `Pgvector candidates retrieved: ${debugLog.bookRerank?.candidates ?? debugLog.bookChunks ?? 0}`,
      `Exact duplicates removed before Groq: ${debugLog.bookRerank?.exactRemoved ?? 0}`,
      `Candidates sent to Groq reranker: ${debugLog.bookRerank?.afterExactDedupe ?? debugLog.bookChunks ?? 0}`,
      `Groq reranker status: ${debugLog.bookRerank?.status || 'not-run'}${debugLog.bookRerank?.reason ? ` (${debugLog.bookRerank.reason})` : ''}`,
      ...((debugLog.bookRerank?.ratings || []).length
        ? ['Groq ratings (5=direct, 4=useful, 3=context, 2=tangential, 1=unrelated):',
           ...debugLog.bookRerank.ratings.map(r => `    [R${r.index+1}] score ${r.score} — ${r.kept ? 'KEPT → SONNET' : (r.duplicateOf != null ? `DROPPED duplicate of R${r.duplicateOf+1}` : 'DROPPED')} — ${r.book}, p.${r.page}${r.title ? ` — ${r.title}` : ''}\\n        ${r.preview || ''}`)]
        : ['Groq ratings: (none — reranker did not run or used fallback)']),
      `Chunks transferred to Sonnet: ${debugLog.bookChunks || 0}`,
      ...(bookChunks || []).map((c, i) =>
        `[${i+1}] ${c.source_book}, p.${c.page_number}\\n    Title: ${c.lesson_title || 'n/a'}\\n    Content: ${c.content?.slice(0, 300) || ''}`
      ),"""
if old_dbg not in s:
    raise SystemExit('Main-path old BOOK RAG debug section not found')
s = s.replace(old_dbg, new_dbg, 1)

marker = """          pipeline: {
            bookChunkDetails: (bookChunks || []).map(c => ({"""
replacement = """          pipeline: {
            bookRerank: debugLog.bookRerank || null,
            bookChunkDetails: (bookChunks || []).map(c => ({"""
if marker not in s:
    raise SystemExit('Admin debug pipeline marker not found')
s = s.replace(marker, replacement, 1)

marker2 = """        pipeline: {
          bookChunkDetails: (bookChunks || []).map(c => ({"""
replacement2 = """        pipeline: {
          bookRerank: debugLog.bookRerank || null,
          bookChunkDetails: (bookChunks || []).map(c => ({"""
if marker2 not in s:
    raise SystemExit('Final sourceInfo pipeline marker not found')
s = s.replace(marker2, replacement2, 1)

p.write_text(s)
