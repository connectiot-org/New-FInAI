# Release sign-off review — 4 November 2026

**Local release matrix: PASS. Hosted real-company activation: UNCLEARED.**

Baseline: merged main `0b27162` (including `e7517d5`), clean checkout. Branch: `fix/release-signoff`.

Sequential coordinator/backend/frontend/reviewer scope: recheck prior fixes and remaining high-risk boundaries, reproduce/fix newly observed defects, run the complete release matrix and record actual evidence. Preserve no-login invoice samples, authenticated company data/Assistant authority, existing stores, separate dependencies and financial contracts. No subagents/worktrees or production data/hosting mutations. Shared contract changes precede implementation if required.

Acceptance: passing application checks and explicit evidence for controls, persistence, invoice/Assistant journeys, migrations/recovery, audits and private packaging. Hosted activation remains conditional on actual configuration/access and target smoke verification. Prior report and measured coverage: `final-product-review.md`; file inventory: `final-review-inventory.tsv`. A second pass does not imply formal proof of every possible execution path.

Findings and fresh execution results follow below.

Scope refinement during review: verify the private ClamAV command's absolute deadline as well as ingress reads. The existing socket timeout measures inactivity only, so partial scanner replies can retain a scan slot. Backend role owns the scanner/test/runbook correction after coordinator compatibility review; API fields, financial rules, scan verdict policy and dependencies stay unchanged. Acceptance includes a real local drip-fed scanner regression, subsequent healthy scan and full backend rerun before final packaging.

## Corrected findings

| Finding | Before correction | Final behavior and evidence |
| --- | --- | --- |
| Unfinished private request retained the ingress reader | Real HTTP clients started ordinary JSON and withheld the terminating chunk. Both embedded and remote adapters had no response by the 6.5-second regression deadline. | Shared private body reader enforces an absolute 5-second ordinary / 15-second raw-upload deadline, returns safe no-store HTTP 408 `REQUEST_TIMEOUT`, closes the connection and never initializes/forwards incomplete input. Existing 16 KiB / 1 MiB bounds and raw byte requirements remain. Tests cover both actual adapters, JSON/PDF deadlines, streamed/parsed limits, interrupted/drained inputs, late errors and drip-fed input cleanup. |
| Partial ClamAV verdict evaded inactivity timeout | A controlled local scanner returned a valid fresh VERSION, then sent partial verdict bytes every 50 ms. The scan was still pending at 12.5 seconds. | Every private scanner command now has an absolute 10-second limit, clears its deadline and destroys its socket on completion/error. Timed-out scans remain quarantined with unavailable provenance. The regression verifies a subsequent healthy scan succeeds; existing clean/infected/framing/signature-age tests remain. |

The first focused body-reader run also exposed a test-fixture mistake: a manually drained synthetic `IncomingMessage` was not marked complete, so Node correctly marked it aborted. The complete/empty fixture was corrected; aborted/incomplete requests still reject. No production behavior was weakened for that fixture.

Compatible ingress 408 behavior is documented in `contracts/README.md` before consumer changes. No endpoint payload schema, migration, dependency or financial authority changed. No-login public samples, private company authentication, invoice/Assistant confirmation, prior identity isolation and PDF lifetime corrections remain intact.

## Scope and limits

The refreshed [307-file inventory](release-signoff-inventory.tsv) records current content hashes/line counts: 87 backend, 187 frontend, 31 contracts and 2 workflows. It carries forward the previous broad review scope and adds the new private reader. It is a provenance/scope inventory, not proof every line or browser execution path was executed. The [previous report](final-product-review.md) records the earlier full review and measured backend source coverage; coverage was not remeasured in this pass. Its PostgreSQL 18.6 run covered 86 tests before this scanner-only change; this pass reruns the current 87-test backend suite on local PostgreSQL 17.6.

Public invoice routes remain browser-only sample workflows without a sign-in selection. Actual company invoices and grounded FinAI controls still require their authenticated workspace. Payments, external ledger posting, OCR/email intake and the original browser accounting/banking/reporting demos do not become production integrations through this review. The supported company invoice feature remains a manual-entry GBP approval/export pilot subject to finance-approved tax/account mappings.

## Hosted release status

The fresh hosted invoice HEAD attempt was rejected by the outbound proxy at CONNECT with 403 (origin HTTP 000). There are still no callable Vercel/Neon/GitHub API tools, private runtime bindings, secret bindings or outbound identities. Normal Git transport is available. This is an access limitation; it does not establish whether the public site is healthy or failing. No hosted database, account, permissions, scanner, model or deployment was changed or tested.

The standard Docker deployment path remains blocked by the preceding review's 403 fetching Prisma's pinned schema-engine checksum. That unchanged blocked build was not rerun or represented as a pass. Local tests and private Vercel packaging use the documented exact-commit source-built native engine override with normal TLS/checksums; this does not prove the production RHEL engine or real model/provider works. Exact-head hosted CI remains unobserved from this environment.

