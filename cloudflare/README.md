# Wani on Cloudflare — isolated staging migration

This branch prepares the **entire existing Wani application** (React SPA + the eleven existing `/api` entry points) for a Cloudflare Worker with Static Assets. It does not modify Vercel or point `ask-wani.com` at Cloudflare.

## Current status

- Source files and API compatibility adapter added, **not yet validated end-to-end**.
- Cloudflare GitHub integration in this account currently fails with Cloudflare error `8000011` (Pages) / `8000008` (Workers Builds). The GitHub app must be reauthorized or reinstalled before a Git-linked build can run.
- The Cloudflare free-plan CPU limit and Workers Node.js compatibility have not yet been proven sufficient for Wani's AI/document handlers. Do not switch the live domain until all tests pass.

## Building

```sh
npm ci
npm run build
npx wrangler@4 deploy --dry-run
```

For a real staging Worker deployment use `npx wrangler@4 deploy` after attaching and checking build and secret bindings. Cloudflare Worker name: `wani-cloudflare-staging`, not the existing `abi-jarvis`.

The Worker serves Vite's `dist/` as SPA assets, and routes `/api/*` through a Node HTTP compatibility layer to the same existing API handlers. Discovery rewrites are preserved.

## Configuration

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **at frontend build time**. Configure the server-side secrets present on the current Vercel project as Cloudflare Worker secrets, particularly Supabase service credentials and AI provider keys. Never commit secrets.

For compatibility, use Cloudflare's Node.js environment-variable bindings with the declared compatibility date. Recheck any module that assumes Vercel-only features or local file system access.

Supabase OAuth redirect allowlist must include the Cloudflare staging hostname before testing Google login.

## Release checklist

1. Successful Cloudflare Worker bundle compilation (including `docx`, `pptxgenjs`, `mammoth`, and other Node-based libraries).
2. Frontend loads and React navigation renders on the Cloudflare preview URL.
3. Google login and session return to correct Cloudflare path.
4. Normal SAP Q&A and streaming response, reference searches, memory and categorization.
5. File upload/parse, Word/PPT generation, and download checks.
6. Discovery create/edit/save/transcript/export operations using existing Supabase data.
7. Configure and test the Discovery retention schedule on Cloudflare.
8. Verify secrets, RLS and security headers; assess free-tier CPU/memory compatibility.
9. Only then transfer custom domain from Vercel and verify HTTPS.

The current live `ask-wani.com` remains on Vercel throughout staging.
