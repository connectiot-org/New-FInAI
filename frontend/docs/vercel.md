# Same-project Vercel deployment

## Test chat without sign-in or database

Open `/workspace/assistant` (also `/assistant`). This separate public chat needs only the existing server Secret `OPENROUTER_API_KEY` (`Openrouter` is accepted too), followed by a redeploy so the function receives it. No `DATABASE_URL`, account, `ASSISTANT_ENABLED`, default model, provider allowlist or financial mapping is needed for this public test. The existing private financial Assistant is at `/workspace/assistant/records`; financial APIs and sources still require sessions and PostgreSQL.

The server reads OpenRouter's live free text-model catalog, including models without structured output, and the user chooses a model for each message. All routing is capped at zero prompt/completion price; paid/request-priced models are excluded and positive reported response costs are rejected. Free availability/rate limits come from OpenRouter, not an invented token balance. Some free models may be temporarily unavailable; errors remain visible and another model can be selected. Nothing automatically retries a completion.

Only bounded text conversation is sent to OpenRouter/its model provider. No financial tools, cookies, identity, browser demo data or database queries are included. Current-page history is not persisted by FinAI; OpenRouter/provider retention policies apply. Anonymous endpoints `/api/chat/models` and `/api/chat/messages` run before private backend initialization, so missing database configuration cannot block this chat. UI supports search, model switching, cancellation, clear and bounded follow-ups.

Per warm function instance: five completions per IP/minute, twenty total/minute, two in flight, 64KiB input, eleven alternating messages/12000 total UTF-16 units, 4096 output tokens, 40-second provider deadline and bounded response parsing. These counters are not a durable global allowance across serverless instances. Set any account-wide request allowance in OpenRouter's key settings and use Vercel traffic controls as appropriate for a public test. The interface exposes no API key or fabricated remaining quota.

`npm run test:public-chat` builds the actual browser app and runs controlled-provider HTTP/API/UI tests without any database. Live catalog and real provider completion are separate verification outcomes. The public component is loaded on its route so this feature does not enlarge the initial product bundle past the existing build warning threshold.

## Private financial backend

This release packages the real NestJS API into the existing Vercel API function. The frontend can use the OPENROUTER_API_KEY or Openrouter Secret from that same Vercel project. All private history/source data still requires PostgreSQL and authenticated accounts. No production database or account is created by a build or HTTP request.

## Project and build

Use repository root directory frontend, Node 24, the Vite preset and the checked-in vercel.json. Its build command is npm run build:vercel. Enable Include source files outside of Root Directory so the build can read ../backend. The build performs frozen backend installs/generation/compilation, creates an ignored .finai-server private runtime with production dependencies and generated Prisma client, and builds the browser with session/API modes enabled. A separate NodeNext typecheck catches Node function import mistakes. No database migrations, seeds or model calls run during the build.

