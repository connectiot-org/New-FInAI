# Supplier invoice approvals — implementation and verification

Date: 3 November 2026 (Asia/Dhaka). Starting base `36b2214f248f2582fab6bbde8861fae480bbd60e`, initially clean branch `work`; delivery branch `feat/supplier-invoice-approvals`. Git records the final implementation commit. No merge to main or production deployment is included.

The attached context.md supplied background and reference evidence; prompt.md supplied the implementation specification requested by the user. The later direct request explicitly authorized completing the product and pushing the repository. Scope is the complete manual-entry **internal supplier-invoice pilot**, with the exclusions below. It is not a customer sales-invoice product or a full Moss platform.

## Discovery and ownership

Roles were performed sequentially in the existing checkout: coordinator (`contracts/`, `context/`) → backend engineer (`backend/`) → frontend integrator (`frontend/`) → scoped review and corrections in the owning role. No parallel agents or worktrees. Acceptance was an authenticated persistent supplier/PDF/review/verification/two-step approval/export journey, exact money, revision/assignment enforcement, private transport, real database/HTTP/browser coverage and recovery evidence.

| Area | Source | Reuse/change | Control |
|---|---|---|---|
| Identity | backend auth/config/app | Reused database sessions, exact origin/host, CSRF and safe errors | Account, membership, entity and explicit AP grants rechecked in transactions |
| Business CRUD | workspace service/controller | Followed existing scoped CRUD/audit conventions | Global canWrite/import and admin status do not confer AP approval |
| Private UI | Workspace and SessionGate | Added lazy AP routes and one navigation link | Existing strict WorkspaceContext, demo store and marketing remain independent |
| Transport | proxy.ts, embedded.ts, app.ts | Exact raw PDF and private binary route exceptions | Ordinary JSON16KiB; PDF1MiB; auth before buffering; MIME/header allowlists |
| Persistence | Prisma schema and migrations | Added eight tenant-keyed AP tables | Additive migration, no ledger writes or resets |
| Reference | attached public Moss notes M1–M6 | Grouped Supplier/Documents/Accounting/Payment/Approval detail | Fresh Moss requests returned proxy403; no claim of unseen private-app pixel parity |

## Delivered behaviour

Contract1.0.0 is in `contracts/payables.md` and generated `payables.openapi.json`; generation/validation helpers and synthetic examples are committed. Custom cross-field validation remains authoritative in domain/service tests. Existing feature contracts and WorkspaceContext are unchanged. Migration `202611030001_payables` adds ApGrant, ApSupplier, ApPolicy, ApInvoice, ApDocument, ApEvent, ApOperation and ApExport.

Private routes:

- `/workspace/payables/invoices` and `/workspace/payables/invoices/:id`
- `/workspace/payables/suppliers`
- `/workspace/payables/export`
- `/workspace/payables/settings/approvals`
- `/workspace/payables/settings/access`

The feature includes supplier create/edit/active status; filtered/paged invoice queues and counts; manual fields and coding; original PDF upload, preview, download and rescan; optional assigned factual verification; one/two sequential approvals; reasoned corrections/challenge/rejection; version conflicts and unsaved-change protection; immutable history and balanced replay-safe CSV. The policy editor supports all ten ordered amount-threshold rules plus mandatory fallback, with separate draft save/publication and route preview. Admin access settings provision other existing members without self-granting financial authority.

GBP is explicit. Money uses integer minor-unit strings, quantity4dp and BigInt half-up line rounding. Declared document gross is retained separately and must match calculated totals before submission. Positive bills are capped at GBP10m and50 lines. Supported tax treatments are NONE or explicitly confirmed STANDARD20%; mixed/unsupported treatments are rejected. Synthetic account/tax/recoverability mappings are not jurisdictional approval. Exports balance expense/nonrecoverable-tax and recoverable-tax debits against supplier-payable credits, include supplier/reference/dates/revision/currency/coding snapshots, and escape spreadsheet formula cells. Export does not mean posted or paid.

Each action checks enabled Account, active Membership, EntityAccess and AP capability. Policy submission freezes its revision/rule/reason/assignees. Only the current assigned actor can verify/approve; no submitter self-approval or implicit admin bypass. Row/advisory locks, expectedVersion and per-actor operation digests protect concurrent edits/retries. Corrections block submission until metadata is saved; material edits/challenges start a new review revision and invalidate current approvals/export eligibility while retaining historical snapshots. Rejection is terminal. Audit failure rolls back transitions and events. Removing EntityAccess cascades AP grants while retaining invoice/document/history data. AP grant changes revoke the target member’s organisation sessions.

Original PDF bytes remain private PostgreSQL bytea, max1MiB and20 documents per invoice. Real ClamAV INSTREAM support checks signature freshness and records scan provenance; missing, stale, unreachable or inconclusive scanners fail closed to quarantine. Infected and encrypted documents remain blocked. No production scanner was provisioned. The exact synthetic allowlist works only under NODE_ENV=test and is visibly labelled synthetic. Protocol tests use a controlled server and do not establish malware-detection quality. PDF.js6.5.438 renders page content in a worker with bounded resources; the application does not execute PDF actions/JavaScript or load XFA. Private binary routes enforce authentication, no-store/nosniff and safe filenames.

