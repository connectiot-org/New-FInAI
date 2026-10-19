# Code review and verification — 2026-10-19

Reviewer: sequential self-review in this Codex session; no independent human or parallel agent review is claimed. Scope: Prompt 01 context/contracts/instructions and Prompt 02 local monthly checklist, based on f1400308b2a2acc83b38c89465f0367bed6e52f3. User authorized commit/push after verification; public deployment remains excluded.

## Findings resolved

1. Internal test identity contained an extra entity property, causing a Prisma composite-key validation error. Application now canonicalizes server identity to organisationId/userId. Multi-tenant HTTP test passes.
2. Body-parser size failures produced generic 500. Oversized JSON now returns safe 422; HTTP regression passes.
3. Pinned backend dependencies had advisories. Updated compatible NestJS 11 and Prisma 6 patches, Express, validation/test tools, and scoped deepmerge-ts override. Verified frozen install, generation, migration, build, tests and full audit. Both packages report zero known npm vulnerabilities at review time; this is not an exhaustive security audit.
4. Frontend list validation incorrectly depended on JSON property order. It now checks summary values against the exact rows, identity/month and duplicate IDs.
5. Definitively rejected creates could trap a corrected input behind the previous retry payload. Known 4xx rejections now release the retry; ambiguous network/5xx outcomes retain the original UUID/payload. Both correction and lost-success-response browser tests pass.
6. Failed saves needed a visible manual reload path; added it. No optimistic success is shown. Rejected completion remains unchecked and progress remains unchanged.
7. Controlled checkboxes wait for server confirmation. Browser tests now click then assert persisted state, rather than assuming synchronous optimistic state. Assertions remain in place.
8. Old /close navigation also matched the new nested screen. Exact matching now keeps the two entries distinct without changing close behavior.

## Review areas

- Authorization: fixed server-owned local identity; active membership and entity access verified on reads/writes; organisation/role fields rejected; inaccessible records use safe 404; write restrictions use 403. No production login is pretended. Loopback/host/origin/proxy safeguards and production refusal tested.
- Persistence/concurrency: tenant-aware foreign keys, explicit SQL month and trimmed title constraints, consistent advisory locks for ID claims/monthly cap, immutable create digest, version CAS for updates/deletion, bounded deterministic full-set summary. Real PostgreSQL concurrency tests pass.
- Browser integrity: schema-checked response boundaries, visible network/auth/malformed/conflict errors, no API-to-fixture fallback, same-UUID ambiguous retries, ignored/aborted stale scopes, no financial localStorage contamination, reset independence, mobile containment.
- Scope: financial source/demo state and original tests unchanged; separate package manifests and lockfiles; exactly one feature table. No uploads, templates, approval engine, financial posting, AI or external integrations.
- Release contents: no .env, database data, node_modules, compiled dist, screenshots/test traces or credentials should enter commits. Synthetic IDs/examples are public fixtures. Review staged paths and diff checks before committing.

## Evidence and limits

Final automated checks: **8 backend + 11 checklist browser + 33 original regression = 52 passed**, none skipped. Both applications typecheck/lint/build; OpenAPI/examples validate; full npm audits report zero vulnerabilities. Production API and default demo builds were exercised in Chromium with no runtime errors; desktop/mobile images inspected locally under ignored artifacts/.

No unresolved finding was observed within this local feature's tested scope. Testing cannot guarantee absence of all bugs. Production identity, public deployment, infrastructure security audit, monitored backups and measured restore are still unimplemented/unverified Gate D requirements. Build/tool warning notices are documented in progress.md and do not indicate failed checks. New-task snapshot restoration is unverified. This review does not enable public live operation.
