# FinAI — Production Gap Map (Payables / Invoices)

| | |
|---|---|
| **Document ID** | FINAI-GAP-001 |
| **Branch** | `docs/production-gap-map` (base: `chore/baseline-audit` @ `fb40ea5`, which includes `origin/main` @ `d16b0ef`) |
| **Date** | 2026-11-09 |
| **Task** | READ-ONLY capability verification from code; no application behaviour changed |
| **Method** | Static code inspection (file:line evidence below), runbook reading, GitHub REST API queries for branch protection/rulesets/CI runs. No production, hosting or database access. |
| **Context** | The real workflow is `/workspace/payables/invoices` (NestJS 11 + Prisma + PostgreSQL behind session auth); `/demo/*` is a labelled browser-only sandbox (`frontend/src/features/payables/development-store.ts:1`). All findings below are re-verified against current code, not carried over from any earlier demo-only checklist. |

Status values: **Present** (working implementation + evidence) · **Partial** (real groundwork, defined clauses missing) · **Missing** (no implementation) · **Cannot verify** (requires access this task does not have). Risk: S1 blocker for real use · S2 blocks GA · S3 medium · S4 low.

## Summary counts

| Status | Count |
|---|---|
| Present | 20 |
| Partial | 10 |
| Missing | 18 |
| Cannot verify | 1 |
| **Total capabilities** | **49** |

## A. Identity and security

| Area | Capability | Status | Evidence | Note | Risk |
|---|---|---|---|---|---|
| A | Session expiry | Present | `backend/src/auth.ts:133` (8 h), `:56-62` (expiry checked per request), `:145-151` (logout deletes row); reset revokes all sessions (`backend/RELEASE.md:34`) | Fixed 8 h lifetime, no refresh/rotation, no concurrent-session cap | S4 |
| A | MFA | Missing | `backend/src/auth.ts:77-99` (username+password only); `backend/RELEASE.md:34` "No signup, email recovery or paid identity provider" | Single-factor Argon2id only | **S2** |
| A | CSRF | Present | `backend/src/auth.ts:140-144` (double-submit digest, timing-safe), `backend/src/app.ts:482-484` (all mutations), `frontend/src/features/payables/api.ts:26-29` | Same-origin cookie + per-session token | — |
| A | Login rate limiting | Present | `backend/src/auth.ts:86-91` (30/IP/15 m, 10/account/15 m), `app.ts:484` (120 mutations/user/min), `app.ts:409-413` (10 uploads/15 m) | DB-backed, spans replicas (`RELEASE.md:34`) | — |
| A | Security headers / CSP | Partial | `backend/src/app.ts:240-241` (nosniff, no-store); sandbox CSP on downloads only: `backend/src/payables/controller.ts:273`, `frontend/api/proxy.ts:193`; no document-level CSP/X-Frame-Options/HSTS/Referrer-Policy, `frontend/vercel.json` has no `headers` block | App HTML itself lacks header hardening | S3 |
| A | Account provisioning | Present | `backend/scripts/accounts.mts` create/reset/revoke (`backend/RELEASE.md:26-32`); admin UI `/workspace/payables/settings/access` (`backend/PAYABLES.md:45`); explicit trusted process, no public signup | Administrative, terminal-prompt based | — |
| A | Per-company isolation | Partial | Application-level: composite keys on every table (`backend/prisma/schema.prisma:304-413`), scope-filtered queries (`backend/src/payables/service.ts:397`), cross-tenant denial tested (`context/invoice-workspace-refresh.md:118`). No PostgreSQL RLS: 0 `CREATE POLICY` in `backend/prisma/migrations/` | Isolation is query-enforced only; RLS would be defence-in-depth | S3 |
| A | Role/grant enforcement (server) | Present | `ApGrant` view/review/verify/approve/manage (`schema.prisma:304-315`); every mutation rechecks grants in-transaction (`backend/PAYABLES.md:71`) | `canWrite`/admin flag do not grant approval authority (`PAYABLES.md:43`) | — |
| A | Append-only audit log | Present | `ApEvent` full snapshots (`schema.prisma:380-392`), `ServerAudit` request-level (`:176-191`); no update/delete code paths; audit failure rolls back business write (`PAYABLES.md:71`) | Two-level, transactional | — |
| A | Secrets handling | Present | Only `backend/.env.example` tracked; `.env` ignored in all three .gitignore files; no secret pattern in history (AUDIT §5); VITE_ flags non-secret (`RELEASE.md:3`); CI asset secret scan (`docs/repository-guide.md:653`) | Hosting secrets via secret manager only (`RELEASE.md:7`) | — |

