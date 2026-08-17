from pathlib import Path
p=Path('api/chat.js')
s=p.read_text()
old="""    let kept = ranked.filter(item => item.score >= 4).slice(0, 4)\n    if (!kept.length && ranked[0]?.score === 3) kept = [ranked[0]]\n"""
new="""    // Keep all directly useful chunks (4/5), plus at most ONE score-3 context chunk\n    // when it is not a duplicate. This preserves useful adjacent book context without\n    // flooding Sonnet with tangential excerpts. Score 1/2 chunks remain excluded.\n    let kept = ranked.filter(item => item.score >= 4).slice(0, 4)\n    const bestContext = ranked.find(item => item.score === 3)\n    if (bestContext && kept.length < 4) kept.push(bestContext)\n    if (!kept.length && ranked[0]?.score === 3) kept = [ranked[0]]\n"""
if s.count(old)!=1:
    raise SystemExit(f'expected one reranker selection block, found {s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s)
print('Book RAG reranker now retains one score-3 context chunk')
