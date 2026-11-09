# FinAI — Production Readiness TODO (Payables / Invoices)

Derived from `docs/AUDIT.md` (branch `chore/baseline-audit`, 2026-11-09) and
re-verified per capability in `docs/PRODUCTION_GAPS.md`
(branch `docs/production-gap-map`, 2026-11-09).
Evidence citations are `file:line` in this repository. Unticked items are gaps
found by the audit. Items marked *(partial)* have real groundwork already.

## Phase 0 Baseline

- [x] 0.1 Repo audit and baseline results documented
  — `docs/AUDIT.md` (this branch)
- [x] 0.2 CI runs lint, typecheck, test, build on every PR
  — `.github/workflows/checklist-release.yml:26-57` (backend typecheck/lint/build/test + frontend typecheck/lint/build), `:58-104` (browser suites), `.github/workflows/payables.yml:46-70` (invoice journeys). Note: `checklist-release.yml` triggers on all pushes/PRs; `payables.yml` is path-filtered. CI passes do not gate merges because no check is required — see 0.3.
- [ ] 0.3 main branch protected; PR required
  — **Verified missing (2026-11-09)**: GitHub API `GET /repos/connectiot-org/New-FInAI/branches/main/protection` returns 404 "Branch not protected" and `GET /repos/…/rulesets` returns `[]`; also stated in `AGENTS.md:16` ("no CODEOWNERS or branch protection is configured by these instructions")

## Phase 1 Foundation

- [ ] 1.1 Config and secrets per environment (dev, staging, prod) *(partial)*
  — `backend/.env.example` + validated config (`backend/src/config.ts:8-86`), Vercel hosting settings documented in `backend/RELEASE.md`, `frontend/docs/vercel.md`; **staging environment absent** (AUDIT A-07)
- [x] 1.2 Real database with migrations
  — `backend/prisma/schema.prisma` + 8 ordered additive migrations in `backend/prisma/migrations/` (202610190001 … 202611030001); migrations run in CI (`checklist-release.yml:32`)
- [ ] 1.3 Authentication with MFA and session expiry *(partial)*
  — session auth with Argon2id + 8 h expiry + logout exists (`backend/src/auth.ts:15-20,50-55,77-151`); **MFA absent** (AUDIT A-02)
- [ ] 1.4 Tenant isolation (tenant_id plus row-level security) *(partial)*
  — `organisation_id`/`entity_id` composite keys and scope-filtered queries on every table (`backend/prisma/schema.prisma:304-413`, `backend/src/payables/service.ts:397`); **PostgreSQL RLS not enabled** (AUDIT A-03)
- [x] 1.5 Roles and permissions enforced server-side
  — `ApGrant` (view/review/verify/approve/manage) checked in `backend/src/payables/service.ts`; submitter cannot approve own invoice (`backend/src/payables/domain.ts:180-185`); tests in `backend/test/payables-domain.test.ts`
- [x] 1.6 Money stored as integer minor units; single rounding policy
  — string minor units end-to-end (`backend/src/payables/domain.ts:11`), BigInt totals with half-up rounding (`domain.ts:131-171`), client formatting via BigInt (`frontend/src/features/payables/api.ts:141-144`)
- [x] 1.7 Server-side validation for all inputs
  — zod `strictObject` on every body/query/param (`backend/src/payables/domain.ts:14-102`, `backend/src/validation.ts`), content-type allowlist and upload limits in `backend/src/app.ts:341-447`
- [x] 1.8 Consistent error model and idempotency keys
  — `ApiError` codes + `sendError` (`backend/src/errors.ts`); `ApOperation` digest-based idempotency (`backend/src/payables/service.ts:121-127,596-656`); client distinguishes retryable rejections (`frontend/src/features/payables/api.ts:59-67`)
- [x] 1.9 Append-only audit log
  — `ApEvent` (per-action full snapshot, `backend/prisma/schema.prisma:380-392`) + request-level `ServerAudit` (`schema.prisma:176-191`); no update/delete code paths for either table

## Phase 2 Accounting core

- [ ] 2.1 Chart of accounts
  — accounts are free-text codes per line (`backend/src/payables/domain.ts:21-23`); no COA entity or validation against a master
- [ ] 2.2 Supplier master with bank-detail change control *(partial)*
  — `ApSupplier` exists with name/taxId/active/version (`backend/prisma/schema.prisma:316-328`); **no bank details, no dual-approval change control** (AUDIT A-13)
- [ ] 2.3 Double-entry journal engine (balanced entries enforced) *(partial)*
  — CSV export emits balanced Dr/Cr rows per line (`backend/src/payables/domain.ts:198-266`); **no journal store, no enforced invariant** (AUDIT A-05)
- [ ] 2.4 Period locking
  — no accounting period concept anywhere in `backend/prisma/schema.prisma`
