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