The function includes .finai-server/**, outside the public dist directory. Prisma includes native and rhel-openssl-3.0.x targets for Node 24 Vercel. The runtime package has a 220 MiB build budget, leaving space beneath the 250 MiB function limit. The verified private artifact was approximately 144 MB on disk; it is not browser storage or a public asset directory. .env files are not copied. @vercel/functions3.6.1 supplies waitUntil; this pinned release passes the dependency audit and avoids the vulnerable CLI configuration dependency chain in the newer version initially evaluated.

## Runtime settings

| Mode | Selection | Requirements |
| --- | --- | --- |
| Same-project | FINAI_API_MODE=embedded, or no FINAI_BACKEND_ORIGIN | DATABASE_URL and an exact trusted public HTTPS origin |
| Existing remote API | FINAI_BACKEND_ORIGIN present, or FINAI_API_MODE=remote | Existing FINAI_PUBLIC_ORIGIN/FINAI_PROXY_TOKEN/TLS backend configuration |

Same-project mode derives the public origin from trusted Vercel deployment metadata when available; set FINAI_PUBLIC_ORIGIN explicitly for the exact production/custom domain when needed. Only that host/origin is accepted. Preview deployments need their own database/runtime environment; do not point an unreviewed preview at production data. Existing remote mode remains supported and does not silently fall back when explicitly selected.

Set DATABASE_URL as a server Secret containing the provider's verified-TLS PostgreSQL connection URL. Prefer the provider's serverless/pooled endpoint and a bounded connection budget. Select an appropriate PostgreSQL integration/plan in Vercel only after checking price, region and account ownership. The local application is validated against PostgreSQL17.6. This implementation did not provision a hosted database or approve a paid plan.

OpenRouter settings remain server-only: OPENROUTER_API_KEY (Openrouter alias accepted), ASSISTANT_ENABLED=true, ASSISTANT_MODEL (approved default), ASSISTANT_OPENROUTER_PROVIDERS (approved comma-separated names), ASSISTANT_DAILY_TOKEN_LIMIT (approved allowance), ASSISTANT_MAX_INPUT_PRICE=0 and ASSISTANT_MAX_OUTPUT_PRICE=0. Finance-approved ledger mappings remain a separate setting. The user-selected model catalog does not bypass provider/privacy/budget configuration. A key alone does not configure a database, provision an account or approve source data. See ../../backend/ASSISTANT.md.

## Database initialization and identity

After a database is actually provisioned and the target/backup is reviewed, apply the existing seven migrations from a trusted operator runtime with DATABASE_URL supplied securely: `node node_modules/prisma/build/index.js migrate deploy` from `backend`. This reads the injected target connection directly; the local convenience `db:migrate` script loads `.env` and is for local development. For pooled providers use their migration-supported direct endpoint where required; do not paste credentials into source or chat. Builds never run reset, seed or production migrations automatically. Existing data is preserved by additive migrations.

Provision the real organisation/entity through the approved bootstrap process described in backend/RELEASE.md, then use scripts/accounts.mts and scripts/workspace-admin.mts for administrative accounts/grants with hidden terminal password input. Demo persona selection is not authentication. Do not seed Northstar or invent customer financial data in a new production database. Empty authorized sources stay empty and missing snapshots stay explicit.

## Request and job behavior

The function initializes Nest without binding a TCP listener. It validates the host, rebuilds a bounded request and replaces identity/proxy headers with a server-owned per-instance proof; existing session, CSRF, membership, entity, version and rate limits still run. Ordinary 16 KiB and dedicated raw preview 1 MiB limits apply to both raw and pre-parsed Vercel request bodies. Missing DATABASE_URL produces a safe DEPLOYMENT_NOT_CONFIGURED 503 that the sign-in gate displays; no demo answer is substituted.

Assistant work is registered with waitUntil before 202 is sent. The function duration is 60 seconds; the existing 40-second durable lease and conditional completion/cancellation rules remain. A killed/timed-out invocation expires safely instead of automatically repeating model spend. This is not an unlimited job queue. PostgreSQL sessions and turns survive warm-instance replacement; no private browser cache is introduced.

## Verification and remaining release work

npm run test:vercel builds the private runtime and checks the packaged real API against an isolated synthetic PostgreSQL schema: missing configuration, listener-free bootstrap, host/anonymous guard, login, CSRF, saved records, raw/pre-parsed limits, retained202 work, grounded output, stable retry, instance replacement and logout. The model is a controlled test provider, never production runtime behavior. Existing separate-backend HTTPS tests remain required.

Engineering also built the function with the official @vercel/node27.0.2 builder locally, confirmed private backend/RHEL engine inclusion and booted the emitted Node 24 function from an isolated directory. Standalone anonymous 401/malformed JSON 400 checks passed. This is genuine build-artifact verification, not proof of a hosted deployment, real provider compatibility or quota.

Before release, verify exact-head CI, bind the actual database and server Secrets, apply approved migrations/identity setup, redeploy the reviewed commit, then test authenticated real OpenRouter questions and source refresh/logout on that deployment. Restore/backups/cleanup/monitoring/finance approvals remain the existing operator gates. No Vercel account/database tools or CLI credentials were exposed in this engineering session despite the plugin tag; therefore no hosted database, environment-variable change or deployment was performed here.
