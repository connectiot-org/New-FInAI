# Imported receivables production extension — 24 October 2026, Asia/Dhaka

## Scope and ownership

Sequential coordinator → backend engineer → frontend integrator → reviewer, in the existing isolated checkout; no agents/worktrees. Started clean at reviewed feature head `73618d8e2fc7a06496b45564760bab3489816122`, original demo implementation `b5c275c`, with fetched main still `55e79b3`. New branch: `feat/receivables-snapshot-production`; the reviewed feature branch and main are preserved. This task supersedes the older frontend-only/seven-file restriction for this extension.

No supported production invoice/customer source was present. Implemented the specified default: complete immutable imported USD registers, a session-authorized read summary, and a bounded trusted operator CLI. No accounting mutation, connector, real-time synchronization, new provider, navigation item, dependency or public importer. No real data/import/deployment. Default demo selector, existing feature assertions, seed, financial Redux/localStorage, FinanceSnapshot and Overview placement are preserved.

## Specification and behavior

Contract `receivables.openapi.yaml` **1.0.0**, additive migration **202610240001_receivable_snapshots**, exactly two feature tables. Five-MiB UTF-8/10,000-row normalized registers validate completely before writes. BigInt PostgreSQL fields and numeric sums avoid floating arithmetic; checked safe numbers are serialized. Status/payment consistency, calendar dates, names/IDs, unique invoices, complete-register declaration and five-minute capture clock skew are checked. Original numeric tokens are checked against rounding. Rows and metadata canonicalize for deterministic digest identity.

Per-entity advisory locking plus expected version and historical digest checks prevent concurrent/stale/old retry reactivation. Current exact retries may use current or originally preceding version. Batches/header commit atomically; readers select a complete latest snapshot in REPEATABLE READ. Every read checks active membership/entity access, every CLI import checks write permission and stabilizes it under row locks. No automatic history deletion. Retention/source reconciliation belong to the data owner.

The API selects issue dates and uses the latest snapshot's cumulative paid values. Full totals/counts precede five-row deterministic ordering. `no_snapshot` has no amounts/timestamps; imported empty/empty period is ready/zero. DB outages, missing feature schema and unsafe sums fail explicitly. Existing session/trusted proxy/host/origin/CSRF and no-store/request-ID error handling remain in force.

Frontend `VITE_RECEIVABLES_MODE=demo|api` defaults to demo. API mode requires the existing session configuration and `/api/v1`; bad configuration is visible and never substitutes fixtures. Only the card is gated. Authorized UUID entities and issue period have card-local in-memory controls, independent of demo us/uk and global controls. A page reload resets those controls; choose the intended authorized entity again. Imported data/choices never enter financial storage or cross-user caches. Scope changes/reloads key data, pending reads abort on change/unmount, 401 unmounts data via compatible SessionGate invalidation, and successful logout clears mounted gates. Focus revalidates stored data without polling. API names are plain text; no production links point into synthetic records. Source/entity/currency/period/capture/import labels explain the distinct basis.

## Evidence

See the feature documentation's production-extension section for the final test counts and commands. The built integration exercised actual frontend assets → verified synthetic TLS proxy → session backend → isolated PostgreSQL: import A ($750), sign in, full refresh/reselection, backend restart, import B ($500/version 2/new capture), stored-snapshot refresh, second entity no_snapshot, permission removal, missing proxy configuration and session expiry. No fixture fallback or financial browser persistence occurred.

Before/after default-demo captures at 1440/390/320 are under `/workspace/finai-receivables-extension-review/`; `comparison.json` compares them with the earlier reviewed-feature captures under `/workspace/finai-outstanding-review-20261024/`. Both homepage **and Overview** PNGs are byte-identical at all three widths. API captures are ignored under `frontend/artifacts/receivables-production/{overview,card}-{1440,390,320}.png`; card screenshots were inspected, with no page overflow/errors. The long-name API/browser tests also passed at 320px.

Initial implementation checks exposed a CLI ESM/source-module interop problem (fixed by loading the matching compiled backend), a test harness Host-header issue (fixed by native HTTP for trusted-host tests), and an integration-test assumption that in-memory production selection survived full reload (fixed by explicit authorized reselection). No assertion or security check was disabled. The importer now prebounds arrays before schema traversal. Redocly validated all contracts, with two intentional unused-component warnings for the query-validation/operator-import schemas, which have no public mutation route. An initial Redocly download cache permission issue was resolved by using `/workspace/.npm-cache`.

Backend audit currently reports **5 existing dependency advisories: 1 moderate, 4 high** (body-parser, fast-uri, multer/@nestjs/platform-express, Zod). Frontend audit reports **0**. Dependencies/lockfiles are unchanged from the starting head. No audit fix/ignore, skipped assertion or relaxed CI gate was introduced; dependency remediation remains a release blocker, and the existing CI audit step may fail. The new importer caps array length before Zod traversal but that does not clear the dependency advisories or claim whole-application remediation.

GitHub PR/Actions API access still returns HTTP 403. The supplied historical 85-test run cannot verify this extension. Native Git read/push access and hosted checks must be reported separately. Production proxy variables are absent from this local process; target hosting settings/live deployment cannot be inferred from that. Existing proxy code's missing/invalid variable behavior was inspected and exercised in the synthetic harness. No target configuration/secrets/network access were modified. The malformed FINAI_PUBLIC_ORIGIN multiline runbook example is corrected; API_TRUSTED_HOST stays separate.

## Release and rollback

