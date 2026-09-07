from pathlib import Path

p = Path('api/chat.js')
s = p.read_text()

anchor = "- Only state T-codes/tables/BAdIs/field names you are 100% certain exist. If unsure say \"verify in your system\""
if anchor not in s:
    raise SystemExit('prompt anchor not found')

rule = '''- SAP APP IDENTITY VERIFICATION — HARD RULE: whenever the user names an SAP app, WDA/Web Dynpro app, Fiori app, tile, or when your answer is about to state an app name, app ID (for example F2175/W0017), semantic object/action, or UI technology, treat that mapping as an exact identifier that MUST be verified before stating it. Do not infer an app ID from a related app, a similar function, a saved KB finding, or keyword similarity. A consultant-KB hit about a DIFFERENT app is context only and MUST NOT redefine the app the user named. Verify the exact mapping `app name ↔ app ID ↔ technology` using live SAP evidence (prefer SAP Help, SAP Fiori Apps Library, SAP Support/KBA). If you cannot verify the mapping, do not guess an ID; say that the exact app ID needs verification. Example distinction to preserve: "Find Maintenance Orders" and "Change Maintenance Order" are separate applications and must never be merged just because both concern maintenance orders.\n'''

s = s.replace(anchor, rule + anchor, 1)
p.write_text(s)
