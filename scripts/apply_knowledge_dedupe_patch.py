from pathlib import Path

path = Path('api/chat.js')
text = path.read_text()
marker = "async function fetchRelevantKnowledge(question, userId, userToken) {"
if marker not in text:
    raise SystemExit('fetchRelevantKnowledge marker not found')

helper = r'''// ── KNOWLEDGE DEDUPLICATION ──────────────────────────────────────────────────
// Conservative by design: exact duplicates are removed deterministically; only
// wording-similar non-identical pairs are judged by a tiny Groq model. Any model
// failure keeps both findings. Nothing here deletes stored consultant knowledge.
function normalizeFindingForDedupe(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function findingTokenSet(value) {
  return new Set(normalizeFindingForDedupe(value).split(' ').filter(token => token.length > 2))
}

function findingLexicalSimilarity(a, b) {
  const left = findingTokenSet(a), right = findingTokenSet(b)
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection++
  const union = left.size + right.size - intersection
  return union ? intersection / union : 0
}

async function judgeAmbiguousKnowledgePairs(pairs) {
  if (!pairs.length || !process.env.GROQ_API_KEY) return new Map()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1200)
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b', temperature: 0, max_tokens: 220,
        messages: [{ role: 'user', content: `You are a conservative SAP knowledge deduplication judge. For each pair classify the factual relationship as duplicate, related, or distinct.\n\nduplicate = the same operational fact/claim even if phrased differently.\nrelated = same area but each contains a distinct useful condition, exception, scope, app/t-code distinction, or outcome.\ndistinct = different facts.\n\nChoose duplicate ONLY when keeping both would repeat the same factual claim. Never infer missing SAP facts. Return ONLY JSON: {"decisions":[{"pair":"0-1","relation":"duplicate"}]}\n\n${pairs.map(p => `PAIR ${p.key}\nA: ${p.a.slice(0, 500)}\nB: ${p.b.slice(0, 500)}`).join('\n\n')}` }]
      })
    })
    if (!response.ok) return new Map()
    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const decisions = new Map()
    for (const item of parsed.decisions || []) {
      if (pairs.some(p => p.key === item.pair) && ['duplicate','related','distinct'].includes(item.relation)) decisions.set(item.pair, item.relation)
    }
    return decisions
  } catch (err) {
    console.log('[KNOWLEDGE DEDUPE] Groq judge skipped:', err.name === 'AbortError' ? 'timeout' : err.message)
    return new Map()
  } finally {
    clearTimeout(timeout)
  }
}

async function dedupeKnowledgeCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) return candidates || []

  const unique = [], seen = new Set()
  let exactRemoved = 0
  for (const candidate of candidates) {
    const key = normalizeFindingForDedupe(candidate.finding)
    if (key && seen.has(key)) { exactRemoved++; continue }
    if (key) seen.add(key)
    unique.push(candidate)
  }
  if (unique.length < 2) {
    console.log('[KNOWLEDGE DEDUPE]', JSON.stringify({ exactRemoved, aiPairs: 0, aiRemoved: 0 }))
    return unique
  }

  const pairs = []
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const lexical = findingLexicalSimilarity(unique[i].finding, unique[j].finding)
      if (lexical >= 0.30) pairs.push({ key: `${i}-${j}`, i, j, lexical, a: unique[i].finding || '', b: unique[j].finding || '' })
    }
  }
  if (!pairs.length) {
    console.log('[KNOWLEDGE DEDUPE]', JSON.stringify({ exactRemoved, aiPairs: 0, aiRemoved: 0 }))
    return unique
  }

  const decisions = await judgeAmbiguousKnowledgePairs(pairs)
  const parent = unique.map((_, i) => i)
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]))
  const union = (a, b) => {
    a = find(a); b = find(b)
    if (a === b) return
    if (a < b) parent[b] = a
    else parent[a] = b
  }
  for (const pair of pairs) if (decisions.get(pair.key) === 'duplicate') union(pair.i, pair.j)
  const kept = unique.filter((_, i) => find(i) === i)
  console.log('[KNOWLEDGE DEDUPE]', JSON.stringify({ exactRemoved, aiPairs: pairs.length, aiRemoved: unique.length - kept.length }))
  return kept
}

'''

if 'async function dedupeKnowledgeCandidates(candidates)' not in text:
    text = text.replace(marker, helper + marker, 1)

old = r'''    const kept = hasScore
      ? scored.filter(d => d.similarity >= KNOWLEDGE_THRESHOLD).slice(0, 3)
      : scored.slice(0, 3)
    return Object.assign(kept, { _allCandidates: scored.map(d => ({ finding: (d.finding||'').slice(0,60), score: d.similarity == null ? 'n/a' : +d.similarity.toFixed(3) })) })'''
new = r'''    const relevant = hasScore
      ? scored.filter(d => d.similarity >= KNOWLEDGE_THRESHOLD).slice(0, 5)
      : scored.slice(0, 5)
    const deduped = await dedupeKnowledgeCandidates(relevant)
    const kept = deduped.slice(0, 3)
    return Object.assign(kept, { _allCandidates: scored.map(d => ({ finding: (d.finding||'').slice(0,60), score: d.similarity == null ? 'n/a' : +d.similarity.toFixed(3) })) })'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('knowledge kept-block not found')

path.write_text(text)
