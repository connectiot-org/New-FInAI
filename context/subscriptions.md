# Subscription renewals — 2026-10-22

Baseline: clean `work` checkout at c06d7f2c020b54e7f628fa7edccd0ed5567f0c49. Work followed sequential coordinator, backend, frontend and reviewer ownership; no parallel agents or worktrees. This task is implemented in the local checkout; no public deployment, paid resources or new authentication platform. Existing financial Redux/demo storage, original `/close`, FinanceSnapshot and public marketing workflows were preserved.

## Implemented behavior

Route `/tools/subscriptions`, navigation under Manage. Manual add/edit/archive/unarchive, literal case-insensitive supplier/subscription search, active/archived/all status, compact date/indicator table, 20-row UI pagination, add/edit drawer, archive confirmation, empty/loading/validation/network/conflict states. Backend-confirmed success only; ambiguous creates retain a UUID for an identical safe retry. Old-scope reads/writes cannot replace another entity's page. Records never enter financial demo fixtures/localStorage, and API failures never switch to demo data. Existing sign-in UI was extracted into a shared SessionGate without introducing another authentication system.

Controller/service/repository use NestJS, Prisma/PostgreSQL and the existing server-owned identity and entity permission queries. Every request checks active membership/entity access; writes require canWrite. Bodies are strict allowlists. Updates and archive actions require expectedVersion and atomically increment under a scoped SQL version condition; stale versions return 409. Create IDs support identical retries; occupied IDs with changed payload conflict and cannot move entities/organisations. GET results are bounded (default20/max50), offset0..1000000, ordered renewalDate/id. Count/page share a repeatable-read snapshot; pagination across separate requests is not a frozen snapshot.

One additive table: SubscriptionRenewal, with composite entity/organisation foreign key, date fields, name/notes limits, cancellation<=renewal and version constraints. No checklist or organisation-table migration, data reset, automatic billing, recurring-date generation, reminders, email, uploads, AI or paid API calls. Prisma maps its long scope index to PostgreSQL's 63-byte identifier limit.

Organisation timezone is configured only on the server: `ORGANISATION_TIMEZONES` JSON maps organisation UUIDs to IANA timezone names; missing entries fall back to UTC, invalid maps/zones fail startup. Example non-secret local setting: `{"11111111-1111-4111-8111-111111111111":"Asia/Dhaka"}`. Restart API after changing it. Existing production Compose forwards this optional configuration. Today is calculated in that zone and shown with the zone above the table. Calendar dates remain YYYY-MM-DD with no client timezone conversion. Active renewal dates before today show "Renewal date passed."; today through 30 calendar days inclusive show "Renewing soon.". Active cancellation dates before today show "Cancellation deadline passed."; today through seven days inclusive show "Cancellation deadline approaching.". These two indicators are independent; archived records have neither. No indicator asserts that a subscription actually renewed, cancelled or charged.

## Migration/startup

For the prepared existing local checkout (Node24/npm11, Docker Compose, existing private backend/.env):

```sh
cd /workspace/New-FInAI/backend
npm run db:up
npm run generate
npm run db:migrate
npm run build
npm start
```

Migration `202610220001_subscription_renewals` adds only the new table and constraints/index. No reset or reseed is needed for an existing installation. On a fresh installation, first use the existing README's npm ci/db:init/db:seed local-only setup; never run the local seed remotely or in production.

In another terminal:

```sh
cd /workspace/New-FInAI/frontend
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Subscription route: `/tools/subscriptions`. Local readiness: `curl --fail http://127.0.0.1:3000/health/ready`. No VITE_CHECKLIST_MODE flag is required for this API-only tool. Existing checklist demo modes remain separate. For authorized production preparation use VITE_AUTH_MODE=session and VITE_API_BASE_URL=/api/v1 with the existing exact-host/TLS/proxy configuration in backend/RELEASE.md. The public checklist demo is not a live subscription service.

Endpoints: GET/POST `/api/v1/subscription-renewals`; PATCH `/api/v1/subscription-renewals/{id}` for details/expectedVersion; PATCH `/api/v1/subscription-renewals/{id}/archive` for archived/expectedVersion. New contract is `contracts/subscriptions.openapi.yaml`; existing checklist contract is unchanged.

## Actual verification

