# GRA Agent Workbench

Next.js workbench for CA workflows, agent execution, approvals, sources, query inbox, calendar and GRA AI Architect.

```sh
pnpm install --frozen-lockfile
# Configure server credentials/storage from .env.example first (see docs/SECURITY.md).
pnpm dev
```

Production: `pnpm build`, then `pnpm start`. AI/email integrations need their existing server environment variables. DOCX processing requires no AI/provider keys; application access requires server authentication and security-storage configuration.

Sign in with a server-provisioned account, then open **Document Redactor** in the sidebar or visit `/redactor`. It supports restricted plain text DOCX, a values-only XLSX subset and ordinary selectable-text PDF, rebuilding exports after human review and verification. XLSX supports multiple sheets and limited direct cell formatting; hidden data is shown for review and output names/visibility are normalized. Formulas/caches can be inspected but formulas, comments, hyperlinks, defined names, custom formats and other unsupported features block XLSX export. PDF export overwrites approved pixels and builds a fresh raster-only PDF, losing selectable text/accessibility/signatures. Scanned/mixed-image PDFs (even logos), OCR, annotations/forms/layers, encrypted files, macros/legacy spreadsheets and complex DOCX remain unsupported. Read [security setup and Go/No-Go assessment](docs/SECURITY.md) and [architecture/support contract](docs/ARCHITECTURE.md). There is no default password; missing security configuration fails closed. Confidential-data production use is not approved by this assessment.

Tests use synthetic data only:

```sh
pnpm test
python tests/verify-independent.py
python tests/verify-xlsx-independent.py
pnpm exec playwright install chromium
pnpm build
# Isolated production-server + browser security checks, ephemeral synthetic users,
# no real provider credentials or .env changes; requires Python/openpyxl/pypdf/Pillow/ReportLab and Poppler:
pnpm test:production
# For a manually configured local instance:
pnpm start
# In another terminal against the running production server:
# Set GRA_TEST_EMAIL / GRA_TEST_PASSWORD to a provisioned synthetic account.
pnpm test:browser
```

Set `GRA_TEST_URL` to test another local origin. Python 3 is used for independent verification and synthetic interoperability inputs, not by the application. Browser testing uses Chromium and includes local import, manual review, export/download inspection, network/storage checks and rejection scenarios. No existing lint/typecheck script was present; production compilation is the repository's build validation.

XLSX independent checks require `openpyxl` (verified with 3.1.5). Set `GRA_TEST_PYTHON` to the full Python executable path if `python` is unavailable. The production suite independently inspects its actual synthetic XLSX download using Python ZIP/XML and openpyxl, in addition to the original DOCX/authentication regressions. Test downloads and spreadsheet originals are never uploaded to an application endpoint or provider.

Optional interoperability test: `python tests/verify-word-compatibility.py` (requires `python-docx`). It generates a plain-text fixture with an independent DOCX writer and reopens the redacted result. The stock template's custom-XML bibliography is explicitly removed from that fixture because custom XML remains unsupported.

PDF requires a current browser with OffscreenCanvas. `pnpm dev` and `pnpm build` prepare bundled standard fonts from pinned PDF.js; no font/CDN downloads occur during document processing. Node >=22.13 or >=24 is required by PDF.js tooling. The fifth production test stage verifies the actual PDF download with Python `pypdf`, `Pillow` and Poppler `pdftoppm`, and tests independently generated `reportlab` input. Set `GRA_TEST_PYTHON` and `GRA_TEST_PDFTOPPM` if executables are not on PATH. Target only this stage during development with `node tests/run-production.mjs tests/pdf.browser.mjs`; full `pnpm test:production` still runs every stage.
