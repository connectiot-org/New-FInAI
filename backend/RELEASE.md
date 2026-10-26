# Production release runbook

Architecture: Vercel project root `frontend`, build `npm run build:vercel`, output `dist`, Node 24. The same-project API function now packages the real NestJS backend and uses a separately provisioned PostgreSQL service. See [the Vercel runbook](../frontend/docs/vercel.md) for this mode, database binding and server-only settings. The build enables the authenticated API frontend; it never migrates or seeds a production database. No credentials belong in VITE_ variables.

The existing remote proxy/Docker option remains supported. The settings and container commands below describe that option; select `FINAI_API_MODE=remote` explicitly when using a separate backend.

Backend deploy environment (secure values supplied through hosting secret settings, never committed):

```
NODE_ENV=production
CHECKLIST_IDENTITY=session
API_HOST=0.0.0.0
API_PORT=3000
PUBLIC_ORIGIN=https://your-frontend.example
API_TRUSTED_HOST=your-backend.example
DATABASE_URL=<private PostgreSQL connection with TLS and verification>
API_PROXY_TOKEN=<at least 32 random characters from secret manager>
```

Vercel server-side variables: `FINAI_BACKEND_ORIGIN=https://your-backend.example`, `FINAI_PUBLIC_ORIGIN=https://your-frontend.example`, `FINAI_PROXY_TOKEN` equal to backend API_PROXY_TOKEN. Proxy replaces all forwarded/identity headers; backend trusts only this token, exact backend Host, authenticated X-Finai-Public-Host and HTTPS forwarded protocol. TLS ingress must not log headers/bodies or expose unencrypted backend traffic. Restrict backend ingress to the proxy where hosting supports it. Do not enable Express trust proxy. Configure ingress request limit 16 KiB, upstream timeout 15 seconds and TLS. One configured public origin per environment; preview requires its own backend configuration/database and exact origin, never wildcard trust.

On a prepared host: `docker build -t finai-backend:<release-sha> backend`. Run against persistent PostgreSQL 17.6 with private network and durable volume; do not put database on ephemeral serverless filesystem. Migrate once per release with the same image and secure environment: `node node_modules/prisma/build/index.js migrate deploy`. Then start `node dist/src/main.js` behind TLS ingress. Local commands use `node --env-file=.env ...`; production environment is injected. Never run local seed in production. The additive sessions migration creates Account/Session/RateLimit only; it does not change checklist data. Existing organisations/entities/memberships remain authoritative. Bootstrap real organisation/entity via an approved administrative data process, never copy synthetic local identity into production.

Administrative account operations (trusted terminal with DATABASE_URL injected):

```
node --import tsx scripts/accounts.mts create <username> <existing-organisation-uuid>
node --import tsx scripts/accounts.mts reset <username>
node --import tsx scripts/accounts.mts revoke <username>
```

Create grants membership but no entity access. Grant/revoke existing EntityAccess rows explicitly through an approved database administration process. Password prompts are hidden and require a terminal, 12–1024 characters. Argon2id: 64 MiB, 3 iterations, parallelism 1; tune only after measured host load. Reset revokes every session in the same transaction. Sessions expire after 8 hours; logout/revocation remove rows. Login errors are generic. Database rate limits span replicas (30 logins/IP/15m, 10/account/15m; 120 mutations/user/minute). Trusted proxy supplies client IP. Keep replica/connection budgets bounded, and capacity-test Argon2 under expected concurrent attempts before release. Schedule deletion of expired Session rows and RateLimit windows older than one day. No signup, email recovery or paid identity provider.

Backups: use a restricted backup service account and secure PGPASSFILE/secret manager; never put a password in argv. `pg_dump --format=custom --file=/secure-backups/finai.dump "$PGSERVICE"` where PGSERVICE is a service name without secrets; encrypt, restrict permissions and store off-host with documented retention. Include roles/grants separately. Restore into a new isolated database using `pg_restore --exit-on-error --no-owner --dbname="$RESTORE_SERVICE" /secure-backups/finai.dump`; verify migrations, tenant row counts, constraints, session policy and CRUD/copy with synthetic records before promotion. Revoke restored sessions before accepting traffic. Never restore over the active database. Run `bash scripts/restore-rehearsal.sh` locally for a disposable synthetic dump/restore check; this does not establish production RPO/RTO or full application disaster recovery.

