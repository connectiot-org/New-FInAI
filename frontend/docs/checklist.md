> Current product startup/build boundary: [product.md](product.md). The product defaults to real API/session mode; legacy demo instructions below apply only to explicit local regression builds.

# Local monthly checklist

The separate `/close/checklist` screen lists user-created tasks for an authorized entity and explicit YYYY-MM. Add, mark done/undone, confirm deletion and see completed/total and rounded progress. API data survives refresh and API restart. This feature has no approval, evidence, locking, finance calculation, AI or bank integration. Existing `/close`, Approved counts, persona controls and financial localStorage stay unchanged.

## Startup

From `/workspace/New-FInAI/backend`:

```sh
npm ci
npm run db:init
npm run db:up
npm run generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

See backend/README.md for prerequisites, private generated local DB configuration, safe migrations/seed, persistent Docker volume and loopback-only identity. Engine/checksum downloads need binaries.prisma.sh. No external API key or cloud subscription is needed. Never run this development identity publicly.

In `frontend/.env.local` (ignored), configure only public values:

```dotenv
VITE_CHECKLIST_MODE=api
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
```

From `/workspace/New-FInAI/frontend`, run `npm ci` and `npm run dev -- --port 5173 --strictPort`. Visit the local `/close/checklist` route in your development browser. The configured frontend origin must be allowed by the backend. `GET /api/v1/entities` supplies the trusted entity selector; it is unrelated to browser demo IDs/personas. The selected entity/month are kept in the route's query string for refresh. All VITE_ values are public: never store a DB URL or credentials there.

Without configuration, mode defaults to `demo`: explicitly labeled session-only tasks, separate from financial fixtures and cleared on page refresh. It never calls an API. API errors never trigger demo fallback. Default public builds retain demo mode; public multi-user API use is blocked until real identity and release gates are implemented.

## Failure and concurrency behavior

Updates show pending state and only reflect successful server responses. Failed saves stay visible; reload is available. A 409 reloads the list and asks for review before another action. Absolute completion and quoted If-Match deletion use the displayed version. An ambiguous create retry keeps the same client UUID and payload, including when the server saved it but the response was lost; editing or moving that unresolved request cannot silently create another task. Known 4xx rejections release that pending creation so a corrected request can be submitted. Scope changes abort/ignore older reads. Task records never enter finai-demo-v1, and resetting the financial demo does not delete API tasks.

## Checks

From backend/: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`. The eight backend tests use isolated PostgreSQL schemas, real HTTP and concurrency (not an embedded substitute).

From frontend/:

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:checklist
```

`npm test` runs the original 33 accounting/public-site regression tests without needing a backend. `npm run test:checklist` is separate: requires the migrated/seeded DB, generated client and compiled backend. It owns a test API on 127.0.0.1:3001 and Vite on 5173 (keep that port free). The tests stop/restart only their own API, use a random distant month and remove only task IDs they created. Never run against public or production configuration. Coverage includes CRUD/progress/refresh/API restart, scope isolation, demo reset independence, actual outage, ambiguous retries, conflict/refetch, delayed reads, auth/service failures, invalid responses, corrective saves and mobile containment. See context/progress.md for exact completed run outcomes.

API/OpenAPI 1.0.0 lives in contracts/; both client response boundaries and actual backend test responses are validated. Architecture, domain ownership and release gates live in context/. This local feature is not a production ERP or deployment.

## Copy previous month and session release

The copy button is available for an empty selected destination (except 0001-01). Confirm the displayed calendar months; only titles are copied into new incomplete tasks. The API calculates the previous month and enforces permissions, atomic insertion and destination emptiness. An empty source changes nothing. A conflict or uncertain response reloads the destination before another deliberate attempt. Deleting every destination task allows another copy; this is not a permanent exactly-once operation. The demo performs the same action only in session memory and loses tasks on refresh.

Production build settings: `VITE_CHECKLIST_MODE=api VITE_AUTH_MODE=session VITE_API_BASE_URL=/api/v1 npm run build`. Set Vercel project root to `frontend`, output `dist`, Node 24, and configure the server-only proxy variables listed in `backend/RELEASE.md`. No secrets belong in VITE_ variables. The new same-origin sign-in form accepts administratively provisioned accounts; demo personas never authorize API calls. `npm run test:session` exercises a production frontend build over a disposable local HTTPS harness with real PostgreSQL sessions. Its self-signed certificate exception is isolated to the test browser. It does not validate the actual Vercel proxy or target TLS infrastructure.

Vercel routes send `/api/*` and `/auth/*` through the JSON proxy before filesystem/SPA fallback; static assets remain filesystem routes, and React Router deep links fall back to index.html. Deployed direct URL/refresh verification is pending authorized hosting access.