## B. Money and data integrity

| Area | Capability | Status | Evidence | Note | Risk |
|---|---|---|---|---|---|
| B | Integer minor units | Present | `backend/src/payables/domain.ts:11` (`/^(0|[1-9]\d{0,9})$/`), `frontend/src/features/payables/schemas.ts:24` (`unitMinor` string), BigInt totals (`domain.ts:138-156`) | String-encoded pence end-to-end, no floats | — |
| B | Rounding policy | Present | `backend/src/payables/domain.ts:150-151` (per-line half-up `(x + 5000n) / 10000n`) | Single documented rule (`PAYABLES.md:67`) | — |
| B | Multi-currency | Missing | `backend/src/payables/domain.ts:32` (`z.literal("GBP")`), `PAYABLES.md:67` "GBP only" | No rate handling, no FX, no revaluation | **S2** |
| B | VAT/tax lines | Partial | `domain.ts:24-25` (NONE / STANDARD 2000 bps only), `:132-137` (mixed treatments blocked), recoverable flag per line | One treatment per invoice; no jurisdiction-specific effective-dated rules (`PAYABLES.md:67`) | **S2** |
| B | Credit notes | Missing | No credit-note code (keyword scan negative); `PAYABLES.md:81` deferred | Correction loop exists but no credit-note document type | S3 |
| B | Duplicate detection | Present | Unique `(organisation, entity, supplier, referenceKey)` (`schema.prisma:362`); NFKC/trim/lowercase key (`domain.ts:129-130`); `DUPLICATE_REFERENCE` pre-check (`service.ts:397-401`) | Exact-reference only, no fuzzy/amount heuristic (`PAYABLES.md:71` "no fuzzy silent discard") | — |
| B | Optimistic locking / versioning | Present | `version`/`revision` (`schema.prisma:349-350`), `expectedVersion` required on patches (`domain.ts:40-42`) | Conflicts rejected, not silently overwritten | — |
| B | Idempotency keys | Present | `ApOperation` digest table (`schema.prisma:393-400`), `once()` replay (`service.ts:121-127`), stable retry IDs across uncertain outcomes (`docs/architecture.md:46`) | Applies to create/approve/export mutations | — |

## C. Workflow

| Area | Capability | Status | Evidence | Note | Risk |
|---|---|---|---|---|---|
| C | Status state machine | Present | States `review/verify/approve/approved/rejected` (`frontend/src/features/payables/schemas.ts:63`, `backend/src/payables/domain.ts:84-102`); server-side transitions; challenge reopens review, rejection terminal, correction blocks resubmission (`PAYABLES.md:69`) | No paid/voided states (follows from payments gap) | — |
| C | Sequential approvals | Present | `service.ts:742-753` (`route.step` advances; done when `step === approverIds.length`), 1–2 approvers (`domain.ts:47`), only current assignee decides (`service.ts:511,526`) | Required verification precedes approval (`PAYABLES.md:69`) | — |
| C | Segregation of duties | Present | Submitter cannot be routed approver: `domain.ts:180-185` (`ROUTING_BLOCKED`); `PAYABLES.md:45` "no submitter may approve their own submitted invoice" | Enforced server-side at routing and decision time | — |
| C | Delegation / escalation | Missing | No delegate/escalate code (keyword scan negative); `PAYABLES.md:81` "advanced delegations/quorums … explicitly deferred" | Assignee change requires manual reassignment path | S3 |
| C | Notifications | Missing | No mailer/notification code (keyword scan: only demo UI text in `frontend/src/demo/seed.ts`); events recorded (`ApEvent`) but not delivered | No email or in-app delivery | S3 |
| C | Supplier master | Partial | `ApSupplier` name/taxId/active/version (`schema.prisma:316-328`); 500 suppliers/company cap (`PAYABLES.md:71`) | No addresses, no payment terms, no bank details | S3 |
| C | Bank-detail change control | Missing | No bank-detail fields exist (follows from above) | Not attackable today (no payments), but blocks Phase 4 and is a classic fraud vector | S3 |
| C | PO matching | Missing | No purchase-order/goods-receipt code (keyword scan negative); `PAYABLES.md:81` deferred | — | S3 |
| C | Attachment scanning | Partial | ClamAV INSTREAM adapter with 10 s deadline, stale-signature refusal, concurrency caps (`backend/src/payables/scanner.ts`, `PAYABLES.md:57-63`); fail-closed default `quarantined` (`schema.prisma:374`); encrypted PDFs quarantined (`PAYABLES.md:59`) | **No scanner provisioned in any hosted environment** (`PAYABLES.md:57`, `RELEASE.md:22`) — operator blocker; without it real PDFs never become reviewable | **S2** |