Rollback: stop rollout and route back to the prior compatible image/frontend. Leave additive tables/data intact; do not reverse migrations or delete tasks. A pre-session application must remain local-only, so rolling back authentication closes public API access. Restore data only via the separate verified recovery process. Keep release SHA, image digest, migration status and backup identifiers in operator records.

Release smoke checks: exact deployment preview direct `/close/checklist` and refresh; static assets 200; unknown `/api/*` and `/auth/*` JSON, never SPA HTML; anonymous API 401; sign in via HTTPS and verify Secure/HttpOnly cookie; permitted entity list/copy and cross-tenant denial; missing CSRF 403; logout/revoke/expiry/membership removal deny access; liveness/readiness; request IDs without titles/passwords/tokens; scan generated frontend assets for secret values without printing matches. Verify rate limiting under deployed replicas, graceful SIGTERM drain, persistent data across backend restart, and backup restore on target infrastructure. Hosting credentials, TLS/database provisioning, target capacity and deployed verification must be checked on the actual target. Local tests do not establish those outcomes.

For this cloud machine only, the verified platform CA can be supplied at build time with `BUILDX_CONFIG=/workspace/.finai-buildx docker build --secret id=cloud_ca,src="$NODE_EXTRA_CA_CERTS" -t finai-backend:<release-sha> backend` from the repository root. The optional BuildKit mount is not retained in the image; no TLS or checksum bypass is used. Normal hosts with standard public trust use the plain build command.

For an existing authorized single-host Docker deployment, `compose.production.yaml` provides private PostgreSQL and a loopback-published API. Use a mode-0600 `/secure/finai.env` outside the checkout containing FINAI_IMAGE (tested image digest), POSTGRES_PASSWORD, DATABASE_URL (URL-encoded password, internal host db:5432, database finai), PUBLIC_ORIGIN, API_TRUSTED_HOST and API_PROXY_TOKEN. Do not print `docker compose config`, which expands secrets. Apply the host's existing TLS ingress to loopback port 3000; never expose that port directly. For a remote database use verified TLS and the provider's supported CA configuration. Exact release sequence, only after authorization:

```
docker compose --env-file /secure/finai.env -f backend/compose.production.yaml up -d --wait db
docker compose --env-file /secure/finai.env -f backend/compose.production.yaml run --rm api node node_modules/prisma/build/index.js migrate deploy
docker compose --env-file /secure/finai.env -f backend/compose.production.yaml up -d api
```

Use the same `run --rm api` prefix for administrative `node --import tsx scripts/accounts.mts ...` commands (interactive terminal required). Configure the Vercel server-only variables and public build flags before an authorized preview, run every deployed smoke check above, and publish only after those gates pass. Never run `down -v`. Validate the host storage/backups, ingress limits, private database topology and connection/Argon2 capacity before release; this file alone does not verify them.


## Imported receivables release

See `RECEIVABLES.md` for the ordered snapshot migration, owner-reviewed source import, readiness/smoke checks and rollback. Frontend flags: `VITE_RECEIVABLES_MODE=api`, `VITE_AUTH_MODE=session`, `VITE_API_BASE_URL=/api/v1`. Preserve checklist mode separately. FINAI_PUBLIC_ORIGIN is one exact frontend HTTPS origin; API_TRUSTED_HOST is a separate backend host setting, not a second line of that origin value. No target secrets, production import or deployment is performed by implementation tests.


FinAI Assistant adds two migrations (seven total). Read [ASSISTANT.md](ASSISTANT.md) for explicit provider/price/budget/privacy controls, approved ledger mapping, retention, evaluation and rollback gates. Keep disabled until approved configuration and staging verification.


Same-project Vercel mode is now implemented; see [frontend/docs/vercel.md](../frontend/docs/vercel.md). Listener-free startup and waitUntil retention preserve existing API/auth/lease semantics. Database/schema/accounts still need real provisioning; the build never migrates or seeds production. Existing remote proxy/Docker mode stays supported.
