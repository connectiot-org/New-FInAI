# Current progress — 2026-10-19

Prompt 01 design and Prompt 02 local monthly checklist are complete. Contract 1.0.0 is frozen; Gates A–C passed. Production Gate D remains intentionally closed. Base source commit: f1400308b2a2acc83b38c89465f0367bed6e52f3. Use git log for subsequent implementation/review commits; no deployment is claimed.

## Implemented scope

- Backend: NestJS 11.2.7 / Prisma 6.19.3 / PostgreSQL 17.6, separate manifest/lockfile, exactly one feature table plus shared identity/membership tables, additive migrations, safe synthetic seed, persistent local Docker volume, loopback-only explicit local identity and exact-origin mutation checks.
- Contract: authorized entity discovery; flat task CRUD; explicit month; canonical client-UUID create retry digest; transactional 200-task cap; exact full-list progress; absolute completion and versioned If-Match deletion; safe error envelopes and response schemas.
- Frontend: separate /close/checklist with trusted entity/month selector, user task entry, done/undone, confirmed deletion, completed/total/percentage, explicit local/API or session-demo label, pending/empty/error/conflict states, safe create retry and stale-request cancellation. No changes to existing Close.tsx, FinanceSnapshot.tsx, demo store/seed or original browser assertions.
- Default public checkout remains standalone demo. Ignored local configuration enables API mode. Resetting financial demo state does not erase API tasks. No real finance, bank, AI, review or period-lock feature was added.

## Actual verification

| Check | Result |
| --- | --- |
| Backend frozen install (`npm ci --cache /workspace/.npm-cache --no-audit --no-fund`), verified generation, migrate/seed and repeat migrate/seed | Passed; no pending migrations on repeat; existing data preserved |
| Backend typecheck / lint / build | Passed |
| Backend `npm test` | **8 passed, 0 skipped** against real PostgreSQL and actual HTTP |
| Frontend typecheck / lint / production build | Passed |
| Frontend `npm run test:checklist` | **11 passed, 0 skipped**; owned API on 3001, Vite on 5173 |
| Frontend `npm test` | **33 passed, 0 skipped**; original accounting/public-site suite, 1.3m |
| Full npm audits (including development tools) | **0 vulnerabilities** in backend and frontend |
| Contract validator / Redocly 2.8.0 minimal lint | Passed: 17 examples, empty summary, rejected patch payloads and routes |
| Production API build smoke | Actual create/completion/refresh persisted, no JS errors; desktop/mobile captures inspected |
| Default demo production build smoke | Adds session-only tasks, clears on refresh, no API requests or JS errors |
| Scope, whitespace, ignored secrets/generated outputs | Checked before commit; see review.md |

Backend tests cover actual migration repeatability, CRUD and summaries, API restart persistence, canonical create replay after later edits and at full capacity, tenant/entity isolation for all mutations, read-only membership, forged identity/host-origin defenses, title/month/UUID/version boundaries, malformed/oversized input, concurrent update and delete/update races, concurrent capacity enforcement, safe dependency outages and production refusal. Tests create/drop only a unique synthetic test schema.

Checklist browser tests cover refresh and real child-process API restart, done/undone and 50% progress, cancellation/confirmation of deletion, month/entity isolation, empty 0% without NaN, demo reset independence, actual backend shutdown, ambiguous successful create response and same-UUID retry, conflicts/refetch, delayed earlier scope responses, 401/403/503, invalid responses/entity failures, corrected rejected input, failed completion without false success, mobile containment. Original regression tests remain intact.

Review fixed internal identity canonicalization, oversized-body error translation, dependency advisories, response validation independent of JSON property order, correction after definitive failed create, and recoverable failed-save handling. Initial failures were diagnosed and rerun; no assertions were disabled. Nonfatal warnings remain: npm reports the existing ESLint 9 support/deprecation notice, Vite reports third-party Zod comment annotations, and test tooling emits FORCE_COLOR/NO_COLOR notices. All recorded final checks completed successfully.

## Startup and next action