## D. Accounting

| Area | Capability | Status | Evidence | Note | Risk |
|---|---|---|---|---|---|
| D | Immutable export | Present | `ApExport` unique per approved revision (`schema.prisma:412`); replay returns the same export (`service.ts:954-955`); historical exports remain downloadable, visibly superseded (`PAYABLES.md:73`) | Bytea + SHA-256 digest stored | — |
| D | Balanced entries | Partial | CSV export emits balanced Dr/Cr rows per line incl. recoverable tax split (`domain.ts:198-266`) | Rows are balanced but nothing is persisted as a journal and no DB-enforced debits=credits invariant exists (AUDIT A-05) | S3 |
| D | Posting to an external ledger | Missing | `README.md:18` "does not … post to an external ledger"; `PAYABLES.md:73` "Exported means prepared for accounting; it does not mean posted or paid" | CSV hand-off only | **S2** |
| D | Period locking | Missing | No accounting-period concept (keyword scan negative) | Backdated posting unrestricted today | S3 |
| D | Payments | Missing | `payment` is literal `"unpaid"` (`frontend/src/features/payables/schemas.ts:104`); `PAYABLES.md:81` deferred | The defining scope gap for production AP | **S2** |
| D | Bank reconciliation | Missing | No code (keyword scan negative); assistant fact text only (`backend/src/assistant/facts.ts:611`) | — | S3 |
| D | AP aging and reports | Missing | Register shows per-state queue counts only (`schemas.ts:107-118`); assistant explicitly "not overdue aging" (`facts.ts:320`) | No aging buckets, supplier statements or PDF reports | S3 |

## E. Ingestion

| Area | Capability | Status | Evidence | Note | Risk |
|---|---|---|---|---|---|
| E | OCR | Missing | No OCR/extraction code (keyword scan negative); `PAYABLES.md:81` "OCR/email intake … explicitly deferred"; no fabricated controls (`context/invoice-workspace-refresh.md:21`) | Assistant proposes actions from entered data, not from documents | S3 |
| E | Email-to-invoice | Missing | Same as above | — | S4 |

## F. Operations

| Area | Capability | Status | Evidence | Note | Risk |
|---|---|---|---|---|---|
| F | CI workflows | Present | `.github/workflows/checklist-release.yml` (all pushes/PRs: install, repo guardrails, backend db/typecheck/lint/build/test/audit, Python+Redocly contracts, frontend typecheck/lint/build, ~20 browser suites, asset scan, Docker build, restore rehearsal) and `payables.yml` (path-filtered invoice journeys, Vercel integration, storage check) | Comprehensive matrix; historical matrix record: 311 automated checks passing (`context/invoice-workspace-refresh.md:91`) | — |
| F | Branch protection / required checks | **Missing (verified)** | GitHub API `GET /repos/…/branches/main/protection` → 404 "Branch not protected" (2026-11-09); `GET /repos/…/rulesets` → `[]`; `AGENTS.md:16` "no CODEOWNERS or branch protection is configured by these instructions" | CI runs but nothing blocks a direct push to `main` | S3 |
| F | Migration process | Present | 8 ordered additive migrations (`backend/prisma/migrations/`); explicit `migrate deploy` runbook (`RELEASE.md:24`, `PAYABLES.md:24`); never auto-migrates on startup; migrations executed in CI (`checklist-release.yml:32`) | Altering applied migrations is prohibited (`docs/architecture.md:31`) | — |
| F | Backup / PITR on the real managed database | **Cannot verify** | Runbook exists: encrypted off-host `pg_dump`/`pg_restore`, rehearsal script in CI on synthetic data (`RELEASE.md:36`, `checklist-release.yml:120-123`) | CI proves the process on synthetic data only; no evidence of an actual managed-DB backup schedule, RPO/RTO or tested production restore — "does not establish production RPO/RTO" (`RELEASE.md:36`) | **S2** |
| F | Error tracking and logging | Partial | Structured JSON request logs + `X-Request-Id` (`backend/src/app.ts:234-254`); generic login errors (`auth.ts:23`) | No external error tracking, metrics, alerting or uptime monitoring | S3 |
| F | Health endpoint | Present | `/health/live` and `/health/ready` with real DB checks (`backend/src/app.ts:450-475`) | Readiness probes every core table | — |
| F | Load test | Missing | None in repo; register bounded/paginated with filtered counts up to 10 000 matches (`PAYABLES.md:71`) | No 50 k-invoice performance evidence | S3 |
| F | Docker build | Present | `backend/Dockerfile`; image built in CI (`checklist-release.yml:122`) | One historical environment saw a proxy-blocked Prisma engine download (`context/invoice-workspace-refresh.md:82`); CI on GitHub runners passes | — |
| F | Hosted smoke test | Partial | Release smoke checklist documented and detailed (`RELEASE.md:40`: anonymous 401, CSRF 403, cookie flags, cross-tenant denial, readiness, SIGTERM drain…) | Manual operator checklist only — no automated post-deploy smoke; the deployed `*.vercel.app` origin was unreachable from the review environment (`context/invoice-workspace-refresh.md:83`), so hosted state is unobserved | **S2** |

