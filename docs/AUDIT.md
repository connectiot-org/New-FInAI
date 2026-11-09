# FinAI — Repository Baseline Audit (Payables / Invoices)

| | |
|---|---|
| **Document ID** | FINAI-AUD-001 |
| **Branch** | `chore/baseline-audit` (from `origin/main` @ `d16b0ef`) |
| **Date** | 2026-11-09 |
| **Scope** | Audit and baseline only — no application behaviour changed |
| **Method** | Static inspection + local command execution in a clean clone |
| **Companion** | `docs/PRODUCTION_TODO.md` (phased readiness checklist) |

---

## 1. Stack summary

FinAI is a pnpm-free npm monorepo with two independent applications, each with its
own `package.json` and `package-lock.json` (there is **no root package.json**):

- **`frontend/`** — React 19 + Vite 7 + TypeScript 5.9 (strict), Tailwind CSS 4,
  Redux Toolkit 2, react-router-dom 7, react-hook-form 7 + zod 4, TanStack Table 8,
  Recharts 3, pdfjs-dist 6, lucide-react. Testing: Playwright 1.55 with ~17
  per-feature config files. Lint: ESLint 10 (typescript-eslint 8) + Prettier.
  Node engine: 24.x. Deployed to Vercel (`frontend/vercel.json`) where
  `/api/*` and `/auth/*` are routed to a Vercel Function that proxies to an
  embedded Nest runtime or a remote backend origin.
- **`backend/`** — NestJS 11 on Express 5, Prisma 6.19 (PostgreSQL), argon2
  (argon2id), zod 4, Node's built-in `node --test` runner with tsx. Local database
  via Docker Compose (`backend/compose.yaml`, port 55432). Production image via
  `backend/Dockerfile`; release runbook in `backend/RELEASE.md`.
- **`contracts/`** — shared JSON Schemas, OpenAPI documents and validators
  (Node + Python) exercised in CI.
- **`context/`**, **`docs/`** — engineering handoffs, architecture and file guides,
  dated verification evidence.
- **CI** — two GitHub Actions workflows (`.github/workflows/checklist-release.yml`,
  `payables.yml`) that install, typecheck, lint, build, test, audit, validate
  contracts, build the Docker image and rehearse a restore.

## 2. Architecture sketch

```
Browser
├─ /demo/payables/*         Sample tier (no sign-in, fictional data, IndexedDB)
│    DevelopmentPayables.tsx → development-store.ts (browser-only store)
│    └─ reuses the same UI component: Payables.tsx
├─ /workspace/payables/*    Product tier (session auth)
│    Payables.tsx → features/payables/api.ts → fetch /api/v1/payables/*
│    (cookie session + X-CSRF-Token + zod response validation)
└─ /welcome + Shell routes  Original Northstar demo (Redux + demo/seed.ts)

Vercel deployment (frontend/vercel.json)
└─ /api/(.*) and /auth/(.*) → api/proxy.ts (Vercel Function)
      proxy auth: FINAI_PROXY_TOKEN + trusted host/origin checks
      → server/embedded.ts (Nest runtime in-function) or FINAI_BACKEND_ORIGIN

Backend (NestJS 11 + Express 5)
├─ src/auth.ts        Argon2id login, __Host- cookie (HttpOnly/Secure/Strict, 8h),
│                     CSRF double-submit, DB-backed rate limiting
├─ src/app.ts         Composition root: proxy trust model, content-type allowlist,
│                     PDF upload limit (1 MB), health endpoints, request logging
├─ src/payables/      controller → service → domain (zod + BigInt money)
└─ Prisma PostgreSQL  ApInvoice / ApSupplier / ApPolicy / ApDocument / ApEvent /
                      ApExport / ApOperation / ApGrant + Session / Account /
                      RateLimit / ServerAudit (all tenant-scoped composite keys)
```

## 3. Invoices feature — files and data flow

### 3.1 The audited route `/demo/payables/invoices`

Route table (`frontend/src/app/router.tsx:245-258`) maps
`/demo/payables/{invoices,invoices/:id,suppliers,export,settings/approvals}`
to `DevelopmentPayables` (`frontend/src/features/payables/DevelopmentPayables.tsx`).

Data flow: `DevelopmentPayables` wraps the shared `Payables.tsx` UI in a
`PayablesClientContext` whose client is `developmentClient` from
`frontend/src/features/payables/development-store.ts:1` —
**browser-only sample data in a separate IndexedDB, no session, no scanner,
no financial posting**. Sample fixtures in that file: three fictional suppliers
(`Sample Studio Supplier`, `Sample Cloud Hosting`, `Sample Office Supplies`),
four role actors (Reviewer/Verifier/First approver/Second approver), seeded
invoices `DEV-1001…`, an in-code synthetic PDF generator `samplePdf()`
(`development-store.ts:73-95`) and fixed sample digests.

