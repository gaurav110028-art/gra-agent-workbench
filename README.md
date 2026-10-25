# GRA Agent Workbench

Next.js workbench for CA workflows, agent execution, approvals, sources, query inbox, calendar and GRA AI Architect.

```sh
pnpm install --frozen-lockfile
# Configure server credentials/storage from .env.example first (see docs/SECURITY.md).
pnpm dev
```

Production: `pnpm build`, then `pnpm start`. AI/email integrations need their existing server environment variables. DOCX processing requires no AI/provider keys; application access requires server authentication and security-storage configuration.

Sign in with a server-provisioned account, then open **Document Redactor** in the sidebar or visit `/redactor`. The tool accepts only restricted plain text DOCX and exports a newly built DOCX after human review and verification. PDF, scanned documents, XLSX and complex DOCX are explicitly unsupported. Read [security setup and Go/No-Go assessment](docs/SECURITY.md) and [architecture](docs/ARCHITECTURE.md). There is no default password; missing server security configuration fails closed. Confidential-data production use is not approved by this assessment.

Tests use synthetic data only:

```sh
pnpm test
python tests/verify-independent.py
pnpm exec playwright install chromium
pnpm build
# Isolated production-server + browser security checks, ephemeral synthetic users,
# no real provider credentials and no .env file changes:
pnpm test:production
# For a manually configured local instance:
pnpm start
# In another terminal against the running production server:
# Set GRA_TEST_EMAIL / GRA_TEST_PASSWORD to a provisioned synthetic account.
pnpm test:browser
```

Set `GRA_TEST_URL` to test another local origin. Python 3 is required only for the independent ZIP/XML verification. Browser testing uses Chromium and includes local import, manual review, export/download inspection, network/storage checks and rejection scenarios. No existing lint/typecheck script was present; production compilation is the repository's build validation.

Optional interoperability test: `python tests/verify-word-compatibility.py` (requires `python-docx`). It generates a plain-text fixture with an independent DOCX writer and reopens the redacted result. The stock template's custom-XML bibliography is explicitly removed from that fixture because custom XML remains unsupported.
