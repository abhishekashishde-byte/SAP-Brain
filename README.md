# SAP Brain — Personal Knowledge Base

Your private SAP AI assistant. Topic-based conversations, powered by Claude, stored in Supabase.

---

## Stack
- **Frontend** — React + Vite
- **Backend** — Vercel Serverless Function (`/api/chat.js`)
- **LLM** — Claude Sonnet 4 via Anthropic API
- **Storage** — Supabase (your existing instance)
- **Hosting** — Vercel (free tier)

---

## Step 1 — Supabase Table

Run this SQL in your Supabase SQL editor:

```sql
create table sap_conversations (
  topic_key text primary key,
  messages jsonb default '[]'::jsonb,
  updated_at timestamp with time zone default now()
);
```

---

## Step 2 — GitHub

1. Create a new repo on GitHub (e.g. `sap-brain`)
2. Push all files from this folder:

```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/sap-brain.git
git push -u origin main
```

---

## Step 3 — Vercel

1. Go to vercel.com → New Project → Import your GitHub repo
2. Framework preset: **Vite**
3. Add Environment Variables:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

4. Deploy

---

## Step 4 — Custom Domain

In Vercel → Project → Settings → Domains:
- Add `brain.ask-wani.com` (or any subdomain you prefer)
- Add the DNS CNAME record in your domain registrar pointing to `cname.vercel-dns.com`

---

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in your keys in .env.local
npm run dev
```

---

## Security Notes

- `ANTHROPIC_API_KEY` is **server-side only** — lives in `api/chat.js`, never sent to browser
- Supabase anon key is safe to expose (row-level security can be added later)
- No auth currently — this is a personal tool. Add Supabase Auth later if needed.

---

## Future Ideas

- Add GDPR tokenization layer in `api/chat.js` before the Anthropic call
- Add Supabase Auth to protect access
- Add a search across all conversations
- Export topic as PDF knowledge sheet
