# GRA security assessment — Phase 1.5 and Phase 2

Phase 1.5 baseline: 25 October 2026. Restricted XLSX follow-on: 26 October 2026. The original hosting/confidential-data Go/No-Go gates remain in force; XLSX support does not establish broader production readiness.

## Scope and recommendation

Reviewed all repository API handlers, browser authentication/directory helpers, server provider adapters, generic HTTP egress, browser DOCX import/export, CSP, and the repository's Next/Vercel runtime settings. Tests use synthetic data only. No real provider calls, deployment changes, commits or pushes were made.

**NO-GO for deploying to the existing Vercel environment on the evidence currently available. GO for the isolated local synthetic test harness once its checks pass.** Hosted synthetic testing can proceed only after the operator provisions the configuration below, enables Vercel deployment protection, and repeats the hosted access-control/egress/redactor smoke checks. Remote project settings, Redis service behavior and edge/platform controls have not been verified here. Confidential client data remains **NO-GO**.

The Vercel connector could not list projects without a required connection `link_id`, and no linked `.vercel` project configuration was present in this checkout. This report therefore distinguishes repository changes/local evidence from remote hosting assumptions.

## Findings by severity

| ID | Severity at discovery | Confirmed issue | Fix/status |
| --- | --- | --- | --- |
| S01 | High | AI/email APIs and shared webhook/MCP/scheduling state accepted unauthenticated callers; browser login did not guard the workbench | Every API export is wrapped with server authentication, permission checks, rate/body limits and no-store responses. Pages `/` and `/redactor` require a verified browser identity. Anonymous calls are rejected before handlers run. |
| S02 | High | Known default password, weak client-side hash, forgeable localStorage sessions | Removed default credential authority. Pinned iron-session encrypts/authenticates cookies. Server-configured accounts use salted scrypt (N=65536, r=8, p=1, 64-byte derived hash); passwords never enter localStorage. Legacy local hashes/session data are removed at login. |
| S03 | High | Generic HTTP proxy checked only selected literal hostnames and followed redirects; private IP, IPv6, DNS/redirect bypasses remained | Validate canonical URL, all DNS answers, public address ranges and every redirect; pin native socket lookup to an approved IP while retaining URL hostname/TLS verification; no pooled sockets or environment proxy. Block unsafe URL forms, downgrade/body-forwarding redirects, strip credentials on cross-origin redirects. Vercel requires exact hostname allowlisting. |
| S04 | High | No server-side throttling/body bounds; response fully buffered before truncation; unbounded SSE lifetime | Shared atomic Redis counters and expiring session records; local-only bounded memory adapter. Global pre-auth and per-principal/per-route budgets, login/account budgets, streamed body limits/deadlines, bounded upstream responses/timeouts, maximum 45-second SSE connections with abort/cancel cleanup. |
| S05 | High | Wildcard CORS on webhook/MCP and no browser origin enforcement | Cookie mutations require exact configured Origin; cross-site cookie requests are rejected. CORS returns an exact explicitly configured integration origin, never wildcard/credentials. Scoped bearer tokens support non-browser callers. |
| S06 | High | Existing Audit Demo forwarded source files to Anthropic; raw errors/provider previews could expose input or secrets | Audit is disabled by default, server opt-in plus per-request synthetic acknowledgement required, visible confirmation before upload, 3 MiB total sources/4 MiB request cap. Provider failures/logging are sanitized, raw previews removed. This gate cannot prove a user supplied synthetic data; confidential use remains prohibited. |
| S07 | Medium | Gemini key was in request URL; provider errors were logged and retained in telemetry; MCP audit retained input/result values | Gemini uses x-goog-api-key header; no raw provider-error logging; telemetry contains failure codes; MCP audit stores static action/parameter-name metadata. Provider calls have exact HTTPS host allowlists and refuse redirects. |
| S08 | Medium | DOCX importer accepted unexpected package entries/ambiguous main types and unsafe targets without explicit External mode | Source part allowlist, unique main-type declarations, mandatory root relationship, known relationship types, duplicate-ID/target existence checks, unsafe/absolute/external target rejection. Output remains a fresh exact three-part package. |
| S09 | Medium | Page CSP did not constrain a dedicated worker's own network requests | Separate restrictive response CSP on bundled static resources, including worker scripts; browser test actively verifies worker fetch rejection. No telemetry/CDN requests or document persistence were introduced. |
| S10 | Medium | User-controlled automation IDs indexed ordinary prototype-bearing objects; demo state could grow without bounds | Null-prototype dictionaries, identifier validation, own-property tool dispatch, 200-schedule/500-run caps. Demo schedules/executions now explicitly carry non-durable/simulation status. |
| S11 | Medium | Deprecated Edge handlers and hardcoded production SSE endpoint | MCP/SSE use Node runtime, 60-second function cap and 45-second stream limit. Endpoint comes from trusted configured app origin. Edge warnings are absent from the hardened build. Simulated delayed completion uses Next after() to retain the request lifecycle, and late callbacks cannot undo a cancellation. |
| S12 | High, remaining architecture risk | Browser-local workflow approval records are editable and are not an authoritative server approval ledger | Server email access is restricted to configured admins; viewer/operator and integration tokens cannot send email or clear the shared query buffer. An admin remains authorized to invoke email directly. Immutable approvals, separation of duties and recipient policy are not implemented. |
| S13 | High, remaining architecture risk | Business data and prototype schedules/queries/audits are stored in localStorage or per-instance memory | Preserved existing features. This is one shared workspace; no tenant/agent ownership isolation, durable scheduler or durable business/audit database is claimed. Do not use confidential data. |

