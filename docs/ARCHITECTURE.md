# GRA Agent Workbench architecture

## Current document capabilities — Phase 2

`/redactor` supports the original restricted DOCX workflow and a restricted, values-only XLSX workflow. Both use the same authenticated page and CSP-constrained local worker; no upload API, provider call, telemetry channel or document persistence was added. The server hardening below remains intact. See ADR 002 for the XLSX contract; historical statements about XLSX being wholly unsupported refer to the earlier phases.

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

PDF requires a licensed, genuine content-removal engine, sanitization of annotations/forms/attachments/metadata and independent extraction/object checks. Scans need a local or explicitly controlled OCR pipeline and image pixel removal with verification; no rectangle overlay exports. Restricted XLSX support is now implemented in ADR 002; formulas, advanced workbook features and DOCX expansion still need their own independently tested handling.

## Verification and dependency baseline

`pnpm test` runs synthetic Node core cases. `python tests/verify-independent.py` independently opens generated output using Python's ZIP/CRC/XML libraries. `pnpm test:browser` against a built production server covers actual file import, worker loading under CSP, manual/custom proposals, acknowledgement, verified download, failed-verification/no-download behavior, malformed/unsupported inputs, mobile width, existing navigation and absence of document network/storage activity. See CHANGELOG.md for actual run results. Word/LibreOffice visual fidelity and non-Chromium browsers have not been validated; the UI requires inspection of exports in Word before sharing.

