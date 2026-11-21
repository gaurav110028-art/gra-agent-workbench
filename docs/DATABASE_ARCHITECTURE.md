# Private PostgreSQL foundation

Phase 1D targets **Neon-managed PostgreSQL through the Vercel Marketplace**, attached to the original Vercel project for `https://gra-agent-workbench.vercel.app/` after ownership is verified. The adapter is implemented and the archive endpoint can use it when explicitly enabled. The browser migration screen remains read-only. PostgreSQL does not replace Redis sessions or throttling. No production configuration or provisioning was performed. [Neon-managed Vercel integration](https://neon.com/docs/guides/neon-managed-vercel-integration)

## Connections and authorization

| Setting | Intended use |
| --- | --- |
| `DATABASE_URL` | Server-only **pooled** Neon URI for the restricted runtime role. Vercel runtime requires a Neon pooler hostname. Use a synthetic-only database for approved development or preview. |
| `DATABASE_URL_UNPOOLED` | Server-only **direct** URI for the separate schema operator. Load it only in the operator shell. The application runtime does not need the direct URI or DDL credentials. |
| `GRA_ENABLE_LEGACY_IMPORT` | Defaults off. Set to `true` only for the explicitly approved environment. The import endpoint returns an unavailable response before reading the batch if storage is disabled or the pooled URI is missing. |
| `GRA_DATABASE_APPROVED_TARGET` | Independently verified JSON containing `directHost`, numeric `port`, `database`, `runtimeRole` and `migrationRole`. The two roles must differ. Derive these non-secret values from the approved environment inventory and dashboard, rather than trusting a supplied connection URI. Required for enabled imports and schema commands. |
| `GRA_WHATSAPP_ADMIN_ID` | The existing designated administrator ID, paired with a server-authenticated `admin` role. API access also uses existing session, same-origin, throttling and request bounds. |
| `GRA_TEST_POSTGRES_BIN` | Test-only path to local PostgreSQL binaries. The suite creates its own temporary loopback cluster and generates synthetic credentials. It does not consume either deployment URI. |

The Node runtime uses `pg` with a small, lazy per-instance pool, bounded connection wait and short idle timeout. Remote connections always use certificate verification. SCRAM channel binding is enabled when offered, unless explicitly disabled in the URI. Certificate verification remains enabled when a Neon URI uses `sslmode=require`. TLS can be explicitly disabled only for a loopback fixture outside Vercel. Connection configuration and transport errors are surfaced as safe diagnostics without the URI. The application does not automatically connect from the public homepage or a browser bundle. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) · [node-postgres SSL](https://node-postgres.com/features/ssl)

Keep production, development and preview credentials and databases separate. Confirm an empty or sanitized branch parent for preview. A new branch can inherit data from its parent, so avoid production-derived previews for synthetic testing. Select the Neon region close to the deployed compute after approval. Revalidate cold starts, connection limits and full-batch latency before enabling imports on hosted infrastructure.

## Schema version 1

| Tables | Relationships and constraints |
| --- | --- |
| `gra.schema_migrations`, `gra.workspaces` | Consecutive migration versions and checksums. One server-selected workspace `gra` seeded for the existing application. |
| `gra.legacy_import_records` | Unique workspace, kind and legacy ID. Constrained format and digest, object JSONB, and an archive FK from workflow graphs and versions to their corresponding agent. |
| `gra.legacy_import_batches`, `gra.legacy_import_entries` | One receipt per workspace and approved manifest digest. Entry FKs bind each receipt member to the exact stored fingerprint. First insertion provenance is unique per record. |
| `gra.admin_audit_events` | Server actor, event, receipt reference, timestamp and outcome counts. One import event per receipt. No document contents, phone lists or credentials in import audit events. |
| `gra.agents`, `gra.workflows`, `gra.workflow_versions` | Separate operational tables with workspace-scoped foreign keys and unique numbered snapshots. The archive importer never promotes a graph, publishes a version or activates an agent. |
| `gra.contacts` | Name, normalized phone, country calling code, consent and provenance, creator and lifecycle timestamps. Unique canonical phone within a workspace. |
| `gra.whatsapp_templates` | BizAutomation provider name, language, version, variable definitions, media requirements and lifecycle. Unique provider name, language and version per workspace. |
| `gra.whatsapp_campaigns`, `gra.whatsapp_campaign_recipients` | Versioned template selection, status, scheduled timestamp, and explicit deduplicated audience. Composite FKs reject cross-workspace contacts and templates. |
| `gra.whatsapp_reminders`, `gra.whatsapp_message_attempts` | Reminder interval, last attempt, next eligible time, paused-by-default status. Attempts track recipient, template, campaign or reminder, submission status, timestamps, provider ID and safe error code. Workspace-scoped attempt idempotency and provider IDs are unique. FKs tie campaign attempts to the audience and template, and reminder attempts to the corresponding contact and template. |

The future application repository should accept a server-selected workspace and an independently authorized principal, enforce consent rechecks before any delivery, and separate contact/template changes, campaign audience snapshots, and attempt transitions. Delivery eligibility, staged credentials, and message body retention still need a design review. The schema alone cannot authorize or execute sending. No WhatsApp CRUD API, provider connection or scheduler is bound.

## Repository behavior

`lib/database/postgres-repository.mjs` implements the Phase 1C transaction contract. It acquires one connection, checks the supported schema version, and takes a transaction-scoped workspace lock. Inserts use parameterized statements and ignore duplicate keys without updates. The service reads back the canonical payload and digest, rejects content conflicts, and verifies receipt members and audit counts before commit. A failed check rolls back records, receipt and audit together. If commit acknowledgement is lost, retrying the same manifest reconciles against committed records without creating duplicates. Connections that fail during a transaction are discarded. [node-postgres transactions](https://node-postgres.com/features/transactions)

The `gra` schema revokes access from `PUBLIC`. Use a restricted role for `DATABASE_URL`; a schema owner is required for `DATABASE_URL_UNPOOLED`. After creating and approving the roles, the runtime role needs only the following grants. Replace `gra_runtime` with the approved role identifier. Keep roles, grants, policy, and connection settings in each approved environment separately.

```sql
GRANT USAGE ON SCHEMA gra TO gra_runtime;
GRANT SELECT ON gra.schema_migrations TO gra_runtime;
GRANT SELECT, INSERT ON gra.legacy_import_records, gra.legacy_import_batches,
  gra.legacy_import_entries, gra.admin_audit_events TO gra_runtime;
```

Operational and WhatsApp tables are outside this runtime grant. The current Workbench remains a single trusted workspace with no claim of database-enforced multitenancy or RLS. Audit data is append-only for the restricted application role.

## Migration commands

1. Verify ownership of the original Vercel deployment, the authorized Neon integration account, and the target project, branch, endpoint, role, and database. For this phase, only a disposable local database is exercised.
2. In a separately authorized non-production schema-operator shell, inject `DATABASE_URL_UNPOOLED` privately. Set `GRA_DATABASE_APPROVED_TARGET` from the independently verified inventory. With both URIs available in an authorized local shell, run `pnpm db:migrate --check-targets` to compare pooled/direct hostname, port, database and credentials' role names offline. The command prints only pass/fail and opens no connections. Run `pnpm db:migrate --target <direct-host>:5432/<database>` only for the approved disposable development target. Before DDL, the runner checks both the target pin and the authenticated PostgreSQL identity. It refuses pooled, Vercel, and production-mode targets. Loopback schema CLI use is limited to test-mode databases named `gra_test_*`. A target pin is not proof of project ownership or absence of production data.
3. The runner serializes schema changes, verifies the applied migration checksums, and commits the schema and ledger together. Do not edit an applied file. Append a numbered migration for future changes. The runner is separate from builds, startup and the runtime account.
4. Run `pnpm test`, `pnpm build`, and `pnpm test:production`. To exercise the real database locally, set `GRA_TEST_POSTGRES_BIN` and run `pnpm test:postgres` after the build. It uses local `initdb`, `pg_ctl`, `pg_dump`, and `pg_restore`, random loopback endpoints, and a temporary cluster and restore database.

## Backup and recovery

Confirm the Neon restore window and recovery objectives for the approved plan. Before real imports, verify branch restore in a protected recovery environment and run a separate encrypted logical backup and restore drill. Use direct database connectivity for admin backup tools, encrypt any real dump before it leaves the approved encrypted destination, keep keys separate, and limit retention and access. A schema-only or data-only dump is insufficient for full recovery on its own. Reapply and verify least-privilege roles and grants after a restore drill. [Neon branch restore](https://neon.com/docs/postgres/backup-restore/branch-restore) · [PostgreSQL logical backups](https://www.postgresql.org/docs/current/backup-dump.html)

The local suite uses a synthetic custom-format dump and restores it transactionally into a different disposable database. It then checks the schema ledger, row and audit counts, receipt replay and WhatsApp fixture persistence. A transaction rollback is immediate for an uncommitted batch. For committed data, keep browser originals, isolate restored data in a recovery database, and reconcile it before replacing or quarantining any archive. A live rollback or browser cleanup tool is outside Phase 1D.

## Verification and release gates

Local synthetic verification covers schema creation and repeated schema commands, runtime permissions, concurrent imports, duplicate prevention, content conflicts, integrity rollback, socket termination and retry, the authorized HTTP path, future WhatsApp constraints, and logical backup/restore. The normal app regression suite leaves database configuration disabled. See the Phase 1D test report for the commands and results.

Before production work, verify the project's ownership, configure and test an approved isolated Neon environment, confirm role grants, and measure the pooled connection behavior. Before enabling real migration, implement the reviewed approval workflow and migrate confidential browser and process-local state to protected persistence, including deferred file storage. Verify backup and recovery for each affected browser profile before any cleanup. Production credentials, hosted connectivity, and Neon restoration were not exercised in this phase.

## Phase 1E staging handoff

No approved Neon development endpoint or credentials were available for this review. Set up the handoff through an approved secrets channel, with a dedicated GRA Neon project, a synthetic-only development database, and role credentials separate from every other project. Verify the project ID and branch, canonical direct endpoint, paired pooler endpoint, database name and separate roles in the Neon console before sharing the non-secret pin. Verify the existing Vercel project separately by the assigned production domain if integrating later.

After authorization, run the offline target check first. Then verify the connected identity on each endpoint with `current_database()`, `session_user` and `current_user`. Confirm verified TLS from the client connection settings. Verify runtime grants and memberships before enabling the endpoint. The runtime rejects unexpected identities and privileges to create databases, roles or objects in the private schema. Confirm the role cannot perform private schema migrations or read future WhatsApp tables, and that the operator uses the direct endpoint. The runtime should only have the archive and audit grants listed above.

Use synthetic manifests to exercise duplicate/concurrent imports, conflict rollback, read-back verification and connection recovery. Restore a synthetic dump into a separately approved recovery database and reconcile counts and receipt replay. Keep the feature flag off outside the explicitly authorized synthetic verification window. These pooled/direct Neon connection, privilege, transaction, and recovery tests are pending. Local disposable PostgreSQL tests are not evidence of hosted Neon behavior.
