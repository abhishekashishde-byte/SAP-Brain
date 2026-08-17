from pathlib import Path
import subprocess

GOOD = 'd19906ee3f4ad9226dd1dedd9910b3d73567d740'

# Restore ONLY the answer/search pipeline from the last known-good Wani state.
# Do not touch middleware/auth, history, admin, video, UI, Supabase, quota, or other APIs.
old = subprocess.check_output(['git','show',f'{GOOD}:api/chat.js'], text=True)

# Keep the provider retirement cleanup that happened later; the old snapshot still
# referenced Groq models retired on 2026-08-16.
old = old.replace("'llama-3.3-70b-versatile'", "'openai/gpt-oss-120b'")
old = old.replace('"llama-3.3-70b-versatile"', '"openai/gpt-oss-120b"')
old = old.replace("'llama-3.1-8b-instant'", "'openai/gpt-oss-20b'")
old = old.replace('"llama-3.1-8b-instant"', '"openai/gpt-oss-20b"')

Path('api/chat.js').write_text(old)

# Safety assertions: we really restored the old architecture, retained deterministic
# Verified Links, and did not resurrect retired Groq models.
s = Path('api/chat.js').read_text()
assert 'mergeVerifiedReferences' in s
assert 'llama-3.3-70b-versatile' not in s
assert 'llama-3.1-8b-instant' not in s
assert 'openai/gpt-oss-120b' in s
print('Restored api/chat.js to d199 answer pipeline, preserving supported Groq models.')
