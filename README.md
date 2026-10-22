# FinAI

FinAI provides authenticated tools for finance teams:

- **Monthly checklist** — saved tasks, completion, deletion and atomic copying of the previous month's titles into an empty month.
- **Invoice duplicate checker** — transient CSV analysis of repeated supplier/invoice references, with a downloadable review report; no stored uploads or invoice changes.
- **Subscription renewals** — manually entered renewals/cancellation deadlines, search, archive and optimistic version conflicts.
- **Payment due-date calculator** — validated calendar-day calculation from invoice date, terms and explicit as-of date. No payment-status check or stored calculation history.

The default build is the product: real server requests, PostgreSQL records where applicable, administratively provisioned accounts and server-owned organisation/entity permissions. API failures stay visible. Fictional accounting/banking/AI screens are development-only legacy sources; the product does not load their Redux store, fixtures, persona controls, routes or public marketing assets. Those modules are not implemented financial services.

## Repository

| Path | Responsibility |
| --- | --- |
| `frontend/` | React/Vite/TypeScript product, shared UI, typed API adapters, same-origin API/auth proxy and browser tests |
| `backend/` | NestJS service, Prisma/PostgreSQL, authentication, permissions, business transactions, additive migrations and operating scripts |
| `contracts/` | Versioned OpenAPI contracts, examples and validation |
| `context/architecture.md` | Current system design, authority/data boundaries and accepted decisions |
| `context/production-review.md` | Review coverage, concrete fixes, actual verification and remaining release gates |
| `.github/workflows/checklist-release.yml` | Automated application, contract, product build, browser/proxy, audit, container and restore checks |

Application manifests/lockfiles remain separate. Use Node24/npm11 and PostgreSQL17. Start with [frontend product operating notes](frontend/docs/product.md), [backend setup](backend/README.md) and [production release runbook](backend/RELEASE.md). Existing installations do not reset/reseed data. This hardening adds no migration or dependency.

## Prepared local environment

With dependencies and the private local backend configuration already initialized, run in two terminals:

```sh
cd backend
npm run db:up
npm run generate
npm run db:migrate
npm run build
npm start
```

```sh
cd frontend
VITE_APP_MODE=product VITE_AUTH_MODE=local VITE_CHECKLIST_MODE=api VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `/tools/payment-due-date`, `/tools/subscriptions`, `/close/checklist` or `/tools/invoice-duplicates`. This is explicit loopback-only development identity. It must never authorize remote access or run in production. Fresh disposable local setup and separate dependency installs are documented in the operating notes. Never seed/reset an unknown or production database.

## Product build and release

From `frontend/`, `npm run build` produces the session-authenticated product in `dist/`, using same-origin `/api/v1`. Unsafe direct Vite builds are rejected. Vercel project root is `frontend`; build `npm run build`; output `dist`; Node24. Server-only proxy configuration and exact backend hosts/origin are required. No secret belongs in a VITE_ variable. A build does not provision a backend, database, account or entity grant.

The repository contains deployment/recovery instructions, not evidence of a verified public deployment. Target TLS/proxy configuration, persistent PostgreSQL, real account/entity provisioning, deployed smoke tests, backup/restore objectives, capacity and monitoring still require operator verification and deployment authorization. Do not describe simulated modules as production accounting or infer whole-platform readiness from passing tests.

## Verification

Run the separate backend typecheck/lint/build/test/audit commands and the frontend checks listed in [product.md](frontend/docs/product.md). The production HTTPS suite uses the actual product build, proxy, NestJS service and isolated synthetic PostgreSQL schema; legacy suites explicitly use development-only demo builds to preserve regression coverage. No real customer data is needed. Exact current results and review limitations are recorded in [production-review.md](context/production-review.md).

PR #4 merge verification and combined release evidence: [invoice integration review](context/invoice-merge.md).