The original lock resolved Next.js 16.4.0 and React/React DOM 19.3.0. Build/audit identified two critical and one high Next.js advisory, so this increment pins Next.js 16.4.3, React/React DOM 19.3.1, React Flow 12.12.0, fflate 0.8.3 and @xmldom/xmldom 0.9.12. Playwright 1.62.1 is development-only. The patched audit reports no known vulnerabilities; this does not resolve the application-level security findings above. Library references: [fflate](https://github.com/101arrowz/fflate), [xmldom](https://github.com/xmldom/xmldom), [Next.js security notice](https://nextjs.org/blog/nextjs-security-update-october-14-2026).

## ADR 002 — restricted browser-side XLSX reconstruction

Decision: extend the existing local worker with a format-specific parser and canonical XLSX writer using the already pinned fflate and @xmldom/xmldom. A broad spreadsheet library's load/edit/save path would increase the number of features/parts requiring sanitization. The first increment instead has an explicit capability allowlist and creates every exported ZIP entry from reviewed model values. No new runtime dependency, key or server endpoint is required.

Browser processing keeps originals off Vercel/providers and retains the existing CSP/privacy boundary. It limits CPU/memory and compatibility, so unsupported workbooks are rejected or shown as inspection-only, never described as fully redacted. A backend would add confidential upload/retention/authorization duties without removing the OOXML sanitization problem; it is not introduced here.

### Modules and flow

- `lib/redactor/ooxml.mjs`: bounded UTF-8/XML parsing, XLSX ZIP preflight/CRC verification, namespace/attribute guards, XML and SpreadsheetML string escaping.
- `xlsx-styles.mjs`: a restricted style reader/writer; no source style XML or typeface/theme labels are copied.
- `xlsx.mjs`: package/content-type/relationship validation, worksheet model, fresh archive writer, redaction and fail-closed export verification.
- `xlsx-detect.mjs`: cell-addressed suggestions using existing PAN/Aadhaar/GSTIN/TAN/IFSC/email/phone patterns, 9–18 digit bank-account candidates, and bounded literal custom terms.
- `redactor.worker.js`: owns the format/model and exports only after review; its own CSP still blocks network access.
- `XlsxReview.js`: worksheet selector, paginated raw-cell table, hidden-state labels, formula/cache inspection, enabled/rejected proposals, manual range correction/addition, custom terms, per-sheet acknowledgement and final review.

### Supported input and output

| Structure | First increment contract |
| --- | --- |
| Container | UTF-8 transitional OOXML `.xlsx`; extension/MIME/signature/content types and root/workbook relationships must agree |
| Worksheets | 1–20 ordinary worksheets; source order and stored cell addresses retained; output names are always Sheet1, Sheet2, etc. |
| Visibility | visible/hidden/veryHidden sheets and explicit hidden/zero-height rows/zero-width columns are identified in raw review; output sheets, rows and columns are unhidden; zero sizes reset to a safe default |
| Values | Plain inline/shared text, blank stored cells, Boolean and ordinary finite decimal numeric cells with at most 15 significant digits; long identifiers must be stored as text |
| Shared strings | Plain `<si><t>` resolved into each cell; unused strings and the entire source SST are discarded; output text uses explicit inline strings |
| Formatting | Limited direct bold/italic/single underline, 8–72pt size, RGB colors, solid fills, basic four-side borders, left/center/right alignment, wrap, allowlisted built-in number formats, supported row heights and column widths |
| Normalization | Source font names become Calibri; theme/indexed colors use safe defaults; metadata, source names, unused styles and print/view preferences are not retained. This is disclosed before review/export; exact Excel appearance is not claimed |
| Formula inspection | Formula expression and supported cached value displayed/detected separately; every formula (including shared/array formula entries) blocks export; no evaluation or cache-trusting flattening |

Text replacement physically removes selected characters and inserts `[REDACTED]`. A redacted numeric/Boolean cell becomes an explicit string. Literal strings beginning with `=` remain strings, never formulas. OOXML `_xHHHH_` escapes are decoded once; literal output escape-like strings and carriage returns are encoded explicitly. Invalid controls/surrogates are rejected.

Each worksheet must be acknowledged, followed by final review. Selection/term/approval changes invalidate acknowledgements. At least one cell range is required in this increment; metadata-only or zero-selection cleanup is not offered. The review is raw cell data, not a rendered Excel grid: blank gaps are omitted and ordinary display formatting may differ.

### Blocked features and limits

The workbook may be inspected but export is blocked for formulas/caches, defined names, merges, hyperlinks, active workbook/sheet protection, grouping/inherited row/column styles, frozen/custom views, value-hiding views, conditional formatting, validation, tables, headers/footers and other recognized unsupported features. Unknown structures, rich/phonetic strings, custom number formats (including hidden `;;;` formats), unsupported/hidden styles, extensions, malformed data and unsafe relationships are rejected. Comments/notes, drawings/images/charts, embeddings, external links/connections, custom XML, calculation chains, VBA/macros and other extra package parts are rejected. No links are followed. Empty default protection/defined-name containers do not enable those features and are normalized away.

XLSM/XLSB/XLS/XLTM, encrypted/OLE containers, Strict OOXML and macro content types renamed to XLSX remain unsupported. Modern Excel files with unsupported extension attributes can be rejected even if their visible cells appear simple. Full Excel/LibreOffice compatibility has not been established.

Limits: 5 MiB input, 100 ZIP entries, 8 MiB declared expansion, 2 MiB per expanded archive entry, 1 MiB per XML part, 50,000 XML nodes/40 levels per part, 20 sheets, 10,000 stored cells, 10,000 row index/256 columns, 100,000 total cell/formula characters, 32,767 characters per string/formula, 32 cell styles, 64 fonts/fills/borders, 2,000 proposals and 30 custom terms of at most 200 characters. Existing 15-second worker timeout and clear/unmount termination apply. The table renders 100 review entries per page.

### Export verification

Output contains exactly five fixed parts plus one XML part per worksheet: content types, root relationships, workbook, workbook relationships, styles and sheet XML. Original archive entries are never copied. The writer removes source metadata, source names, shared strings, unused styles and visibility flags; it cannot write a supported export containing a formula. Runtime verification reopens the complete ZIP, checks CRC/entry set, compares every supported value/type/style/row/column property with the intended model, and searches every decompressed part plus decoded cell/name text for surviving selected strings (including XML/Xstring encodings). It emits no download on mismatch. Short/common selected strings may collide with fixed package labels and fail conservatively; choose a wider range rather than bypassing verification.

Independent tests use Python zipfile/CRC/XML extraction and openpyxl 3.1.5. They inspect rebuilt output, reopen supported values/styles/visibility, import an independently authored workbook, and inspect the actual Chromium download. These checks complement the runtime parser; they are not proof of full OOXML compliance or exact desktop rendering. Source references: [Microsoft shared strings](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-the-shared-string-table), [cell/formula cached values](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cellvalue), [Xstring escaping](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/bd0aa042-434a-4ca7-b25f-4e1fd25a954d).
