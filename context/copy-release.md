# Copy previous month — release handover, 2026-10-21

Starting checkout: `a285efa93bcf8918958b13139dabd9857edd0e72`, initially clean. Implemented sequential coordinator → backend → frontend → review work; no parallel agents, worktrees, public deployment or paid resources. Subsequent user instruction authorizes verification, commit and push to the existing work branch. Original `/close`, financial Redux/demo storage and FinanceSnapshot source are unchanged.

## Implemented

Contract 1.1.0 adds POST `/api/v1/checklist-tasks/copy-previous-month`. Strict entity/month input (0001-01 rejected), January handling, existing membership/entity authorization, explicit repository/service method, READ COMMITTED transaction and ordinary-create-compatible destination month advisory lock. A fresh destination query follows any lock wait. One source snapshot, at most 200 titles, one batch insert, new server UUIDs/digests, incomplete/version 1, source preserved. Occupied destination conflicts, empty source returns zero. Insert failures roll back. Deleting all destination tasks permits a later new copy; no permanent exactly-once guarantee is claimed.

UI extends the existing checklist with confirmation/cancellation, pending guard, server-confirmed count or empty-source message, conflict/network errors and mandatory destination reload after uncertain results. Stale-scope responses/messages cannot replace another month's state. Demo copying remains session-only and never falls back after API errors. Session sign-in is explicitly enabled with public VITE_AUTH_MODE=session; credentials/tokens never enter localStorage or VITE_ configuration.

Production foundations: Argon2id administrative accounts (64 MiB/3 iterations/parallelism 1), hidden-password account creation/reset commands, session revocation, PostgreSQL sessions and shared rate limits, 8-hour expiry, authentication rotation, Secure/HttpOnly/SameSite=Strict cookies, exact Origin and CSRF-token checks, active memberships and existing entity access. Production rejects local identity. Additive migration creates only Account/Session/RateLimit; checklist table unchanged.

Vercel proxy retains backend hostname/SNI for verified TLS and host routing, replaces caller identity/forwarding headers, authenticates with server-only proxy token and supplies the frontend host separately. Backend validates exact API_TRUSTED_HOST, authenticated frontend host and HTTPS protocol. Non-JSON upstream failures are converted to JSON. Routes exclude API/auth from SPA fallback and preserve filesystem assets. Docker runs as node; production Compose provides private persistent PostgreSQL and loopback-only API for existing TLS ingress. See backend/RELEASE.md for configuration and exact deployment/account/backup/rollback commands.

## Checks actually run

| Check | Current result |
| --- | --- |
| Baseline before implementation | Backend typecheck/lint/build and 8 existing PostgreSQL/HTTP tests passed |
| Backend typecheck/lint/build | Passed after final authentication/host changes |
| Backend PostgreSQL/HTTP suite | 12 passed, zero skipped; includes copy concurrency/create race, 200-task maximum, rollback, permissions, boundaries, restart, production sessions/rotation/CSRF/revocation/expiry/removed membership, HTTP login limiting and shared-instance rate limiting |
| Frontend typecheck/lint | Passed, including proxy typecheck; generated artifacts explicitly excluded |
| Frontend builds | Default production demo and API/session production build passed |
| API checklist browser suite | 14 passed, zero skipped; includes copy confirmation/cancel, empty/conflict/uncertain saved response, pending guard, browser-back during copy, refresh, keyboard/mobile and existing CRUD/error tests |
| Original standalone browser suite | 33 passed in a fresh run; historical 52-test report was not reused |
| New session-only demo copy test | 1 passed; refresh clears and zero checklist API calls |
| HTTPS production-build session/proxy browser journey | 1 passed; actual proxy handler with verified outbound TLS through ephemeral trusted test CA, real DB sessions, login/create/copy/refresh, Secure/HttpOnly cookie, CSRF denial, unknown API JSON and logout |
| Contract checks | 23 schema examples and negative input checks passed; pinned Redocly 2.8.0 minimal lint passed |
| Dependency review | Both full application npm audits: zero known vulnerabilities, including development dependencies |
| Asset scan | Both demo/session assets contain none of available backend credential values; session build has no visitor-localhost API fallback |
| Synthetic restore | Fresh disposable database migrated, seeded with synthetic task, dumped/restored into another disposable database; task incomplete/version 1, auth tables and migration history verified; databases/archive removed |
| Container | Build passed using optional build-only platform CA mount, TLS/checksum verification intact. Image `sha256:544e36ca7c2f4b97cc78ff649abe824c7d3bddb7229116efda2291aa3a3b2552`; runtime smoke passed as node, read-only filesystem, dropped capabilities/no-new-privileges, real PostgreSQL readiness/liveness and anonymous API 401. Owned container stopped/removed. |
| Scope/config review | git diff --check passed; CI/Compose/Vercel files parse; original close/financial demo source unchanged |

