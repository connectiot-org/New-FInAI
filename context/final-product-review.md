# Final product review —4 November 2026 (Asia/Dhaka)

Baseline: main `3896cfb`, initially clean checkout; review branch `fix/final-release-review`. Latest no-login public invoice entry is preserved. Real company records and FinAI confirmed controls remain separately authenticated.

## Scope and method

Sequential coordinator (`context/`, shared contract proposals), backend (`backend/`), frontend (`frontend/`) and reviewer roles. Inventory all authored source/configuration/test/migration folders, manually inspect security/data/concurrency/financial/routing boundaries, run the full checked-in release matrix on isolated synthetic data, reproduce/fix defects, verify the final diff and publish a reviewable branch. No subagents or worktrees. Shared contract changes precede consumers if required. No hosted database mutation, demo seeding of company data, credential disclosure or production merge/deployment.

Acceptance: repeatable passing checks for both applications, contracts, API/session isolation, invoice/PDF/approval/export/persistence, Assistant grounding/confirmation, browser routes/responsiveness, private artifact packaging and synthetic recovery. A local pass does not establish external model compatibility, production database/account/scanner configuration, hosted availability or formal exhaustive proof of every possible input.

## Evidence and findings

### Corrected defects

| Finding | Reproduction before the fix | Correction | Regression evidence |
| --- | --- | --- | --- |
| Shared/checklist account-switch race | Four controlled browser cases accepted an old-account response or completed a write after the identity epoch changed during CSRF retrieval. Subscription/admin/Assistant callers share this client; the separate checklist client had the same gap. | Check identity before sending and after receiving private data; protect shared session results and the raw import preview path too. Old requests cannot expire a new account session. | Four reproduced failures now pass; full private Assistant suite passes 20 tests, including interrupted HTTP 401 body cleanup. |
| Cross-tab private view retained | After authenticating in a second same-origin tab, the first tab still displayed the previous private financial answer. | An ephemeral BroadcastChannel invalidates other tabs' private state. Messages contain only a fixed change signal; no account, token, question, answer or browser storage payload. Local guards remain active if the channel is unavailable. | Two-tab regression now clears private turns and returns to the gate; shared token race test passes. |
| PDF preview worker outlived navigation | Delaying `Blob.arrayBuffer()`, leaving invoice detail, then resolving the bytes started one orphan PDF worker. | Recheck component lifetime after byte loading; dispose failed/oversized/stale PDF tasks and handle asynchronous worker cleanup. | Original test observed 1 worker; fixed test observes 0. |

### Review coverage

The [file inventory](final-review-inventory.tsv) lists 306 tracked application/contract/workflow files with line counts, SHA-256 and verification groups. It covers 87 backend, 186 frontend, 31 contract and 2 workflow files. Context/history and repository administrative files are separately read as instructions, not application code. The inventory records scope and provenance; its verification groups do not claim every line was executed or manually proved correct.

Manual inspection focused on authentication/CSRF and identity lifetimes; tenant/entity/AP permission boundaries; exact money, policy/assignment/state transitions, PDF scanning/preview/download and export replay; immutable source import/version/coverage; Assistant facts/grounding/budgets/confirmed commands; public/private routing and separate demo stores; runtime proxy/private packaging; and synthetic backup/restore. Unchanged layout and demonstration modules also receive full route, workflow, keyboard, recovery, mobile and build regressions.

Backend Node source coverage from the 86-test suite: **90.78% lines, 86.66% branches, 91.52% functions**. This is measured coverage for that suite only. Browser integration suites exercise compiled backends and are not merged into this percentage. Lower source-controller coverage remains explicit (payables 48.19%, Assistant 56.22%, workspace 63.48% lines); source entrypoint `main.ts` is outside that imported-source coverage run. No artificial 100% target or formal correctness certification is claimed.

### Completed release checks

- Backend typecheck/lint/build and 86 tests pass, including a separate coverage run. The complete 86-test suite also passes on disposable PostgreSQL 18.6 (matching Neon’s major version); the container/volume/private temporary credentials were removed.
- All 7 contract validators pass; OpenAPI lint across all 7 descriptions passes with 29 nonblocking missing-operation-ID/unused-component warnings.
- Both synthetic application and AP storage restore rehearsals pass. Fresh/repeated migrations, tenant FK rejection, PDF/export bytes/digests, approval/policy/event state and auth/source/Assistant records are checked on disposable local databases.
- Backend npm audit reports 0 vulnerabilities.
- Full frontend release matrix passed (table below), including frozen installs, typecheck/lint/build, every checked-in browser/integration suite, both runtime transports, asset credential scanning and frontend audit with 0 vulnerabilities. Final focused cleanup verification is recorded below.

### Hosting and external blockers

- The standard checked-in Docker build reached Prisma generation and failed fetching the pinned schema-engine checksum from `binaries.prisma.sh` with 403. TLS/checksum verification stayed enabled. This is a blocked standard container build, not a passed release check. Local tests/private function packaging use the already documented exact-commit source-built native engine override; that does not certify the production RHEL runtime.
- The public hosted invoice availability check was blocked at the proxy CONNECT step (403, no origin HTTP response). This is not evidence the site is down or functioning. There are no callable Vercel/Neon tools, ready private runtime variables, secret bindings or outbound identities here, so real hosted database/account/scanner/provider state and production deployment remain unverified.

### Product boundaries for release