Partial email delivery is also handled explicitly: a batch with any failed/unconfirmed delivery reports failure and counts rather than claiming all mail was sent. This matters when provider or rate-limit errors occur mid-batch.

## Authentication and authorization contract

- Accounts are server configuration in `GRA_AUTH_USERS_JSON`: an array of `{ id, email, name, role, version, passwordHash }`. IDs must be unique, roles are admin/operator/viewer, and hashes have the `scrypt$salt$hash` form. No public signup or password recovery exists.
- Create an account record with `node scripts/create-auth-user.mjs admin@example.test admin admin-id`. Password input is hidden in an interactive terminal and the script prints only the account record/hash. Use a unique real test password; do not reuse committed synthetic test credentials.
- `GRA_SESSION_PASSWORD` must be a high-entropy server secret of at least 32 characters. Use independent secrets for development, preview and production; never `NEXT_PUBLIC_` variables. Rotate it to invalidate all cookies.
- Login issues a fresh random session ID, stored with a one-hour TTL. Cookie payload contains only user ID/session ID/absolute expiry. HTTPS uses `__Host-gra-session; Secure; HttpOnly; SameSite=Strict; Path=/` with no Domain; explicit localhost HTTP uses `gra-local-session`. Absolute expiry is checked independently of seal clock skew. No sliding renewal.
- Each request rechecks the configured user, current role/password/version generation and active session record. Logout deletes the active session before clearing the cookie; replay is rejected. Password, role or version changes invalidate previous sessions. Removing an account/token requires updating server configuration and redeploying all instances; no instantaneous administrative UI is provided.
- Login is globally limited to 30 attempts/minute and 5 attempts/account/minute; unknown accounts take the same password-derivation path. Global pre-auth API budget is 600/minute. Additional principal/route budgets apply. No user-provided X-Forwarded-For value is trusted. Global budgets protect expensive work but can be exhausted by an attacker: configure platform WAF/IP controls for availability.

