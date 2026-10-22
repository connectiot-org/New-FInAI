# Invoice duplicate checker — implementation scope

Base: 3011b0cfb9ad9c0e13c8f49208a63e10c6a5c8c5. User requested inspection and one small useful feature. Work uses sequential coordinator (`context/`, `contracts/`), backend (`backend/`), frontend (`frontend/`) and reviewer (this report and CI integration) roles. No parallel agents or worktrees.

## Accepted contract delta

Add `contracts/invoice-duplicates.openapi.yaml` version 1.0.0, POST `/api/v1/invoice-duplicate-checks`, and UI `/tools/invoice-duplicates`. Existing checklist 1.1.0 and subscription 1.0.0 contracts remain compatible. Consumers: new typed frontend adapter, new NestJS controller/service, existing same-origin proxy with a larger body limit only on this exact route. Existing routes retain their 16 KiB limit.

The checker accepts one UTF-8 CSV (optional BOM), at most 128 KiB and 500 data records, for one authorized entity. Required headers, exactly once in any order: `supplier_id,supplier_name,invoice_number,invoice_date,amount,currency`. Comma separator, LF/CRLF/CR, double-quoted fields and doubled-quote escaping are supported. Empty records are ignored; whitespace-only or missing fields are invalid. The whole file is rejected if any record is invalid. No partial success. Unknown headers, malformed quotes, unequal widths, control characters in values, non-UTF-8 input and invalid calendar dates are rejected. Header/value outer whitespace is trimmed. Names/references use 1–200 Unicode characters. Amount is a non-negative exact decimal string (1–12 integer digits, optional one/two fractional digits), normalized to two fractional digits without floating-point arithmetic; currency is three uppercase letters. No currency totals or conversion.

Matching uses the same selected entity, exact trimmed supplier ID (case-sensitive, preserving leading zeros), and trimmed invoice number converted with JavaScript Unicode uppercase. Internal spaces, punctuation and leading zeros in references remain significant. All records in a repeated-key group are flagged, including the first. Amount, currency, date and supplier display name do not influence the match: discrepancies remain visible for manual review. Group numbers follow first appearance, starting at 1. Record numbers start at 2 and count logical CSV records, including ignored empty records, rather than physical lines inside quotes.

No invoice/document is created, changed, deleted, paid or posted. This is a within-file possible-duplicate check, not comparison against stored invoices or proof of duplicate payment. CSV and results remain transient in request/browser memory; no new database table, raw-file storage, history, analytics payloads or localStorage. Refresh, file change, entity change, clear, sign-out and leaving the page discard the result. Users can download a synthetic template and a spreadsheet-safe quoted CSV report. Formula-like text cells are prefixed with an apostrophe on export, which may visibly change their representation. CSV transport still uses existing authentication, CSRF, request IDs, no-store responses, production host/proxy checks and shared rate limits. Access to the selected entity is checked on every check; read permission suffices because no records are saved.

## Acceptance and handoff

- Strict OpenAPI request/result/error schemas; response adapter checks scope, record order, group memberships and computed summary, not just JSON shape.
- Bounded parsing; file validation errors name the record/field without echoing uploaded values. Auth/entity checks precede CSV parsing in the service. No new paid API or dependency.
- Backend parser/HTTP tests cover valid quoted CSV, duplicate rules, boundaries, malformed uploads, unchanged database, auth/entity isolation and safe errors. Existing DB tests remain enabled.
- Browser tests cover real API check/filter/export, no matches, validation/errors/retry, stale scope/file responses, reset, mobile/keyboard and no demo-storage changes. Existing regression suites remain enabled.
- Run both applications' typecheck/lint/build, relevant backend/browser suites, contract validation, diff review and audit where the environment permits. Record actual results and blockers below; do not reuse historical pass counts as current evidence.
- Code is reviewable on a feature branch. No merge or public deployment. Existing production infrastructure/authentication/backup gates in `backend/RELEASE.md` still apply.

## Verification

Local verification completed before draft review:

- Both applications: frozen offline installs, typecheck, lint and production build passed. Backend Prisma client generated successfully. New endpoint is registered without schema changes.
- Backend `npm test`: **23 passed, zero skipped**, including 17 existing tests, five CSV parser tests and one new real PostgreSQL/HTTP integration test. Existing production-session test additionally verifies checker CSRF denial/success. New HTTP coverage checks read-only access, inaccessible entities, inactive membership, repeated transient checks, strict allowlists and separate transport limits. Counts of existing feature rows remain unchanged.
- All three Python contract validators passed: existing 23 checklist examples, five subscription examples, and new request/result examples plus nine invalid schemas. New OpenAPI description passed pinned Redocly 2.8.0 minimal lint.
- Both full npm audits: zero known vulnerabilities. No application dependency or lockfile changes. `git diff --check` passed.
- New four-test browser suite was attempted but **all four were blocked before UI assertions**: this workspace forbids the Unix socket Chrome creates at startup (`process_singleton_posix.cc`, operation not permitted). Existing browser suites and the expanded HTTPS session upload test have not passed in this workspace. They remain enabled in CI. No browser pass count is claimed locally.
- Local PostgreSQL 16.15 executed real migrations/transactions in a disposable schema. Because this environment cannot switch Unix users, only that disposable test server used an effective-UID/file-owner compatibility shim, with TCP loopback and Unix sockets disabled. The shim, database, downloaded binaries and local configuration are outside Git and are not application/deployment code. This is not operating-system/container security verification.
- GitHub CI is configured to run the existing suites plus the new checker and expanded HTTPS proxy/session journey. CI outcome is pending at this checkpoint.
- No Docker build or new restore rehearsal ran locally (Docker is unavailable; this feature adds no database schema). Existing CI still runs both.

Live inspection: the marketing homepage and `/tools/subscriptions` render. The latter displays **“API proxy is not configured.”** Its authorized entity list therefore cannot load. This is a current deployed configuration blocker, not evidence of a working authenticated SaaS backend. No live customer data was accessed or changed. Fixing production proxy/hosting/secrets is outside this branch and requires the operator's actual configuration.

Self-review covers the full scoped diff and new files; no independent reviewer is claimed. Original financial/close/demo source and storage are preserved. Browser test servers now bind explicit loopback rather than all interfaces, also avoiding the workspace's forbidden network-interface enumeration. No test assertions were removed or bypassed. Review/merge/deployment and target operational verification remain separate gates.
