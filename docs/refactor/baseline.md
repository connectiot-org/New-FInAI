# Refactor baseline — phase 0 (read-only recon)

Recorded on the `refactor/feature-folders` branch from tag `pre-refactor-baseline`
(commit `e8037ea`, merge of PR #30). This file is the measured pre-refactor state
that every later phase must reproduce exactly. Verification philosophy and command
map: `docs/repository-guide.md#verification`; historical matrices:
`context/invoice-workspace-refresh.md`.

## Environment

| Item | Value |
| --- | --- |
| Runner | Isolated Linux sandbox, non-root user |
| Node / npm | v24.22.2 / 11.19.1 (matches package engines) |
| PostgreSQL | 16.x embedded user-space server on `127.0.0.1:55432`, loopback trust auth (no Docker available); `finai` database with all 8 migrations and the local synthetic seed applied |
| Browser | Playwright bundled Chromium 156.0.8078.4 (headless, `--no-sandbox`) |
| Not available | Docker/Compose, system Chromium, ClamAV daemon, any hosted/remote environment |

Environment-specific adjustments (no repository changes involved):

1. The sandbox presets a `DATABASE_URL` environment variable, and Node's
   `--env-file` never overrides existing variables. All backend and DB-backed
   browser suites were therefore run with an explicit
   `DATABASE_URL=postgresql://…@127.0.0.1:55432/finai?schema=public` pointing at
   the disposable local instance above.
2. `npm ci` printed `install-scripts` warnings (esbuild, prisma postinstall
   scripts skipped by the sandbox npm policy). Frontend build, backend build and
   `prisma generate` (run explicitly) all succeed; nothing in the repo changed.
3. DB-backed browser suites occasionally orphan their spawned fixture API on
   shutdown in this sandbox; fixture processes were cleaned between suites.

## Baseline matrix

### Frontend (`frontend/`)

| Command | Result |
| --- | --- |
| `npm ci` | PASS (0 vulnerabilities) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS (vite build, 6.1s) |
| `npm test` (default sample suite) | PASS — 67 passed |
| `npm run test:repository` | PASS — 18/18 node tests |
| `npm run check:repository` | PASS — 343 file purposes; 100 source modules respect literal-import boundaries |
| `npm run build:invoice-demo` | PASS |
| `npm run test:invoice-demo` | PASS — 15 passed |
| `npm run test:payables-transport` | PASS — 12/12 node tests |
| `npm run test:checklist` | **13 passed, 1 failed** — see "Known environment-caused failure" |
| `npm run test:subscriptions` | PASS — 4 passed |
| `npm run test:session` | PASS — 1 passed |
| `npm run test:receivables` | PASS — 5 passed |
| `npm run test:receivables:production` | PASS — 1 passed |
| `npm run test:workspace` | PASS — 18 passed |
| `npm run test:workspace:production` | PASS — 2 passed |
| `npm run test:assistant` | PASS — 20 passed |
| `npm run test:assistant:production` | PASS — 1 passed |
| `npm run test:public-chat` | PASS — 22 passed |
| `npm run test:vercel` | PASS — 6 passed (includes `build:vercel` private packaging) |
| `npm run test:payables` | PASS — 27 passed |
| `npm run test:payables:integration` | PASS — 9 passed (real DB journeys, remote/embedded/packaged runtimes) |
| `node scripts/check-assets.ts` (after all dists) | PASS — no credential leakage, no localhost API fallback |
| `npm audit` | PASS — 0 vulnerabilities |

### Backend (`backend/`)

| Command | Result |
| --- | --- |
| `npm ci` | PASS (0 vulnerabilities) |
| `npm run generate` | PASS (Prisma client generated) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS — 87/87 (disposable `test_*` schemas, real migrations, HTTP, sessions, AP, Assistant, scanner protocol) |
| `npm audit` | PASS — 0 vulnerabilities |

DB-backed suites ran against the disposable local PostgreSQL only. Migrations
were applied by the tests themselves (`prisma migrate deploy` into per-test
schemas); no unknown or shared database was ever contacted.

### Contracts and cross-cutting

| Check | Result |
| --- | --- |
| `python3 contracts/validate_examples.py` | PASS — 23 examples |
| `python3 contracts/validate_receivables.py` | PASS — 8 examples |
| `python3 contracts/validate_receivables_detail.py` | PASS — 6 examples |
| `python3 contracts/validate_subscriptions.py` | PASS — 5 examples |
| `node contracts/validate_assistant.mjs` | PASS |
| `node contracts/validate_public_chat.mjs` | PASS |
| `node contracts/validate_payables.mjs` | PASS |
| `node --import ./backend/node_modules/tsx/dist/loader.mjs contracts/generate-payables.mts` | regenerated `contracts/payables.openapi.json` **byte-identical** (empty `git diff`) |
| Redocly lint `@redocly/cli@2.8.0 --extends minimal` over all 7 OpenAPI descriptions | PASS — 0 errors, 29 pre-existing warnings |
| `git diff pre-refactor-baseline -- backend/prisma` | empty |

### Not run in this environment (and why)

| Check | Reason |
| --- | --- |
| `docker build -t finai-backend backend` | No Docker daemon in the sandbox |
| `bash backend/scripts/restore-rehearsal.sh`, `payables-storage-check.sh` | Require Docker/Compose-managed PostgreSQL |
| `npm run db:up` / `db:init` Compose flow | Replaced by the embedded loopback PostgreSQL (same URL shape `db:init` generates) |
| Real ClamAV scanning | No daemon; the scanner suite uses its controlled protocol simulation (passes) and documents quarantine as the no-scanner behavior |
| Hosted/Vercel deployment verification | Out of scope by the refactor rules (never deploy) |

## Known environment-caused failure (recorded, not a product defect)

`npm run test:checklist`, test
`stopping the real backend shows a failed save and safe retry never creates duplicate tasks`:
the suite stops the spawned API with SIGTERM and expects the UI
"Cannot reach the checklist backend" alert within 7s. In this sandbox the
fixture's shutdown can outlive that window (the listener stays up), so the save
stays pending and the alert never appears; an orphaned
`node --env-file=.env dist/src/main.js` was observed afterwards. A direct
SIGTERM from the shell terminates the same process in under 5 seconds, and the
suite passes in the CI matrix recorded in `context/invoice-workspace-refresh.md`.
**Refactor acceptance:** this exact single failure is part of the baseline; the
phase is green only if the post-refactor run shows the same 13/14 result with the
same failing test and no new failures.

## Screenshot baseline (for pixel-diff gates in F4/F5/F6)

- 44 public/demo routes × 3 viewports (1440×900, 1024×768, 390×844) captured with
  the frontend's Playwright: fixed clock (`2026-11-04T12:00:00`), reduced motion,
  fonts-ready wait, non-local requests blocked, fresh context per viewport,
  full-page PNGs.
- Route coverage: all marketing routes (`/`, 7 `/product/*`, `/resources`,
  `/about`, `/customers`), `/welcome`, all `/demo/payables/*` sample routes,
  `/demo/assistant(+/offline)`, and every original demo Shell route
  (overview, accounting ×5, receivables ×2, payables ×2, banking ×2, close ×2,
  subscriptions, reports ×4, entities ×2, automations, integrations, audit-log,
  settings) including two seeded detail routes.
- Harness determinism proof: a second independent capture run produced 44/44
  byte-identical PNGs at 1440.
- Baseline PNGs are kept outside the tracked tree (generated evidence, never
  committed); the comparison is byte-identity per route/viewport.
- Private `/workspace/*` routes are covered by the controlled suites' own
  assertions (all passing above), not by static screenshots (they require
  session fixtures).

## Size inventory (line counts of tracked code files)

343 tracked files; 190 counted as code (`.ts/.tsx/.mts/.mjs/.js/.css`).
Files over thresholds: **19 > 800**, 36 > 500, 61 > 300. Largest code files:

| Lines | File |
| --- | --- |
| 2735 | `frontend/src/styles/global.css` |
| 2733 | `frontend/src/styles/reference-home.css` |
| 2267 | `frontend/src/features/payables/Payables.tsx` |
| 1661 | `frontend/src/styles/marketing.css` |
| 1520 | `backend/test/assistant.test.ts` |
| 1345 | `backend/test/checklist.test.ts` |
| 1323 | `frontend/src/features/payables/payables.css` |
| 1242 | `frontend/src/features/Operations.tsx` |
| 1206 | `backend/test/receivables.test.ts` |
| 1147 | `frontend/tests/payables-ui.spec.ts` |
| 983 | `backend/src/payables/service.ts` |
| 982 | `frontend/src/features/marketing/ReferenceHome.tsx` |
| 937 | `frontend/src/features/payables/development-store.ts` |
| 914 | `backend/src/assistant/service.ts` |
| 890 | `frontend/src/features/Accounting.tsx` |
| 851 | `frontend/src/features/assistant/Assistant.tsx` |
| 835 | `frontend/src/styles/product-reference.css` |
| 781 | `frontend/src/features/Administration.tsx` |
| 716 | `backend/test/invoice-assistant.test.ts` |

Measured corrections to prior assumptions ("measure; do not assume"):

- `backend/src/payables/domain.ts` is 266 lines (under the 300 target; no split).
- `backend/src/receivables/repository.ts` ~200 and `detail.repository.ts` 208
  lines (no split needed).
- `backend/src/checklist.repository.ts` is 244 lines.
- The oversized backend files are dominated by single god-classes
  (`PayablesService` ≈ 932 lines, `AssistantService` ≈ 861, `AssistantFacts` ≈
  594, `WorkspaceService` ≈ 341): Tier A can only extract their small top-level
  helpers/types; splitting the classes themselves is gated Tier B work (recorded
  in `docs/refactor/observations.md`, not planned by default).
- `ChecklistController` (≈105 lines) is defined inline in `backend/src/app.ts`
  (line 79) — a domain controller inside the composition root, extracted
  verbatim in phase B2.

## Inbound-reference map (what each planned move must update)

Full generated table (all 35 movable targets → every referencing file with line
numbers) is kept with the working notes outside the tree; the durable facts:

- `backend/src/app.ts` imports every loose root module and hosts the inline
  `ChecklistController`.
- `backend/scripts/*.mts` import **compiled** `../dist/src/<module>.js` paths:
  `accounts.mts` (auth), `cleanup.mts` (audit), `import-ledger.mts` /
  `import-receivables.mts` (checklist.repository, validation), `workspace-admin.mts`
  (audit), `evaluate-assistant.mts` (assistant/provider, ledger/source).
- `frontend/scripts/session-fixture.ts` dynamically imports
  `../../backend/dist/src/checklist.repository.js`.
- `contracts/generate-payables.mts` requires **source** `.ts` modules:
  `../backend/src/payables/domain.ts`, `../backend/src/payables/assistant.ts`
  and `../frontend/src/features/payables/schemas.ts` — any move of those three
  files must update this generator (the one sanctioned contracts edit).
- `frontend/scripts/vercel-build.mjs` copies `backend/dist/src` wholesale and is
  path-agnostic; `frontend/server/embedded.ts` references no source paths.
- `frontend/src/app/router.tsx` statically imports all demo screens and lazily
  imports `payables/DevelopmentPayables`, `payables/Payables`,
  `workspace/ImportChanges`, `assistant/Assistant` (as `ProductionAssistant`)
  and `LegacyAssistant` — lazy import specifiers must keep pointing at
  single-component modules to preserve chunk boundaries (vite `manualChunks`
  only groups vendor packages, so app-file moves cannot change vendor chunks).
- `frontend/tests/*.spec.ts` import source modules directly
  (`../src/demo/seed`, `../src/types/domain`,
  `../src/features/receivables/{changes,format,outstandingCustomers}`, …).
- `frontend/src/app/navigation.ts` imports `Accounting`/`Operations` symbols;
  demo screens import each other (`Administration.tsx` → `Accounting.tsx`,
  `Operations.tsx` → `Accounting.tsx` icons/types, `seed.ts` → `Operations`
  types, `development-store.ts` → `Operations` types).
- `docs/repository-guide.md` carries one purpose row per tracked file and is
  enforced by `npm --prefix frontend run check:repository`; **every move phase
  must update its catalog rows in the same commit** or the guard fails.
- Dated evidence under `context/` (including `final-review-inventory.tsv`,
  `release-signoff-inventory.tsv`) mentions current paths but is historical
  evidence: it stays unchanged, per the catalog's own rules.

## Working artifacts (outside the tracked tree, never committed)

- Line-conservation checker, inventory/reference-map/symbol extractors:
  `/home/z/my-project/scripts/`
- Baseline screenshots (44 routes × 3 viewports) and determinism proof:
  `/home/z/my-project/refactor-work/shots-a/`
- Full logs of every baseline command: `/home/z/my-project/logs/`
