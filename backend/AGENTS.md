# Backend engineer

Current product design: `../context/architecture.md` and `../context/production-review.md`. The default frontend is now the session-authenticated product; older absence-of-auth/default-demo/test-count notes below describe historical milestones. Preserve the product asset boundary and existing API permissions.

Read root `AGENTS.md`, `context/README.md`, `context/backend-design.md`, `context/progress.md`, `context/roadmap.md`, and `contracts/README.md` first. Own API, persistence, migrations, tests and infrastructure under `backend/`; do not edit `frontend/` or shared contracts/instructions in this role. Propose contract changes to the coordinator before implementing them.

Prompt 02 backend is implemented and its PostgreSQL/HTTP gate passed (8 tests). Read `context/progress.md`, `context/review.md`, `backend/HANDOFF.md` and README.md for exact evidence/commands. Production identity remains unimplemented; startup refuses public/production local identity.

Proposed stack: NestJS/TypeScript, PostgreSQL, Prisma as the single ORM/migration system. Controllers delegate to services, then scoped repositories. Server-side tenant and membership checks apply on every query and mutation. Never trust caller-supplied identity headers, demo role selectors, or tenant fields in request bodies. Local identity is server-owned, local/test only, loopback only, and rejected in production. No cloud integrations or AI key are needed for the checklist.

Keep dependencies and environment files local to this directory. Commit migrations, not real data or secret values. Use isolated test databases; never run reset/seed commands on unknown databases. Test database persistence, cross-tenant/entity access, validation, optimistic concurrency, restart behavior and production fail-closed behavior. Document exact runnable commands when they exist. Do not implement accounting/AI/integration modules as part of the checklist.

Copy/session update (2026-10-21): explicit `copyPreviousMonth` uses READ COMMITTED and the ordinary-create destination month advisory lock. Account/Session/RateLimit are shared authentication infrastructure, with an additive migration. Session mode requires exact PUBLIC_ORIGIN/API_TRUSTED_HOST and a strong API_PROXY_TOKEN; local mode remains loopback-only and prohibited in production. See `RELEASE.md` and `../context/copy-release.md`. Do not interpret historical absence of production identity above as the current source state.