Real-company production release remains uncleared until the [deployment handoff](invoice-assistant-release.md) is completed: rotated private database binding and reviewed migrations/accounts/AP grants, reachable maintained scanner, approved model/provider/privacy/budget settings, deployed exact-commit smoke verification and operator backup/monitoring/finance gates. The user previously chose the tested branch and deployment handoff. This pass delivers that branch; it does not merge main or deploy production.

## Fresh execution evidence

Environment: Node 24.19.0/npm 11.9.0, local PostgreSQL 17.6, checked-in Chromium configuration. Frozen installs, real isolated synthetic database schemas and controlled external services are used; no real customer data is tested or seeded. All suites run sequentially within each application; backend checks finish before packaging reinstalls backend dependencies.

Backend: frozen install/generation, typecheck/lint/build, all 87 tests (0 skipped) and npm audit 0 vulnerabilities pass after the scanner correction. Both synthetic restore rehearsals pass again, covering migrated application records, AP approval/history/policy/PDF/export bytes and tenant FKs. All 7 contract validators and all 7 OpenAPI descriptions pass; 29 existing nonblocking lint warnings remain. The first validator attempt referenced an absent old temporary venv; rerunning with the available Python dependencies passed.

| Frontend command | Outcome | Checks | Seconds |
| --- | --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | — | 6 |
| `npm run typecheck` | PASS | — | 10 |
| `npm run lint` | PASS | — | 4 |
| `npm run build` | PASS | — | 17 |
| `npm run test` | PASS | 60 | 117 |
| `npm run test:invoice-demo` | PASS | 8 | 25 |
| `npm run test:checklist` | PASS | 14 | 28 |
| `npm run test:subscriptions` | PASS | 4 | 13 |
| `npm run test:session` | PASS | 1 | 15 |
| `npm run test:receivables` | PASS | 5 | 14 |
| `npm run test:receivables:production` | PASS | 1 | 17 |
| `npm run test:workspace` | PASS | 18 | 33 |
| `npm run test:workspace:production` | PASS | 2 | 28 |
| `npm run test:assistant` | PASS | 20 | 36 |
| `npm run test:assistant:production` | PASS | 1 | 30 |
| `npm run test:public-chat` | PASS | 22 | 24 |
| `npm run test:vercel` | PASS | 6 | 44 |
| `npm run test:payables` | PASS | 8 | 16 |
| `npm run test:payables-transport` | PASS | 10 | 41 |
| `npm run test:payables:integration` | PASS | 9 | 140 |
| `node scripts/check-assets.ts` | PASS | — | 0 |
| `npm audit` | PASS | — | 0 |


The complete current matrix passes **189 frontend/API/transport checks + 87 backend checks = 276 tests**, with no skipped tests. Focused reproduction/follow-up runs are not counted twice. Full invoice integration passes all three journeys through each of remote, embedded and private packaged runtimes: original PDF/coding/mismatch/verification/two approvals/export/restart; scoped FinAI grounding/explicit confirmation/ambiguous retry/stale proposal; and real HTTP replay/concurrency/CSRF/assignment/grant/company isolation. Existing identity-switch/cross-tab/PDF lifecycle regressions pass in the full matrix. Fresh frontend audit reports **0 vulnerabilities**; final lint and scoped formatting also pass.

Per-command logs/metadata are retained locally in ignored `frontend/artifacts/release-signoff/`. Backend logs are `/tmp/finai-signoff-backend-final.log`; scanner/body pre-fix reproductions are `/tmp/finai-signoff-scanner-before.log` and `/tmp/finai-signoff-transport-before.log`; contract lint and synthetic restore logs are `/tmp/finai-signoff-openapi.log` and `/tmp/finai-signoff-restore.log`. These are local evidence, not observed GitHub/Vercel CI results or real-provider evaluations.

## Delivery

Review branch: `fix/release-signoff`, based on main `0b271626751ab6af29e6de9ac0b8e77dffa147e7` (fetched again unchanged before delivery). Final source diff and all 307 inventory hashes were inspected; no dependency/lockfile/environment/migration changes. Source/tests/runbooks and this evidence are committed for normal PR review. Main and production deployment are separate operator steps.

A freshly tested standalone sample is retained locally at `frontend/artifacts/release-signoff/finai-invoice-demo.zip`: 997699 bytes, SHA-256 `16472d5d5cccee2924816f0ebddc056bf5c9720e19635d1c7733825a51cbaacc`. Its 29 files contain only public dist assets, server script, README and build metadata. ZIP integrity, exact equality with the tested build and index digest were checked. Unzip, run `node serve.mjs` with Node 24 and open `http://127.0.0.1:4173/demo/invoices`. Use sample documents only; this archive has no real company database/auth/API/scanner or accounting/payment integration. The archive and ignored logs are not pushed to GitHub.

Local engineering verification is complete for this reviewed version. **Real-company hosted production activation remains uncleared** for the specific access/configuration/operational reasons above; a passing build or branch push does not establish live readiness.
