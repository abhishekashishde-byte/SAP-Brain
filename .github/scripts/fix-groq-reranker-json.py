from pathlib import Path

p = Path('api/chat.js')
s = p.read_text()

old = """        model: 'openai/gpt-oss-20b', temperature: 0, max_tokens: 500,
        messages: [{ role: 'user', content: `You are a conservative reranker for SAP book excerpts."""
new = """        model: 'openai/gpt-oss-20b', temperature: 0, max_tokens: 500,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'book_rerank',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                ratings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      index: { type: 'integer' },
                      score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
                      duplicate_of: { type: ['integer', 'null'] },
                    },
                    required: ['index', 'score', 'duplicate_of'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['ratings'],
              additionalProperties: false,
            },
          },
        },
        messages: [{ role: 'user', content: `You are a conservative reranker for SAP book excerpts."""
if old not in s:
    raise SystemExit('Groq model block not found')
s = s.replace(old, new, 1)

old2 = """    const t2 = Date.now()
    debugLog.parallelMs = t2 - t1

    // Deduplicate book chunks by source_book + page_number"""
new2 = """    const t2 = Date.now()
    debugLog.parallelMs = t2 - t1

    // Preserve reranker audit metadata before any downstream array mutation.
    const bookRerankMeta = bookChunks._bookRerankMeta || null

    // Deduplicate book chunks by source_book + page_number"""
if old2 not in s:
    raise SystemExit('parallel/debug marker not found')
s = s.replace(old2, new2, 1)

old3 = "debugLog.bookRerank      = bookChunks._bookRerankMeta || null"
new3 = "debugLog.bookRerank      = bookRerankMeta"
if old3 not in s:
    raise SystemExit('bookRerank debug assignment not found')
s = s.replace(old3, new3, 1)

p.write_text(s)
