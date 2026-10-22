# Product hardening review — 2026-10-22

Starting point: clean `8b270d2`, branch `feature/payment-due-date`. Latest user instruction authorizes reviewing, fixing, testing, documenting and pushing production foundations. No public deployment, main merge, paid resource or customer-data operation is requested. Remote main3011b0c contains the same baseline application sources; the unrelated duplicate-checker branch is not included.

Coordinator scope: context/contracts/current architecture and root operating notes. Backend scope follows for concrete authentication/readiness fixes. Frontend scope follows for the production entry, build boundaries, proxy/session robustness and regression tests. Reviewer checks all scoped changes and publishes only verified results. Existing API contracts remain compatible: no new business operation or table is proposed.

The current product boundary is the implemented server-backed checklist/copy, subscription renewal tracker and stateless payment due-date calculator. Production must default to session-authenticated tools and must not import or initialize the fictional financial demo store, expose its persona controls, or route users to simulated accounting/banking/AI workflows. Preserve legacy sources as an explicit development/test mode for regression coverage. Local identity remains loopback-only; production must use PostgreSQL sessions and configured same-origin proxy. No claim that mock financial modules are now server-backed.

Review will cover backend controllers/services/repositories/validation/auth/config/database errors and lifecycle; proxy/transport/session behavior; all live screens and their shared UI dependencies; schema/migration/recovery configuration; production entry/navigation/build/assets; and existing regression suites. Record file-level coverage, concrete fixes, actual test results and remaining target deployment gates here after execution. Zero-defect/perfect-production claims are not a testable acceptance criterion.


## Concrete changes and review coverage

The initial statement “now the product” was checked against source: the previously shipped default router/Shell imported Redux seeds and exposed simulated finance. Passing tests did not turn that into a backend product. This change supplies an authenticated live-only entry and removes that ambiguity from the default build.

