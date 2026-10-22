# Ordered backlog and gates

> Historical gate plan. Current architecture/evidence: [architecture.md](architecture.md), [production-review.md](production-review.md). Self-hosted session identity is implemented; target deployment/recovery/capacity verification remains required. The product exposes implemented live tools, with the separately authorized free-model text chat extension described in openrouter.md.

Status: A–C are complete for the local feature; D and later remain planned. Every ticket records role, edit paths, dependencies, test evidence and done criteria. Broader Rillet parity is a separate programme, not the first release promise.

| ID / gate | Owner and allowed paths | Dependencies | Evidence and done criteria |
| --- | --- | --- | --- |
| A1 source/context/contracts | Coordinator: `context/`, `contracts/`, agent instructions | Current checkout and Prompt 01 | Source inventory, diagrams, consistent boundaries, valid OpenAPI/examples; disclose missing Prompt 02 |
| A2 reconcile first-slice requirements | Coordinator: same paths | Actual Prompt 02 or explicit acceptance of proposal | Resolve routes/fields/operations/error/auth/version semantics; update provisional version and examples; no application edits |
| B1 server and persistence foundation | Backend: `backend/` | A2, implementation authorization | Pinned NestJS/Prisma/PostgreSQL, own lockfile, Docker/local commands, migration and isolated seed, readiness checks; clean DB migrates and second migration run has no unintended change |
| B2 checklist service/API | Backend: `backend/` | B1, shared contract | GET/POST/PATCH/DELETE and /entities match schema; safe errors; validation; transactional create/cap/idempotency and versioned deletion; actual PostgreSQL restart/reload persistence and summary tests pass |
| B3 isolation and identity guards | Backend: `backend/` | B2 | Two tenants and same-tenant restricted entity fixtures; foreign IDs and scopes, spoofed role/tenant/body fields, missing auth, read-only membership, version races, DB outage, production-local-mode rejection tested; failures leave data unchanged |
| C1 browser adapter and checklist page | Frontend: `frontend/` | Gate B passing; frozen contract/types/fixtures/curl handoff | Separate `/close/checklist`, explicit entity/month, list/create/toggle/reopen; typed response validation, visible errors and 409 resolution; no demo-state API adapter reuse |
| C2 browser integration evidence | Frontend: `frontend/` | C1 and running isolated API/DB | Real API create/toggle/reload; entity/month isolation, summaries, loading/empty/error/503/401/403/409, malformed response, network failure; no fallback fixtures; existing 33 tests/build/lint/typecheck stay passing |
| D1 verified public identity | Backend implementation; coordinator for decisions/contracts; frontend for token adapter, sequential roles | B/C, provider and permission decisions | OIDC issuer/audience/signature/expiry and membership tests, no demo authorization, local identity cannot start in production; security review resolves findings |
| D2 deployment/recovery | Backend: `backend/` infra/runbooks; coordinator: context status | D1, hosting/region/secrets/operator decisions | Private DB/TLS, migration release job, ingress/CORS/CSRF decision, bounded redacted logging, readiness, backups and measured restore; RPO/RTO targets validated or revised |
| D3 public live enablement | Reviewer: scoped evidence; designated operator deploys separately | D1/D2 passing, deployment authorization | Proven deployment SHA, production identity and isolation smoke, monitoring and rollback/recovery evidence; only then enable public checklist |
| E finance kernel | Backend after coordinator/finance specification | Independent finance-owner approval, D security foundation | Approved exact currency/rounding, balanced atomic posting, immutable correction and period-control fixtures; no inferred demo accounting policy |
| F subledgers/reports/banking | Separate later domain tickets | E and domain-specific approvals | Idempotent source ingestion, subledger/ledger/report traceability, reconciliation and real provider consent tests |
| G integrations/AI proposals | Separate later domain tickets | Verified authorization, deterministic domain services | Scoped/revocable integrations, safe job retries, human-approved AI proposals, deterministic validation; no direct AI ledger posting |

Gate A is reconciled with Prompt 02 and passed. Gate B requires actual DB-backed implementation and isolation evidence. Gate C requires real browser integration. Gate D requires security, identity, recovery and deployment evidence before public live enablement. None are implied by the frontend demo tests.

## Current handoff

Prompt 02 was supplied and completed sequentially. A1/A2/B1/B2/B3/C1/C2 are complete with evidence in progress.md and review.md. The earlier provisional nested routes, pagination and event-table design are superseded by contract 1.0.0. Exact setup/run/check commands are in backend/README.md and frontend/docs/checklist.md. Read them and directory instructions before starting another task.

Next implementation milestone is D1 only when explicitly requested: choose and integrate verified production identity/membership lifecycle while preserving local fail-closed controls. D2/D3 require hosting/security/recovery evidence and deployment authorization. No real financial implementation should start without finance-owner-approved specifications.