## G. Compliance

| Area | Capability | Status | Evidence | Note | Risk |
|---|---|---|---|---|---|
| G | Privacy policy | Missing | Absent from repo (no policy docs in `contracts/`, `docs/`, `context/`) | Required before selling to businesses | S3 |
| G | Terms | Missing | Same | — | S3 |
| G | Data retention | Partial | Assistant conversations/turns expire after 30/90 days (`backend/src/assistant/service.ts:317,375`); expired Session/RateLimit cleanup scheduled (`RELEASE.md:34`) | No retention policy for invoices, audit events or tenant offboarding | S3 |
| G | Deletion process | Partial | `AssistantDeletion` receipts + atomic retention purge (`backend/prisma/schema.prisma:290-301`, assistant test "retention purges dependent chat turns/preferences atomically") | No tenant-wide or data-subject deletion workflow | S3 |

## Blockers requiring a human / operator

1. **Scanner provisioning** — configure a reachable, signature-current private ClamAV (`AP_CLAMD_HOST`) on the hosting network; until then every real PDF stays quarantined and unreviewable (`PAYABLES.md:57,63`, `RELEASE.md:22`).
2. **Backup / restore on the real managed database** — schedule encrypted off-host backups and rehearse a restore on target infrastructure; local rehearsal does not establish RPO/RTO (`RELEASE.md:36`).
3. **Hosted end-to-end smoke test** — execute the `RELEASE.md:40` checklist against the deployed commit (origin unreachable from this environment).
4. **Branch protection** — an admin must protect `main` and mark CI as required (verified unprotected via API).
5. **Secrets / hosting configuration** — `API_PROXY_TOKEN`, database binding, public origins and any Assistant provider keys are hosting settings this task deliberately did not touch (`RELEASE.md:7-20`).

## Recommended next 5 work items

| # | Item | Size | Why |
|---|---|---|---|
| 1 | Protect `main` + require the two CI workflows | S | Cheapest highest-leverage process fix; verified missing today |
| 2 | Add security `headers` block to `frontend/vercel.json` (CSP, X-Frame-Options/frame-ancestors, HSTS, Referrer-Policy) | S | Closes A-header gap; config-only |
| 3 | Provision ClamAV on hosting + verify a real PDF journey end-to-end | M | Unblocks the entire document half of the product |
| 4 | MFA (TOTP or WebAuthn) on `Account`/login flow | M | Single-factor auth is the top identity gap for real companies |
| 5 | Payment records + journal store with DB-enforced balanced entries (schema + service + tests, additive migration) | L | The defining gap between "approval pilot" and production AP; foundation for reconciliation |

## Method limits

- No production/hosting/database access was used; hosted deployment state of `https://new-f-in-ai.vercel.app` is unobserved (historical review also could not reach it: `context/invoice-workspace-refresh.md:83`).
- Backend `npm test` requires Docker Compose PostgreSQL; in this sandbox 63/71 tests fail on DB connectivity only — CI executes the full suite against Docker (`.github/workflows/checklist-release.yml:26-38`).
- Branch protection was verified via GitHub REST API (read-only) on 2026-11-09; token scopes did not permit write actions and none were attempted.
- Evidence line numbers refer to commit `fb40ea5`; application source is identical to `origin/main` @ `d16b0ef` (branch adds docs only).
