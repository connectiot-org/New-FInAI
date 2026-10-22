# FinAI API

NestJS 11 / TypeScript / Prisma 6.19.3 / PostgreSQL 17.6. Persistent monthly checklist/copy, subscription renewals and a stateless payment due-date calculator. The default frontend is the authenticated product; legacy financial simulations are excluded from its build. Local identity requires explicit development/test configuration and loopback binding. Administratively provisioned session authentication and production proxy configuration are documented in [RELEASE.md](RELEASE.md); public deployment remains gated. No paid authentication provider or third-party key is required.

From `backend/`, with Node 24/npm 11 and Docker Compose:

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run db:init
npm run db:up
npm run generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

`db:init` creates an ignored mode-0600 `.env` with randomly generated local database authentication and explicit local configuration; existing files are preserved. Never copy its values into context, chat or frontend settings. PostgreSQL is bound to 127.0.0.1:55432; data lives in Docker named volume `backend_checklist_pgdata`. `docker compose stop db` stops it without deletion; `npm run db:up` restarts. Do not use `down -v` if tasks should survive. The image is pinned by digest. Prisma migrations are additive/versioned, run explicitly; no reset or automatic seed on startup. `db:seed` only upserts synthetic identity/entities and preserves tasks; refuses non-local/production configurations.

API: 127.0.0.1:3000. `GET /health/ready` checks database/schema and active seeded membership (not just port/PID). The fixed server user has two authorized entities returned by `GET /api/v1/entities`. No browser demo identity or arbitrary headers can authorize requests. Trusted local frontend origins default to http://127.0.0.1:5173 and http://localhost:5173. Mutations require JSON, including DELETE. No Origin is allowed for local CLI tools; browser requests must use an exact configured origin. Cross-origin credentials/cookies are not used. Forwarding headers, identity overrides, untrusted Host/Origin and caller Authorization are rejected in this local-only implementation.

See `../contracts/openapi.yaml` (1.1.0) and `../contracts/README.md` for exact routes, examples and error semantics. Unknown input fields are rejected. Task creations retain a digest of canonical original payload for safe UUID retries. Transaction-scoped PostgreSQL advisory locks serialize ID claims and per-month capacity; at most 200 tasks per entity/month. Completion and deletion use optimistic version checks. ChecklistTask and SubscriptionRenewal store the two persistent features; shared identity/membership tables supply authorization. No workflow/event/financial tables were added.

Checks from this directory:

```sh
npm run typecheck
npm run lint
npm run build
npm test
```

Tests create a unique `test_<UUID>` PostgreSQL schema, apply real Prisma migrations twice, seed isolated synthetic tenants, start actual HTTP services, then remove only that test schema. They do not reset the application schema. DATABASE_URL must point to local PostgreSQL. Real tests cover CRUD, summaries, restart persistence, schema conformance, input constraints, entity/organisation permissions, forged identities/origins, safe retries, concurrent CAS/deletion, concurrent cap enforcement and production fail-closed configuration. See context/progress.md for actual run outcomes; do not equate written tests with passed tests.

If Prisma engine downloads fail, allow `binaries.prisma.sh` in environment network settings, retain TLS/checksum verification and retry `npm run generate`. Never set checksum-ignore or TLS-disable variables. No seed/development identity may run publicly. Production uses the implemented database-session identity and still requires target membership provisioning, security/deployment review, private database/migration/backup/restore gates and explicit deployment authorization.

Dependency review: NestJS 11.2.7 and Prisma 6.19.3 are pinned. A scoped npm override pins @prisma/config → deepmerge-ts 8.0.2 to resolve its recursive-merge advisory; generation, migration deployment and full PostgreSQL tests validate this toolchain combination. No dependency advisories (including development tools) were reported by npm audit after the update.

Copy/session verification and exact next commands: [current handover](../context/copy-release.md). The new additive migration creates only shared Account/Session/RateLimit tables. Production releases must use session identity and the exact configured backend/frontend hosts; local identity remains prohibited in production.

