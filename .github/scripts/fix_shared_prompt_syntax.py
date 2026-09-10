from pathlib import Path

p = Path('api/_shared.js')
s = p.read_text()
old = "Verify the exact mapping `app name ↔ app ID ↔ technology` using live SAP evidence"
new = "Verify the exact mapping 'app name ↔ app ID ↔ technology' using live SAP evidence"
if old not in s:
    raise SystemExit('target text not found')
s = s.replace(old, new, 1)
p.write_text(s)
print('Fixed unescaped backticks inside BASE_SYSTEM_PROMPT template literal')
