# Repository engineering rules

- Preserve the existing workbench, workflow builder, runs, approvals, sources, query inbox, calendar, settings, architect and API routes.
- Use the semantic dark/light design tokens in `app/globals.css`.
- Do not commit, push, merge or deploy without an explicit user instruction.
- Be direct about security limitations; server authentication now protects access, but browser-local team/approval records are not server authorization or a durable approval ledger.
- Redactor documents, filenames, matches and custom terms must never enter AI calls, telemetry, logs, browser storage, workflow stores or server APIs. Use synthetic fixtures only.
- Build redaction output from an explicit supported model, never by covering content or copying an uninspected package. Fail closed on unsupported structures and failed verification.
- Human review is mandatory. Pattern detection is heuristic, not a guarantee of anonymity.
- Run `pnpm test` and `pnpm build` for redactor changes. Record failures and actual supported formats in CHANGELOG.md and docs/ARCHITECTURE.md.
- All API method exports must use `secure()` from `lib/security/route.mjs`; page guards do not replace handler authorization. Add new permissions explicitly and test anonymous, underprivileged and scoped-token callers.
- Server roles come only from configured principals. Never use localStorage, payload reviewer names, client approvals or MCP session IDs as server authority. This is one shared trusted workspace, not a multitenant system.
- Use `safeFetch`/`providerFetch` for server egress. Never reintroduce raw fetch, automatic redirects, user-supplied Host/proxy headers or validation that resolves DNS again at connection time.
- Vercel must use shared Redis security storage; missing/unavailable storage fails closed. Memory mode is explicit and local-only. Do not trust client-forwarded IP headers for rate-limit identity.
- Keep server secrets out of client bundles, URLs, error bodies and logs. MCP audit records retain action metadata, not parameter/result values. External Audit Demo is opt-in, synthetic-only and requires explicit acknowledgement; never connect redactor state to it.
- Worker response CSP must block network connections; document CSP alone is insufficient. Unexpected DOCX components/relationships are rejected, not copied.
- XLSX is a restricted values-only OOXML reconstruction, not a general Excel editor. Keep parsing/export in the local worker; never copy a source ZIP part, shared-string table, metadata, unused style record or source worksheet name into output.
- Show all supported worksheet cells, including hidden/veryHidden sheets and hidden/zero-size rows/columns. Export uses generic sheet names and unhides sheets/rows/columns; require per-sheet and final human review. Changing decisions invalidates those acknowledgements.
- Formula expressions and supported cached values may be inspected, but any formula blocks XLSX export. Defined names, comments/notes, links, macros, embedded content, rich text, custom number formats, extensions and other unsupported features must remain blocked until a separately verified implementation exists. Do not silently flatten formulas or rely on cached values as safe output.
- Validate XLSX locations, styles, number precision, XML/ZIP bounds and relationships. Preserve text identifiers/leading zeros; redacted numeric cells become explicit text. Never generate a formula from user text, including strings beginning with `=`.
- XLSX changes require `python tests/verify-xlsx-independent.py` (openpyxl required) and the XLSX browser stage in `pnpm test:production`; the actual download is independently checked by Python ZIP/XML/openpyxl. Set GRA_TEST_PYTHON when Python is not on PATH. Use synthetic data only.
- Security validation: `pnpm test`, `pnpm build`, `pnpm test:production`, the independent Python checks, `pnpm audit` and `git diff --check`. The production harness clears provider keys and uses only ephemeral synthetic identities/data.
- Treat instance-memory schedules, buffers, approval records and audit history as prototype state. Do not describe them as durable jobs, tenant isolation or an enforceable server approval ledger.
- PDF output is raster-only: overwrite approved RGB pixels before writing a fresh image-only PDF. Never retain source PDF objects, original text, thumbnails, metadata, annotations, attachments or hidden layers. Verify the exact output grammar and every sanitized pixel; never introduce overlay-only export.
- PDF inspection/rendering stays in the dedicated, network-blocked worker. Bundle pinned standard fonts at build time; do not add runtime font/CMap/OCR/CDN fetches or source-dependent logs. Reject renderer warnings, ambiguous coordinates, scans/mixed images and other unsupported pages rather than skipping them. OCR is not implemented.
- PDF changes require the PDF production-browser stage and `tests/verify-pdf-independent.py` on the actual synthetic download (Python pypdf/Pillow and Poppler required). Require per-page/final human review; decisions invalidate all acknowledgements. Preserve DOCX/XLSX verification.
- PDF view zoom/pan must never rescale the stored raster coordinates or change approved removals. Map pointer positions through the current page bounds, keep keyboard edits bounded, and block final review/download while a draft remains unapplied. Viewing alone must not invalidate approvals.
- Keep release QA synthetic and isolated. Give independent browser stages their own ephemeral identities when needed; never raise production authentication/rate limits to make a larger test suite pass. Only non-sensitive theme preferences may be persisted by redactor UI refinements.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
