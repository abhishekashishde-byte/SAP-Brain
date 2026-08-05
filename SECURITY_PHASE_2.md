# Security Phase 2 Validation

This branch adds approved-user enforcement in Vercel Routing Middleware for Wani's private API routes.

Protected routes:

- `/api/chat`
- `/api/categorise`
- `/api/extract`
- `/api/recall`
- `/api/summarise`
- `/api/reference-search`
- `/api/generate-fs-doc`
- `/api/generate-ppt`

The middleware validates the Supabase bearer session, checks `approved_emails` using the server-side service role, fails closed, and enforces route-specific request-size limits.

The frontend fetch wrapper attaches the current Supabase access token to same-origin `/api/*` calls that omitted it. This restores passive memory extraction and secures categorisation/document background requests without changing the large chat UI component.

No Supabase migration is included. Vault tables and vault code are untouched.