| Reviewed area / files | Outcome |
| --- | --- |
| backend/src/app.ts, config.ts, auth.ts, errors.ts, database.ts, main.ts | Traced identity, proxy/host/origin checks, JSON limit, request-ID/no-secret logs, lifecycle, CSRF, cookie rotation/expiry/revocation and DB errors. Added shared login-cost budget, migration/schema readiness and removed Express identification header. Auth accepts the PrismaClient interface rather than coupling to Nest lifecycle. Existing production-local-mode rejection remains intact. |
| backend/src/checklist.repository.ts, checklist.service.ts, validation.ts | Reviewed canonical digest, compatible locks, READ COMMITTED copy snapshot/cap/atomicity, optimistic mutations and permission scoping. Preserved business behavior; existing PostgreSQL race/rollback/restart tests rerun. |
| backend/src/subscription.{controller,repository,service,validation}.ts | Reviewed allowlists, bounded literal search/pagination, DATE validation, version CAS, tenant/entity checks and timezone indicators. Existing tests rerun; no new business schema or behavior. |
| backend/src/payment-due-date{,.controller,.service}.ts | Reviewed strict real-date input, overflow, UTC calendar arithmetic/early years, explicit as-of and read authorization. Boundary/permission/API tests rerun. |
| backend/prisma/schema.prisma and all3 migrations; scripts/accounts.mts, restore-rehearsal.sh; Dockerfile/compose.production.yaml | Checked tenant foreign keys, constraints, additive compatibility, hidden password input and session revocation, non-root/private topology, existing backup/restore/runbook. No schema or dependency changes. Rebuilt image and reran synthetic restore. Target image OS scan/capacity and production recovery remain gates. |
| frontend/src/main.tsx, app/ProductApp.tsx, app/demo-entry.tsx, vite.config.ts, index.html | Product default with only live routes, one shared session gate, explicit development-only legacy entry, build rejection of unsafe modes, no copied fixture public assets. Product imports no demo store/legacy router. Default npm build explicitly selects session/same-origin/API settings. |
| frontend/src/components/SessionGate.tsx; lib/api.ts, session-lifecycle.ts, authorized-entities.ts, calendar.ts | Strict200/schema checks for sign-in/session/logout, bounded sign-out, no false success on outage, initial session retry, shared nested context, automatic expired-session unmount and revision guard against old401 replies ending a new session. No credential/browser storage. |
| frontend/api/proxy.ts and vercel.json | Error request ID matches its header; safe JSON/nosniff, config/host/route/body validation, duplicate route rejection, absolute upstream deadline and disconnect cleanup. Explicit bare API/auth routing excludes SPA HTML; CSP/anti-framing/referrer/permissions/HSTS headers. Local HTTPS harness uses the actual proxy/security headers; Vercel platform routing remains a target smoke gate. |
| frontend/src/features/checklist/*, subscriptions/*, payment-due-date/* | Traced each live interaction from UI to typed transport/backend. Extracted pure shared UI imports; mounted/scope cleanup suppresses late save notifications; subscription response validation checks real dates, IDs/entities, versions, fields, pagination/status and archived indicators before success. Calculator's existing stale-response and no-storage protections retained. |
| frontend/src/components/shared/{Common,PageHeader}.tsx, components/ui/{index,primitives}.tsx | Extracted shared UI without demo imports; compatibility exports preserve legacy screens. Reused design tokens, modal/confirmation/focus behavior and feedback controls. Inspected390px actual product screenshot and exercised keyboard. |
| frontend/src/store, demo/, legacy Shell/router and financial screens | Excluded from product code/assets, retained as explicit local regression sources.34 legacy tests passed, including original approval/locking/accounting demos. This review does not certify those simulations as real accounting or claim every legacy line received a financial/security audit. |
| contracts/, application manifests/lockfiles, .github/workflows/checklist-release.yml | All3 API contracts remain compatible and validate/lint; no dependencies or lockfile changes. CI now enforces product build/asset guards and proxy/session tests alongside existing checks. |

## Actual verification (fresh runs for this task)

Baseline backend:21 tests passed before editing. Final passing total: **93 tests,0 skipped** =23 backend +34 standalone legacy +14 checklist +6 subscriptions +11 calculator +3 HTTPS product +2 proxy/session Node tests. Earlier task totals remain historical.

| Command and working directory | Actual result |
| --- | --- |
| `npm run typecheck && npm run lint && npm run build && npm test && npm audit` (backend/) | Passed;23 tests,0 skipped,0 vulnerabilities. Real PostgreSQL and actual HTTP, including migrations/schema failure probes, replica-shared limits, auth/CSRF/revocation/isolation, concurrency/rollback and restart persistence. Final limit test freezes Date to avoid a minute-boundary race. |
| `npm run typecheck`, `npm run lint`, `npm run build` (frontend/) | Passed; lint has0 errors/warnings. Default product and HTTPS-product builds succeed. |
| `npm test` (frontend/) |34 passed. Initial full run had33 pass/1 failure because the existing artwork measurement ran before the newly asynchronous entry rendered. Added explicit heading/image readiness assertions, retained every original assertion, reran the complete suite successfully. |
| `npm run test:checklist` (frontend/) |14 passed against real API/PostgreSQL, including CRUD/copy/version/conflict/uncertain result, persistence/restart, mobile and old-scope responses. |
| `npm run test:subscriptions` (frontend/) |6 passed: existing4 plus mismatched successful response rejection and late post-navigation save notification suppression. |
| `npm run test:payment-due-date` (frontend/) |11 passed; live API, boundary/reset/error/stale-input/company/repeated submission/response validation, keyboard/mobile and storage regression. |
| `npm run test:session` (frontend/) |3 passed; actual production product build through local HTTPS + real proxy/NestJS/PostgreSQL, secure cookie/CSRF/auth, saved refresh, direct links, no simulated finance routes or demo-storage access,390px/keyboard/CSP, malformed sign-in, failed sign-out and expiry clearing. Ran successfully more than once while implementing; final full-run pass is the recorded result. |
| `npm run test:proxy` (frontend/) |2 passed. Real local HTTP proxy failure cases (missing config, wrong scheme/host/route, duplicate route, oversized body, unreachable backend) remain JSON with matching request IDs. Session-lifecycle test proves old unauthorized replies cannot expire a newly authenticated session and repeated expiry is delivered once. |
| `npm run check:product` (frontend/) | Passed:5 unsafe build configurations rejected, both product outputs scan clean for known credential values, localhost fallback, demo entry/runtime and fixture markers. This bounded scan is not an exhaustive secret detector. |
| `npm audit` (frontend/ and backend/) |0 known vulnerabilities, including development dependencies. No dependency changes. No separate OS/container vulnerability scan was performed. |
| `/workspace/.finai-contracts/bin/python contracts/validate_examples.py`, `validate_subscriptions.py`, `validate_payment_due_date.py` (root) | All passed (existing23 and5 example sets, calculator request/3 results plus negative schema validation). |
| `npm exec --cache /workspace/.npm-cache --yes --package @redocly/cli@2.8.0 -- redocly lint contracts/openapi.yaml contracts/subscriptions.openapi.yaml contracts/payment-due-date.openapi.yaml --extends minimal` (root) | All3 contracts passed, no warnings. |
| `bash backend/scripts/restore-rehearsal.sh` (root) | Passed; unique disposable synthetic databases, checklist/subscription state, auth schema and all3 migration records restored. No customer data access/reset. |
| `BUILDX_CONFIG=/workspace/.finai-buildx docker build --secret id=cloud_ca,src="$NODE_EXTRA_CA_CERTS" -t finai-backend:product-hardening-local backend` (root; output `/tmp/finai-product-hardening-build.log`) | Passed with trusted environment CA and TLS verification intact. Local non-root image sha256:f8514e5510f278ee9818a3f8a7f226b213275db1678a67f3892c7769fd5c77bc; not published/deployed. |
| `git diff --check`; schema/manifests/lockfile compatibility checks | Passed. Only frontend scripts changed in manifests; no dependency/schema/migration/reset changes. |

Temporary compile/test-authoring errors (unused import, typed plugin context/test fixture types and the proxy test's use of a fetch-forbidden Host override) were corrected before final checks. The Host assertion was retained and tested through an exact configured-host mismatch. No assertions were deleted to obtain a pass. Existing nonfatal Vite Zod annotation and FORCE_COLOR/NO_COLOR tool notices remain.

## Deployment and review limits

Application tests and the local HTTPS product are verified; the public website is not deployed or reclassified by this work. The prior public observation “API proxy is not configured” was not rechecked or claimed fixed. No hosting credentials/secret settings were changed, no paid resource created and no public deployment performed.

A request to `https://openapi.vercel.sh/vercel.json` returnedHTTP403, so official remote Vercel-schema validation could not be performed. The JSON config was parsed/read locally, and the HTTPS harness uses its security headers/API boundaries; that is not proof of deployed Vercel rewrite behavior. GitHub API access previously returned Forbidden; hosted CI status is unverified and is not inferred from local results. Git transport publication and remote SHA comparison are checked separately when pushing.

Remaining release gates: exact target frontend/backend origins/hosts/proxy secrets and TLS; private persistent PostgreSQL/current migrations; actual administrative accounts and entity grants; target direct-link/API JSON/cookie/CSRF/tenant/expiry smoke tests; replica/database/Argon2 capacity and ingress limits; monitored backup with measured isolated restore/RPO/RTO and restored-session revocation; monitoring/alerts/operator ownership; release image OS scanning; and an authorized rollout/rollback. backend/RELEASE.md documents commands and procedures. No implementation or review can promise zero bugs; no formal independent security or financial audit is claimed.

Local startup/manual journey: README.md and frontend/docs/product.md. Product routes are `/tools/payment-due-date`, `/tools/subscriptions`, `/close/checklist`. No hardening migration is needed. Keep all existing data and additive tables on rollback. Rolling frontend back to the earlier demo would re-expose simulations; do not promote that as the product or open local identity to public traffic.

## Changed paths

- `.github/workflows/checklist-release.yml`
- `AGENTS.md`
- `README.md`
- `backend/AGENTS.md`
- `backend/README.md`
- `backend/RELEASE.md`
- `backend/src/app.ts`
- `backend/src/auth.ts`
- `backend/src/readiness.ts`
- `backend/test/checklist.test.ts`
- `context/README.md`
- `context/architecture.md`
- `context/backend-design.md`
- `context/production-review.md`
- `context/progress.md`
- `context/project-state.md`
- `context/roadmap.md`
- `contracts/README.md`
- `frontend/.env.example`
- `frontend/AGENTS.md`
- `frontend/api/proxy.ts`
- `frontend/docs/checklist.md`
- `frontend/docs/payment-due-date.md`
- `frontend/docs/product.md`
- `frontend/index.html`
- `frontend/package.json`
- `frontend/playwright.checklist.config.ts`
- `frontend/playwright.config.ts`
- `frontend/playwright.payment-due-date.config.ts`
- `frontend/playwright.subscriptions.config.ts`
- `frontend/scripts/check-assets.ts`
- `frontend/scripts/check-product-build.ts`
- `frontend/scripts/proxy.test.ts`
- `frontend/scripts/session-fixture.ts`
- `frontend/scripts/session.test.ts`
- `frontend/src/app/ProductApp.tsx`
- `frontend/src/app/demo-entry.tsx`
- `frontend/src/app/product.css`
- `frontend/src/components/SessionGate.tsx`
- `frontend/src/components/shared/Common.tsx`
- `frontend/src/components/shared/PageHeader.tsx`
- `frontend/src/components/ui/index.tsx`
- `frontend/src/components/ui/primitives.tsx`
- `frontend/src/features/checklist/MonthlyChecklist.tsx`
- `frontend/src/features/checklist/api.ts`
- `frontend/src/features/payment-due-date/PaymentDueDate.tsx`
- `frontend/src/features/payment-due-date/api.ts`
- `frontend/src/features/subscriptions/SubscriptionRenewals.tsx`
- `frontend/src/features/subscriptions/api.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/calendar.ts`
- `frontend/src/lib/session-lifecycle.ts`
- `frontend/src/main.tsx`
- `frontend/tests/marketing.spec.ts`
- `frontend/tests/session-production.spec.ts`
- `frontend/tests/subscriptions.spec.ts`
- `frontend/vercel.json`
- `frontend/vite.config.ts`
