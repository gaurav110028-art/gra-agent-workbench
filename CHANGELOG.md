# Changelog

## 2026-10-25 — Phase 1.5: security hardening

- Added severity-ranked findings, an egress inventory, deployment requirements, evidence limits and explicit Go/No-Go assessment in `docs/SECURITY.md`; updated AGENTS.md, architecture and setup instructions. No PDF/XLSX redaction features were added.
- Replaced forgeable browser authentication with server-configured salted-scrypt accounts, pinned iron-session encrypted HttpOnly cookies, absolute one-hour expiry, expiring active-session records and logout replay rejection. Role/password/version changes revoke prior generations. Removed the default password authority and migrated legacy local auth records to non-authoritative directory data.
- Guarded workbench/redactor pages and every API handler. Added admin/operator/viewer permissions, scoped MCP/webhook tokens, strict cookie-request origin checks, explicit integration-origin CORS, login redirects using the trusted configured origin, and no-store security responses. Email and shared query-buffer deletion require admin authority.
- Added atomic Redis-backed rate limits and session state with a bounded local-only memory adapter. Vercel refuses memory mode and security-store failure fails closed. Applied global pre-auth, per-route/principal and login/account budgets, actual streamed request-body limits and deadlines, plus sanitized errors. Added `.env.example` and a hidden-password account-provisioning helper.
- Replaced vulnerable hostname-only HTTP checks with all-answer public-IP validation, DNS-pinned native connections, per-hop redirect validation, cross-origin credential stripping, unsafe body/downgrade redirect rejection, response/header bounds and timeouts. Vercel HTTP destinations require an explicit hostname allowlist. Fixed-provider calls use HTTPS host allowlists and refuse redirects. Gemini credentials moved out of URLs into headers.
- Removed raw provider-error console/telemetry values and audit provider previews. MCP audit records retain static action metadata without parameter/result values. Existing external Audit Demo now has an explicit server enable flag and synthetic-only acknowledgement before upload; reduced its source cap to 3 MiB and multipart cap to 4 MiB for Vercel compatibility. Bounded/CRC-checked its existing workbook ZIP extraction; this does not add spreadsheet redaction.
- Hardened browser DOCX package/relationship validation and worker response CSP. Unexpected parts, ambiguous main declarations, missing/unsafe relationship targets and duplicate IDs fail closed. The verified fresh three-part export and manual review workflow remain.
- Moved MCP/SSE to Node, added finite 45-second streams with cancellation cleanup and configured-origin endpoints. Simulated delayed completion uses Next `after()`; state remains non-durable and is labelled accordingly. Validated automation IDs, removed prototype-bearing lookups, capped prototype state growth, and prevented a late completion callback from undoing cancellation.
- Kept default bulk email capacity within the admin rate budget (60/minute). Fixed an existing partial-delivery false-success result: a batch containing failed/unconfirmed deliveries now reports failure with delivery counts instead of claiming the whole batch was sent.
- Added pinned iron-session 9.0.1 and ipaddr.js 2.5.0; explicitly marked the existing ES-module codebase as an ES module package.

### Phase 1.5 validation

- `pnpm test`: 49 tests passed, including the original redaction coverage plus authentication/session tampering/expiry/revocation, role/scoped-token policy, CSRF, shared-store failure behavior, body/JSON limits, SSRF/DNS/redirect/native-transport checks, prototype state protection, cancellation and partial delivery handling.
- `pnpm build`: passed with all original routes/features still present and no Edge-runtime warnings.
- `pnpm test:production`: passed all three stages (server API/security regression, browser authentication/logout/forged-session checks, and the complete DOCX browser regression). Verified configured-origin redirects, post-response simulated completion, malformed/MCP argument rejection, CSP-blocked document and worker fetches, manual redaction and verified download, failed-verification/no-download behavior, mobile width and existing navigation.
- Both independent Python checks passed: stdlib ZIP/CRC/XML extraction and python-docx source/output interoperability.
- `pnpm audit`: no known vulnerabilities reported. `git diff --check`: no whitespace errors. These checks do not constitute a security certification.
- Production-server regression harness uses ephemeral synthetic identities/tokens, explicit local memory security state, cleared provider keys and an isolated localhost port. It does not write deployment/environment configuration or call external AI/email providers.
- Live Redis/multi-instance Vercel behavior, actual remote deployment settings, external provider/email delivery, MFA/SSO, tenant isolation, immutable approvals and durable background scheduling remain unverified or unimplemented. Confidential-data use remains No-Go; hosted synthetic testing is conditional on provisioning and hosted smoke tests described in SECURITY.md.