### 3.2 The real product route `/workspace/payables/invoices`

Same `Payables.tsx` UI, but the client is `frontend/src/features/payables/api.ts`:
`fetch("/api/v1/payables" + path)` with `credentials: "same-origin"`,
`X-CSRF-Token` on mutations, per-response zod strict validation, session-epoch
identity-change detection and request timeouts (`api.ts:6-79`).

Backend chain: Vercel proxy (`frontend/api/proxy.ts`, CSP-sandboxed downloads at
line 193) → Nest `PayablesController` (`backend/src/payables/controller.ts`) →
`PayablesService` (`backend/src/payables/service.ts`, transactions, idempotency
via `ApOperation.once()`, duplicate pre-check) → `domain.ts` (zod schemas,
BigInt totals, routing policy, CSV export) → Prisma/PostgreSQL
(`backend/prisma/schema.prisma:341-413`).

### 3.3 Where data is mocked / hardcoded / fictional

| Location | What |
|---|---|
| `frontend/src/features/payables/development-store.ts` | Entire demo dataset (suppliers, actors, seeded invoices, synthetic PDFs, digests) — IndexedDB |
| `frontend/src/demo/seed.ts`, `frontend/src/demo/selectors.ts`, `frontend/src/store/index.ts` | Northstar fictional demo behind `/welcome` and Shell routes |
| `backend/prisma/seed.ts` | Local synthetic development data only (never for real databases, per README) |

The workspace path contains **no mocks**: every record comes from the API/DB.

### 3.4 Money representation

**String-encoded integer minor units (pence), BigInt arithmetic, no floats.**
Schema: `unitMinor`/`gross`/`net` as `/^(0|[1-9]\d{0,9})$/` strings
(`backend/src/payables/domain.ts:11`, `frontend/src/features/payables/schemas.ts:24`).
Totals computed with BigInt and half-up rounding `(x + 5000n) / 10000n`
(`domain.ts:131-171`); displayed via BigInt division
(`frontend/src/features/payables/api.ts:141-144`). This matches the
"integer minor units" production recommendation.

### 3.5 Hygiene counts (invoices feature: `features/payables/`, `src/demo/`, `backend/src/payables/`, `frontend/api/`, `frontend/server/embedded.ts`)

| Metric | Count |
|---|---|
| `TODO` / `FIXME` / `HACK` / `XXX` | **0** (also 0 across all `src/`) |
| `console.*` calls | **0** in the feature (4 repo-wide, all intentional structured logging: `backend/src/main.ts:3`, `backend/src/app.ts:245`, `backend/src/errors.ts:66`, `frontend/server/public-chat.ts:145`) |
| TypeScript `any` (`: any`, `as any`, `<any>`, `any[]`) | **0** |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | **0** |

## 4. Baseline command results

Run in a clean clone, Node v24.22.2 / npm 11.19.1, after `npm ci` in each app.

### 4.1 Backend (`cd backend`)

| Command | Result | Detail | Duration |
|---|---|---|---|
| `npm ci` | **PASS** | lockfile install; npm 11.19 blocked 5 postinstall scripts (prisma/argon2/esbuild) — prisma generate, argon2 loading and vite build all verified working regardless | ~25 s |
| `npm run generate` | **PASS** | Prisma client generated | ~3 s |
| `npm run typecheck` | **PASS** | `tsc --noEmit`, 0 errors | 5.2 s |
| `npm run lint` | **PASS** | ESLint `src test scripts`, 0 errors / 0 warnings | 2.1 s |
| `npm run build` | **PASS** | `dist/src/main.js` produced | 5.3 s |
| `npm test` | **ENV-BLOCKED** | 71 tests: 8 pass / 63 fail — every failure is `Can't reach database server at 127.0.0.1:55432` (requires Docker Compose PostgreSQL; Docker unavailable in this audit sandbox). CI runs the same suite with Docker (`checklist-release.yml:26-38`). Not a code defect. | 15.2 s |
| `npm audit` | **PASS** | 0 vulnerabilities | <1 s |

Environment note: this sandbox pre-sets a `DATABASE_URL` env var which Node's
`--env-file` does not override; tests were run with `env -u DATABASE_URL` so the
generated `backend/.env` value applied.

### 4.2 Frontend (`cd frontend`)