Exact commands: backend/README.md and frontend/docs/checklist.md. Start the persistent database, explicitly migrate/seed, build and start API; configure ignored frontend/.env.local with VITE_CHECKLIST_MODE=api and VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1; start Vite on 5173. GET /health/ready verifies DB/schema and seeded membership. Required download host binaries.prisma.sh is now reachable with TLS/checksum verification intact. Secrets remain only in ignored local configuration; no external API key is required.

The complete reusable cloud install script was executed successfully (both frozen installs, initialization, migration/seed, typechecks, lint and builds). Updated install_script and start_skill were saved in the environment draft; saving does not publish or apply them. The user can review/save and publish the environment separately.

The user authorized review, commit and push to GitHub after verification. Commit role-scoped changes to the current work branch and push without force; verify the remote SHA. Public identity/provider integration, membership lifecycle, production deployment/security review, backup/restore rehearsal and RPO/RTO validation remain separate Gate D tasks. No public deployment or fresh-task snapshot restoration was verified. Live API/Vite/database processes must restart in each task; local Docker volume persistence was verified across local restarts, not a new cloud task.

## Historical milestones

Prompt 01 initially created a provisional design because Prompt 02 was absent. Prompt 02 then superseded its nested routes, cursor pagination, no-delete policy and proposed event table. A proxy denial at binaries.prisma.sh initially blocked generation; the network requirement was saved and later access succeeded. Earlier blocked-state reports are superseded by the completed evidence above.

## Copy previous month / release foundations — 2026-10-21

Implemented sequentially from clean a285efa93bcf8918958b13139dabd9857edd0e72. Baseline backend 8 tests rerun successfully. New actual checks: backend 12 tests; checklist API browser 14; original browser regression 33; session-only demo copy 1; production-build HTTPS session/proxy browser 1. Both applications typecheck/lint/build; contract validator 23 examples and Redocly 2.8.0 lint pass; both full npm audits report zero known vulnerabilities. Synthetic migrated application database dump/restore verifies task state, auth tables and migration history. No production/paid-resource deployment or GitHub CI execution claimed. See `copy-release.md` for final container evidence, exact next commands and outstanding target gates.

## Verification and GitHub handoff

User authorized commit/push after fresh verification. Reran 12 backend + 34 standalone browser + 14 API checklist + 1 HTTPS session/proxy = 61 passing tests, with typechecks/lint/builds, contracts, zero-vulnerability application audits, asset scan and synthetic restore passing. Backend review additionally fixed and tested a concurrent login/password-reset race by locking/rechecking the account before minting a session. Push the role-scoped commits to the existing work branch without force; main/public deployment remain separate. See copy-release.md and Git history.

## Subscription renewals — 2026-10-22

Implemented sequentially from clean c06d7f2 on work. Fresh final checks: 17 backend + 4 subscription browser + 34 existing standalone browser + 14 checklist browser + 1 production-build HTTPS session/proxy = 70 passing tests, zero skipped. Both applications typecheck/lint/build; existing/new contracts validate, subscription Redocly lint passes, application audits report zero known vulnerabilities, asset scan passes, and additive migration repeatability/synthetic subscription+checklist restore pass. Existing production auth reused; no deployment/paid resources. Commands, file inventory and gates: subscriptions.md.

## Payment due-date calculator — 2026-10-22

Implemented from clean7c918477a4a360d0dfefef0dace3015894911950 on `feature/payment-due-date`, following the supplied calculator brief. Independent contract1.0.0, pure permission-checked calendar calculation, `/tools/payment-due-date`, shared existing sessions/entity loader/transport, stale-request cancellation, strict response verification and no calculation persistence. No business table, migration, new dependency or global security change.