- [x] 2.5 Duplicate invoice detection
  — DB unique `(organisation_id, entity_id, supplier_id, reference_key)` (`backend/prisma/schema.prisma:362`), NFKC-normalised reference key (`backend/src/payables/domain.ts:129-130`), pre-check with `DUPLICATE_REFERENCE` conflict (`backend/src/payables/service.ts:397-401`). *Note: reference-based only; no fuzzy/amount heuristic.*

## Phase 3 AP workflow

- [x] 3.1 Invoice CRUD with status state machine
  — states `review/verify/approve/approved/rejected` + correction loop (`frontend/src/features/payables/schemas.ts:63`, `backend/src/payables/domain.ts:84-102`, transitions in `service.ts`); optimistic locking via `version`/`revision`. *Note: no paid/voided states yet (follows from A-01).*
- [ ] 3.2 Secure attachments (upload, scan, preview) *(partial)*
  — PDF-only, ≤1 MB, digest, quarantined by default (`backend/src/app.ts:423-447`, `backend/prisma/schema.prisma:365-379`), CSP-sandboxed serving (`backend/src/payables/controller.ts:273`), preview UI (`frontend/src/features/payables/PdfPreview.tsx`); **ClamAV endpoint optional/unconfigured → documents remain quarantined in hosted prod until it is set** (AUDIT A-09)
- [x] 3.3 Approval workflow with segregation of duties
  — amount-threshold routing policy with verifier + up to two approvers (`backend/prisma/schema.prisma:329-340`, `backend/src/payables/domain.ts:172-197`), submitter-cannot-approve enforced server-side (`domain.ts:180-185`), reasons required for reject/challenge/correction (`domain.ts:98-102`)
- [ ] 3.4 List with server-side pagination, filters, sort, bulk actions *(partial)*
  — server-side pagination + per-state counts (`frontend/src/features/payables/schemas.ts:107-133`); **no free-text search, no arbitrary sort, no bulk actions**
- [ ] 3.5 Credit notes and adjustments
  — correction loop exists (reject → revise → resubmit); **no credit-note document type**
- [ ] 3.6 Notifications (email and in-app)
  — none; events are recorded but nobody is notified (`ApEvent` only)

## Phase 4 Cash out

- [ ] 4.1 Payments (full, partial, payment runs)
  — no payment model; invoice payment field is the literal `"unpaid"` (`frontend/src/features/payables/schemas.ts:104`)
- [ ] 4.2 Tax codes, withholding, multi-currency and FX
  — single GBP currency (`backend/src/payables/domain.ts:32`), single STANDARD 20% tax code (`domain.ts:24-25`), no withholding, no FX
- [ ] 4.3 Bank reconciliation
  — absent (`README.md:18` documents the boundary)
- [ ] 4.4 AP aging and exports (CSV, PDF) *(partial)*
  — CSV accounting export with formula-injection defence (`backend/src/payables/domain.ts:198-266`); **no aging report, no PDF report**

## Phase 5 Harden

- [ ] 5.1 Security headers, rate limiting, input sanitisation, CSRF *(partial)*
  — rate limiting ✔ (`backend/src/auth.ts:26-40`), input sanitisation ✔ (zod everywhere), CSRF ✔ (`auth.ts:140-144`); **document-level CSP/X-Frame-Options/HSTS/Referrer-Policy missing, `frontend/vercel.json` has no `headers` block** (AUDIT A-04)
- [x] 5.2 End-to-end browser tests in CI
  — invoice demo, payables UI, transport and full integration suites in CI (`.github/workflows/payables.yml:64-70`, `checklist-release.yml:58-104`); locally reproduced: 67 + 27 Playwright tests passing
- [ ] 5.3 Logging, error tracking, uptime monitoring, backups with a tested restore *(partial)*
  — structured JSON logs + request IDs ✔ (`backend/src/app.ts:234-254`), health endpoints ✔ (`app.ts:450-475`), containerised restore rehearsal in CI ✔ (`checklist-release.yml:120-123`, `backend/scripts/restore-rehearsal.sh`); **no external error tracking / uptime monitoring / alerting** (AUDIT A-10)
- [ ] 5.4 Performance tested at 50k invoices
  — untested; pagination exists (AUDIT A-14)
- [ ] 5.5 Privacy policy, terms, data retention
  — absent from the repository (AUDIT A-11)

## Phase 6 Differentiate

- [ ] 6.1 AI invoice extraction with confidence scores and human review *(groundwork only)*
  — an assistant that proposes invoice actions requiring explicit confirmation exists (`backend/src/payables/assistant.ts`, `contracts/invoice-assistant.schema.json`); **no OCR/extraction of uploaded documents**

---

### How to use this file

Tick an item only when its evidence citation points at merged code on `main`
(or a linked PR). Keep the *(partial)* marker until every clause of the item is
satisfied. Update `docs/AUDIT.md` findings (A-01 … A-14) when closing gaps.
