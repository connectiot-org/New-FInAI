# Import Change Review — 31 October 2026 (Asia/Dhaka)

## Release-check remediation — 31 October 2026

After the user reported the failing push check, updated the development lint stack in both applications to ESLint10 and compatible TypeScript/React plugins, with minimatch11.0.3 overrides. The old minimatch versions were affected by GHSA-g3hv-75wg-m249; forcing11 into ESLint9's older callable API would be incompatible. Frontend explicitly retains the two React Hooks rules enabled by its previous5.2 plugin; the new plugin's additional compiler rules require separate adoption. Runtime application dependencies and audit gates are unchanged.

Both complete npm audits now report zero vulnerabilities. Backend and frontend lint, typecheck and builds passed; all58 backend tests,18 workspace tests and2 built authenticated workspace tests passed. Both frozen lockfiles passed `npm ci --dry-run --ignore-scripts`. Exact logs for the original failed GitHub step remain inaccessible, so this confirms a locally reproduced audit blocker was fixed, not that it was the only possible CI failure. A fresh hosted workflow must be checked independently.

Base main66d0c5445968ca4f8f97af0b98b6da57dd3d8b79, clean checkout; no equivalent comparison found. User requested implementation of the attached one-feature guide. Sequential coordinator (`contracts/`, `context/`), backend (`backend/`), frontend (`frontend/`), reviewer roles; no parallel agents/worktrees. Preserve public chat, demo storage, unrelated product and old endpoint shapes. No deployment/paid provisioning is authorized by this feature.

Additive receivables-detail1.2.0 freezes GET `/api/v1/receivables/changes`: entity/fromSnapshot/toSnapshot UUIDs, offset0..20000, limit1..50. Authorization precedes version direction checks. Compare all issue dates and all statuses using exact source invoice IDs, full outer union in database C collation. Absent sides stay null. Earlier/later follow import versions; backward capture cutoffs get a caution. Same-source selection is valid zero-change.

New monetary fields are canonical decimal integer strings (nonnegative totals/contributions, signed deltas). Effective contribution is amount minus cumulative paid for non-Draft rows with paid below amount, otherwise zero. Full union totals and bridge reconcile before paging changed rows. Four exclusive bridge buckets: new IDs, absent IDs, positive matched deltas, negative matched deltas. Metadata-only changes count once and contribute zero; flags are overlapping facts, never additive invoice counts. Presence changes have no invented field values. Currency remains USD.

Implementation acceptance: actual PostgreSQL/HTTP basic255000→215000 and mixed255000→120000 cases; metadata/status/presence, overflow/20000 union/pagination/C ordering, identical/reversed/cutoff, read-only and foreign/revoked access; typed strict browser adapter, exact string formatting, paginated source selection, pinned defaults/third-import stability, entity/session stale protection and real authenticated browser-to-API journey. Current live missing-database state is separate from local completion. Actual commands/outcomes and final handoff will be recorded after execution.

## Implemented and verified

Contract commit4c8ece2, backend5809b21 and frontend7c02c5b implement the endpoint and private screen. No equivalent code was duplicated. Source metadata validation is shared with existing detail adapters. New comparison code loads only on its private route; default public bundle stays below the existing500kB warning threshold. All source data remains immutable; SQL has fixed parameterized organisation/entity/snapshot scopes and C-collated full outer matching, bounded to20000 union rows. Complete BigInt arithmetic precedes changed-only page slicing. No table, migration, dependency, financial mutation or model call was added.

Final review found a public-chat focus race while checking preservation of existing behavior: a frame sometimes ran before React committed disabled=false. Local metadata-only focus instrumentation captured the focus attempt against a disabled textarea in two failing runs. A separate compatibility commit4590e80 moves requested focus into a post-commit effect, preserving the existing chat interface, server policy and assertions. Ten repeated existing focus cases and the full22 public-chat cases then passed. The initial focus failures and the validation/fixture problems found during development were corrected; no retries, timeouts or assertions were relaxed.

Local results (195 unique passing application tests, no final skips):

