# Payment due-date calculator — 2026-10-22

## Scope and ownership

Started from clean `7c918477a4a360d0dfefef0dace3015894911950`; working branch `feature/payment-due-date`. The initial calculator brief required an unpushed reviewable diff. The subsequent user instruction explicitly authorizes checking, testing, committing and pushing this feature branch. Merging, public deployment and hosting settings/secrets remain outside scope. No real customer data was accessed. No agents were used. Sequential roles: coordinator froze contract/context; backend implemented permission-checked calculation; frontend connected the screen; reviewer checked the full diff and verification; coordinator recorded this handover and extended existing CI.

Revalidated existing NestJS11.2.7, Prisma6.19.3/PostgreSQL, backend Zod4.1.12, TypeScript5.9.3, frontend React19.3.1/Vite7.3.7 and Playwright1.64.1 from manifests/locks/source. Existing PostgreSQL sessions, CSRF, proxy/origin/host checks, rate limits and explicit loopback local identity are reused unchanged. Historical notes saying authentication is absent are not the current source state. No duplicate checker or calculator existed in the inspected checkout; checklist and subscription tracker already existed and were preserved.

## Implemented behavior

Independent OpenAPI3.1.1 contract1.0.0: `contracts/payment-due-date.openapi.yaml`. POST `/api/v1/payment-due-date-checks`, strict `entityId/invoiceDate/termsDays/asOfDate`, no query fields, HTTP200 with exactly those fields plus `dueDate/daysUntilDue/status`. Real Gregorian dates0001–9999; integer terms0..365; due overflow422. Pure UTC-midnight calendar arithmetic preserves early years and avoids DST; the supplied as-of date is authoritative. Positive means not_due, zero due_today, negative overdue. No weekend/holiday/month adjustments or payment/legal checks.

Thin controller/service uses existing server identity and active membership/entity read permission, including read-only access. No business writes, calculation history, schema/migration, storage or new dependency. Authentication retains its normal session/rate-limit operations. Existing safe errors, request IDs, no-store and small JSON-body limit are unchanged.

Frontend `/tools/payment-due-date` adds one navigation entry, shared SessionGate/entity loader/transport and existing UI controls. Compact responsive form, authorized company selector, Net0/7/14/30/45/60/90 and Custom0..365, local-calendar today default, editable as-of, Reset and one verified result card. Shows due date, entered as-of, absolute day count, singular/plural status and the required overdue qualification. Input/company edits and Reset clear/abort results; request generations prevent late overwrites, pending submissions are blocked, and unmount/sign-out discards the form. Only confirmedHTTP200 results with strict schema, real dates, exact input correspondence and consistent arithmetic/status display. Failures remain visible; no fixtures or browser storage are used. Financial demo state and `/close` are preserved.

## Actual verification

Baseline `cd backend && npm test`:17 passed before edits. Final checks below are fresh runs for this task, not historical reports.

