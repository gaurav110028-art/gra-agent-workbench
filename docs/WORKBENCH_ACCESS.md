# Public Workbench and private WhatsApp access

The production hostname remains `https://gra-agent-workbench.vercel.app/`. This change is suitable for local synthetic review. **Production release is blocked while confidential workspace data can persist in same-origin browser storage.** Keep the existing production access policy in place until the owner verifies the migration below.

## Access policy

| Route | Access |
| --- | --- |
| `/` | Public workbench. Built-in examples, in-memory drafts and approvals, test execution only. No private storage or session lookup. A network-blocking `connect-src` policy adds browser protection. |
| `/workspace` | Existing authenticated workbench and operational views. The Query Inbox, its badge and WhatsApp settings require the designated administrator. |
| `/whatsapp` | Placeholder for the designated administrator. Anonymous page requests go to `/login?next=/whatsapp`. Nested paths inherit the guard. |
| `/redactor` | Existing authenticated document redactor, with its worker and document privacy policies. |
| `/login`, `/logout` | Public forms. Login uses existing rate, origin and session checks. Login destinations are explicitly allowlisted. Logout revokes the session through the existing authenticated API. |
| `/api/webhook/whatsapp` | GET and DELETE require the designated administrator. Browser POST requires the same identity. An existing `webhook:ingest` service token can POST an inbound record and receives an acknowledgement without the record. Confirm the installing extension accepts this response before release. OPTIONS remains data-free. |
| Other existing API routes | Existing per-method authentication, authorization and limits remain in force. |

Set `GRA_WHATSAPP_ADMIN_ID` to the exact ID of one account with role `admin` in server-side `GRA_AUTH_USERS_JSON`. Other admins and service identities cannot access the private module. A missing or invalid designation fails closed. Any future WhatsApp data or operations API must apply `requireWhatsAppAdmin` through `secure()` before reading data, contacting providers or mutating state. The existing ingress is a write-only exception for its own scoped credential. The placeholder has no provider or credential endpoints.

## Browser storage audit

| Location | Current private contents |
| --- | --- |
| localStorage `gra-agents`, `gra-agents-seeded`, `gra-workflow-*`, `gra-workflow-version-*` | Agent names, workflow graphs, node configuration and snapshots. Graphs may include imported rows or business inputs. |
| localStorage `gra-run-history`, `gra-approval-queue` | Run inputs, step results, approval and delivery records. |
| localStorage `gra-query-inbox`, `gra-queries-cleared-time`, `gra-team-members` | Inbox content, phone numbers, team information and polling state. |
| localStorage `gra-calendar-*`, `gra-instagram-posts`, `gra-auth-users`, `gra-auth-session` | Calendar and notes, historical user profiles and potentially legacy password hashes or client-side session records. Server authorization ignores legacy records. |
| localStorage `gra-gaurav-history-*`, `gra-theme`, `gra-sidebar-collapsed` | Saved Architect conversations and UI preferences. |
| IndexedDB `gra-agent-workbench` / `sources` | Source metadata and uploaded file blobs. |
| Cookies | The existing HttpOnly session cookie is server-issued. Session values are neither read by the public client nor serialized into public page data. |
| sessionStorage | No application-owned records found in the current source. Include it in existing-browser inventory because earlier builds and extensions may have written data. |

Public and private pages share a browser origin. Script execution on that origin, a shared browser profile, and developer tools can still expose old browser records. A separate route, a new key prefix, and logout cannot provide confidentiality for browser-local records. This change leaves those records in place. The public app intentionally does not access or erase them.

## Backup, migration and release gate

1. Inventory each authorized browser profile and device with the private application still protected. Inventory storage keys and source file counts without copying contents into logs, support tickets, or the repository. Review extension-managed or old-origin copies as well.
2. Before any deletion, export the private localStorage records and IndexedDB metadata/blobs with approved tooling to an encrypted, access-controlled backup. Validate recovery with representative synthetic data first. For real backups, verify counts, file sizes and hashes privately and record who can restore each backup. Handle legacy auth exports as credential material. Rotate any historically reused passwords and preserve only the required recovery evidence.
3. Move private persistence behind authenticated server-side storage and authorization. Preserve IDs, snapshots, approval relationships, file references, and ownership. Do not import legacy browser auth as a trusted session or a server-created identity. Stop ongoing writes of confidential data to shared-origin browser storage.
4. Compare migrated inventories and confirm restoration in a protected environment using the existing project. Only after the owner approves verified migration and retention, perform explicit cleanup in each affected profile. This phase includes no migration, export or deletion tool and does not authorize those actions.
5. Before release, verify from a previously used admin browser as well as a fresh anonymous browser. Exercise public simulation, protected route denial, session revocation, provider isolation and the authenticated source workflow. Verify the project's real Redis/auth configuration and check any inbound extension against the write-only response. Keep production protected until these checks pass.
