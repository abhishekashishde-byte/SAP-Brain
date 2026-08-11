from pathlib import Path
import re

p = Path('api/chat.js')
s = p.read_text()

start = s.find('async function rerankBookChunksWithGroq(question, chunks) {')
end_marker = '\n// ── 7. BOOK RAG'
end = s.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit(f'rerank function bounds not found start={start} end={end}')

new_func = r'''async function rerankBookChunksWithMini(question, chunks) {
  if (!Array.isArray(chunks) || chunks.length <= 1 || !process.env.OPENAI_API_KEY) return chunks || []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const compact = chunks.map((c, i) => {
      const title = c.title || c.book_title || c.doc_name || c.source || 'Unknown book'
      const page = c.page || c.page_number || c.page_num || ''
      const body = getBookChunkText(c).slice(0, 1200)
      return `CHUNK ${i}\nBOOK: ${title}\nPAGE: ${page}\nTEXT: ${body}`
    }).join('\n\n')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: `You are a conservative reranker for SAP book excerpts. The user's exact question is:\n\n${question}\n\nFor each chunk, score ONLY how directly useful the excerpt is for answering that exact question. Do not judge whether SAP facts are true and do not add outside knowledge.\n\n5 = directly answers the exact question or contains a decisive fact\n4 = clearly same SAP object/process and materially useful\n3 = related context but not enough to answer\n2 = same broad module but mostly tangential\n1 = unrelated to the actual question\n\nSet duplicate_of to another chunk index ONLY when this chunk repeats essentially the same useful factual content and contributes no meaningful extra condition, exception, scope, app/t-code, or outcome. Similar topic is NOT a duplicate.\n\nReturn ONLY valid JSON in exactly this shape: {"ratings":[{"index":0,"score":5,"duplicate_of":null}]}\nReturn one ratings item for EVERY chunk index from 0 through ${chunks.length - 1}.\n\n${compact}` }]
      })
    })
    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      console.log('[BOOK RERANK MINI] OpenAI HTTP', response.status, errBody.slice(0, 500), '— keeping pgvector candidates')
      return Object.assign(chunks, { _rerankDetails: { status: 'fallback', reason: `OpenAI mini HTTP ${response.status}: ${errBody.slice(0, 180)}`, ratings: [], keptIndices: chunks.map((_, i) => i) } })
    }
    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const ratings = Array.isArray(parsed.ratings) ? parsed.ratings : []
    if (!ratings.length) {
      return Object.assign(chunks, { _rerankDetails: { status: 'fallback', reason: 'OpenAI mini returned no ratings', ratings: [], keptIndices: chunks.map((_, i) => i) } })
    }

    const valid = new Map()
    for (const r of ratings) {
      const index = Number(r.index), score = Number(r.score)
      const duplicateOf = r.duplicate_of == null ? null : Number(r.duplicate_of)
      if (Number.isInteger(index) && index >= 0 && index < chunks.length && Number.isFinite(score) && score >= 1 && score <= 5) {
        valid.set(index, { score, duplicateOf: Number.isInteger(duplicateOf) ? duplicateOf : null })
      }
    }
    if (!valid.size) {
      return Object.assign(chunks, { _rerankDetails: { status: 'fallback', reason: 'OpenAI mini ratings failed validation', ratings: [], keptIndices: chunks.map((_, i) => i) } })
    }

    const ranked = chunks.map((chunk, index) => ({ chunk, index, ...(valid.get(index) || { score: 1, duplicateOf: null }) }))
      .filter(item => !(item.duplicateOf != null && item.duplicateOf >= 0 && item.duplicateOf < chunks.length))
      .sort((a, b) => b.score - a.score || a.index - b.index)

    let kept = ranked.filter(item => item.score >= 4).slice(0, 4)
    if (!kept.length && ranked[0]?.score === 3) kept = [ranked[0]]
    const selected = kept.map(item => item.chunk)
    const ratingsForDebug = chunks.map((chunk, index) => {
      const r = valid.get(index) || { score: 1, duplicateOf: null }
      return {
        index,
        score: r.score,
        duplicateOf: r.duplicateOf,
        kept: kept.some(k => k.index === index),
        book: chunk?.source_book || chunk?.book_title || chunk?.source || 'Unknown book',
        page: chunk?.page_number || chunk?.page || chunk?.page_num || '',
        title: chunk?.lesson_title || chunk?.title || '',
        preview: getBookChunkText(chunk).slice(0, 180),
      }
    })
    console.log('[BOOK RERANK MINI]', JSON.stringify({ candidates: chunks.length, ratings: ratingsForDebug, kept: kept.map(r => r.index) }))
    return Object.assign(selected, { _rerankDetails: { status: 'applied', model: 'gpt-4o-mini', ratings: ratingsForDebug, keptIndices: kept.map(r => r.index) } })
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message
    console.log('[BOOK RERANK MINI] skipped:', reason, '— keeping pgvector candidates')
    return Object.assign(chunks, { _rerankDetails: { status: 'fallback', reason, ratings: [], keptIndices: chunks.map((_, i) => i) } })
  } finally { clearTimeout(timeout) }
}
'''

s = s[:start] + new_func + s[end:]
s = s.replace('rerankBookChunksWithGroq(question, exactUnique)', 'rerankBookChunksWithMini(question, exactUnique)')
s = s.replace('Exact duplicates removed before Groq:', 'Exact duplicates removed before mini:')
s = s.replace('Candidates sent to Groq reranker:', 'Candidates sent to GPT-4o mini reranker:')
s = s.replace('Groq reranker status:', 'GPT-4o mini reranker status:')
s = s.replace('Groq ratings (5=direct, 4=useful, 3=context, 2=tangential, 1=unrelated):', 'GPT-4o mini ratings (5=direct, 4=useful, 3=context, 2=tangential, 1=unrelated):')
s = s.replace('Groq ratings: (none — reranker did not run or used fallback)', 'GPT-4o mini ratings: (none — reranker did not run or used fallback)')

p.write_text(s)