Fresh final checks:21 backend +11 calculator browser +34 standalone browser +14 checklist browser +4 subscription browser +1 local HTTPS production-build session/proxy =85 passing tests, zero skipped. Both applications typecheck/lint/build, all3 contracts/validators lint/validate, both full audits report0 vulnerabilities, asset scan and synthetic restore pass, local backend container builds. One initial browser failure logged Chromium ERR_NETWORK_CHANGED while loading modules during overlapping container work; the full unchanged standalone suite reran with34 passes. Assertions were not removed. CI now includes calculator checks, but remote CI/deployment was not run. Reviewable diff deliberately remains unpushed/unmerged per the current brief. Exact commands, changed paths, manual journey, startup and remaining deployment gates: [payment-due-date.md](payment-due-date.md).


### Subsequent calculator commit/push authorization

The latest user instruction supersedes the original no-push restriction: verify, commit and push `feature/payment-due-date`. Fresh rerun passed all85 tests (21 backend,34 standalone,14 checklist,4 subscriptions,11 calculator,1 HTTPS session), both applications' typechecks/lint/builds, all3 contract validators/Redocly lint, asset scan and both0-vulnerability audits. Code inspection and diff checks passed. Publish only the feature branch without force; do not merge newer remote main or deploy. GitHub API access for hosted CI inspection returned Forbidden; distinguish that limitation from Git transport and local verification. Full evidence is in payment-due-date.md.


## Product boundary and production hardening — 2026-10-22

Reviewed from clean8b270d2. Default frontend is now the session-authenticated live product with checklist/copy, subscriptions and due-date calculation; it excludes legacy Redux/fixtures/financial simulation routes/assets. Added strict session response/expiry behavior, stale save guards, subscription response correspondence, proxy error IDs/deadlines and security headers, schema/migration readiness and DB-shared global login cost budget. No migration/dependency or customer-data changes. Architecture and operating/CI instructions are committed with the implementation.

Fresh final evidence:93 tests passed,0 skipped (23 backend,34 legacy regression,14 checklist,6 subscriptions,11 calculator,3 HTTPS product,2 proxy/session). Both applications typecheck/lint/build, all3 contract validators/lints,5 negative build guards, product asset scans,0-vulnerability audits, container build and synthetic restore pass. One artwork test loading race was fixed by adding waits/assertions without removing existing assertions. Official Vercel-schema fetch and GitHub API checks are blocked byHTTP403; target deployment/recovery/capacity/monitoring and hosted CI remain unverified. Exact coverage/results/gates: production-review.md. User authorizes commit/push to the existing feature branch, without main merge or public deployment.


## Invoice duplicate checker — 2026-10-22

New transient CSV checker at `/tools/invoice-duplicates`, POST `/api/v1/invoice-duplicate-checks`, independent contract 1.0.0. Reuses existing auth/entity read access; no new dependency, paid API, table or invoice mutation. Locally 23 backend tests pass; both application builds/lint/typechecks, contracts and audits pass. Browser tests are blocked locally by forbidden Chrome startup Unix sockets, but full GitHub CI run 39750248107 subsequently passed on application commit 395aef4: **80 tests**, both builds/checks, contracts/audits, asset scan, Docker build and synthetic restore. See `invoice-duplicates.md` for the exact breakdown and evidence. Live subscription route currently reports "API proxy is not configured." See `invoice-duplicates.md` for exact behavior, limits, test evidence and deployment blocker.


## PR #4 conflict resolution and integrated verification — 2026-10-22

The user now authorizes resolving and merging feat/invoice-duplicate-checker into main. Reconciled all15 conflicts against maincbc7dc6, preserving calculator/product/session/readiness behavior and both complete contract/test sets. Fixed the missing authenticated product route and demo-dependent header imports; added session upload/logout/re-login/refresh coverage. Fresh local verification:104 tests passed,0 skipped (29 backend,34 legacy,14 checklist,6 subscriptions,11 calculator,4 invoice,4 HTTPS product,2 proxy/session). Both applications typecheck/lint/build, all4 contract validators/lints, both0-vulnerability audits, build guards/assets, container build and synthetic restore passed. No schema/dependency/data reset. GitHub APIs return403; hosted CI/PR UI/deployment state remain unverified. See invoice-merge.md for the scope, exact evidence, operating/rollback notes and final publication procedure. OpenRouter remains a separate branch.