| Identity | Allowed operations |
| --- | --- |
| viewer | Workbench and shared query/MCP metadata reads; local restricted DOCX/XLSX tools |
| operator | Viewer reads, workflow/MCP mutations, webhook ingest, AI and permitted HTTP calls, opt-in synthetic audit |
| admin | All above plus email sending and shared-buffer clearing |
| service token | Only explicit mcp:read, mcp:write and/or webhook:ingest scopes. mcp:write callers also need mcp:read to enter the MCP transport. No browser/workbench session, email or query-buffer read/clear authority. |

Team/directory records and approval reviewer labels are UI data, not principals or role assignments. The app intentionally represents one trusted shared workspace; all authorized readers can see that workspace's shared server records. A viewer can alter their own browser-local copies; server permissions still apply. Separating firms/users requires a tenant-aware data model, not a new client-side role switch.

## Server egress inventory

| Operation | Destinations and controls |
| --- | --- |
| Generic workflow HTTP node | User URL; public HTTP(S), all DNS answers checked, connection pinned, each redirect revalidated (maximum 3), credentials stripped across origins, body-carrying cross-origin and TLS downgrade redirects rejected. 15-second total timeout; 256 KiB upstream body cap, 20,000-character display with explicit truncation flag. Exact hostnames required on Vercel via GRA_HTTP_ALLOWED_HOSTS. |
| AI node / architect router / Audit Demo | Fixed HTTPS OpenAI, Anthropic, Google Gemini, Groq and OpenRouter hosts; no redirects; DNS pinning and private-IP rejection; default 15-second call timeout/2 MiB response cap. Router fallback can make multiple bounded calls; it is not durable orchestration. Audit remains opt-in synthetic-only. |
| Email | Fixed api.resend.com HTTPS, same no-redirect/DNS/response bounds. Admin-only; 60 requests/minute supports the existing default 50-recipient bulk flow while bounding abuse. Provider idempotency remains; there is no server approval ledger. |
| Security store | Configured HTTPS *.upstash.io root endpoint only, exact hostname pin/allowlist, no redirects, 3-second timeout and 16 KiB response cap. Only pseudonymous limit keys, random session keys and principal-generation hashes; no documents/prompts are sent. Atomic EVAL increments with expiry; session SET EX/GET/DEL. Failure is 503 without a memory fallback on Vercel. |
| Browser UI | Existing same-origin APIs for workflows/queries/auth. External LinkedIn links are user navigation, not server fetch. Redactor has no auth/provider/data fetch while a document is open; auth is checked on navigation before processing. |
| Build/tooling | next/font downloads fonts at build and serves bundled fonts locally. Next CLI telemetry is controlled with NEXT_TELEMETRY_DISABLED=1; it is not document telemetry. No app analytics SDK was found. |

The native transport keeps normal certificate validation, retains the original URL hostname, overrides socket DNS lookup with a validated address, and creates a fresh agent-less connection. It validates every returned A/AAAA answer and rejects mapped/transition/reserved/loopback/private/link-local/CGNAT/multicast/documentation ranges. DNS failure and timeouts fail closed. Response compression is requested as identity and unexpected compression is rejected rather than decompressed without bounds. This does not replace infrastructure-level egress filtering.

## DOCX privacy boundary

The upload remains browser-only, with the original 5 MiB/100,000-character limits, local worker timeout, explicit human review, approved character removal, fresh package generation and fail-closed verification. No document contents, filename, custom term or selection enters auth, Redis, workflow stores, providers, logs or analytics. Authentication cookies are handled by the browser/server before loading the tool. Static worker responses carry connect-src none in addition to the page policy.

Known metadata/settings/styles/thumbnail input parts are stripped; unsupported components and relationships are rejected. No source ZIP entry is copied. Output has exactly `[Content_Types].xml`, `_rels/.rels` and `word/document.xml`; selected strings and expected text/format model are checked after reopening. Independent Python extraction and python-docx reopening complement the same-library runtime verification.

