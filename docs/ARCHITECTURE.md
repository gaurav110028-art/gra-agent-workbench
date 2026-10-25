# GRA Agent Workbench architecture

## Current security architecture — Phase 1.5

The historical baseline audit below is superseded by the fixes and remaining-risk assessment in [SECURITY.md](SECURITY.md). The app now uses server-issued encrypted iron-session cookies, one-hour active-session records, server-configured admin/operator/viewer identities, scoped machine tokens and mandatory `secure()` wrappers on every API method. `proxy.js` guards workbench/redactor page entry; authorization is also enforced inside API handlers. Browser-local team/reviewer records do not grant server permissions.

New modules in `lib/security/` implement authentication, shared session/rate-limit storage, bounded request handling, safe server egress, failure responses and finite SSE streams. Vercel requires Redis-backed security state and exact HTTPS origin configuration; explicit memory mode is only for single-process local testing. Business stores remain prototype localStorage/instance-memory data in one shared workspace. No tenant isolation, immutable approvals or durable scheduler is claimed.

All server URL requests use a native HTTP(S) transport that validates public IPs, pins DNS resolution, bounds response/time budgets, revalidates redirects and restricts provider destinations. MCP/SSE now use Node instead of Edge. The existing Audit Demo is explicitly opt-in and synthetic-only because it sends sources to Anthropic; the redactor remains disconnected from that feature.

The browser DOCX source-part and relationship policies are stricter, and static worker resources now carry a separate network-blocking CSP. Authentication checks happen before entering the document tool, without adding document API calls. See SECURITY.md for configuration, severity-ranked findings, exact authorization policy, egress inventory, test evidence and hosted-test Go/No-Go requirements.

## Repository audit — 25 October 2026

Next.js App Router, JavaScript, React and React DOM; React Flow (`@xyflow/react`) provides the workflow editor. `app/page.js` owns the workbench navigation and agent state. Existing views include agents/workflows, sources, query inbox, run history, approvals, settings, calendar and GRA AI Architect. Store modules primarily use localStorage; architect automation state also lives in server module memory. There is no database, durable job runner, middleware authentication or existing automated test script in the initial repository. Server memory is not a durable scheduling mechanism across Vercel instances/restarts.

API routes: `/api/ai-node`, `/api/audit-demo`, `/api/http-request`, `/api/send-email`, `/api/webhook/whatsapp`, `/api/mcp`, `/api/mcp/sse`, `/api/architect/{chat,advanced,models,schedule}`. AI routes call external providers; email uses Resend. Provider credentials are read from server environment variables. Existing routes must never receive redactor inputs.

Design: semantic CSS tokens, indigo accent, dark default, optional light theme, Inter/JetBrains fonts through next/font. Existing package manifest uses `latest` for the four original dependencies; pnpm lockfile resolves specific versions. No deployment config was present. The user reports GitHub/Vercel deployment; remote settings were not inspected or changed.

### Initial baseline findings (historical; current status is in SECURITY.md)

- Calendar login uses a localStorage session, a simple client-side password hash and a published default account. This is demonstration authentication, not access control for server APIs.
- API handlers inspected have no common authenticated authorization or rate-limiting boundary; credential-backed calls can incur cost or send email. MCP permits wildcard CORS.
- The HTTP proxy blocks only some literal private hosts, permits redirects and does not validate DNS-resolved IPs. It is not a complete SSRF defense (IPv6, other private ranges, redirects and DNS rebinding need treatment).
- Existing stores retain business data in localStorage; provider error messages are sometimes returned/logged. Redactor is deliberately disconnected from these paths.
- Remediate these issues before claiming the entire workbench is suitable for confidential production use. This increment is not a full penetration test or security certification.

## ADR 001 — first secure redaction increment

Decision recorded before implementation: process a restricted text DOCX entirely in the browser, reconstruct a new OOXML package, and verify that package before download. ZIP handling uses pinned MIT-licensed fflate and strict XML parsing uses pinned MIT-licensed @xmldom/xmldom. No document upload endpoint, provider, API key or server temporary file is needed.

| Option | Privacy and operations | Decision |
| --- | --- | --- |
| Browser processing | Bytes remain in the current tab; no retention backend; bounded client CPU/memory; trusted app scripts/extensions/device still matter | Choose for initial restricted DOCX |
| Vercel function | Central parser control but unredacted bytes cross network, request/body/runtime limits apply; requires real auth, quotas, isolation, retention policy and private logs | Do not introduce for initial increment |
| Isolated backend/container | Can host native PDF/OCR tooling with explicit erasure, durable jobs and resource isolation; adds confidential storage and operational obligations | Evaluate for later PDF/XLSX increments |