| Command (directory) | Actual result |
| --- | --- |
| `npm run typecheck && npm run lint && npm run build && npm test` (backend) | Passed;21 tests,0 skipped, actual HTTP and isolated PostgreSQL schemas. Includes calculator arithmetic/validation, read-only/inactive/tenant/entity permissions, no business writes, sessions/CSRF and existing persistence/concurrency regressions. |
| `npm run typecheck && npm run lint && npm run build` (frontend) | Passed. |
| `npm run test:payment-due-date` (frontend) |11 passed; actual API example, Net0/30/custom365, local today, Reset/leaving, errors/retry, delayed input/company changes, repeated-submit blocking, invalid/mismatched/non200 responses, keyboard/390px containment and unchanged demo storage. |
| `npm run test:session` (frontend) |1 passed; production build over local HTTPS, actual session and same-origin proxy, CSRF/cookie checks, calculator calculation and sign-out/relogin discarding results, existing checklist/subscription regression. |
| `npm test`, `npm run test:checklist`, `npm run test:subscriptions` (frontend) | Passed;34 standalone +14 checklist +4 subscription tests,0 skipped. Full standalone rerun passed after the initial infrastructure-related failure described below. |
| `npm audit` (each application) | Both passed;0 known vulnerabilities, including development dependencies. No dependency or lockfile changes. |
| `node scripts/check-assets.ts` (frontend) | Passed for demo and production-session assets; available backend credential values absent and no production localhost API fallback. This is the existing bounded scan, not a proof against every possible secret. |
| `/workspace/.finai-contracts/bin/python contracts/validate_examples.py` (root) | Passed;23 existing examples plus empty summary, rejected patches and frozen routes. |
| `/workspace/.finai-contracts/bin/python contracts/validate_subscriptions.py` (root) | Passed;5 subscription examples/invalid inputs. |
| `/workspace/.finai-contracts/bin/python contracts/validate_payment_due_date.py` (root) | Passed; request/3 results, strict fields/terms, Gregorian dates and status/day-sign schemas. |
| `npm exec --cache /workspace/.npm-cache --yes --package @redocly/cli@2.8.0 -- redocly lint contracts/openapi.yaml contracts/subscriptions.openapi.yaml contracts/payment-due-date.openapi.yaml --extends minimal` (root) | All3 contracts passed, no warnings in final run. Initial conditional-schema linter warnings were resolved without weakening top-level strictness; negative schema checks still pass. |
| `bash scripts/restore-rehearsal.sh` (backend) | Passed; isolated synthetic application DB dump/restore verifies checklist/subscription records, auth tables and all3 existing migration records. No customer DB was dumped/reset. |
| `BUILDX_CONFIG=/workspace/.finai-buildx docker build --secret id=cloud_ca,src="$NODE_EXTRA_CA_CERTS" -t finai-backend:payment-due-date-local backend` (root; output redirected to `/tmp/finai-payment-image-build.log`) | Passed; local image built with trusted environment CA, TLS verification preserved. No registry publication or public deployment. |
| `git diff --check`; unchanged-schema/lock/dependency check | Passed; no calculator migration or dependency changes. |

The first standalone regression run had33 passes/1 failure: the1024px homepage could not load application modules because Chromium logged `net::ERR_NETWORK_CHANGED` during overlapping local container operations. No assertions or unrelated code changed. The entire unchanged suite was rerun after container work finished; final results are recorded below. Nonfatal tool notices include FORCE_COLOR/NO_COLOR and existing Vite dependency annotation/chunk-size messages.

CI `.github/workflows/checklist-release.yml` now includes the calculator contract validator/OpenAPI lint and dedicated browser script alongside all existing checks. Local equivalents were run; GitHub-hosted CI status must be distinguished from local results when publishing.

## Changed paths

- `.github/workflows/checklist-release.yml`
- `backend/README.md`
- `backend/src/app.ts`
- `backend/src/checklist.repository.ts`
- `backend/src/payment-due-date.controller.ts`
- `backend/src/payment-due-date.service.ts`
- `backend/src/payment-due-date.ts`
- `backend/test/checklist.test.ts`
- `backend/test/payment-due-date.test.ts`
- `context/payment-due-date.md`
- `context/progress.md`
- `context/project-state.md`
- `contracts/README.md`
- `contracts/payment-due-date.openapi.yaml`
- `contracts/validate_payment_due_date.py`
- `frontend/docs/payment-due-date.md`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/playwright.payment-due-date.config.ts`
- `frontend/src/app/navigation.ts`
- `frontend/src/app/router.tsx`
- `frontend/src/features/payment-due-date/PaymentDueDate.tsx`
- `frontend/src/features/payment-due-date/api.ts`
- `frontend/src/features/payment-due-date/payment-due-date.css`
- `frontend/src/features/subscriptions/api.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/authorized-entities.ts`
- `frontend/tests/payment-due-date.spec.ts`
- `frontend/tests/session-production.spec.ts`
- `frontend/tsconfig.json`

## Local startup and manual acceptance

No calculator migration is required. Keep existing database contents and private configuration. With dependencies and local `.env` already prepared:

```sh
cd /workspace/New-FInAI/backend
npm run db:up
npm run generate
npm run db:migrate
npm run build
npm start
```

In another terminal:

```sh
cd /workspace/New-FInAI/frontend
VITE_AUTH_MODE=local VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