Detailed source schema, CLI dry-run/apply commands, secure configuration names, image/migration/backup/restore order, owner verification and non-destructive rollback are in `backend/RECEIVABLES.md`. Real owner-approved complete exports, production organisation/entity/operator access, target frontend/backend origins/private durable database/TLS and matching proxy secret bindings, dependency remediation and final release authorization are absent. Production import/deployment cannot be claimed. Roll back to compatible images/disable API mode, keeping all additive tables/snapshots intact; do not reset, drop tables, restore over live DB or delete volumes.

Status: **Implemented / Locally tested**. **CI verified: no; Preview verified: no; Production deployed: no; Production verified: no.**

## Exact extension files

Coordinator:
- `contracts/receivables.openapi.yaml`
- `contracts/receivables-examples/import-v1.json`
- `contracts/validate_receivables.py`
- `contracts/README.md`
- `context/receivables-production.md`
- `context/progress.md`

Backend:
- `backend/src/receivables/controller.ts`
- `backend/src/receivables/service.ts`
- `backend/src/receivables/repository.ts`
- `backend/src/receivables/validation.ts`
- `backend/src/app.ts` (registration/readiness only)
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/202610240001_receivable_snapshots/migration.sql`
- `backend/scripts/import-receivables.mts`
- `backend/test/receivables.test.ts`
- `backend/scripts/restore-rehearsal.sh`
- `backend/package.json` (CLI script only)
- `backend/RECEIVABLES.md`
- `backend/RELEASE.md`

Frontend/shared checks:
- `frontend/src/features/receivables/OutstandingCustomers.tsx`
- `frontend/src/features/receivables/ImportedOutstandingCustomers.tsx`
- `frontend/src/features/receivables/api.ts`
- `frontend/src/features/receivables/outstanding-customers.css`
- `frontend/src/components/SessionGate.tsx` (compatible local heading/expiry invalidation only)
- `frontend/tests/receivables-api.spec.ts`
- `frontend/tests/receivables-configuration.spec.ts`
- `frontend/tests/receivables-production.spec.ts`
- `frontend/playwright.receivables.config.ts`
- `frontend/playwright.receivables-production.config.ts`
- `frontend/playwright.config.ts` (exclude dedicated API suites only)
- `frontend/scripts/session-fixture.ts` (opt-in synthetic import/restart test commands)
- `frontend/scripts/check-assets.ts` (include receivables assets)
- `frontend/package.json` (test scripts only)
- `frontend/docs/outstanding-customers.md`
- `.github/workflows/checklist-release.yml` (add checks, preserve existing suites/audits)

Original demo selector/tests and Overview insertion remain unchanged relative to the reviewed feature head; original feature files also appear in the complete diff against main. No tracked generated evidence, secrets, real data or lockfile changes are included.

## Final local check ledger

103 unique automated tests passed, zero skipped: 27 backend (17 existing + 10 feature), 51 default frontend (49 existing + 2 config), 5 API-state browser, 14 checklist, 4 subscription, 1 existing session and 1 imported production-build integration. Backend feature tests were rerun after the final bounded-validation and C-collation review. Both application typecheck/lint/build commands passed. All three contract validators and Redocly lint passed (two intentional unused operator/query component warnings), all three frontend asset scans passed, and the synthetic dump/restore verified snapshot/row state alongside existing task/subscription/auth data and all four migrations. Backend audit fails on the five existing advisories described above; frontend audit passes with zero.

The final container `finai-backend:receivables-review` has digest `sha256:1ca11f523a3424ffffac08977416332990e77a3c7e980f385408a0445377999a`; readiness, anonymous JSON 401, actual CLI dry-run and production-local-identity refusal passed. Build used the documented optional platform CA secret mount with TLS/checksum verification intact. Exactly 35 extension paths matched the declared list; protected source/old contracts and both lockfiles matched the starting head. See frontend feature documentation for exact commands, screenshots and nonpassing external/audit gates. No historical results are substituted for these local checks.

## CI audit follow-up — 24 October 2026

The earlier five-advisory audit blocker is superseded by a minimal dependency fix on `fix/receivables-release-audit`, based on merged main `642d11d` (PR #6). Backend Zod is now 4.6.7; scoped overrides select body-parser 2.4.0 under Express, multer 2.5.0 under Nest platform, and fast-uri 3.1.9 under AJV. Only four installed package versions/root Zod metadata changed in the backend lock. NestJS/Prisma/Express/AJV and frontend dependencies remain unchanged. Full frozen install and both application audits now pass with **zero vulnerabilities**. No forced framework downgrade, audit suppression or workflow relaxation.

Fresh local release-check reproduction passed all103 tests, including default frontend two-worker execution, both application typecheck/lint/build, all contracts, asset scans, patched container build/runtime parsing/auth smoke and snapshot-inclusive restore. The patched image is `finai-backend:receivables-ci-fix`, `sha256:fbd4d1b1c394923dad9d6cefea1304127977ebdc4fd1710991cd4818463405e2`. Scope is backend/package.json, backend/package-lock.json, context/progress.md and this follow-up only. Previous extension lockfile/audit statements describe its original commit; this follow-up intentionally changes those dependency files to fix the release gate.

The public metadata for [run40070560149](https://github.com/connectiot-org/New-FInAI/actions/runs/40070560149/job/120802868897) identifies the failed Local database and backend checks step. Logs require sign-in and API inspection is denied, so the exact original command is not independently observed; the reproduced failing audit is sufficient to block that unchanged step. Current local success is not evidence of a hosted success or production verification. The earlier main merge/deployment was a user action; this follow-up does not merge, push main, deploy, change target settings or import real data.