61 current automated tests passed across the suites above (12+14+33+1+1). The last three frontend suites were run separately; no claim of one combined runner invocation. The new default `npm test` will include the original 33 plus the new demo-copy test. Nonfatal existing notices: ESLint support/deprecation, third-party Zod Rollup comments and color-variable warnings. Initial migration quoting, test fixture/selector, generated-artifact lint, TLS trust and image file-ownership failures were diagnosed and corrected; no assertions or verification were disabled. Prisma's initial setup download restriction was resolved before the baseline.

The HTTPS test trusts only its ephemeral certificate on the outbound test agent; browser certificate exceptions apply only to that synthetic test. This is not target TLS verification. Docker's cloud CA is mounted for build trust and is not retained in the image. Plain public-CA builds are defined for normal CI/hosts.

## Pre-push verification

The user explicitly requested code verification, fresh tests, commit and push. Reran both applications' typechecks/lint/builds and full npm audits (zero known vulnerabilities), backend 12 PostgreSQL tests, frontend default 34 tests (original 33 plus demo copy), API checklist 14 tests, HTTPS session/proxy 1 test, 23 contract examples/negative checks and Redocly lint, available-credential asset scan, and synthetic application restore. All passed: 61 tests, zero skipped. Review fixed a login/password-reset race: session creation takes an account row share lock and rechecks the verified hash/disabled state, so a password reset cannot be followed by a session minted from an obsolete password proof. A real PostgreSQL lock-wait regression exercises this interleaving. Source review preserves original close/financial-demo code and excludes ignored configuration/generated data from Git.

GitHub read access works through the existing HTTPS Git proxy. The existing remote work branch is an ancestor of the local branch; publication will use an ordinary fast-forward push, without force or a main-branch merge. See git history for the resulting role-scoped commits. Public-deployment gates remain unchanged.

## Exact next local commands

Prerequisites: Node 24/npm 11, Docker Compose, Chromium. Existing ignored backend/.env is private local development configuration. From the checkout:

```sh
cd /workspace/New-FInAI/backend
npm ci
npm run db:init
npm run db:up
npm run generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

In a separate terminal:

```sh
cd /workspace/New-FInAI/frontend
npm ci
VITE_CHECKLIST_MODE=api VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Local readiness: `curl --fail http://127.0.0.1:3000/health/ready`. Run backend `npm test`; with frontend port 5173 free run frontend `npm run test:checklist`, `npm test`, `npm run test:session`, and `node scripts/check-assets.ts`. `bash backend/scripts/restore-rehearsal.sh` from the repository root repeats the disposable application restore. Production startup is separately defined in backend/RELEASE.md; never use local identity/seed publicly.

## Outstanding release gates

Feature and local integration are verified. Production authentication and actual proxy handler are verified locally with synthetic data; deployment is not verified. No public site, preview, paid resource or production database was changed. CI workflow is prepared but has not run on GitHub. Vercel project-root/settings/routes, deployed direct URL and refresh, target TLS ingress/header behavior, private database/storage durability, real administrative provisioning/access grants, connection/Argon2/rate-limit capacity under intended replicas, monitored backups and measured production restore/RPO/RTO remain operator gates. Production Compose was prepared, not launched against production. The local restore rehearsal does not establish production disaster recovery. A historical baseline foreign-key default-action difference between existing Prisma schema and old SQL migrations was observed during a diagnostic diff; existing checklist/identity foreign keys were left unchanged. New auth relation actions match their additive migration.

Required operator next action: supply exact frontend/backend hostnames and secure proxy/database configuration in hosting settings, arrange the existing host's TLS/storage/backup configuration, and authorize a preview deployment. Follow the exact migration/start sequence in backend/RELEASE.md and complete its deployed smoke checklist before public release. Do not call the public session-demo site a live authenticated SaaS product.

## Changed files
- `backend/README.md`
- `.github/workflows/checklist-release.yml`
- `AGENTS.md`
- `backend/.dockerignore`
- `backend/AGENTS.md`
- `backend/Dockerfile`
- `backend/RELEASE.md`
- `backend/compose.production.yaml`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/prisma/migrations/202610210001_sessions/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/scripts/accounts.mts`
- `backend/scripts/restore-rehearsal.sh`
- `backend/src/app.ts`
- `backend/src/auth.ts`
- `backend/src/checklist.repository.ts`
- `backend/src/checklist.service.ts`
- `backend/src/config.ts`
- `backend/src/validation.ts`
- `backend/test/checklist.test.ts`
- `context/copy-release.md`
- `context/progress.md`
- `context/project-state.md`
- `contracts/README.md`
- `contracts/openapi.yaml`
- `contracts/validate_examples.py`
- `frontend/api/proxy.ts`
- `frontend/docs/checklist.md`
- `frontend/eslint.config.js`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/playwright.session.config.ts`
- `frontend/scripts/check-assets.ts`
- `frontend/scripts/session-fixture.ts`
- `frontend/src/features/checklist/MonthlyChecklist.tsx`
- `frontend/src/features/checklist/api.ts`
- `frontend/tests/checklist.spec.ts`
- `frontend/tests/copy-demo.spec.ts`
- `frontend/tests/session-production.spec.ts`
- `frontend/tsconfig.json`
- `frontend/vercel.json`
