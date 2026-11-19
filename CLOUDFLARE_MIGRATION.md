# Wani Cloudflare staging

## Deployment
Wani's Cloudflare **Worker** is named `sap-brain`. The Cloudflare Workers Builds
trigger is set to the branch `deploy/cloudflare-wani-staging` only. This prevents
new pushes to `main` from deploying automatically to the staging Worker.

The existing `npm run build` produces Vite 5 static assets in `dist`.
`npx wrangler deploy` reads `wrangler.jsonc` to deploy those assets with an
API proxy Worker. No Vite upgrade is needed.

The frontend build requires `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` set as Cloudflare Workers Builds **build-time**
environment variables (the anon key is intended to be public). Do not commit
credentials or private API keys to source. Supabase Auth's approved redirect
URL(s) need to include the staging domain for OAuth login.

## Important: not yet independent of Vercel

`cloudflare/worker.js` currently proxies `/api/*` to
`https://ask-wani.vercel.app`. It is a staging bridge only, not a complete
server-side migration. Wani's Vercel APIs include long-running and streaming
AI calls, document generation, file processing, and scheduled Discovery jobs.
Converting them to Cloudflare-native request handlers is separate work and
must be authenticated-tested before changing any custom domains.

The unused Pages staging project `wani-cloudflare-staging` was created earlier
during troubleshooting; it is not the Git-linked Worker.

## Release checklist
- [ ] Worker build and deployment successful on staging
- [ ] Static routes and CSS/assets load, including /discovery
- [ ] Set build-time Supabase variables and test authenticated login
- [ ] Test chat streaming, database reads/writes, Discovery note persistence
- [ ] Test docx/pptx generation, file extraction, scheduled actions
- [ ] Convert Node/Vercel APIs to Worker-compatible handlers where feasible
- [ ] Verify secrets, quotas, error handling and latency
- [ ] Change production DNS only after full acceptance testing
