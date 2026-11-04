# FinAI backend

For architecture, module boundaries and future products, see [the development guide](../docs/architecture.md).

NestJS 11, TypeScript, Prisma 6.19.3 and PostgreSQL. The API implements shared identity/session controls, monthly checklist tasks, subscription records, immutable receivables/ledger imports, workspace administration, grounded FinAI conversations and supplier-invoice approval/export. The original frontend Northstar accounting/banking sample remains separate.

Read the [repository guide](../docs/repository-guide.md#backend-files) for each source/configuration/test file and the [root README](../README.md) for the application boundaries. Install dependencies independently from the frontend.

## Local setup

Use Node 24/npm 11 and a running Docker Compose daemon. From this directory:

```sh
npm ci --no-audit --no-fund
npm run db:init
npm run db:up
npm run generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

`db:init` creates an ignored mode-0600 local `.env` with random database authentication and preserves existing configuration. PostgreSQL binds to loopback port 55432 and uses a persistent Docker volume. `db:seed` creates local synthetic identity/entities and refuses production/unknown targets. Never seed/reset a company database or use `down -v` to stop a database containing wanted data. `docker compose stop db` stops without deleting its volume.

Local API: `http://127.0.0.1:3000`; readiness: `/health/ready`. Explicit development/test identity is server-owned and loopback-only. Production uses administratively provisioned accounts, opaque database sessions, exact trusted hosts/origin, CSRF and scoped membership/permissions. Demo roles and caller identity headers grant no company authority.

Eight ordered additive migrations live under `prisma/migrations/`. Apply them explicitly to a reviewed target; builds/startup do not migrate or seed it. Existing company data and approval history must survive upgrades. [RELEASE.md](RELEASE.md) describes account provisioning, production environment, migration, TLS/ingress and deployment gates.

## Module boundaries

| Source folder | Responsibility |
| --- | --- |
| `src/` shared files | Application composition, database lifecycle, configuration, identity/ACL, checklist/subscriptions and safe errors/audit |
| `src/receivables/` | Validate/import complete snapshots; authorized summaries, details, exports and exact snapshot comparisons |
| `src/ledger/` | Validate immutable owner-approved ledger sources and finance-approved derived calculations |
| `src/workspace/` | Membership/admin/permissions, audit reads and staged reviewed imports |
| `src/payables/` | Exact GBP rules, supplier/policy/invoice transitions, private document scans and immutable exports |
| `src/assistant/` | Read-only source grounding, bounded model/provider policy, durable private turns and confirmed proposal provenance |

FinAI proposes invoice actions; the ordinary transactional service rechecks authority, version, assignment and business rules after explicit user confirmation. It cannot automatically pay invoices or post to an external ledger. Original PDFs require a reachable private scanner with fresh signatures; missing/failed scanners quarantine documents.

## Checks and recovery

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm audit
```

Tests require local PostgreSQL and create/drop only isolated synthetic schemas. They cover real API/database persistence, isolation, validation, concurrency, sessions/CSRF, financial transitions, grounding and scanner protocol. Shared schemas/examples under `../contracts/` have their own validators; browser/built-runtime suites run from `../frontend/`. See the [complete command map](../docs/repository-guide.md#verification).

From the repository root, `bash backend/scripts/restore-rehearsal.sh` verifies a disposable synthetic full-application backup/restore; `bash backend/scripts/payables-storage-check.sh` verifies AP byte storage/history/tenant foreign keys. These do not establish the actual hosted backup RPO/RTO. Real release needs target restore/monitoring/finance approval and deployed smoke checks.

## Operational guides

[RELEASE.md](RELEASE.md): sessions/deployment. [WORKSPACE.md](WORKSPACE.md): member/grant administration and reviewed imports. [RECEIVABLES.md](RECEIVABLES.md): source semantics/imports. [ASSISTANT.md](ASSISTANT.md): provider/privacy/budgets. [PAYABLES.md](PAYABLES.md): invoice/scanner/storage/approval/export setup. Shared payload authority: [contracts/README.md](../contracts/README.md). Current evidence: [production verification](../context/production-verification.md).

If Prisma vendor downloads are restricted, preserve TLS/checksum verification. The documented optional `scripts/build-local-prisma.sh` builds the exact pinned official native engine commit; source its emitted environment file before local commands. This native development fallback does not prove the production RHEL runtime. Never disable checksums/TLS or commit private environment/credential values.
