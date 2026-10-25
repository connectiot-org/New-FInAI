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

## Overview: Outstanding by customer — 2026-10-23

From clean audited55e79b3 on main, created feat/overview-outstanding-customers in the existing checkout. Adds only a pure integer-cent selector and isolated read-only Overview card after FinanceSnapshot/before Recent activity, scoped to existing browser-owned demo invoices. Preserves the exact Outstanding predicate, full totals before top5, deterministic ID ties, entity-safe customer links, empty/unavailable states and current cumulative balance/issue-period semantics. No backend/AI/API, entry/navigation/auth/store/fixture/config/dependency changes; Overview has only one import and JSX insertion.

Fresh local checks:85 tests passed,0 skipped (17 backend,49 default including15 new,14 checklist,4 subscriptions,1 HTTPS session); both applications typecheck/lint/build, both contract validators/Redocly lints, both0-vulnerability audits and asset scans passed. Baseline34 original frontend tests passed before editing. Before/after homepage PNGs at1440/390/320px are byte-identical; existing Overview header/FinanceSnapshot geometry is unchanged; keyboard, long names and narrow layout are tested. Local screenshot paths, exact allowed files/commands and limitations are in frontend/docs/outstanding-customers.md. GitHub API inspection returns403, so hosted workflow status and draft PR remain gates to verify/report after the authorized non-main push. No main push/merge, hosting change, paid resource or production deployment command is authorized; the supplied review's unrelated deployed proxy issue is not repaired by this frontend task.


## Outstanding customer review — 24 October 2026 (Asia/Dhaka)

Reused `feat/overview-outstanding-customers` at `b5c275c121950ceaca999f78c7dab1fadd292ba2`, based on unchanged main `55e79b3`. Sequential review found no required application fix; only `frontend/docs/outstanding-customers.md` and this coordinator append were updated with fresh evidence. Frontend typecheck/lint/build and `npm test -- --workers=1` passed: 49 tests, zero skipped, including all 15 feature tests. Session asset build and available-credential asset scan passed; no authenticated backend check is implied. Independent seed grouping confirmed all requested totals/top-five values. Before/after desktop/390/320 captures under `/workspace/finai-outstanding-review-20261024/` show identical homepage bytes and unchanged Overview header/FinanceSnapshot geometry, no overflow/page errors, and the expected card/activity shift. See feature documentation for commands, initial scan prerequisite and historical/current evidence separation.

GitHub API PR/Actions inspection and live-site access returned HTTP 403; native Git reads work. Draft PR/CI/live verification therefore depend on the missing external access. No backend/proxy/auth/store/fixtures/shared styles/dependencies/configuration changes, merge, main push or production deployment occurred. Earlier 85-test/hosted results are historical, not a new run. Full backend onboarding remains blocked separately by Prisma engine network access.

## Imported receivables production extension — 24 October 2026

Full production-extension prompt supersedes the prior frontend-only boundary. Reused reviewed head `73618d8`, created `feat/receivables-snapshot-production` without agents/worktrees and preserved the old feature branch/main. Implemented receivables contract 1.0.0; additive snapshot migration 202610240001_receivable_snapshots; bounded dry-run-default operator JSON import; authorized exact-integer read API; same-card explicit demo/API modes with independent in-memory UUID/period controls, session invalidation, source provenance and no synthetic production links/fallback/storage. Existing financial store/seed/selectors/Overview/FinanceSnapshot and old contracts remain unchanged. CI and synthetic restore checks were extended; no dependency/lockfile or proxy-route/body-limit change. Corrected the malformed FINAI_PUBLIC_ORIGIN runbook example. Exact files, semantics, actual checks and release/rollback inputs are in context/receivables-production.md and backend/RECEIVABLES.md.

Snapshot refresh is operator-driven, not real-time. Backend dependency audit advisories remain in unchanged locks; GitHub API/PR/CI inspection remains denied with HTTP 403. Real exports/target settings/credentials and deployment/import authorization are absent. Implemented/locally tested does not mean CI/preview/production verified. No main push/merge, production deployment, target secret/access change or real-data import occurred.

Final local evidence: 103 unique tests passed, zero skipped (27 backend +51 default +5 API state +14 checklist +4 subscriptions +1 existing session +1 imported built integration). Both applications typecheck/lint/build, contract validators/Redocly, asset scan, final container smoke and snapshot-inclusive synthetic restore passed. Backend audit fails with five existing advisories; frontend audit reports zero. Protected paths/lockfiles unchanged; 35 extension paths match the declared scope. Fresh CI/PR/preview/production verification is not claimed; detailed ledger and image digest are in context/receivables-production.md.

## Release-check audit remediation — 24 October 2026

User reported failing run 40070560149 after merging PR #6. Fetched main is `642d11d35198f50fc031930f8b4194b60c955e87`, whose tree matches the reviewed extension. Created `fix/receivables-release-audit` from that main with no user changes lost. Public job metadata confirms failure in Local database and backend checks (exit 1); exact logs require sign-in and GitHub API requests return Forbidden. Reproduced a definite blocker in that step: plain backend npm audit exits nonzero on five advisories. No claim is made that unavailable logs prove the precise failing command.