| Command | Result | Detail | Duration |
|---|---|---|---|
| `npm ci` | **PASS** | lockfile install | ~30 s |
| `npm run typecheck` | **PASS** | app + server tsconfigs, 0 errors | 12.2 s |
| `npm run lint` | **PASS** | 0 errors / 0 warnings | 3.9 s |
| `npm run build` | **PASS** | `dist/` produced (main bundle 470.86 kB / gzip 139.17 kB) | 17.4 s |
| `npm test` | **PASS** | default Playwright suite: **67 passed, 0 failed** | 202.8 s |
| `npm run test:payables` | **PASS** | invoice feature suite: **27 passed, 0 failed** | 88.5 s |
| `npm run test:repository` | **PASS** | 18 pass / 0 fail (file-purpose guardrails) | <1 s |
| `npm run check:repository` | **PASS** | 347 file purposes; 100 source modules respect import boundaries | <1 s |
| `npm audit` | **PASS** | 0 vulnerabilities | <1 s |

## 5. Security scan summary

- **Committed secrets:** none. Token/key/PEM pattern search over tracked files and
  history found nothing; the only tracked env file is `backend/.env.example`
  (safe). `backend/.env` exists locally (gitignored) and is never printed or committed.
- **`.env` ignore rules:** present in `frontend/.gitignore` and `backend/.gitignore`;
  the repository **root** had no `.gitignore` (added in this PR).
- **Dependency audit:** `npm audit` clean in both apps (0 vulnerabilities).
- **`dangerouslySetInnerHTML` / `eval` / `innerHTML` / `new Function`:** 0 occurrences
  across `frontend/src`, `backend/src`, `frontend/api`, `frontend/server`.
- **Security headers:** backend sets `X-Content-Type-Options: nosniff` and
  `Cache-Control: no-store` on every response (`backend/src/app.ts:240-241`);
  PDF/CSV downloads add `Content-Security-Policy: sandbox; default-src 'none'`
  (`frontend/api/proxy.ts:193`, `backend/src/payables/controller.ts:273`). Missing:
  document-level CSP, `X-Frame-Options`/`frame-ancestors`, HSTS, `Referrer-Policy`,
  `Permissions-Policy` — `frontend/vercel.json` has no `headers` block (finding A-05).
- **Unauthenticated routes:** only `/health/live`, `/health/ready` (readiness probes)
  and `POST /auth/login` (rate-limited, Argon2-verified) are public
  (`backend/src/app.ts:450-479`). Every other route requires a session
  (session mode) or loopback local identity (local mode). The public free-model chat
  is a separate Vercel handler that cannot reach company records.
- **Tenant isolation:** every table carries `organisation_id` + `entity_id`
  composite keys and all queries are scope-filtered (e.g.
  `backend/src/payables/service.ts:397`), but PostgreSQL **row-level security is not
  used** (0 `CREATE POLICY` in migrations) — isolation is application-enforced only.

## 6. Findings register

Severity: **S1** blocker · **S2** high, blocks GA · **S3** medium · **S4** low.