No commits, pushes, merges or deployments were performed.

## 2026-10-25 — Secure Document Redactor, first increment

- Audited the actual Next.js App Router workbench and documented its views, API integrations, browser storage, deployment trade-offs and existing security gaps in `docs/ARCHITECTURE.md`.
- Added `AGENTS.md` with preservation, privacy, verification and release rules.
- Added a Document Redactor navigation link and dedicated `/redactor` route using the existing dark/light semantic design tokens and responsive layout. Existing tools and API routes remain present.
- Implemented restricted plain text DOCX import, local worker processing, PAN/Aadhaar/GSTIN/TAN/phone/email/labelled-bank-account/IFSC suggestions, highlighted text preview, custom literal terms, manual range addition/correction/removal and mandatory human review.
- Added fresh-package DOCX export: selected characters are physically omitted, basic direct formatting retained, source metadata and package extras discarded. Reopen/model/package checks block downloads on verification failure or surviving selected values. Export remains subject to human inspection for missed identifiers and formatting changes.
- Added type/MIME/signature/content-type checks, archive size/count/expansion/path/CRC checks, strict XML parsing, DTD rejection, complexity limits, 15-second worker timeout and explicit unsupported-content errors. Clear/unmount terminates workers; temporary download URLs are revoked. There are no document upload endpoints, AI calls, document logs or document persistence stores.
- Added a route-specific CSP blocking network connections, forms, objects and framing. Inline scripts remain enabled for Next hydration; this is not an XSS-proof sandbox.
- PDF/scanned PDF, XLSX and complex DOCX (tables, images, headers/footers, comments/revisions, links/fields, hidden text and embedded objects) remain unsupported. No visual masking export was introduced.
- Pinned dependencies; added fflate 0.8.3, @xmldom/xmldom 0.9.12 and Playwright 1.62.1 (development only).
- Updated the original Next.js 16.4.0 baseline to 16.4.3 and React/React DOM 19.3.0 to 19.3.1 after production build and pnpm audit identified two critical and one high advisory. The original baseline build was blocked; the patched production build succeeds. See the [maintainer security notice](https://nextjs.org/blog/nextjs-security-update-october-14-2026).

### Validation

- `pnpm test`: 19 synthetic core tests passed, covering successful redaction, run/paragraph boundaries, manual ranges, metadata, review gating, surviving-value failures, unsupported/scanned inputs, malformed archives/XML, hidden/embedded content, expansion limits, property ordering and XML escaping.
- `python tests/verify-independent.py`: passed using the bundled Python runtime; independent stdlib ZIP/CRC/XML extraction confirms synthetic selected identifiers and source author metadata are absent.
- `python tests/verify-word-compatibility.py`: passed using python-docx 1.2.0; independently generated plain-text source imported and output reopened with text/direct formatting intact and author removed. The stock template's custom XML bibliography is explicitly omitted from this fixture, since custom XML is unsupported. Word/LibreOffice visual rendering remains untested.
- `pnpm build`: passed on patched dependencies. Existing Edge runtime deprecation/static-generation warnings remain.
- `pnpm audit`: no known vulnerabilities reported after patching (registry audit is not a security certification).
- `pnpm test:browser`: passed against the production server in Chromium. Verified import → local worker → remove/add/correct/custom selections → required review → download and text extraction; blocked unsupported PDF/XLSX, malformed DOCX and a surviving-value export. No document API calls, request bodies, identifiers in URLs or identifiers in browser storage were observed. A live fetch attempt was blocked by CSP. Mobile overflow and existing navigation smoke checks passed; no uncaught page errors. Desktop screenshot visually inspected.

No commits, pushes, merges or deployments were performed.
