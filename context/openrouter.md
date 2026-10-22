# OpenRouter free text models — implementation record

2026-10-22. Started at clean commit fd70598 on feature/payment-due-date. User now explicitly authorizes a real OpenRouter integration and adding its key in Vercel; previous no-AI product scope is extended only to manually entered text prompts. No auto-attached finance records, posting, files, paid models, billing or saved chat history. No schema, migration or dependency was added. Continue existing commit/push authorization; main merge/public deployment/secret-setting operations remain outside scope.

Coordinator owns contracts/context; independent API contract1.0.0 is contracts/openrouter.openapi.yaml. GET /api/v1/ai/models?entityId and POST /api/v1/ai/chat {entityId,modelId,prompt}; read access, existing identity/CSRF/proxy and DB rate limits, safe errors/no-store/request IDs. Backend selects only a fresh zero-priced text-model free variant or openrouter/free; no paid fallback. Requests fix zero price ceilings and bounded output. Vercel OPENROUTER_API_KEY is server-only: trusted proxy relays it only for these two AI paths over configured TLS; browser-supplied credential headers are ignored. Backend may instead use its own server environment key. Local identity cannot supply a relay header. The credential is confined to server-side TLS hops and excluded from browser responses, logs and storage.

Backend handoff: provider-independent validation/service/controller, bounded fixed-URL transport, fresh catalog checks, rate limits, safe uncertainty/timeouts and authorization tests. Frontend handoff: /tools/ai-chat, entity/model/search/prompt controls, pending/reset/empty/failure states, plain-text response, no fixture fallback; edits/navigation/logout discard requests/results. Explicit user notice that prompts go to OpenRouter/model providers and responses may be inaccurate. Production upstream budgetAI45s/proxy maxDuration60s; existing non-AI request limits unchanged. Provider deadlines stay below proxy/browser budgets.

External evidence: unauthenticated GET https://openrouter.ai/api/v1/models and https://openrouter.ai/openapi.json both returned HTTP403 from this workspace. Actual Vercel key and live provider/model/quota behavior are not accessible/verified; never claim fixture tests are live inference. Controlled-provider tests below are local integration evidence only.


## Implemented files and review

- Shared contract/context: contracts/openrouter.openapi.yaml, validate_openrouter.py, contracts/README.md; context/architecture.md, README.md, project-state.md, progress.md, roadmap.md, this record; root AGENTS.md/README.md; CI checklist-release.yml.
- Backend: src/openrouter.validation.ts, openrouter.service.ts, openrouter.controller.ts; app.ts composition and trusted key relay; test/openrouter.test.ts plus checklist.test.ts HTTP/session integration; .env.example, compose.production.yaml and RELEASE.md.
- Frontend: src/features/ai-chat/{AiChat.tsx,api.ts,ai-chat.css}; ProductApp.tsx route/navigation; lib/api.ts optional chat timeout; api/proxy.ts server-only relay and AI deadline; check-assets.ts secret scan; session-fixture.ts controlled transport and session-production.spec.ts; README.md and docs/{product,openrouter}.md.

Review traced browser → same-origin proxy → trusted backend → permissions → shared DB budgets → fresh provider catalog → bounded zero-price request → validated plaintext reply. Caller fields cannot select a key/URL/organisation/routing policy. Provider errors/content are never logged or returned raw. No financial/demo state is connected to prompts, and the default production path never imports a fake responder. Test transport replacement exists only in host-side test code; no HTTP/env flag enables fixture replies. Existing data/CRUD/copy/version/session semantics are preserved.

## Fresh local verification — 2026-10-22

