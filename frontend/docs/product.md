# FinAI product frontend

`npm run build` now builds the authenticated product. It does not build the financial demo. Supported routes: `/tools/payment-due-date`, `/tools/subscriptions`, `/close/checklist`, `/tools/invoice-duplicates`. Root and `/welcome` lead to the calculator after authentication. Other former demo routes show Page unavailable. The product has one shared SessionGate and only live-tool navigation; no persona, finance snapshot, fixture ledger, simulated assistant or browser-owned financial records.

The entry branches at build time. ProductApp imports pure shared UI components and the implemented live features; it never imports `store/`, demo seeds, Common's demo selectors or the legacy Shell/router. Vite excludes the legacy public assets and emits only the shared favicon. Product builds require session authentication, API checklist mode and `/api/v1`. `npm run build:product` supplies these values explicitly; directly invoking an unsafe Vite build fails. `VITE_APP_MODE=demo` exists solely for explicit local regression/development; a Vercel-marked demo build fails. No secret belongs in a VITE_ variable.

Prepared local development, using the existing explicit loopback backend identity:

```sh
# terminal 1, backend/ (private .env already initialized)
npm run db:up
npm run generate
npm run db:migrate
npm run build
npm start

# terminal 2, frontend/
VITE_APP_MODE=product VITE_AUTH_MODE=local VITE_CHECKLIST_MODE=api VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Local frontend flags never authorize backend requests. Never expose local identity remotely. Fresh disposable local installations first use the separate application `npm ci` commands and backend `npm run db:init`, then seed synthetic local identity with `npm run db:seed` after migration. Do not seed/reset existing production data. There is no new schema migration for this hardening.

Production: Vercel project root frontend/, build `npm run build`, output dist/, Node24. Use the existing same-origin API/auth proxy with server-only FINAI_BACKEND_ORIGIN, FINAI_PUBLIC_ORIGIN and FINAI_PROXY_TOKEN settings described in backend/RELEASE.md. Missing configuration fails visibly with503 JSON; it never selects fixtures. Do not infer that a deployed backend/proxy exists from the build configuration. CSP/security headers and bare API/auth route rules are included in vercel.json; deployed platform behavior still requires preview smoke verification.

Checks from frontend/:

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:checklist
npm run test:subscriptions
npm run test:payment-due-date
npm run test:session
npm run test:proxy
node scripts/check-product-build.ts
node scripts/check-assets.ts
npm audit
```

Legacy browser suites explicitly start the legacy development build so the older workflows retain regression coverage. The HTTPS production suite serves the actual product build through the real proxy/backend and isolated synthetic PostgreSQL schema, including CSP, authentication/CSRF, saved record refresh, direct links, responsive navigation, expiry/logout and no demo-storage access. Proxy/session Node tests verify old unauthorized replies cannot end a new session, and JSON error/ID behavior, body bounds and host/config failures. Build checks reject five unsafe configurations. Asset checks scan both product outputs for known backend credentials, localhost fallback, demo entry and fixture/runtime markers. They are bounded checks, not a guarantee against every possible secret or defect.

Manual acceptance: sign in with an administratively provisioned account and entity access; enter invoice2026-10-01/Net30/as-of2026-11-02; calculate2026-10-31/two days overdue. Add and refresh a checklist task; create/edit/archive a renewal and refresh. Sign out/in clears calculator inputs/results while saved records persist on the server. Revoked entity access denies subsequent requests; expired sessions return to sign-in. Unknown accounting/assistant routes must not show fictional data. At390px all controls remain contained and keyboard-operable.

The invoice duplicate checker accepts one transient CSV, confirms analysis through the backend and never saves uploaded content/results. See [invoice checker setup](invoice-duplicates.md); its route-specific upload limit leaves other routes bounded as before.
