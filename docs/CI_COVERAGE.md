# FinAI — CI coverage review (release gate)

| | |
|---|---|
| **Document ID** | FINAI-CI-001 |
| **Branch** | `ci/release-gate` (base: `docs/production-gap-map` @ `88e7a7b`) |
| **Date** | 2026-11-11 |
| **Scope** | Tooling and documentation only; no application behaviour, source, migrations, Prisma schema or dependencies changed |
| **Comparison basis** | Full local matrix in the 4 Nov report (`context/invoice-workspace-refresh.md:89-118`) plus the repository guardrails, contract validators, asset check, audits, container build and restore rehearsals |

## 1. What each workflow ran before this branch

### `checklist-release.yml` — "Checklist release checks" (all pushes and PRs, single job `verify`)

| Aspect | Before |
|---|---|
| Jobs | One monolithic `verify` job; everything sequential |
| Setup | Node 24, `setup-node` npm cache over both lockfiles, `npm ci` for both apps, Docker Compose PostgreSQL (migrations + seed applied) |
| Repository guardrails | `test:repository` + `check:repository` ran first (fail-fast in ~17–25 s: this is the step that failed on uncatalogued files before PR #33's fix) |
| Backend | `db:init`, `db:up`, `generate`, `db:migrate`, `db:seed`, `typecheck`, `lint`, `build`, `test`, `npm audit` |
| Contracts | Python venv + `validate_examples.py`, `validate_subscriptions.py`, `validate_receivables.py`, `validate_receivables_detail.py` + Node `validate_assistant.mjs`, `validate_public_chat.mjs`, `validate_payables.mjs` + pinned Redocly lint over all seven OpenAPI descriptions |
| Frontend | Playwright chromium install, `typecheck`, `lint`, `build`, asset scan (`scripts/check-assets.ts`), `npm audit` |
| Browser suites | All ~16 `test:*` suites sequentially in the one job |
| Container | `docker build` + `restore-rehearsal.sh` in the same job after the suites |
| Artifacts | Browser failure evidence retained 7 days on failure |
| Measured wall-clock | **17m13s** (run 42589883307, green) and **17m32s** (run 42589281506, green) |

### `payables.yml` — "Supplier invoice product checks" (path-filtered: `backend/**`, `frontend/**`, `contracts/payables*`, its own workflow file)

| Aspect | Before |
|---|---|
| Jobs | One `invoice-journey` job |
| Coverage (deliberate subset) | Guardrails, backend db/typecheck/lint/build/test (no migrate/seed/audit), `validate_payables.mjs`, frontend typecheck/lint (no build/audit), `test:invoice-demo`, `test:payables`, `test:payables-transport`, `test:payables:integration`, runnable demo artifact, `payables-storage-check.sh`, failure evidence |
| Note | The browser integration suites here pass without migrate/seed because their fixtures create isolated schemas and apply migrations themselves (`frontend/tests/vercel-backend.spec.ts:38,155`, `scripts/session-fixture.ts` pattern) |

## 2. Coverage comparison against the full local matrix

| Check | Runs in CI? | Workflow/job | Gap before this branch |
|---|---|---|---|
| `npm ci` (both apps) | Yes | checklist-release / verify; payables / invoice-journey | None |
| Backend `typecheck`, `lint`, `build`, `test` | Yes | checklist-release / verify | None |
| Backend `db:migrate`, `db:seed` | Yes | checklist-release / verify | None (absent from payables.yml by design) |
| Backend `npm audit` | Yes | checklist-release / verify | None |
| Frontend `typecheck`, `lint`, `build` | Yes | checklist-release / verify | None |
| Frontend `npm audit`, asset scan | Yes | checklist-release / verify | None |
| `test:repository`, `check:repository` (guardrails) | Yes | both workflows | None |
| Contract validators (4 Python + 3 Node) | Yes | checklist-release / verify | None |
| Redocly lint (7 OpenAPI files) | Yes | checklist-release / verify | None |
| `test` (default demo browser suite) | Yes | checklist-release / verify | None |
| `test:invoice-demo` | Yes | checklist-release / verify; payables / invoice-journey | None |
| `test:checklist` | Yes | checklist-release / verify | None (needs seeded entities — kept with seed in the split) |
| `test:session` | Yes | checklist-release / verify | None |
| `test:subscriptions` | Yes | checklist-release / verify | None |
| `test:receivables`, `test:receivables:production` | Yes | checklist-release / verify | None |
| `test:workspace`, `test:workspace:production` | Yes | checklist-release / verify | None |
| `test:assistant`, `test:assistant:production` | Yes | checklist-release / verify | None |
| `test:public-chat` | Yes | checklist-release / verify | None |
| `test:vercel` | Yes | checklist-release / verify | None |
| `test:payables`, `test:payables-transport`, `test:payables:integration` | Yes | checklist-release / verify; payables / invoice-journey | None |
| `docker build` | Yes | checklist-release / verify | None |
| `restore-rehearsal.sh` | Yes | checklist-release / verify | None |
| `payables-storage-check.sh` | Yes | payables / invoice-journey | Not in checklist-release (complementary product workflow) |
| **Structural** | — | — | **Single-job wall-clock 17m13s–17m32s; no `concurrency` to cancel superseded runs; both workflows run on every push/PR regardless of touched paths; no required checks (branch protection is an operator action — see `docs/PRODUCTION_GAPS.md` F)** |

Conclusion: **the check matrix itself was already complete**; every check in the 4 Nov local matrix runs in CI. The gaps were structural (wall-clock, concurrency, and gating), which item 4 closes below.

## 3. Changes on this branch

`checklist-release.yml` is split into seven parallel jobs with the same commands, in the same per-suite order, with a workflow-level `concurrency` that cancels superseded runs:

| Job | Carries (unchanged commands) | Why it is separate |
|---|---|---|
| `guardrails` | `test:repository` + `check:repository` | Fails in ~1–2 min instead of after full installs; catalog violations are caught early |
| `backend` | db init/up/generate/migrate/seed + typecheck/lint/build/test/audit | Independent of browser tooling |
| `contracts` | Python venv validators + Node validators + Redocly | No browser or database needed |
| `frontend` | typecheck/lint/build + npm audit (both app installs: the typecheck imports backend node_modules types via `tests/vercel-backend.spec.ts`) | No browser or database needed |
| `browser-demo` | `test`, `test:invoice-demo`, `test:payables`, `test:receivables`, `test:workspace`, `test:assistant` | Suites that never touch the database or produce scanned build roots |
| `browser-integration` | `test:checklist`, `test:session`, `test:subscriptions`, `test:receivables:production`, `test:workspace:production`, `test:assistant:production`, `test:public-chat`, `test:vercel`, `test:payables-transport`, `test:payables:integration`, then `node scripts/check-assets.ts` | Suites whose fixtures need the local PostgreSQL, backend node_modules and built backend; `test:public-chat` runs here (it needs no database, but its build is one of the seven `check-assets` roots, and the asset scan must run after all seven builds exist in one job — as it did at the end of the monolithic job); gets its own database, migrations, seed and backend build exactly as before |
| `container` | `docker build` + `restore-rehearsal.sh` (+ db up/generate/build prerequisites) | Container and restore rehearsal are independent of the test matrix |

`payables.yml` gains the same `concurrency` group (`payables-product-${{ github.ref }}`); its job content and path filters are unchanged.

Notes on the split:

- **Wall-clock (measured/estimated).** Before: measured 17m13s / 17m32s (green runs 42589883307 / 42589281506). After: measured on the split's first run (42920259770, 2026-11-10): `browser-demo` 7m53s, `browser-integration` 7m02s, `backend` 1m20s, `container` 1m03s, `contracts` 41s, `guardrails` 16s, running in parallel → overall wall-clock **7m54s**, a ~54% reduction. Two corrections followed from that run — the frontend job also installs backend dependencies (its typecheck imports backend `node_modules` types through `tests/vercel-backend.spec.ts`), and `node scripts/check-assets.ts` moved to the end of `browser-integration` together with `test:public-chat`, because the scan requires all seven build roots (`dist` plus the session/receivables/workspace/assistant/public-chat/payables builds) to exist in one job, as they did in the monolithic verify job. Steady-state wall-clock is therefore projected at ~8 minutes, limited by the two browser jobs finishing together. Trade-off: total billed runner minutes increase (each job repeats `npm ci`, and two jobs repeat the database setup and Playwright install) in exchange for roughly halving feedback latency; `concurrency` claws back time on rapid successive pushes.
- **Correctness guards.** Database-backed suites keep `db:init`, `db:up`, `generate`, `db:migrate`, `db:seed` and `npm run build` (the checklist suite spawns `backend/dist/src/main.js`, and `scripts/session-fixture.ts` imports `backend/dist/src/app.js`); suites still run sequentially inside each job because they own ports and shared artifact directories (`docs/repository-guide.md:646`).
- **Least privilege and pinning.** Both workflows already set `permissions: contents: read` (kept) and pin actions to major versions (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`), which satisfies the major-version-or-SHA rule; no new actions were introduced.
- **No new secret-requiring jobs.** No job added on this branch needs secrets, hosted accounts or real providers, per the task rules.

## 4. Required status checks for branch protection (operator action)

When an administrator protects `main`, the required checks from this branch's workflows are the job names:

- `Checklist release checks / guardrails`
- `Checklist release checks / backend`
- `Checklist release checks / contracts`
- `Checklist release checks / frontend`
- `Checklist release checks / browser-demo`
- `Checklist release checks / browser-integration`
- `Checklist release checks / container`
- `Supplier invoice product checks / invoice-journey` (path-filtered; runs when `backend/**`, `frontend/**`, `contracts/payables*` or the workflow file changes)

Branch protection itself needs admin access and is deliberately not attempted here (`docs/PRODUCTION_GAPS.md` F: verified unprotected via API on 2026-11-09).
