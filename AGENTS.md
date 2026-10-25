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
- Security validation: `pnpm test`, `pnpm build`, `pnpm test:production`, the independent Python checks, `pnpm audit` and `git diff --check`. The production harness clears provider keys and uses only ephemeral synthetic identities/data.
- Treat instance-memory schedules, buffers, approval records and audit history as prototype state. Do not describe them as durable jobs, tenant isolation or an enforceable server approval ledger.
