# Cloudflare staging (not a production switch)

Deploy Vite static assets to Cloudflare Pages (build: `npm run build`, output: `dist`). 
The Cloudflare Pages Function `functions/api/[[path]].js` temporarily proxies `/api/*` to the separate Vercel backend at `ask-wani.vercel.app` so that the app remains usable during compatibility conversion.

This staging version **is not a full Cloudflare-native migration**. It still depends on Vercel APIs. Migrating those APIs requires adapting Node request/response handlers, external environment variables, long-running chat streaming, document generation (mammoth, docx, pptxgenjs, pdfjs) and scheduled tasks to Workers capabilities; then performing authenticated QA.

Keep `ask-wani.com` unchanged until Cloudflare-native backend endpoints have been fully tested. Never commit API keys or token values to Git.