Remaining limits: inline scripts/styles are still allowed for Next hydration; this CSP is not an XSS-proof sandbox. Trusted app scripts, browser extensions/device access and browser/OS memory or swap remain in the trust boundary. Logout/expiry prevents future server/page access but cannot remotely erase an already loaded/offline document tab; Clear/unmount releases references and terminates the worker. Font/theme rendering and Word pagination are not exact. Pattern heuristics can miss confidential text. PDF/OCR and complex DOCX remain unsupported; restricted XLSX is covered below.

## Phase 2 — XLSX security boundary

The same authenticated `/redactor` page and network-blocked worker now inspect restricted XLSX. No route, server upload/store, provider API, runtime CDN, telemetry or new dependency was introduced. Original ZIP bytes are transferred to the worker; the UI receives only volatile review data. Sheet names, cell values, formulas, custom terms and ranges never enter server APIs, authentication, Redis, workflow stores or logs. Clear/unmount/timeout terminates the worker and releases review references; JavaScript cannot guarantee physical zeroization or prevent extension/OS access.

### Format controls

1. Validate `.xlsx`, MIME, ZIP signature, all archive entries/CRC/size/count, supported content types and root/workbook/worksheet relationships. Reject encryption/OLE, macro-enabled/binary/legacy/Strict formats, arbitrary parts, unknown namespaces/extensions, unsafe or external targets, duplicate/ambiguous IDs and unreferenced worksheets. Links are never followed.
2. Parse bounded ordinary worksheet cells and plain shared strings. Display hidden/veryHidden sheet state and hidden/zero-size row/column flags alongside raw values. Every worksheet and final output policy requires human acknowledgement; decision changes invalidate it.
3. Inspect formulas and supported cached primitives separately, but block every formula workbook from export, regardless of UI checkbox state. Do not evaluate a formula, trust a cached result as redacted output, or flatten it silently. Formula-like literal strings remain explicit string cells.
4. Block/reject comments/notes, hyperlinks, defined names, active protection, merges, tables, validation/conditional formatting, grouping/inherited styles, custom/hidden number formats, rich/phonetic text, drawings/embeddings, external links/connections, macros and unsupported features. Recognized blocked workbooks can be shown for inspection; rejected structures produce an explicit error with no output.
5. Rebuild all output XML and ZIP entries. Do not copy source metadata, names, shared strings, style XML, unused style records, theme/typeface labels, visibility flags or unknown components. Output sheet names are generic and all sheets/rows/columns unhidden; zero dimensions reset to defaults. Retain only allowlisted direct formatting, types, cell addresses and supported dimensions. Source print/view preferences are explicitly normalized away. See ADR 002 for exact caps and support.
6. Verify exact output entry set (five fixed parts plus sheets), CRC, all modeled values/types/styles/dimensions, no blockers/formulas, and absence of selected strings across decoded cells/names and every decompressed XML part. Verification fails closed and emits no download. Short/common ranges can collide with static XML labels and be rejected conservatively; no bypass is provided.

### Residual risks and compatibility limits

This is values-only XLSX support, not a general Excel anonymizer. Formula-heavy CA workbooks cannot be exported. Modern Excel extensions and unsupported formatting can cause otherwise ordinary files to be rejected. No Excel/LibreOffice desktop rendering, full OOXML conformance, formula engine or arbitrary embedded-content sanitization is claimed. Raw review does not reproduce formatted dates/numbers or page layout; custom terms match underlying cell text, not formatted displays or fragments spread across cells. Names/addresses and other non-pattern data require manual review, and bank candidates can be false positives.

The output policy deliberately changes names and hidden-state flags. A checked acknowledgement is a human attestation, not proof that all confidential data was found. At least one cell redaction is required; metadata-only cleanup is not available in this increment. Downloaded files persist on the user's device and must be opened/inspected before sharing. Direct colors/formatting can affect visual legibility, so the raw cell review and underlying-file checks matter; visual appearance is not evidence of removal.