| Existing command | Passed |
| --- | ---: |
| backend `npm test` | 58 |
| frontend `npm test` | 51 |
| `npm run test:checklist` | 14 |
| `npm run test:subscriptions` | 4 |
| `npm run test:session` | 1 |
| `npm run test:receivables` / `test:receivables:production` | 5 / 1 |
| `npm run test:workspace` / `test:workspace:production` | 18 / 2 |
| `npm run test:assistant` / `test:assistant:production` | 12 / 1 |
| `npm run test:public-chat` / `test:vercel` | 22 / 6 |

Both apps' typecheck/lint/build passed. All six contract validators and all six Redocly2.8.0 OpenAPI checks passed, with four existing warnings. Six-mode available-credential asset scan passed. The packaged128MiB backend and final frontend built and all six real packaged API/PostgreSQL cases passed. A read-only Prisma cache initially prevented packaging; an authorized retry with cache writes allowed passed. The old npm cache symlink was dangling in this runtime; checks used the writable `/tmp/finai-changes-npm-cache`, without changing project configuration or disabling verification.

The independent seven-migration synthetic database dump/restore rehearsal also passed, verifying task/subscription/snapshot/Assistant state, auth schema and migration history. This local recovery check does not establish production backup configuration or a successful fresh container build.

Changed application paths: `backend/src/receivables/changes.repository.ts`, detail controller/service/validation, backend app provider wiring and `backend/test/receivables-changes.test.ts`; frontend `changes.ts`, `changes-api.ts`, shared `source-schema.ts`/detail adapter, `workspace/ImportChanges.tsx`, register link, private route/scoped styles, two comparison suites, existing suite-discovery configs and synthetic session fixture. PublicChat.tsx has only the traced focus compatibility correction. Contracts/examples/validator and feature/context documentation complete the handoff. Review the feature branch comparison for the complete file list; manifests, locks, Prisma schema/migrations, demo store/fixtures and release workflow are unchanged.

The actual built authenticated comparison journey uses synthetic PostgreSQL sources through the real HTTPS session/proxy/API. It verifies255000→215000 cents, backward source cutoff, pinned source links, a third import that leaves A/B unchanged, reload/restart, entity isolation and session expiry. Reviewed captures at1440/768/390/320px: `frontend/artifacts/import-changes/real-comparison-<width>.png` (ignored). Mobile table scrolling is keyboard-tested; a screenshot-discovered CSS specificity problem was fixed. Controlled UI cases cover zero/one import, identical sources, errors/retry, strict malformed/cross-scope responses, source-history and changed-row pagination and delayed source/entity responses. No private browser persistence or demo fallback was introduced.

## Release gates and handoff

Full npm audits currently fail on existing development-tool dependency paths for one minimatch advisory, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (frontend13 moderate affected package entries; backend11). npm reports no available fix on those paths. Both `npm audit --omit=dev` results have zero advisories. Package manifests/locks and audit gates were preserved. These passing functional checks do not override the full-audit release gate.

The guide reported the live private API's missing DATABASE_URL on31 October; this task cannot independently reconfirm it because the target's CONNECT request returns403 even after escalation. Authenticated GitHub API/Actions inspection also returns Forbidden after escalation. Public GitHub workflow HTML is readable; historic run40897031165 succeeds but predates this candidate and cannot validate it. A fresh container build first failed on proxy CA trust; mounting the existing trusted CA bundle through the Dockerfile's supported build-secret option fixed that. Generation then failed on HTTP403 downloading the pinned Prisma checksum from binaries.prisma.sh. Checksum/TLS verification was preserved; no container success is claimed. No fresh hosted/CI success, database provisioning, legitimate data import, production merge or deployment is claimed. The feature needs the existing database/accounts and two legitimate saved sources for useful hosted comparisons; an identical single source is a valid zero review.

Next release step: review the feature branch, resolve the existing dev-tool audit gate in a separately scoped supported maintenance change, restore required network access, run the complete current release workflow, then verify the authenticated source-to-source journey in an authorized configured preview. Use backend `npm run db:up`, `npm run build`, `npm test`; frontend commands above after backend setup. No reset/seed of unknown or production databases. Deployment remains outside this implementation authorization.