| Area | Actual behavior / release boundary |
| --- | --- |
| Public invoice entry | Labelled browser-only sample workflow, persistent separate IndexedDB, no login/private API. The latest user choice remains intact. |
| Company supplier invoices | Session/AP grants, supported GBP/tax rules, original private PDFs, manual entry/coding, verification/approvals/correction/challenge/rejection and balanced CSV. Requires real database/accounts/scanner and finance-approved mappings. No payment or external accounting posting. |
| Checklist/subscriptions | Scoped PostgreSQL persistence and sessions when configured; task completion and saved renewals are not accounting approvals or automatic billing. |
| Receivables/ledger | Owner-approved complete immutable imports, exact calculations and explicit source/mapping/currency/coverage; no bank/provider connection inferred. |
| Private FinAI | Authorized facts, persisted owner-only history, explicit confirmed invoice proposals. Requires approved provider/model/privacy/budget settings and real-model evaluation. |
| Public chat | General free-model chat, bounded stateless context, visible provider/quota failures; no company record access or commercial availability guarantee. |
| Existing accounting/banking/reports/automations demo | Browser fixture workflows retain demo storage/personas. They are not converted to a real ERP or bank/payment platform by passing tests. |

Production activation requires the existing [deployment handoff](invoice-assistant-release.md): private rotated connection binding, reviewed migrations and real accounts/AP grants, reachable private scanner, approved model/provider configuration, exact-commit hosted smoke tests, backups/monitoring and finance approval of the supported accounting/tax rules. No synthetic data is seeded into company databases to hide missing provisioning.


### Full release matrix

Commands run from `frontend/` with the existing local Prisma engine override; each stage ran sequentially and retained an ignored artifact log. Application sources stayed separate from test databases and credentials.

| Command | Outcome | Checks | Seconds |
| --- | --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | — | 6 |
| `npm run typecheck` | PASS | — | 9 |
| `npm run lint` | PASS | — | 3 |
| `npm run build` | PASS | — | 14 |
| `npm run test` | PASS | 60 | 106 |
| `npm run test:invoice-demo` | PASS | 8 | 26 |
| `npm run test:checklist` | PASS | 14 | 31 |
| `npm run test:subscriptions` | PASS | 4 | 14 |
| `npm run test:session` | PASS | 1 | 13 |
| `npm run test:receivables` | PASS | 5 | 11 |
| `npm run test:receivables:production` | PASS | 1 | 13 |
| `npm run test:workspace` | PASS | 18 | 28 |
| `npm run test:workspace:production` | PASS | 2 | 25 |
| `npm run test:assistant` | PASS | 18 | 32 |
| `npm run test:assistant:production` | PASS | 1 | 29 |
| `npm run test:public-chat` | PASS | 22 | 23 |
| `npm run test:vercel` | PASS | 6 | 41 |
| `npm run test:payables` | PASS | 8 | 16 |
| `npm run test:payables-transport` | PASS | 2 | 1 |
| `npm run test:payables:integration` | PASS | 9 | 137 |
| `node scripts/check-assets.ts` | PASS | — | 0 |
| `npm audit` | PASS | — | 0 |

The full matrix passed 179 frontend/API/transport checks. Backend 86 tests are reported separately; repeat runs and contract examples are not added to that total. After the final interrupted-error-body cleanup, follow-up checks passed: private Assistant 20 (including 2 additional interrupted HTTP 401 response tests), checklist 14, built session 1 and rebuilt standalone invoice demo 8. Typecheck/lint and asset scan also passed again. The earlier follow-up attempt omitted the documented native Prisma override and stopped during test API startup; rerunning with that override passed all 14 checklist cases.

Baseline and coverage logs are in `/tmp/finai-final-review-backend*.log`; container and restore logs are in `/tmp/finai-final-review-container.log` and `/tmp/finai-final-review-restore.log`. Per-step frontend logs/results are in ignored `frontend/artifacts/final-review/`. Reproduction traces for the original identity and PDF failures are in ignored `frontend/artifacts/final-review-identity-before/` and `frontend/artifacts/final-review-pdf-before/`. These paths are local evidence, not hosted CI results or committed customer data.


### Usable sample artifact and delivery

The rebuilt, independently tested no-login invoice demo is packaged at `frontend/artifacts/final-review/finai-invoice-demo-reviewed.zip` (998801 bytes, SHA-256 `7f50165f4609f773d7c68cd2e93cbbb3b23f9c48783a2314dafcec675a5cffdd`). It contains only public `dist` assets, `serve.mjs`, README and build metadata. Unzip, use Node 24 to run `node serve.mjs` from the extracted folder, and open `http://127.0.0.1:4173/demo/invoices`. Use sample documents/data only. This is a runnable sample, not a company database or real payment/ERP system.

Delivery is a reviewable fix branch, source changes, regression tests, this report and the 306-file inventory. Hosted real-company use remains **uncleared because target configuration and deployed verification are unverified**. The separate Docker deployment path is also unverified locally because its pinned engine fetch was blocked; the Vercel private-package tests passed independently. No claim is made that a pushed branch has updated Vercel, that actual external models are compatible, or that the full finance application is certified for real-company use today. Browser verification uses the checked-in Chromium configuration; other browser engines and formal security/financial certification are outside the measured evidence.

Final production-mode browser build and asset scan passed after the cleanup refinement (main entry477.92kB uncompressed /141.19kB gzip). No dependency/lockfile or server-contract changes were required.
