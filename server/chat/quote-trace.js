// Quote trace: for every quotation and source citation in a finished answer, record
// which retrieved passage it came from — book page, web page or the consultant's own
// confirmed knowledge — and whether the quoted wording really appears there.
//
// The small model decides WHAT in the answer is a quote or citation and WHICH source
// it relies on (judgement, no keyword rules). The wording check is then done in code:
// a quote only counts as "exact" when its text is literally found in that source, and
// a source sentence shown to the user is only shown if it is literally in the source.
import { callSmall, parseJson } from './case-memory.js'

const SYSTEM = `You audit an SAP answer against the sources it was given.
Find every place in ANSWER that either
- quotes text (words in quotation marks presented as coming from a source), or
- cites or attributes a source (a book and page, a numbered reference like [2], "according to …", "SAP Help says …").
For each one return:
- "answer_text": the exact quoted words or the cited sentence, copied from ANSWER (max 220 characters)
- "kind": "quote" or "citation"
- "source_id": the id of the SOURCE it actually comes from, judged by content (not by the label the answer used); null if no source supports it
- "source_sentence": the sentence(s) copied EXACTLY from that source that support it (max 320 characters); "" if none
Do not list ordinary statements that neither quote nor cite. Return ONLY JSON {"items":[...]}; {"items":[]} if there are none.`

const norm = s => String(s || '')
  .toLowerCase()
  .replace(/[“”„‟"'’‘‚`´]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const unquote = s => String(s || '').replace(/^[\s“”„"'‘’«»]+|[\s“”„"'‘’«».,;:]+$/g, '')

export async function traceQuotes({ answer, books = [], web = [], knowledge = [], timeoutMs = 9000 }) {
  const sources = [
    ...books.map((c, i) => ({ id: 'B' + (i + 1), type: 'book', label: `${c.source_book || 'SAP book'}, p.${c.page_number ?? '?'}`, topic: c.lesson_title || '', text: String(c.content || '') })),
    ...web.map((r, i) => ({ id: 'W' + (i + 1), type: 'web', label: r.title || r.url || 'Web page', url: r.url || '', text: String(r.snippet || '') })),
    ...knowledge.map((k, i) => ({ id: 'K' + (i + 1), type: 'knowledge', label: `Your confirmed knowledge — ${[k.module, k.topic, k.object].filter(Boolean).join(' > ')}`, text: String(k.finding || '') })),
  ].filter(s => s.text.trim())
  if (!sources.length || !String(answer || '').trim()) return []

  const user = 'SOURCES:\n' + sources.map(s => `<source id="${s.id}" label="${s.label.replace(/"/g, "'")}">\n${s.text.slice(0, 4500)}\n</source>`).join('\n') +
    '\n\nANSWER:\n' + String(answer).slice(0, 14000)

  let items = []
  try {
    const out = await Promise.race([
      callSmall(SYSTEM, user, 1800),
      new Promise((_, rej) => setTimeout(() => rej(Error('timeout')), timeoutMs)),
    ])
    items = Array.isArray(parseJson(out.text)?.items) ? parseJson(out.text).items : []
  } catch (e) {
    console.warn('[QUOTE TRACE] skipped:', e.message)
    return []
  }

  const byId = new Map(sources.map(s => [s.id, s]))
  return items.slice(0, 20).map(x => {
    const kind = x?.kind === 'quote' ? 'quote' : 'citation'
    const text = String(x?.answer_text || '').trim().slice(0, 220)
    if (!text) return null
    const src = byId.get(String(x?.source_id || '')) || null
    const srcNorm = src ? norm(src.text) : ''
    // Exact = the quoted words are literally in the source (code check, not the model's word).
    const exact = !!src && kind === 'quote' && norm(unquote(text)).length >= 8 && srcNorm.includes(norm(unquote(text)))
    // Only show a source sentence if it really is in the source.
    const sentence = String(x?.source_sentence || '').trim()
    const sentenceOk = !!src && sentence.length >= 8 && srcNorm.includes(norm(sentence))
    return {
      kind,
      text,
      status: !src ? 'no_source' : kind === 'quote' ? (exact ? 'exact' : 'paraphrase') : 'cited',
      source: src ? { id: src.id, type: src.type, label: src.label, topic: src.topic || '', url: src.url || '' } : null,
      sourceSentence: sentenceOk ? sentence.slice(0, 320) : '',
    }
  }).filter(Boolean)
}