This command uses the existing explicit loopback-only local backend identity and does not authorize remote/public access. Frontend VITE_AUTH_MODE is a UI/session-transport setting, never backend identity. For a fresh disposable local installation only, run `npm ci`, `npm run db:init` before the backend startup sequence, and `npm run db:seed` after migration; frontend dependencies use their separate `npm ci`. Do not seed/reset an unknown or production database. Existing installations need no reseed. Existing session installations keep their normal session/proxy configuration instead of the local browser command; see backend/RELEASE.md.

Open <http://127.0.0.1:5173/tools/payment-due-date>. Select an authorized company; invoice2026-10-01, Net30, as-of2026-11-02; Calculate must show due2026-10-31 and2 days overdue with the payment-status qualification. Change any input/company to clear the result; Net0 with matching invoice/as-of must show Due today. Reset restores blank invoice, Net30, local today. Navigate away/back or sign out/in: no previous result. Disconnect API: visible error, no fixture result. The selected company is independent of financial demo personas. Keyboard Calculate/Reset and390px containment are covered by the browser suite.

## Review and remaining gates

Reviewed all changed tracked files and read all new files; `git diff --check` passed. Dependency manifests remain separate; frontend manifest adds only a test script. Prisma/schema/migrations, lockfiles, hosting configuration, financial demo state/approval code and auth/global middleware are unchanged. All85 final tests passed with0 skips. CI coverage is prepared; hosted results are not inferred from local checks. The user subsequently authorized commit/push to the feature branch after fresh verification. No merge, public deployment or paid resource is authorized.

Application behavior and production-mode authentication were verified locally using isolated synthetic PostgreSQL data and a local HTTPS reverse proxy. This does not verify the public site's deployment. The earlier report “API proxy is not configured” has not been rechecked or marked fixed; no backend URL is invented. A future separately authorized release still needs target same-origin API/auth proxy and exact host/origin/secret configuration, private persistent PostgreSQL with existing migrations, administratively provisioned accounts with actual entity grants, target backup/restore validation and direct-link/refresh/auth/CSRF/API-JSON smoke checks. Calculator-specific deployment settings/migrations are unnecessary. Do not claim whole-platform production readiness from these tests.

Next action authorized by the latest user instruction: commit the reviewed calculator changes, push `feature/payment-due-date` without force, and compare its remote SHA to local HEAD. Main has newer remote work; do not merge or overwrite it. No unresolved calculator implementation blocker was found in local verification. Public deployment remains a separate authorization and verification gate.


## Commit/push verification after user authorization

The user explicitly requested fresh code checks/tests followed by commit and push. Reran backend `npm run typecheck && npm run lint && npm run build && npm test && npm audit`:21 tests passed,0 skipped, audit0 vulnerabilities. Reran frontend `npm run typecheck && npm run lint && npm run build && npm test && npm run test:checklist && npm run test:subscriptions && npm run test:payment-due-date && npm run test:session && node scripts/check-assets.ts && npm audit`:34+14+4+11+1 tests passed,0 skipped, asset scan passed, audit0 vulnerabilities. All3 Python contract validators and Redocly2.8.0 lint passed again. Fresh total85 tests with no failures. Code inspection and diff/unchanged schema, dependency and lockfile checks passed. Container build/restore evidence above is from the implementation run, not an additional rerun for this commit request.

Publishing target is `origin` (`https://github.com/connectiot-org/New-FInAI.git`), branch `feature/payment-due-date`, with no force and no main merge. Git transport can read the repository; GitHub CLI GraphQL and REST Actions requests returned Forbidden, so hosted CI status cannot be verified through the available API access. The push result and remote SHA comparison must be reported from actual Git command output. Deployment remains outside scope.
