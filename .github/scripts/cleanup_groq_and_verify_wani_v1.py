from pathlib import Path

# Groq retired both Llama IDs on 2026-08-16 for developer/free tiers.
# Keep the larger replacement for reasoning/classification quality and the
# smaller replacement for cheap fallback lanes.
REPLACEMENTS = {
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
    "llama-3.1-8b-instant": "openai/gpt-oss-20b",
}

changed = []
for root in [Path('api'), Path('lib'), Path('src')]:
    if not root.exists():
        continue
    for p in root.rglob('*'):
        if p.suffix not in {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'} or not p.is_file():
            continue
        s = p.read_text()
        out = s
        for old, new in REPLACEMENTS.items():
            out = out.replace(old, new)
        if out != s:
            p.write_text(out)
            changed.append(str(p))

# Verify the Tavily separation that must remain intact:
# relevant filtered SAP pages are display links; evidence-rated selected pages
# alone are allowed into Sonnet.
chat = Path('api/chat.js').read_text()
required = [
    'const groundingSearchResults = selectedTavily.map(x => x.result)',
    'const answerSearchResults = evidenceDecision.useTavilyForAnswer ? groundingSearchResults : []',
    'const referenceSearchResults = tavilyCandidates.slice(0, 4)',
    'Tavily shown as Verified Links',
]
missing = [x for x in required if x not in chat]
if missing:
    raise SystemExit('Tavily display/grounding separation missing: ' + repr(missing))

# Ensure no retired Groq IDs remain in runtime source.
left = []
for root in [Path('api'), Path('lib'), Path('src')]:
    if not root.exists():
        continue
    for p in root.rglob('*'):
        if p.is_file() and p.suffix in {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'}:
            text = p.read_text()
            for old in REPLACEMENTS:
                if old in text:
                    left.append(f'{p}:{old}')
if left:
    raise SystemExit('Retired Groq models still present: ' + ', '.join(left))

# Categorisation must be non-fatal: provider outages/model removals cannot return 503.
cat = Path('api/categorise.js').read_text()
if "return res.status(200).json(fallback(message))" not in cat:
    raise SystemExit('categorise non-fatal fallback missing')

print('Changed:', ', '.join(changed) if changed else '(none)')
print('Verified: no retired Groq IDs; Tavily display lane independent from Sonnet grounding; categorise non-fatal.')
