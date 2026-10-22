# PR #4 integration review — 2026-10-22

The user explicitly requested fixing the screenshot's conflicts and merging PR #4. This supersedes the original invoice task's draft-only/no-merge scope. No deployment command, secret change, paid resource or database reset is authorized/performed. Existing hosting automation may react to Git pushes; its deployment state is not verified here.

Started from clean feature/payment-due-date at2bc4a53877fefe08e3d7c671c3d271c88b76426f. Fetched PR #4 headbd400e92b2a84866b4b90c6f994cc3af7529b195 (feat/invoice-duplicate-checker) and maincbc7dc618114121d329b3cf24922c44ba0469f16. Main already contains the calculator and authenticated product hardening; the later OpenRouter commit remains outside this PR and is preserved on its branch. Used the existing checkout and sequential coordinator/backend/frontend/reviewer roles; no agents/worktrees.

## Resolution and functional fixes

Reproduced and resolved all15 conflict files: shared CI, backend README/app/test, context progress/project-state, contracts README, frontend package/configuration, legacy navigation/router and HTTPS session test. Kept both endpoint/service registrations and both complete test/contract suites. No assertions were removed to get passing results; the navigation count now reflects the added product tool.

The older invoice branch wired the checker only into the legacy router and imported demo-dependent Common/UI modules. Added /tools/invoice-duplicates to ProductApp's authenticated navigation/router and switched the feature to pure PageHeader/primitives imports. Preserved all current main product/session/readiness/calculator protections. Dedicated browser regressions use explicit local/demo build flags, while HTTPS tests serve the actual product build. Both entry paths retain the calculator and checker. Added a real session test confirming invoice uploads/results disappear on logout, re-login and refresh, including390px containment. Combined the existing HTTPS upload/CSRF/ordinary-body-limit journey with the calculator journey.

The checker retains128KiB/500-record CSV limits; only its exact POST route accepts512KiB JSON through proxy/backend. Other routes retain16KiB. It uses existing membership/entity read access and CSRF; uploads/results are transient, never stored, logged, sent to third parties or silently replaced with fixtures. Schema, dependencies and lockfiles are unchanged. Auth/readiness/calculator logic and migrations are byte-identical to main. Architecture, setup and historical-status notes now distinguish the integrated product from prior branch evidence.

## Fresh checks actually run

| Command/check | Result |
| --- | --- |
| Backend typecheck / lint / build / npm test | Passed;29 tests,0 skipped, actual PostgreSQL/HTTP |
| Frontend typecheck / lint / build | Passed |
| Frontend npm test |34 legacy regressions passed |
| test:checklist |14 passed |
| test:subscriptions |6 passed |
| test:payment-due-date |11 passed |
| test:invoice-duplicates |4 passed |
| test:session |4 passed, real HTTPS product/proxy/NestJS/PostgreSQL |
| test:proxy |2 passed |
| check:product |5 unsafe build configurations rejected; both product/session asset scans passed |
| All4 Python contract validators + pinned Redocly2.8.0 minimal lint | Passed |
| Both full npm audits |0 known vulnerabilities |
| Backend Docker build | Passed; finai-backend:invoice-merge-local, sha256:dbb672d36f41e1e1bb911eddd15d471a5e9e866e2aaee030d4a86294082de481 |
| bash backend/scripts/restore-rehearsal.sh | Passed; isolated migrated synthetic DB dump/restore, task/renewal state, auth schema and migration history |
| Conflict-marker / unresolved-index / whitespace / scoped diff review | Passed |

**104 tests passed,0 skipped.** Existing historical80/93/101 totals describe other source states, not this merge run. No tests were disabled. Third-party Zod annotation and test color-environment warnings remain nonfatal. The container build used the existing verified cloud CA as an ephemeral BuildKit secret; no TLS bypass or retained CA secret. No live customer data was used.

GitHub GraphQL and REST PR APIs return403 Forbidden, including the elevated read attempt. Git transport works. Hosted check status, draft/PR UI state and deployment are therefore not verified by this run; local tests are the evidence above. Authorized merging uses ordinary non-force Git pushes, preserving both ancestry lines and honoring server-side branch protections. Publication SHA/remote verification is reported in the final handover after push.

## Operations

No new migration or seed is needed. Existing installations keep data. From backend/: npm run db:up, npm run generate, npm run db:migrate, npm run build, npm start (private existing configuration). From frontend/: use docs/product.md for explicit loopback development or npm run build for the session-authenticated same-origin product. Working route: /tools/invoice-duplicates.

CI now runs all4 contracts and both feature browser suites alongside existing checks. See .github/workflows/checklist-release.yml, frontend/docs/invoice-duplicates.md and backend/RELEASE.md for exact commands/configuration. Production proxy/TLS/database/account/entity grants, deployed smoke tests, target capacity/monitoring and recovery objectives still require operator evidence. The earlier invoice branch observed an unconfigured public proxy; this task does not claim that hosting configuration has been repaired.

Rollback after publication: revert the main merge with git revert -m 1 <merge-sha> through the normal review/release process; keep the compatible database/migrations/data. Do not reset main, force-push or remove database volumes. No upload history exists to migrate or delete.