`/redactor` is a dedicated route outside the architect/workflow shell. A route-specific CSP blocks fetch, WebSocket and other connect destinations, forms, objects, framing, and external scripts. Inline scripts are enabled for Next hydration, so this is defense in depth rather than an XSS-proof sandbox. The local Web Worker has no network/storage/logging code; it is terminated on clear/unmount or a 15-second processing timeout. Bundled local code is used; no runtime CDN. No document data is saved in localStorage/IndexedDB; the only redactor storage read is the existing theme preference. Clear/unmount releases references; JavaScript cannot promise physical memory zeroization, and browser/OS swap or extensions are outside this boundary. Downloads intentionally persist on the user's device.

### Supported contract

First increment supports UTF-8 transitional OOXML DOCX with plain body paragraphs/runs. It preserves direct bold, italic, underline, font size, paragraph alignment and basic page size/margins. It reconstructs a three-entry DOCX ZIP: content types, root relationship, and document XML. It does not copy any source archive entry. Named styles/themes/fonts, colors, indentation, paragraph spacing, columns and precise pagination are not preserved. Preview is a text review, not Word's page renderer.

Accept a maximum 5 MiB file, 100 archive entries, 8 MiB declared expanded total, 1 MiB document XML, bounded XML nodes/depth and 100,000 text characters. Reject malformed XML/ZIP, duplicate/unsafe archive paths, unsupported compression and excess expansion. Validate extension, MIME (allow empty/octet-stream where browsers omit MIME), ZIP signature and Word main content type. DTDs/entities are forbidden.

Archive preflight compares local and central metadata, rejects ZIP64/multidisk/encryption and overlapping entries, checks declared bounds before inflation, and verifies actual entry sizes and CRC afterwards. XML is decoded strictly as UTF-8. The worker prevents parser stalls from blocking the UI; resource limits are deliberately conservative.

Reject PDF (including scans), XLSX (including hidden sheets/formulas), DOC/DOCM, encrypted files, tables, drawings/scanned DOCX, headers/footers, footnotes/endnotes, comments, revisions, fields, hyperlinks, embedded objects/macros, custom XML, hidden text and unsupported document elements. Common source metadata/settings/styles may be present but are never copied; hidden style definitions are rejected. All visible accepted text is shown for review. Unsupported structures are never silently dropped as successful redaction.

Detection suggests PAN, Aadhaar, GSTIN, TAN, Indian phone numbers, email, context-labelled bank accounts, IFSC and user-defined literal terms. These are format heuristics, not authoritative validity checks. Names/addresses, unlabelled bank numbers, unusual spacing and Unicode lookalikes require human review. Custom terms are literal (no user regex execution).

Review uses character offsets over paragraph text joined with newlines. Users can remove proposals, replace a proposal's range, add manual ranges and add literal terms. Export requires acknowledgement of complete review and formatting limitations. Overlaps are merged. Selected characters are removed and replaced with a constant `[REDACTED]`, not hidden or covered. Export rebuilds only supported values, reopens the ZIP, checks its exact entry set and XML, compares extracted text and formatting model with expected output, and rejects surviving selected strings anywhere in decompressed parts. Verification failure yields no download. This checks approved removals; it does not prove the user found all confidential material.

### Follow-on increments

PDF requires a licensed, genuine content-removal engine, sanitization of annotations/forms/attachments/metadata and independent extraction/object checks. Scans need a local or explicitly controlled OCR pipeline and image pixel removal with verification; no rectangle overlay exports. XLSX requires explicit handling of hidden sheets/rows/columns, shared strings, formulas/caches, links, comments, drawings and metadata; DOCX expansion requires equivalent coverage for tables, headers and other stories. Each remains unsupported until independently tested.

## Verification and dependency baseline

`pnpm test` runs synthetic Node core cases. `python tests/verify-independent.py` independently opens generated output using Python's ZIP/CRC/XML libraries. `pnpm test:browser` against a built production server covers actual file import, worker loading under CSP, manual/custom proposals, acknowledgement, verified download, failed-verification/no-download behavior, malformed/unsupported inputs, mobile width, existing navigation and absence of document network/storage activity. See CHANGELOG.md for actual run results. Word/LibreOffice visual fidelity and non-Chromium browsers have not been validated; the UI requires inspection of exports in Word before sharing.

The original lock resolved Next.js 16.4.0 and React/React DOM 19.3.0. Build/audit identified two critical and one high Next.js advisory, so this increment pins Next.js 16.4.3, React/React DOM 19.3.1, React Flow 12.12.0, fflate 0.8.3 and @xmldom/xmldom 0.9.12. Playwright 1.62.1 is development-only. The patched audit reports no known vulnerabilities; this does not resolve the application-level security findings above. Library references: [fflate](https://github.com/101arrowz/fflate), [xmldom](https://github.com/xmldom/xmldom), [Next.js security notice](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