The application-wide single-workspace/localStorage/instance-memory, approval-ledger, MFA/SSO and hosting limitations above still apply. GO for isolated local synthetic testing after validation; existing hosted/confidential-data recommendations are unchanged. Before broadening XLSX support, independently review the allowlist/writer and add a separately scoped, verifiable formula/cache strategy; do not relax blockers for convenience.

## Vercel/hosting readiness requirements

1. Set exact HTTPS `GRA_APP_ORIGIN` for the intended deployment. Do not infer security origin from Host or client-forwarded headers. Preview URLs need their own correct origin/configuration.
2. Provision `GRA_AUTH_USERS_JSON`, strong `GRA_SESSION_PASSWORD`, `GRA_SECURITY_STORE=redis`, `GRA_REDIS_REST_URL` and `GRA_REDIS_REST_TOKEN` for each environment. Memory storage is refused whenever VERCEL is set. Deployments fail closed if these are missing/unavailable.
3. Configure exact HTTP egress hostnames and any integration CORS origins/tokens. Tokens are high-entropy bearer values; store only SHA-256 digests in `GRA_SERVICE_TOKENS_JSON`, distribute plaintext out-of-band and rotate on compromise. Never put tokens in URLs. Use separate preview/prod tokens and Redis namespaces (the app namespaces by origin).
4. Enable Vercel deployment protection and appropriate WAF/IP rules. Test session expiry/logout, allowed scopes and Redis failure on the real preview. Actual platform settings were not changed or verified.
5. Keep Audit Demo disabled unless explicitly testing synthetic sources. Do not configure real email/provider credentials for the initial redactor-only synthetic preview unless needed and controlled.
6. Confirm Node runtime/memory/duration/region settings and Redis connectivity/latency. SSE intentionally reconnects after 45 seconds. Schedules, webhook buffers and telemetry still do not survive cold starts, instance changes or deployments.
7. Vercel's documented request/response limit is 4.5 MB; the server wrapper caps multipart audit requests at 4 MiB and sources at 3 MiB. DOCX processing never crosses that function boundary. Other JSON requests default to 256 KiB; login 4 KiB; logout 1 KiB. Body-read deadline is 10 seconds. See [Vercel limits](https://vercel.com/docs/functions/limitations).

## Validation evidence

Phase 2 validation passed 68/68 Node tests, all four production-harness stages, all three independent Python checks, and the production build without Edge-runtime warnings. `pnpm audit` reported no known vulnerabilities and `git diff --check` reported no whitespace errors. The actual Chromium XLSX download is piped in memory to an independent Python ZIP/CRC/XML and openpyxl verifier; all fixtures/downloads are synthetic. Detailed command results are recorded in CHANGELOG.md.

`pnpm test:production` starts a built server on localhost:3100 with ephemeral synthetic users/tokens, local memory security storage, and inherited provider keys cleared. It retains anonymous-denial, role/scope/CSRF/CORS, throttling, request-body limits, revocation, workflow/MCP/webhook and DOCX regressions. The XLSX stage tests multiple/hidden sheets, raw hidden cells, manual/custom/corrected/rejected proposals, per-sheet review, actual download and independent reopen, UI and worker export blocking, missed-duplicate verification failure, malformed/unsupported/macro/size errors, page/worker CSP, absence of document network/storage activity, and mobile width. The harness then shuts down its server. Python 3 with openpyxl is required; set GRA_TEST_PYTHON if it is not on PATH.

Mocked Redis tests verify atomic command construction and failure behavior; they do not prove live multi-instance Redis/Vercel integration. No penetration test, external provider/email smoke test, high-load test, non-Chromium browser check or Word/LibreOffice visual rendering is claimed. Those gaps and the remaining architecture findings prevent a confidential production-readiness claim.

References: [iron-session](https://github.com/vvo/iron-session), [Node HTTPS request options](https://nodejs.org/api/https.html#httpsrequestoptions-callback), [Vercel limits](https://vercel.com/docs/functions/limitations).
