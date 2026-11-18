# Wani Discovery Workshop — release acceptance checklist

This document is a **review checklist**, not a claim that browser/database tests have passed. Source catalogs are immutable, additive JSON.

## Source integrity (verified from GitHub branch)
- [x] SAP PM: 7 areas, 19 objects, 214 fields, 101 questions, 41 decisions.
- [x] SAP PM process catalog: 8 categories, 55 processes/jobs, 18 questions.
- [x] All 55 process related-object IDs reference the original 19 SAP objects.
- [x] All report exporters include source systems, object sources, extra fields, processes and process questions.

## Workshop and live meeting
- [ ] Create with mandatory customer name and meeting date; edit and reopen details.
- [ ] Verify all area/object/field/process/category notes, custom fields/questions and todos survive reload.
- [ ] Verify field cycle, quick capture, custom questions, process frequencies and status clearing.
- [ ] Exercise offline edits, retry, duplicate suppression and multi-tab behaviour.
- [ ] Verify presenter mode hides internal notes, AI panels, legacy hints and SAP implementation hints.
- [ ] Verify desktop 1366px, tablet 768px, and mobile 375px views; controls readable and usable by touch.

## Data security
- [ ] Run migrations 009–013 against an isolated Supabase test database, not production first.
- [ ] Test as two distinct users: user B cannot SELECT/INSERT/UPDATE/DELETE user A's workshop data, hints or files.
- [ ] Verify storage bucket is private and rejects uploads above 8 MB; test PDF, DOCX, TXT.
- [ ] Verify uploading document does not trigger AI; separate Analyze button does.
- [ ] Verify deletion removes uploaded files and all workshop rows.
- [ ] Verify AI receives only permitted workshop context, never private notes in client minutes.

## Completeness and exports
- [ ] Export an empty workshop: every in-scope catalog field, question and decision appears as unanswered.
- [ ] Verify all 55 processes and 18 process questions appear even when unanswered.
- [ ] Verify customer name and meeting date on every client/internal workbook and print report.
- [ ] Open .xlsx in Microsoft Excel and LibreOffice; verify tab names, headers, filtering, widths, wrapping, A4 print.
- [ ] Verify CSV ZIP contains individual files including extra_fields.csv and processes.csv.
- [ ] Verify Markdown, JSON, PDF output, punctuation and multilingual texts do not corrupt files.
- [ ] Verify client exports exclude consultant-only notes and SAP process hints. Internal exports retain them.
- [ ] Print A4 portrait/landscape from laptop and mobile; no clipped content or hidden tables.

## AI and legacy import
- [ ] Test generated minutes on a small and full workshop; factual review required before sending.
- [ ] Test invalid/partial AI JSON, model timeout, expired tokens and network failure.
- [ ] Test scanned PDFs: show unsupported-text warning rather than invent findings.
- [ ] Test a large manual: show any truncation warning; verify reviewable per-object hints.
- [ ] Ensure accepted hints only feed internal minutes/AI extra field suggestions, rejected hints do not.
- [ ] User must explicitly accept each proposed extra field; never auto-create fields.
- [ ] Validate processing runtime: current import endpoint runs synchronously during the request; move to a durable background queue before claiming resumable background processing.

## Release gate
- [ ] GitHub validation workflow green (npm ci, catalog counts, npm run build).
- [ ] Preview deployment successful and smoke-tested against isolated Supabase.
- [ ] Database migration tested and backed up before production.
- [ ] Review stacked pull requests in dependency order.
- [ ] Merge/deploy only after all blocking checks pass.

## Addendum 02 — first-call essentials
- [ ] Run migration 014 and verify owner-only RLS for stakeholders, drivers, sizing, requests and parking.
- [ ] Stakeholder spreadsheet paste, permissions/contact privacy, owner badges and decision-maker/date picker.
- [ ] Nine explicitly mapped numeric SAP questions synchronize with sizing in both directions.
- [ ] All 15 fixed metrics and custom metrics persist; incomplete rows do not silently disappear.
- [ ] Requests, due dates, process links and parking Shift+P / Move to to-do function on mobile and desktop.

## Addendum 03 — scoping
- [ ] Run migrations 015–017; verify RLS as two different real users.
- [ ] Candidate collector selects only recorded clarify fields, open decisions, qualifying legacy fields, status-flagged processes and accepted missing-in-SAP hints. Ignored items persist.
- [ ] Gap numbering remains unique with simultaneous tabs; S/M/L/XL points match 1/3/8/13.
- [ ] Interface/form/RAID create/edit/delete and Create-gap actions work; sample request FKs valid.
- [ ] AI suggestions require click; apply per field; duplicate grouping never destroys original rows without consent.
- [ ] Follow-up EN/DE, Formal/Friendly, inclusion toggles, copy and mailto; no auto-send, no internal notes or hidden implementation hints.
- [ ] Scope Pack includes sizing, fit-gap, interfaces, forms/reports and RAID.
- [ ] Individual CSV files `gaps.csv`, `interfaces.csv`, `formsreports.csv`, `raid.csv` exist in ZIP. Verify filenames against customer handover requirements.

## Addendum 04 — later sessions and data privacy
- [ ] Run migrations 018–021 on a non-production clone first.
- [ ] Transactional `discovery_next_session` creates optional engagement and copies all listed data, preserving carry-forward IDs and remapping stakeholder, source-system, request and todo FKs.
- [ ] Verify sessions 1 → 2 → 3, unresolved items, carried-over filter, old/new value differences, and legacy workshops without engagements.
- [ ] Template contents exclude stakeholders, contacts, sizing and attachments. Explicit AI anonymisation + human review required before private save.
- [ ] Template starts as suggestions; accepting one item/whole object never silently approves unrelated items.
- [ ] German catalog generator produces draft overlays; a qualified SAP reviewer must check ALL translated titles, fields, questions and options, then approve overlays before presenter mode uses them.
- [ ] English catalog IDs/answer values remain canonical in German presenter mode.
- [ ] Minutes/email translation requires explicit click and remains editable.
- [ ] Consent checkbox and date/text stored before upload. Reject uploads without consent and reject unauthorized cross-user access.
- [ ] TXT/VTT/DOCX import works; MP3/M4A/WAV only works when a speech-to-text provider is configured (`OPENAI_API_KEY` or project-specific configuration).
- [ ] Transcript analysis is initiated by the user. Quotes must occur in source; timestamps only if supported by the source; confidence displayed.
- [ ] Accept/Edit/Reject, skip conflicts on high-confidence batch acceptance, and validate all catalog target IDs.
- [ ] Delete transcript removes private file, transcript text and suggestions, with no remaining download access.
- [ ] Configure Vercel `CRON_SECRET`, deploy the protected daily retention cron and verify expired records/files are actually deleted.
- [ ] Verify environment supports long-running transcript analysis; use a durable job queue for documents that exceed request timeout rather than claiming background operation.

## Outstanding release cautions
- The GitHub branches contain code, **not a verified deployment**; production remains unchanged.
- Build, browser QA, Excel/PDF print QA and migrations have not yet been confirmed green.
- German translation overlay files are placeholders with `reviewed: false` until an administrator generates and reviews drafts.
- Some import/AI actions use synchronous serverless requests and require timeout testing.
- The transcript analysis uses verified source quotations as a guard but an AI model can still make incorrect semantic proposals; all changes require review.