Backend-engineer scope: backend/package.json and backend/package-lock.json only. Update Zod 4.1.12 →4.6.7; scoped overrides pin Express body-parser 2.4.0, Nest platform multer 2.5.0 and AJV fast-uri 3.1.9. NestJS/Prisma/Express/AJV versions and all other lock entries remain unchanged; the existing Prisma deepmerge override is preserved. Avoid npm audit fix --force's suggested Nest downgrade. Coordinator scope: this append and the latest section in context/receivables-production.md. No application logic, schema, auth, frontend, workflows, audit gates or target hosting settings changed.

Fresh frozen backend install, generation/typecheck/lint/build, all 27 backend tests and full audit pass; backend audit now reports zero vulnerabilities. Frontend typecheck/lint/build and all suites passed: default npm test (51 tests with the configured two workers), checklist14, subscriptions4, session1, API-state5, imported built integration1. Total103 passed, zero skipped. All three contract validators, Redocly validation (same two unused schema warnings), three-build asset scan, frontend audit (zero), patched container build/smoke and snapshot-inclusive synthetic restore pass. Patched image `finai-backend:receivables-ci-fix`, digest `sha256:fbd4d1b1c394923dad9d6cefea1304127977ebdc4fd1710991cd4818463405e2`; production-mode readiness, anonymous JSON401, malformed JSON400 and continued readiness verified. No original assertion or CI audit check was removed. Hosted verification is separate from this local ledger; main merge/deployment remain outside this fix.

## Production workspace foundation — 24 October 2026

User supplied the staged production master brief and authorized implementation. Fetched main3f5af09 includes PRs6/7. The described local workspace increment was absent from this checkout/remotes, so created feat/production-workspace from main without agents/worktrees or resetting work. Added private /workspace entry, overview/checklist/subscriptions and explicit private not-found; one inherited/schema-validated SessionGate, scoped session expiry, visible logout failure and configuration checks before private requests. Reused persisted modules; no new tables/contracts for this slice. Private pages have no Northstar/FinanceSnapshot/persona/financial demo audit or fixture fallback; module selections remain independent and private state is not in financial browser storage. Route/action inventory is in context/production-workspace.md.

Fresh frontend typecheck/lint/build, eight workspace UI cases and actual built HTTPS proxy/session/PostgreSQL journey passed. Existing51 default +14 checklist +4 subscriptions +1 session +5 receivables UI +1 receivables built tests passed as well (85 unique frontend cases including9 workspace). Asset scans cover all4 build modes. Synthetic captures at1440/390/320 under frontend/artifacts/workspace and workspace-production were inspected. No browser/TLS workaround was needed. No main merge/deployment/secret change/real import; later detail/import/admin/reporting/operations work proceeds in scoped slices. Reporting's finance-owned source mappings/expected totals are not invented or labeled approved by synthetic tests.

## Production workspace details/imports/administration — 24 October 2026

Continued authorized implementation sequentially on feat/production-workspace, without agents/worktrees. Coordinator froze receivables-detail1.1.0 and workspace operations1.0.0; backend added pinned scoped pages/reconciled rollups/export, staged reviewed imports, explicit grants/administrator lifecycle, atomic safe business/access audit and dry-run operator recovery/cleanup; frontend added typed routes/import review/admin and validated server context. Added one migration202610240002_workspace_operations. Source/provenance history stays immutable; ordinary16KiB cap stays, dedicated raw preview1MiB, CLI5MiB. No demo financial store/seed/selectors/types or package/lock changes. Details, exact paths via commits, evidence and external gates are in production-workspace.md and backend/WORKSPACE.md.

Fresh results:121 unique tests passed (33 backend +88 frontend), zero skipped; both apps typecheck/lint/build, audits0,4 Python validators,5 OpenAPI lint,4-mode asset scan and synthetic5-migration restore including audit/admin/import grants pass. New actual built HTTPS proxy/session/DB journey covers pinned detail/rollups, larger-than-normal-body-cap browser import, explicit apply/audit, admin entity creation, persistence/restart/logout/expiry and no private browser storage. Inspected1440/390/320 synthetic screenshots. Container/hosted checks are recorded separately when complete. Target live read returned CONNECT403 even after escalation; no target verification claim. Financial statement source/mappings/expected fixtures still need real finance-owner input; recorded normalized source proposal, no fabricated production statements. No merge/main push/deployment, secret/access changes or real-data imports.

Fresh workspace container sha256:6a3672b9dad2a372ace081b79a2aff536f7c018771d58838d1a44c1a2759180d built and production-session readiness/anonymous401/malformedJSON400/recovery smoke passed. Environment Docker DNS required trusted proxy address/build args plus CA secret; TLS stayed verified. Branch pushed normally. Draft PR create remains GraphQL Forbidden after escalation; no PR created. Public Actions run40117442720 was discovered; hosted result is separate/pending at this entry. Review URL and image evidence are in production-workspace.md.


## FinAI Assistant — 25 October 2026

Implemented sequentially from main f51f983 on feat/production-assistant. Added scoped PostgreSQL conversations/turns/preferences/budget/deletion receipts, immutable approved ledger source, strict OpenRouter adapter and grounded fact-only answers; integrated private Assistant and real source viewers while preserving the explicit demo. Two additive migrations, no dependencies/lock changes. 49 backend and96 frontend tests pass locally; controlled providers do not prove actual model quality. Detailed evidence and release blockers: assistant-production.md; operational configuration/retention/import/recovery: ../backend/ASSISTANT.md. No production deployment, target settings change or real-data import.
