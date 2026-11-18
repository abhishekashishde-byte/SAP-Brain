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
