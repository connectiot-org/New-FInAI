# FinAI — Hosted release checklist (Payables / Invoices)

| | |
|---|---|
| **Document ID** | FINAI-RLS-002 |
| **Branch** | `ci/release-gate` (base: `docs/production-gap-map` @ `88e7a7b`) |
| **Date** | 2026-11-11 |
| **Purpose** | Ordered operator checklist to prove a hosted deployment of the reviewed commit works, including the automated hosted smoke (`npm run smoke:hosted`), before opening a release to real companies |

This checklist **links to** the authoritative runbooks instead of duplicating them:
deployment modes and environment settings → [backend/RELEASE.md](../backend/RELEASE.md);
same-project Vercel build, database binding and runtime behaviour → [frontend/docs/vercel.md](../frontend/docs/vercel.md);
verified capability gaps → [docs/PRODUCTION_GAPS.md](PRODUCTION_GAPS.md);
CI coverage → [docs/CI_COVERAGE.md](CI_COVERAGE.md).

Roles: **Agent** = a repository automation session with this checkout (no hosting credentials).
**Operator** = a human/administrator with Vercel/Neon (or hosting) account access, secret manager and database authority.
Anything marked Operator cannot be performed by the agent and must not be attempted with borrowed credentials.

## 0. Preconditions (before starting a release)

- [ ] The target commit is **merged to `main`** after an approved PR (Agent verifies; Operator merges)
- [ ] Branch protection is configured on `main` with the required checks from `docs/CI_COVERAGE.md` §4 (Operator — verified missing in `docs/PRODUCTION_GAPS.md` F)
- [ ] A dedicated **smoke company** exists: one organisation + entity + non-privileged account with AP `view` only (plus `review` for write smoke), never a real company (Operator; provisioning per `backend/RELEASE.md` "Administrative account operations")
- [ ] SMOKE credentials recorded in the secret manager, never in the repository (Operator)
- [ ] Rollback owner and communication channel identified (Operator)

## 1. Before deploy — CI green, migrations reviewed, backup taken

- [ ] **CI green on the exact merge commit** — all seven `Checklist release checks` jobs plus `Supplier invoice product checks` (Agent can verify via the Actions UI/API; see `docs/CI_COVERAGE.md` §4 for job names)
- [ ] **Migrations reviewed** — diff `backend/prisma/migrations/` since the last release; confirm additive only, no destructive ALTERs; run `npm run test` in `backend/` against the local database (Agent)
- [ ] **Backup taken and verified** on the real managed database: `pg_dump` per the [backup runbook](../backend/RELEASE.md#backups) (restricted service account, encrypted, off-host), plus a rehearsed `pg_restore` into an isolated database (Operator; a local `restore-rehearsal.sh` pass is Agent-verifiable but does not establish production RPO/RTO)
- [ ] **Secrets present in hosting** for the selected mode (same-project: `DATABASE_URL`, `FINAI_PUBLIC_ORIGIN`; remote proxy: `FINAI_BACKEND_ORIGIN`, `FINAI_PROXY_TOKEN`, backend `API_PROXY_TOKEN`; scanner: `AP_CLAMD_HOST`/`AP_CLAMD_PORT`) (Operator)
- [ ] **Scanner reachable** with current signatures over the private network — otherwise real PDFs stay quarantined and unreviewable (Operator; see `backend/PAYABLES.md` "documents and scanning")
- [ ] Record the release SHA, image digest, migration status and backup identifier (Operator, per release runbook)

## 2. Deploy

- [ ] Apply migrations once per release with the same image (`node node_modules/prisma/build/index.js migrate deploy`) — never auto-migrated at startup; see [frontend/docs/vercel.md §Database initialization](../frontend/docs/vercel.md#database-initialization-and-identity) and the exact sequences in [backend/RELEASE.md](../backend/RELEASE.md)
- [ ] Deploy the reviewed commit to the hosting (Operator — Vercel or remote Docker per the runbooks; the agent never deploys)
- [ ] Verify the deployment is the exact release SHA (Operator, hosting UI)
- [ ] **Never** run local seed, signup flows or demo identity against the production database (both roles)

## 3. Post-deploy — automated smoke, then one manual journey

- [ ] **Run the automated hosted smoke** (read-only by default) from any machine with network access (Agent or Operator):

  ```sh
  cd frontend
  SMOKE_BASE_URL=https://<deployed-origin> \
  SMOKE_API_URL=https://<api-origin-if-separate> \
  npm run smoke:hosted
  ```

  It checks: the labelled sample route; the workspace route exposes no company data without a session; the API rejects anonymous invoice lists with 401/403; health endpoints; security response headers on the document and API (reported present/missing); and — when `SMOKE_EMAIL`/`SMOKE_PASSWORD`/`SMOKE_ORGANISATION_ID` of the smoke account are provided — sign-in, cookie flags, CSRF enforcement, entity-scoped invoice listing, cross-entity denial and sign-out. All output is redacted; exit code is non-zero on any FAIL.
- [ ] **Write smoke (optional, dedicated smoke company only)**: rerun with `SMOKE_WRITE=1`; it creates one draft invoice with a unique reference, reads it back and stops — never approves, exports or deletes (Agent or Operator)
- [ ] **Manual spot check of one invoice journey** (Operator, in a browser): sign in over HTTPS → create one draft invoice in the smoke company → attach a sample PDF → verify → sequential approvals by a second account (if configured) → export CSV → sign out and confirm access is gone
- [ ] **Manual security spot checks** from [backend/RELEASE.md §Release smoke checks](../backend/RELEASE.md): unknown `/api/*` returns JSON (never SPA HTML); missing CSRF token on a mutation returns 403; cross-tenant entity id is refused; request IDs appear without titles/passwords/tokens
- [ ] Scan the generated frontend assets for secret values without printing matches (`node scripts/check-assets.ts` against the deployed asset set, or locally built equivalent) (Agent)

## 4. Rollback (only if a post-deploy check fails)

- [ ] Stop the rollout and route back to the prior compatible image/frontend (Operator — the runbook's rollback section applies: leave additive tables/data intact, never reverse migrations, never `down -v`)
- [ ] Confirm the smoke suite against the restored origin (Agent)
- [ ] Restore data only via the separate verified recovery process, never over the active database (Operator)
- [ ] Record what failed, evidence and the decision (Operator)

## 5. Agents can vs operators must

| Step | Agent can do | Operator must do |
|---|---|---|
| CI verification, migration diff review, local suites | Yes | — |
| Smoke script execution and interpretation (read-only + `SMOKE_WRITE=1` against the smoke company) | Yes (given network access) | — |
| Asset secret scan | Yes | — |
| Merge PRs, push branches | Yes (never `main` directly) | — |
| Branch protection, required checks | No (admin only) | Yes |
| Vercel/Neon/hosting deploys, previews, domains | No | Yes |
| Secrets, `API_PROXY_TOKEN`, database binding, public origins | No | Yes |
| Account/AP grant provisioning for real companies | No | Yes |
| ClamAV scanner provisioning and signature maintenance | No | Yes |
| Backups, PITR, restore on target infrastructure | No | Yes |
| Real-company go/no-go acceptance | No | Yes |