## Subscription renewals

Manual subscription records use the existing session/local identity, entity permissions, CSRF and safe errors. From backend/: `npm run generate && npm run db:migrate && npm run build`, then `npm start`. Migration `202610220001_subscription_renewals` adds only SubscriptionRenewal and its constraints/index; no reset or reseed is needed for existing installations. GET/POST `/api/v1/subscription-renewals`, PATCH `/:id` (details/expectedVersion), PATCH `/:id/archive` (archived/expectedVersion). Lists accept entityId, search, status=active|archived|all, offset, limit (default20, max50). Create uses client UUIDs for safe identical retries; IDs cannot move entities. Pagination is ordered renewalDate/id, and concurrent updates may change ordering between pages.

Configure organisation dates through non-secret server variable `ORGANISATION_TIMEZONES`, e.g. `{"11111111-1111-4111-8111-111111111111":"Asia/Dhaka"}`. Missing entries use UTC. Invalid UUID/zone configuration refuses startup. This map is administrator-owned; browser requests cannot override it. Today is derived in that zone at request time; date-only values use Gregorian calendar days without timezone shifting. Active renewal dates before today indicate "Renewal date passed."; today..30 days inclusive "Renewing soon.". Cancellation dates before today indicate "Cancellation deadline passed."; today..7 days inclusive "Cancellation deadline approaching.". Indicators are independent, archived records have neither, and none assert renewal/cancellation/payment occurred. No reminders or automatic date changes are performed.

## Payment due-date calculator

POST `/api/v1/payment-due-date-checks` accepts only `entityId`, `invoiceDate`, integer `termsDays` (0–365), and explicit `asOfDate`; no query parameters. Dates are real Gregorian calendar dates in years 0001–9999. HTTP200 returns those fields plus `dueDate`, signed `daysUntilDue`, and `status` (`not_due`, `due_today`, `overdue`). Due-date overflow returns the existing safe422 envelope. Terms add calendar days without weekend/holiday or month adjustments; the server never substitutes its current clock or checks payment/legal obligations.

Existing server-owned identity, active membership and entity access apply. Read-only entity access suffices. Session-mode POST still requires the existing same-origin proxy, cookie and CSRF protections; local identity stays explicit and loopback-only. No security settings, dependencies, business tables or migrations are added, and calculations store no inputs/results/history. Existing authentication infrastructure retains its normal session/rate-limit operations.

With existing database configuration, run `npm run build && npm start` from backend/. Fresh installations follow the setup above; no calculator migration or seed is needed. Checks: `npm run typecheck && npm run lint && npm run build && npm test`. Contract and verification evidence: [payment due-date handover](../context/payment-due-date.md).

Current system design and reviewed product boundary: [architecture](../context/architecture.md). Hardening evidence and remaining deployment gates: [production review](../context/production-review.md). Readiness now checks required migration completion and critical columns; session mode uses a database-shared global login-cost budget in addition to the existing IP/account/mutation limits. No new migration or dependency is required for this hardening.

## Transient invoice duplicate checker

POST `/api/v1/invoice-duplicate-checks` accepts `{entityId,csv}` and returns within-file possible duplicate groups. Uses existing identity/entity read permissions, production sessions/CSRF/proxy checks and rate limits. No uploaded values or results are written to the database; no new table, migration, dependency or paid API. CSV is bounded to 128 KiB and 500 records. This exact POST route alone accepts a JSON body up to 512 KiB; existing routes keep 16 KiB. The frontend proxy enforces the same limits. Do not enable request-body logging, file capture or analytics payload capture at ingress for this endpoint. See `../contracts/invoice-duplicates.openapi.yaml`, `../context/invoice-duplicates.md` and `../frontend/docs/invoice-duplicates.md` for rules/setup/tests. Existing release configuration and operational gates still apply.
