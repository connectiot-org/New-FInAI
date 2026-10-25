# Imported workspace operations

Extends RELEASE.md and RECEIVABLES.md. Locally implemented/tested is not deployed/customer-ready. Apply additive `202610240002_workspace_operations` from the tested image before switching applications. It adds administrator/membership versions, independent import grants, ServerAudit and temporary ReceivableImportStage. Upgrade copies existing can_write import authority to can_import; review those grants. Future grants default false. Never edit applied migrations, reset/seed a customer DB or delete snapshots during rollback.

## Provisioning and recovery

Build (`npm run build`) first. On the trusted database host with server-only DATABASE_URL configured:

```
node --env-file=.env --import tsx scripts/accounts.mts create <username> <organisation UUID>
node --env-file=.env --import tsx scripts/workspace-admin.mts <organisation UUID> <existing username>
```

The administrator command defaults to dry run. Review target then repeat with `--apply`. Requires an existing enabled account and membership; grants administrator only, never entity access. If another enabled active administrator exists, use the UI or explicit trusted `--recovery --apply`. Recovery is audited and revokes target organisation sessions. Protect CLI/database operator access separately. Account creation/password reset require hidden interactive input, never password argv. `accounts.mts reset <username>` rotates password and revokes all user sessions; `revoke <username>` revokes sessions without changing the password. No signup, fake invitation/email recovery, MFA or SSO is claimed.

Private administration controls existing organisation members, creates entities and assigns independent read/workflow-write/import grants. New entities grant nobody access. Target membership versions prevent stale changes, including grant deletion/recreation. Changes serialize per organisation, revoke affected sessions and record audit atomically. Last enabled active administrator cannot be removed; disabled accounts cannot be promoted to usable administrators. Self-edit controls are omitted: use another administrator or trusted recovery. No accounting approval role/period lock exists.

## Reviewed import and exact export

Only exact POST `/api/v1/receivables/imports/preview` accepts uncompressed application/octet-stream containing normalized UTF-8 JSON, maximum 1 MiB. Proxy preserves raw bytes and rejects pre-parsed objects, avoiding numeric-token rounding. Other requests remain 16 KiB JSON; CLI remains 5 MiB/10,000 rows. Backend checks trusted host/origin, session, CSRF, import grant and five preview attempts per actor/15 minutes before parsing; existing mutation limits remain. Maximum two live unapplied previews per actor, 15-minute TTL. Private bytes stay in PostgreSQL, bound to actor/session/organisation/entity. No public object/URL fetching or executable format.

Preview does not change snapshots. It shows source rows, outstanding invoice/customer counts and outstanding non-Draft unpaid total, not trial-balance reconciliation. Owner reconciles the source before explicit confirmation. Apply rechecks permission/current version/digest, commits source/stage/audit together and clears staged bytes. Retry an uncertain apply with the same stage/digest; old retries never reactivate historical sources. Preview retries can consume the second quota slot; discard unused previews. History retains source actor/digest/version/capture/import times. No automatic snapshot/history deletion. Authorized read members may deliberately download bounded 10,000-row exact CSV with formula-leading strings escaped. Export-prepared audit proves preparation, not delivery to disk; downloads leave application custody.

## Retention and support

Schedule hourly in a trusted runtime, reviewing dry run first:

```
node --env-file=.env --import tsx scripts/cleanup.mts
node --env-file=.env --import tsx scripts/cleanup.mts --apply
```

Deletes expired sessions/previews and rate windows older than 24h; never snapshots, business rows or audit. Preview access expires immediately regardless of cleanup. Actual scheduler/owner is a deployment requirement, not installed here. Backups may retain staged bytes until backup expiry; choose encrypted backup retention accordingly. Offboarding: deactivate membership/revoke grants, confirm session denial, provide authorized export if requested, then execute an owner-approved retention/legal-hold/deletion process across live DB/backups/downloads. No customer deletion API is claimed.

Support uses request IDs/status/route templates/timing, never passwords, cookies, raw exports or tokens in tickets. Incident owner disables affected accounts/revokes sessions, isolates targets, preserves audit/backups, rotates compromised secrets in secret managers, assesses impact and handles notification. Review administrators/import grants at onboarding/offboarding and monthly. Named source refresh owner reconciles complete exports/cutoffs and reviews each preview.

Business/access changes and safe audit commit atomically; audit failure rolls back changes. Metadata is allowlisted references/counts/versions/booleans/reason codes, not notes/titles/customer names/amounts/credentials. HTTP request UUID correlates audit; CLI has independent event UUIDs. Failed requests have redacted status logs, not fabricated committed events. Database administrator tampering is outside the guarantees of an application audit table; restrict operator writes and retention separately.

## Target inventory / release gate

| Component | Observed and required |
| --- | --- |
| Frontend | User reference new-f-in-ai.vercel.app; target owner/project/deployed SHA and this branch’s bindings unverified |
| Backend | Source/container exists; real host/owner/region/TLS/capacity/image unverified |
| PostgreSQL | Only local Docker verified; customer owner/region/private networking/durability/pool budget unprovided |
| Proxy settings | FINAI_BACKEND_ORIGIN (HTTPS origin), FINAI_PUBLIC_ORIGIN (exact HTTPS origin), FINAI_PROXY_TOKEN, server-only |
| Backend settings | NODE_ENV=production, CHECKLIST_IDENTITY=session, exact PUBLIC_ORIGIN/API_TRUSTED_HOST, matching API_PROXY_TOKEN, private DATABASE_URL, API_HOST/API_PORT |
| Ingress | Narrow 1 MiB raw route verified locally; target must preserve Buffer/stream and reject oversized/compressed input |
| Migration | One-shot migrate deploy from tested release image; no target reset/seed |
| Monitoring | Redacted JSON requestId/method/route-template/status/ms and live/ready probes exist; collectors/alerts/delivery owner unconfigured |
| Cleanup | Dry-run/apply command exists; target scheduler/owner unconfigured |
| Recovery | Local synthetic restore only; encrypted off-host target backups/retention/owner/measured recovery unverified |

Diagnose proxy503 by checking presence/binding (not printing values) of the three server-only proxy settings, exact host/origin/token match and verified backend TLS/readiness. Vercel build success does not prove API configuration. Never use wildcard trust, insecure TLS or browser VITE_ secrets. Preview requires isolated DB/config and its exact origin.

Proposed pilot: 10 concurrent users, <=1,000 entities/organisation, <=10,000 invoices/snapshot, 1 MiB browser/5 MiB CLI, default20/max50 page rows, bounded deliberate exports. Proposed targets for owner review, NOT achieved SLOs: read p95<1s, reviewed 1 MiB apply<15s, monthly availability99.5%, RPO<=24h/RTO<=4h. Before release measure target startup/shutdown, concurrent reads/export/import, Argon2 login pressure, 429 behavior, DB pool/slow queries/memory; approve targets and configure readiness/5xx/latency/DB/backup-age/cleanup alerts. Local correctness tests are not target performance evidence.

Restore into isolated DB; verify organisation/member/entity counts, source rows/digests/totals, tasks/subscriptions/audit and five migrations, revoke restored sessions before connecting applications. Encrypt off-host backups with least-privilege restore access. Local rehearsal is not production recovery evidence. Rollback pauses imports and uses compatible prior images/flags, preserving additive tables/history; never automatically down-migrate/drop data. An actual restore requires the incident owner’s recovery plan.
