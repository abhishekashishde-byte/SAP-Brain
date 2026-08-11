from pathlib import Path
p = Path('api/chat.js')
s = p.read_text()

old = """    console.log('[BOOK RERANK]', JSON.stringify({ candidates: chunks.length, ratings: ranked.map(r => ({ index: r.index, score: r.score, duplicateOf: r.duplicateOf })), kept: kept.map(r => r.index) }))
    return kept.map(item => item.chunk)
  } catch (err) {
    console.log('[BOOK RERANK] Groq skipped:', err.name === 'AbortError' ? 'timeout' : err.message, '— keeping pgvector candidates')
    return chunks
  } finally { clearTimeout(timeout) }
}"""
new = """    const selected = kept.map(item => item.chunk)
    const ratingsForDebug = ranked.map(r => ({
      index: r.index,
      score: r.score,
      duplicateOf: r.duplicateOf,
      kept: kept.some(k => k.index === r.index),
      book: r.chunk?.source_book || r.chunk?.book_title || r.chunk?.source || 'Unknown book',
      page: r.chunk?.page_number || r.chunk?.page || r.chunk?.page_num || '',
      title: r.chunk?.lesson_title || r.chunk?.title || '',
      preview: getBookChunkText(r.chunk).slice(0, 180),
    }))
    console.log('[BOOK RERANK]', JSON.stringify({ candidates: chunks.length, ratings: ratingsForDebug, kept: kept.map(r => r.index) }))
    return Object.assign(selected, { _rerankDetails: { status: 'applied', ratings: ratingsForDebug, keptIndices: kept.map(r => r.index) } })
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message
    console.log('[BOOK RERANK] Groq skipped:', reason, '— keeping pgvector candidates')
    return Object.assign(chunks, { _rerankDetails: { status: 'fallback', reason, ratings: [], keptIndices: chunks.map((_, i) => i) } })
  } finally { clearTimeout(timeout) }
}"""
if old not in s: raise SystemExit('rerank return block not found')
s = s.replace(old, new, 1)

old2 = """    const candidates = data || []
    const { unique: exactUnique, removed: exactRemoved } = removeExactBookDuplicates(candidates)
    const reranked = await rerankBookChunksWithGroq(question, exactUnique)
    console.log('[BOOK RAG] Candidates:', candidates.length, '| exact duplicates removed:', exactRemoved, '| chunks kept:', reranked.length, '| module filter:', detectedModule || 'none')
    return Object.assign(reranked, { _bookRerankMeta: { candidates: candidates.length, exactRemoved, kept: reranked.length } })"""
new2 = """    const candidates = data || []
    const { unique: exactUnique, removed: exactRemoved } = removeExactBookDuplicates(candidates)
    const reranked = await rerankBookChunksWithGroq(question, exactUnique)
    const rerankDetails = reranked._rerankDetails || { status: 'not-run', ratings: [], keptIndices: exactUnique.map((_, i) => i) }
    console.log('[BOOK RAG] Candidates:', candidates.length, '| exact duplicates removed:', exactRemoved, '| chunks kept:', reranked.length, '| module filter:', detectedModule || 'none')
    return Object.assign(reranked, { _bookRerankMeta: {
      candidates: candidates.length,
      exactRemoved,
      afterExactDedupe: exactUnique.length,
      kept: reranked.length,
      status: rerankDetails.status,
      reason: rerankDetails.reason || '',
      ratings: rerankDetails.ratings || [],
      keptIndices: rerankDetails.keptIndices || [],
    } })"""
if old2 not in s: raise SystemExit('book meta block not found')
s = s.replace(old2, new2, 1)

old3 = """    debugLog.bookChunks     = bookChunks.length
    debugLog.knowledgeChunks = relevantKnowledge.length"""
new3 = """    debugLog.bookChunks     = bookChunks.length
    debugLog.bookRerank      = bookChunks._bookRerankMeta || null
    debugLog.knowledgeChunks = relevantKnowledge.length"""
if old3 not in s: raise SystemExit('debug assignment block not found')
s = s.replace(old3, new3, 1)

target = "    `Chunks found: ${dl.bookChunks || 0}`,\n"
replacement = """    `Pgvector candidates retrieved: ${dl.bookRerank?.candidates ?? dl.bookChunks ?? 0}`,
    `Exact duplicates removed before Groq: ${dl.bookRerank?.exactRemoved ?? 0}`,
    `Candidates sent to Groq reranker: ${dl.bookRerank?.afterExactDedupe ?? dl.bookChunks ?? 0}`,
    `Groq reranker status: ${dl.bookRerank?.status || 'not available'}${dl.bookRerank?.reason ? ` (${dl.bookRerank.reason})` : ''}`,
    ...((dl.bookRerank?.ratings || []).length
      ? ['Groq ratings (5=direct, 4=useful, 3=context, 2=tangential, 1=unrelated):',
         ...dl.bookRerank.ratings.map(r => `    [R${r.index+1}] score ${r.score} — ${r.kept ? 'KEPT → SONNET' : (r.duplicateOf != null ? `DROPPED duplicate of R${r.duplicateOf+1}` : 'DROPPED')} — ${r.book}, p.${r.page}${r.title ? ` — ${r.title}` : ''}\
        ${r.preview || ''}`)]
      : ['Groq ratings: (not available — reranker did not run or used fallback)']),
    `Chunks transferred to Sonnet: ${dl.bookChunks || 0}`,
"""
if target not in s: raise SystemExit('Chunks found line not found')
s = s.replace(target, replacement, 1)

old5 = """          bookChunkDetails: bookChunks_.map(c => ({
            book: c.source_book, page: c.page_number,
            title: c.lesson_title || '', content: c.content?.slice(0, 400) || '',
          })),"""
new5 = """          bookRerank: debugLog.bookRerank || null,
          bookChunkDetails: bookChunks_.map(c => ({
            book: c.source_book, page: c.page_number,
            title: c.lesson_title || '', content: c.content?.slice(0, 400) || '',
          })),"""
if old5 not in s: raise SystemExit('sourceInfo pipeline block not found')
s = s.replace(old5, new5, 1)

p.write_text(s)