Pilot bounds are500 suppliers/company,10000 filtered invoice matches with server pagination and complete filtered queue counts, and the latest500 visible activity events; full immutable history is retained in the database. No full-scale performance claim.

## Environment setup and resolved blocker

Prebuilt `binaries.prisma.sh` downloads still return proxy403. Instead, the exact official Prisma engine commit `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`, matching installed Prisma6.19.3, was built with Rust1.90 and Cargo --locked using ordinary allowed sources and verified TLS/checksums. Both generated engine identities were checked. `backend/scripts/build-local-prisma.sh` reproduces the process and checks the installed pin and clean source checkout; idempotent reuse passed. No source, engine binary or dependency cache from `/workspace/.finai-tools` is committed.

Source `/workspace/.finai-tools/prisma-env.sh` in this environment before backend and packaged-runtime commands. This native Linux development engine proves local execution, not RHEL hosting compatibility. Normal connected CI/hosting uses vendor engines. Local authorized PostgreSQL setup, all eight migrations and non-destructive synthetic seed passed. Saved environment setup/start instructions include the reproducible fallback; the environment settings draft still needs review/save/publication separately. Saved network domains are not applied policy changes. No network/TLS/checksum bypass was used.

## Fresh verification

All counts below are local runs with synthetic fixtures, not remote CI results or production traffic. No tests in these runs were skipped.

| Check | Result |
|---|---|
| Backend Prisma generate/schema validate/typecheck/lint/build | Passed |
| Full backend tests |77 passed: existing modules plus money/policy, real PostgreSQL AP workflow, permissions, concurrent approvals, challenge/reject/correction, quarantine, immutable replay, revocation/cascade and audit rollback |
| Frontend typecheck/lint/build | Passed |
| Existing frontend suites |114 passed: standalone51, workspace18, session1, workspace-production2, Assistant12, Assistant-production1, receivables-production1, public-chat22, packaged Vercel6 |
| New controlled AP UI |8 passed, including320/390/1440 containment, supplier editing, all-rule policy preservation and pending-CSRF identity change |
| New controlled transport |2 passed: actual proxy/embedded adapters with verified local TLS, raw PDF larger than16KiB, CSV and narrow MIME/size rules |
| New real application integration |6 passed: two multi-account scenarios each through remote, embedded and actual packaged backend |
| Application total |207 passing tests across the listed suites |
| Contract |All schemas compile;1 valid and4 invalid examples; generated OpenAPI retained |
| AP storage rehearsal |Passed: private document/export SHA256 and byte preservation, policy/route/history/grants, cross-entity FK denial |
| Full application restore rehearsal |Passed: actual AP service approval/export plus existing task/subscription/snapshot/Assistant state restored with all eight migrations |
| Dependency audits |Both full npm audits report0 vulnerabilities |
| Built-asset scans |Passed for demo/session/receivables/workspace/Assistant/public-chat/payables, including worker mjs; no available backend credential values or production localhost fallback |
| Screenshot QA |Actual signed-in desktop/mobile screenshots inspected at1440/390/320 under ignored frontend/artifacts/payables |

The real integration fixture creates four Argon2 accounts and two companies in an isolated database schema. It signs in through HTTPS/session/CSRF, creates a supplier/invoice, uploads a valid >20KiB PDF, corrects a gross mismatch, verifies actual PDF canvas pixels, performs factual verification and two approvals, downloads a balanced CSV, restarts the runtime and replays the same export. HTTP coverage includes duplicate/currency/cap/CSRF/assignment/concurrency/self-grant/foreign-resource checks, AP-grant session revocation and normal existing admin company-access removal. Fixtures and controlled tests never substitute for the live product API. Test schemas are cleaned up.

Reproduce using `backend/PAYABLES.md`. Backend and integration package builds must run sequentially because packaging performs a fresh backend npm ci. New `.github/workflows/payables.yml` runs the backend, contract, AP UI/transport/real journeys and storage recovery on relevant pushes/PRs; hosted CI execution is not yet verified locally.

## Release boundaries and follow-up

The requested manual-entry pilot is implemented and locally verified. Before real-company release, operators must configure target database/session/proxy bindings, trusted accounts/entity/AP grants, published finance-approved policy, a healthy private scanner with fresh signatures, jurisdiction-specific accounting/tax rules, encrypted backups, monitoring and a target restore rehearsal. Local native packaging is not certification of another hosting target, production scanner quality, availability, regulatory compliance or RPO/RTO.

OCR/email intake, credit notes, structured e-invoices, purchase/budget matching, automatic approval, advanced delegation/quorums, payment execution/settlement, ERP acknowledgements and regulated exchange remain the explicitly deferred parity work. No non-working provider controls or fabricated successes are exposed.

Recovery: revert application code compatibly while retaining additive AP tables/history; do not reset, down-v or reseed unknown databases. No real-company data, paid service, main merge or production deployment is part of this delivery.
