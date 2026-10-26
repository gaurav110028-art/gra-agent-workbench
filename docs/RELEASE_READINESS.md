# Local release candidate — 26 October 2026

Branch: `feature/secure-document-redactor`. This is a restricted DOCX/XLSX/selectable-text-PDF release candidate. OCR, scans/mixed-image PDFs (including logos), complex Office documents and formula XLSX export remain unsupported. No deployment or remote configuration was performed. See [SECURITY.md](SECURITY.md) for the threat model and [ARCHITECTURE.md](ARCHITECTURE.md) for format contracts.

## 1. Verified locally

- [x] Production build passed with original routes retained and no Edge-runtime warnings.
- [x] 80/80 Node tests passed, including PDF zoom/scroll/viewport coordinate invariance, bounded move/resize and 4.5:1 shared normal-text/primary-button token contrast in both themes (including hover).
- [x] All six production-harness stages passed: API/security, browser authentication, DOCX, XLSX, PDF and release UI. Provider credentials were cleared; principals/tokens were ephemeral synthetic values, with explicit local-memory security storage. The UI stage uses its own configured viewer identity so cumulative tests do not exceed the real per-account login limit.
- [x] All three existing independent Python checks passed (DOCX ZIP/XML and python-docx; XLSX ZIP/XML/openpyxl). Actual browser XLSX/PDF downloads passed independent verification. PDF checks include all objects/streams, image pixels and Poppler rendering.
- [x] Synthetic client-information sheet, invoice, GST and 240-row balance-workbook cases passed. Checked large-cell navigation/export, hidden/veryHidden source data, DOCX selection location/download, PDF zoom/pan/resize/keyboard editing and unapplied-draft blocking.
- [x] Browser coverage includes dark/light, desktop/tablet/mobile, persisted collapsed-sidebar mobile navigation, focus indicators, drag/drop import, required reviews, failure/no-download, cancellation/watchdog, page/worker CSP and absence of document API/storage activity. Screenshots were visually inspected. This is Chromium coverage, not a comprehensive accessibility or cross-browser certification.
- [x] Existing anonymous denial, role/scope enforcement, CSRF/CORS, session revocation, upload/body bounds, rate limiting, pinned-DNS egress and shared-store failure tests passed. Server security/CSP/format-engine files were not changed in Phase 4.
- [x] `pnpm audit` reported no known vulnerabilities; `git diff --check` passed. No new dependencies were installed in Phase 4. No commits/pushes/merges/deployments occurred.

Use `pnpm build` followed by `pnpm start` for local release QA, with credentials/storage provisioned as described in README/SECURITY. Development-mode redactor hydration did not complete in this session; its compatibility remains unverified. Production-mode validation passed without relaxing CSP. Python/Poppler are test-only dependencies and are not needed in a browser or Vercel runtime.

## 2. Requires Vercel configuration — not performed or verified

- [ ] Choose the actual preview project/domain and configure exact HTTPS `GRA_APP_ORIGIN`. Scope settings separately to preview/production; do not infer origin from incoming Host/proxy headers.
- [ ] Provision real strong server-only `GRA_SESSION_PASSWORD` and configured `GRA_AUTH_USERS_JSON` principals with salted scrypt password hashes (use `scripts/create-auth-user.mjs`). Never reuse test credentials, expose secrets through `NEXT_PUBLIC_*`, or put secrets in URLs/logs.
- [ ] Set `GRA_SECURITY_STORE=redis`, `GRA_REDIS_REST_URL` and `GRA_REDIS_REST_TOKEN` for the supported HTTPS Upstash endpoint. Check network/region latency and namespace separation. Vercel refuses local memory mode; missing/unavailable storage must fail closed.
- [ ] Enable Vercel Deployment Protection and appropriate WAF/rate/bot controls for the intended synthetic testers. These platform controls complement application authorization.
- [ ] Confirm a PDF.js-compatible Node runtime (>=22.13 or >=24), supported Next build/install commands and worker/static font bundle availability. Check deployed function duration/memory/region settings and Redis connectivity; do not route redactor documents through Functions or Blob.
- [ ] Keep provider/email credentials absent from the initial redactor-only synthetic preview, and `GRA_ENABLE_SYNTHETIC_AUDIT=false`. If separately testing workbench integrations, configure only required provider credentials, exact HTTP egress hosts and integration origins/scoped token digests. Their external delivery is not covered by local mocks.
- [ ] Set `NEXT_TELEMETRY_DISABLED=1` for build tooling if desired. No document analytics or error-body telemetry may be introduced. Do not copy local `.env` values blindly into Vercel.

## 3. Requires hosted synthetic testing — no live evidence yet

- [ ] Confirm Deployment Protection and anonymous `/` and `/redactor` redirects; anonymous APIs return 401. Check viewer/operator/admin denials and scoped-token boundaries using provisioned synthetic identities.
- [ ] Verify real HTTPS Secure/HttpOnly cookies, exact-origin redirects and CSRF, login throttling, one-hour expiry, role/password-generation revocation and logout/replay rejection. Do not spoof forwarded IPs to obtain a fresh rate budget.
- [ ] Confirm shared session/rate state across instances/regions and cold starts. Safely test Redis unavailability/missing configuration on an isolated preview; expect denial/503, never a memory fallback.
- [ ] Confirm deployed page **and worker-response** CSP blocks network fetches. Verify bundled PDF standard fonts/worker scripts load locally without CDN/CMap/OCR requests or document contents in request bodies, URLs, browser storage or remote logs.
- [ ] Run all three synthetic upload/review/download cases against the preview, including hidden Excel data, PDF zoom/scroll/resize, mobile and keyboard paths. Independently inspect the actual hosted downloads with the existing Python/openpyxl/pypdf/Poppler checks. Keep synthetic files small and inside the documented supported subset.
- [ ] Repeat malformed, oversized, encrypted, scanned/mixed-image and unsupported-component rejection, incomplete-review and verification-failure/no-download, cancellation and watchdog cases. Confirm the deployed bundle matches the reviewed release revision.
- [ ] If enabling unrelated integrations, separately smoke-test explicit allowed destinations/redirect policy and provider/email delivery. Local mock success is not hosted/provider evidence.

## 4. Blocks confidential production use

- Live Vercel/Redis configuration and the hosted checks above are unverified. Current verdict for the existing unverified deployment is **NO-GO**. A protected hosted synthetic preview is **conditionally eligible** once configuration is completed and hosted smoke tests pass; it is not authorized or deployed by this local report.
- Detection is heuristic. Human review is mandatory; selected-pixel/character verification does not establish complete anonymity. Small/incorrect/rejected PDF regions can leave readable data. XLSX review shows raw values, not formatted Excel displays.
- PDF output loses selectable text/accessibility/signatures. OCR, mixed-image PDFs, complex DOCX and advanced/formula XLSX remain blocked. Broad font/layout, multilingual and non-Chromium/device-memory compatibility require more evidence.
- No independent penetration test, full accessibility audit, high-load/browser heap-isolation proof or comprehensive format-conformance review has been performed. Browser extensions, compromised scripts/device access and OS memory/swap remain in the trust boundary.
- Existing single-workspace, browser-local team/approval data and instance-memory schedules/buffers/audit history are prototype state. There is no tenant isolation, enforceable durable approval ledger, durable job scheduling or MFA/SSO implementation. Do not market these as provided controls.

**GO:** isolated local synthetic-data release-candidate testing. **Hosted synthetic:** conditional after configuration and hosted validation; currently NO-GO on unverified infrastructure. **Confidential production:** NO-GO.