| Executed check | Result |
| --- | --- |
| Backend typecheck, lint, build, npm test | Passed; 28 tests, 0 skipped, real PostgreSQL/HTTP; controlled external transport for AI |
| Frontend typecheck, lint, build | Passed |
| npm test (legacy local regressions) | 34 passed |
| test:checklist | 14 passed, including API restart and copy regressions |
| test:subscriptions | 6 passed |
| test:payment-due-date | 11 passed |
| test:session | 6 passed using production assets, HTTPS proxy, NestJS, PostgreSQL sessions and controlled AI transport |
| test:proxy | 2 passed |
| check:product | Passed; 5 unsafe configurations rejected; both product asset outputs passed credential/demo/localhost scans |
| All4 Python contract validators + Redocly2.8.0 lint | Passed |
| Both full npm audits | 0 known vulnerabilities |
| Production Compose config --quiet with synthetic settings | Passed |
| Backend container build | Passed; local image finai-backend:openrouter-local, sha256:b11aca416d22f5e781375c14fc6adec9368aa4dafb3c1bead43d0a8749cbb54e |
| bash backend/scripts/restore-rehearsal.sh | Passed; migrated disposable synthetic database restored with task/renewal state, auth schema and migration history |

Total: **101 tests passed, 0 skipped**. Existing 93-test milestone is historical; the table records this run. The first expanded browser run found dynamic accessible naming on the textarea; an explicit stable aria-label fixed repeat editing, then all6 HTTPS tests and the full regression chain passed. Fixture shutdown now releases pending synthetic provider work. Invalid upstream JSON now returns a safe502. No assertions were removed. Redocly initially could not write the default npm cache; rerunning with the writable /workspace/.npm-cache passed. Existing third-party Zod annotation and color-env warnings are nonfatal.

AI-specific checks cover free/paid/fee filtering (including tiny positive price underflow), strict fields/UUID/model/prompt validation, fixed URLs/zero ceilings/no fallback, repricing, read-only/hidden/cross-tenant/inactive access, anonymous/CSRF denial, trusted relay versus forged browser header, shared quota rejection, missing key/empty catalog/provider quota/auth/network/malformed/oversized/secret-echo/nonzero-cost replies, aborts, confirmed plaintext output, search/select, reset/refresh, pending guards, obsolete responses and390px keyboard containment. Local session/auth verification does not prove target hosting configuration or live provider compatibility.

## Exact commands and activation

From repository root in the prepared environment:

```sh
npm run db:up --prefix backend
npm run generate --prefix backend
npm run db:migrate --prefix backend
npm run build --prefix backend
npm start --prefix backend
```

Separate local frontend terminal (explicit loopback development identity only):

```sh
VITE_APP_MODE=product VITE_AUTH_MODE=local VITE_CHECKLIST_MODE=api VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1 npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

Configure a local test key in private backend configuration only. Production uses existing authenticated HTTPS topology, not these local identity flags. No new migration: run migrate deploy normally without reset/seed. Separate dependency manifests/lockfiles are unchanged.

For an operator-authorized release: follow backend/RELEASE.md image/migrate/start commands using the reviewed SHA; Vercel root frontend, Node24, build npm run build, output dist. Add server-only **OPENROUTER_API_KEY** in Vercel's intended environment (never VITE_), preserving FINAI_BACKEND_ORIGIN/FINAI_PUBLIC_ORIGIN/FINAI_PROXY_TOKEN and matching backend hosts/origin/proxy token. Alternatively configure the key on the backend, which takes precedence. Configure AI ingress timeout at least45s and provider spending restrictions. Deploy backend and frontend only after authorization; an environment edit alone does not update existing code. Open /tools/ai-chat with a provisioned account/entity grant, select a free model, send a synthetic non-sensitive prompt, check actual zero-cost response and security/error/direct-link smoke tests in frontend/docs/openrouter.md. No secret value should be sent through chat or committed.

Rollback: use previous compatible frontend/backend images, preserving the existing database/migrations. Chat stores no business history, so no data downgrade/reset is necessary. Remove/revoke an unused provider key through the operator's secret process. Existing backup/restore/session-revocation procedures remain applicable.

## Remaining release gates

- Live OpenRouter catalog/schema access returns403 from this environment. No real key or live generation was verified; provider schema, free routing, quotas and key restrictions require the activation smoke test.
- Vercel secrets/configuration, actual backend TLS/ingress, deployed direct routes, real accounts/entity grants and production logs/assets remain unverified. No public deployment or secret changes were performed.
- Hosted CI status, production restore/RPO/RTO, replica capacity and monitoring still need operator evidence. Local builds/audits/tests do not imply a zero-defect guarantee or independent security audit.
