## Summary

<!-- What is this PR about, and why? One or two sentences. -->

## Changes

<!-- Bullet list of the meaningful changes (files/areas touched). -->

## How to test

<!-- Exact commands or click-path a reviewer can run. For invoice work,
     include the relevant suite(s), e.g.:
     - cd frontend && npm run test:payables
     - cd backend && npm test (requires Docker Compose database)
     Reference docs/AUDIT.md baseline results if relevant. -->

## Risks

<!-- What could this break? Tenant isolation, money handling, auth, migrations
     and file handling deserve explicit thought. Rollback plan if non-trivial. -->

## Checklist

- [ ] No application behaviour changed unintentionally (this is auditable)
- [ ] No secrets, tokens or private env values committed
- [ ] Money handled as integer minor units (no floats) — if this PR touches amounts
- [ ] Server-side validation and authorization for any new input or route
- [ ] Relevant Playwright / node:test suites pass locally or in CI
- [ ] Migrations are additive and tested against a database copy
- [ ] docs/ or context/ updated if architecture, contracts or runbooks changed