| ID | Sev | Area | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| A-01 | **S2** | Product scope | No payments, no ledger posting, no period locking, no tax engine, single currency (GBP), single tax code (STANDARD 20%). Invoices end at "approved + CSV export". | `backend/prisma/schema.prisma` (no payment/journal/period/tax models); `backend/src/payables/domain.ts:32` (`z.literal("GBP")`), `:25` (`taxCode` enum NONE/STANDARD); `frontend/src/features/payables/schemas.ts:104` (`payment: z.literal("unpaid")`); `README.md:18` | Treat as the roadmap, not a defect: implement PRODUCTION_TODO Phases 2–4 before calling the module "production AP" |
| A-02 | **S2** | Security | No MFA / SSO on login; single-factor username+password only | `backend/src/auth.ts:77-99` | Add TOTP/WebAuthn MFA before onboarding real companies |
| A-03 | **S3** | Security | Tenant isolation is application-enforced only; no PostgreSQL row-level security | 0 `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` in `backend/prisma/migrations/`; composite keys in `schema.prisma:341-364` | Add RLS as defence-in-depth (second layer under the scoped queries), plus a CI tenant-crossing test |
| A-04 | **S3** | Security | Document-level security headers absent (CSP, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy); `vercel.json` has no `headers` block | `frontend/vercel.json` (no headers); `backend/src/app.ts:240-241` (only nosniff + no-store) | Add a `headers` section to `vercel.json` for the app origin |
| A-05 | **S3** | Accounting | No double-entry journal store: "posting" is a CSV row generation (balanced rows per line, but nothing persisted or reconciled); no AP subledger-to-control-account check | `backend/src/payables/domain.ts:198-266` (`csv()`); no journal model in `schema.prisma` | Phase 2 of the roadmap: journal engine with enforced balance invariant |
| A-06 | **S3** | Product | The public `/demo` URL serves fictional browser-only records by design — matches external report F-01, but is a deliberate sample tier; the real product lives at `/workspace` behind auth | `frontend/src/app/router.tsx:245-258` vs `:282-296`; `development-store.ts:1` | Keep the split; consider `noindex` on demo pages and a visible "sample data" banner (already partially present in `DevelopmentPayables.tsx:129-134`) |
| A-07 | **S3** | Ops | No evidence of a staging environment; default `*.vercel.app` subdomain | `frontend/vercel.json`; README:18 "A passing local suite does not establish hosted production readiness" | Separate dev/staging/prod deploys and databases; custom domain for prod |
| A-08 | **S4** | Security | Session lifetime fixed at 8 h, no refresh/rotation, no per-user concurrent-session cap | `backend/src/auth.ts:133` | Consider sliding expiry + logout-everywhere + session listing |
| A-09 | **S4** | Data | Invoice PDFs stored as `Bytes` in PostgreSQL (1 MB cap); object storage absent; ClamAV scanning optional and unconfigured by default → documents stay quarantined (fail-closed, but unusable until configured) | `schema.prisma:365-379` (`scan_state` default `"quarantined"`, `bytes Bytes`); `backend/src/payables/scanner.ts`; `app.ts:423-441` | Move to private object storage + configured malware scan when scaling; keep fail-closed default |
| A-10 | **S4** | Observability | Structured JSON request logs with `X-Request-Id` exist, but no metrics, tracing, error tracking or alerting integration | `backend/src/app.ts:234-254` | Add error tracking + uptime monitoring at Phase 5 |
| A-11 | **S4** | Compliance | No privacy policy, terms, DPA or data-retention workflow in the repo | absent from `contracts/`, `docs/`, `context/` | Legal review before selling (Phase 5) |
| A-12 | **S4** | Testability | Backend tests hard-require Docker Compose PostgreSQL; cannot run in plain sandboxes | `backend/test/checklist.test.ts:16` ("Tests require local PostgreSQL"); `compose.yaml` | Optionally gate with a skip-when-unavailable flag; keep CI as the authoritative runner |
| A-13 | **S4** | Supplier master | Suppliers carry name/taxId/active/version only — no bank details, addresses or change control (no fraud vector today, but also no payment readiness) | `schema.prisma:316-328` | Add bank-detail fields with dual-approval change control in Phase 2 |
| A-14 | **S4** | Performance | List pagination is server-side (offset/limit + counts) but no load test at 50k invoices | `frontend/src/features/payables/schemas.ts:107-133`; `service.ts` list query | Phase 5: performance test with seeded volume |

### 6.1 Notable controls already in place (context for the findings)

Money as BigInt minor units with a single rounding rule (`domain.ts:131-171`);
optimistic locking (`version`/`revision`); idempotency keys (`ApOperation` +
`once()`, `service.ts:121-127`); duplicate detection (unique constraint
`(organisation, entity, supplier, referenceKey)` `schema.prisma:362` +
NFKC-normalised `referenceKey` `domain.ts:129-130` + `DUPLICATE_REFERENCE`
`service.ts:397-401`); segregation of duties (submitter cannot be an approver,
`domain.ts:180-185`; grants model `schema.prisma:304-315`); append-only event
audit with full snapshots (`ApEvent` `schema.prisma:380-392`) plus request-level
`ServerAudit`; CSRF double-submit (`auth.ts:140-144`, frontend `api.ts:26-29`);
DB-backed rate limiting (login IP/account + mutation + upload,
`auth.ts:26-40`, `app.ts:484`, `app.ts:409-413`); Argon2id with timing-safe
compare and unknown-account cost balancing (`auth.ts:15-20`, `:95-99`);
`__Host-` prefixed HttpOnly/Secure/SameSite=Strict cookie (`auth.ts:21`, `:50-55`);
strict proxy trust model rejecting identity-spoofing headers (`app.ts:256-295`);
1 MB uncompressed-PDF-only uploads (`app.ts:423-427`); CSV formula-injection
defence (`domain.ts:258`); zod `strictObject` validation on every boundary;
per-response zod parsing on the client; CSP-sandboxed document downloads.

## 7. Method limits

- Backend `npm test` could not be executed to completion in this sandbox (no
  Docker); the 63 failures are all database-connectivity assertions. CI runs the
  full suite against Docker Compose PostgreSQL on every push/PR
  (`.github/workflows/checklist-release.yml:26-38`).
- Playwright suites other than the default and payables configs
  (`test:payables:integration`, `test:session`, `test:workspace:production`,
  …) additionally require the built Vercel runtime and/or a live database and
  were not all run locally; they are covered by the same CI workflows
  (`payables.yml:64-70`, `checklist-release.yml:58-104`).
- GitHub branch-protection settings are not visible from the repository; item
  0.3 of the companion checklist must be verified in repo settings.