- Backend baseline before editing: 12 tests passed against real PostgreSQL.
- Final backend typecheck/lint/build and `npm test`: **17 passed, zero skipped**, including all 12 existing tests plus new subscription CRUD/replay/concurrent CAS/restart, calendar/name/note/allowlist validation, literal search/filter/pagination, org/entity/read-only/inactive isolation, timezone fallback and inclusive today/30-day/seven-day boundaries.
- Final frontend typecheck/lint/default production build: passed.
- `npm run test:subscriptions`: **4 passed, zero skipped**, using a unique migrated/seeded PostgreSQL schema and real child API; covers create/edit/archive/unarchive/cancel, refresh/API restart persistence, failed save without success, validation, stale conflict, server indicators, search/filter/pagination, entity switching, delayed earlier response, keyboard and 390px containment. Only fixture schema is dropped.
- `npm test`: **34 passed**, including existing financial/public workflows and session-only demo copy.
- `npm run test:checklist`: **14 passed**.
- `npm run test:session`: **1 passed** through the real proxy handler and production frontend build over synthetic HTTPS; includes authenticated subscription creation/refresh plus existing login/checklist/CSRF/cookie/logout checks.
- Total current automated tests: **70 passed**, zero skipped (17+4+34+14+1); historical results were not substituted.
- Contract validators: existing 23 examples/negative checks and new five subscription examples/negative checks passed. Redocly 2.8.0 minimal lint for the subscription contract passed without warnings.
- Both full application npm audits: zero known vulnerabilities. No new application dependencies/lockfile changes.
- Frontend asset credential scan passed for default/session builds; no available backend credential values or production session localhost fallback.
- Additive migration deploy repeated successfully with no pending migrations. Updated synthetic dump/restore rehearsal passed and verifies both checklist and subscription records, auth schema and all three migration records. No application data reset.
- git diff --check passed; original Close, FinanceSnapshot, financial store/demo source unchanged. Existing CI workflow extended with subscription contract/browser checks; GitHub CI itself was not executed for this local task.

Initial browser failures exposed implicit label names including populated textarea/select content. Stable accessible names fixed the issue and the complete suite passed on rerun. An initial Prisma index-name length error was corrected by mapping the actual PostgreSQL-truncated identifier. Extra synthetic app instances were closed promptly to avoid accumulating signal listeners in tests. No assertions were removed or verification disabled. Existing nonfatal Zod Rollup/color/deprecation notices remain.

## Production limits

Existing database-backed authentication, CSRF, secure cookies and tenant permissions are reused; no seeded local identity is exposed remotely. Production public access remains gated by the pre-existing exact frontend/backend hostnames, secure proxy/database configuration, TLS ingress, persistent storage, administrative accounts/entity grants, capacity checks, target backup/restore and deployed smoke verification. These external gates were not changed or claimed complete. No public deployment or paid resources were created. This task did not run a new Docker image build; application production builds and the local HTTPS proxy journey were verified. See backend/RELEASE.md for existing production operating gates.

## Files changed
- `.github/workflows/checklist-release.yml`
- `backend/README.md`
- `backend/compose.production.yaml`
- `backend/prisma/migrations/202610220001_subscription_renewals/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/scripts/restore-rehearsal.sh`
- `backend/src/app.ts`
- `backend/src/checklist.repository.ts`
- `backend/src/subscription.controller.ts`
- `backend/src/subscription.repository.ts`
- `backend/src/subscription.service.ts`
- `backend/src/subscription.validation.ts`
- `backend/test/checklist.test.ts`
- `context/progress.md`
- `context/project-state.md`
- `context/subscriptions.md`
- `contracts/README.md`
- `contracts/subscriptions.openapi.yaml`
- `contracts/validate_subscriptions.py`
- `frontend/docs/subscriptions.md`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/playwright.subscriptions.config.ts`
- `frontend/scripts/subscriptions-fixture.ts`
- `frontend/src/app/navigation.ts`
- `frontend/src/app/router.tsx`
- `frontend/src/components/SessionGate.tsx`
- `frontend/src/features/checklist/MonthlyChecklist.tsx`
- `frontend/src/features/subscriptions/SubscriptionRenewals.tsx`
- `frontend/src/features/subscriptions/api.ts`
- `frontend/src/features/subscriptions/subscriptions.css`
- `frontend/src/lib/api.ts`
- `frontend/tests/session-production.spec.ts`
- `frontend/tests/subscriptions.spec.ts`
- `frontend/tsconfig.json`
