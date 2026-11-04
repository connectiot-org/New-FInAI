# Invoice workspace refresh — 4 November 2026 (Asia/Dhaka)

Base: `1d99aa9` on `feat/invoice-workspace-refresh`; previous reviewed fixes remain included because main had not merged them at task start. Working tree initially clean.

Sequential coordinator/frontend/reviewer scope: refresh the existing invoice interface into a compact, organized finance workspace, retaining working sample/private invoice creation, documents, assignments, approvals, exports and FinAI links. No backend/schema/dependency changes or production-data/hosting mutations. Preserve private authentication and the explicitly labelled no-login sample store.

Reference supplied: https://www.getmoss.com/en-gb/lp-invoice-approvals. The direct request was rejected by the configured outbound proxy at CONNECT 403 (origin HTTP 000); exact current Moss appearance/functionality cannot be verified. The user's attached image establishes the existing interface. The change uses an original FinAI workspace treatment with familiar invoice-product layout patterns; no exact-copy or unavailable OCR/payment/ERP capability is claimed.

Acceptance: useful real queue counts, working navigation/filtering/pagination, compact role/sample controls, clear status and document review, responsive/keyboard-readable layout, existing complete invoice journeys and retained security regressions. Current implementation paths stay stable and the per-file repository guide is updated for this report. Verification, screenshots and delivery are recorded below.


## Implemented workspace

- Compact FinAI sidebar, company context, active invoice/supplier/export/policy navigation and an in-product invoice guide. On small screens the same working links appear in a horizontal module navigation.
- A discreet sample-workspace notice, role selector and reset control replace the oversized development banner. The browser-only sample boundary remains explicit; no public route acquires real company identity.
- Data-backed summary shortcuts for all invoices, review, the current user's approvals and approved accounting exports. Approval counts are explicitly personal rather than misrepresented as company-wide waiting totals.
- Organized register with supplier identifiers, clear status/attention chips, right-aligned exact GBP amounts and accessible open-row actions. The invoice month control is compact rather than stretching across the page.
- Queue/search/month/status/due-date/assignee/paging values persist through refresh/back/forward via URL state. Clear filters retains the queue. Company changes clear old per-company paging/assignee/status/queue values while preserving existing global search/month behavior. Stale empty pages offer an explicit first-page recovery and never print a backwards range.
- Keyboard queue navigation supports Arrow Left/Right, Home and End. Desktop 1440px and phone 320px screenshots/containment checks pass; wide tables scroll within their card. The form/month actions fit the narrow card and status text palette was checked for readable contrast on its intended backgrounds.

No OCR, payment, external posting or unavailable integration controls are fabricated. Existing creation, supplier/policy editing, PDF preview/scan eligibility, sequential decisions, immutable export and confirmed private FinAI links remain the working product scope. No new dependency, API payload/schema, migration or backend mutation logic was introduced.

## Fresh verification

| Command (frontend/) | Result | Checks | Seconds |
| --- | --- | --- | --- |
| `npm run typecheck` | PASS | — | 10 |
| `npm run lint` | PASS | — | 3 |
| `npm run build` | PASS | — | 15 |
| `npm run test` | PASS | 65 | 113 |
| `npm run test:invoice-demo` | PASS | 13 | 31 |
| `npm run test:payables` | PASS | 19 | 71 |
| `npm run test:assistant` | PASS | 20 | 38 |
| `npm run test:assistant:production` | PASS | 1 | 31 |
| `npm run test:session` | PASS | 1 | 13 |
| `npm run test:payables:integration` | PASS | 9 | 146 |
| `node scripts/check-assets.ts` | PASS | — | 0 |
| `npm audit` | PASS | — | 0 |
| `npm run test:payables -- --grep "changing company clears\|stale last-page URL"` | PASS | 2 | 5 |

**130 browser/API/runtime checks pass**, with no skipped tests. The final two company/paging cases run separately after the 19-case controlled UI run; repeats are not counted again. After the final edge cases, typecheck/lint/build, both focused cases, all 13 standalone sample cases and asset scanning pass again. The invoice and Assistant contract validators pass. Frontend npm audit reports 0 vulnerabilities.

The real 9-case integration suite exercises each of remote, embedded and private packaged runtimes: PDF/coding/mismatch/verification/two approvals/export/restart; scoped FinAI facts/confirmation/retry/stale proposal; and HTTP/session/CSRF/version/assignment/company isolation. Providers/scanners are controlled fixtures on local PostgreSQL, not real hosted-provider evaluations. Backend/transport sources are unchanged from the previous full 287-check review, so unrelated backend and container suites were not rerun or claimed as fresh successes.

UI validation corrected duplicate invoice link targets, exact filter labels, an absolutely positioned hidden header that expanded the phone document width, narrow month/action sizing and the personal-approval metric description. A new test fixture's supplier name was corrected to the actual sample supplier. Final checks retain the same workflow/security assertions; none were weakened to hide a failure.

## Visuals and runnable sample

Reviewed screenshots are retained locally at `frontend/artifacts/payables/workspace-refresh-1440.png` and `workspace-refresh-320.png`; private detail images also refresh in the controlled UI suite. They are ignored generated evidence, not files published to GitHub or proof of a live deployment.

The newly rebuilt standalone sample archive is `frontend/artifacts/invoice-workspace-refresh/finai-invoice-workspace.zip`. Unzip it, use Node 24 to run `node serve.mjs`, then open `http://127.0.0.1:4173/demo/invoices`. It contains only public assets, build metadata, the server script and README. Use sample documents only; no company database, real scanning/payment/posting or shared-account service is supplied by that archive.

Archive integrity/index digest verified: 29 files, 1002743 bytes, SHA-256 `93077ae68652a1c5cb48a29ea2affb4709e48590234fb4e0c6bf0ed8aa947255`.

## Organization and delivery limits

The complete repository guide now covers all 339 source/control/evidence files exactly once, including this report. Existing folders/import paths and separate stores stay stable. Main/runtime secrets, deployment, live database accounts/AP grants/scanner/provider setup and production data were not changed. The prior hosted access / pinned Prisma checksum blockers remain unresolved; no new Docker or production success is claimed.

Branch: `feat/invoice-workspace-refresh`, based on `1d99aa9`; it includes the preceding production-verification fixes as well as this UI. Source/docs/tests are committed and pushed for review. Merging/deploying the reviewed commit and completing the existing private-company deployment handoff remain necessary before the hosted site can be represented as verified for real company use. The requested Moss page was inaccessible; no exact current visual copy is claimed.

Local per-command evidence is under ignored `frontend/artifacts/invoice-workspace-refresh/`; final follow-ups are `/tmp/finai-workspace-final-quality.log`, `/tmp/finai-workspace-scope-pages.log`, `/tmp/finai-workspace-demo-final.log`. Historical source inventories and broad-review outcomes remain dated snapshots.


## Final developer/tester verification — 4 November 2026

Starting clean from merged main `43b0481` on `fix/invoice-final-verification`. Sequential coordinator/frontend/reviewer scope: check remaining row-identity/draft, URL/scope, financial/auth/document/Assistant boundaries and run the entire checked-in release matrix again. Backend/runtime contracts remain unchanged; no worktrees/agents or production resource/data mutations. Acceptance is reproducible passing checks plus explicit live/container readiness limits, not an impossible guarantee of zero hidden defects. The findings, verification and remaining release limits for this pass follow below.


### Reproduced corrections

1. **Equal-valued editable rows retained the wrong decimal draft.** Invoice lines and policy rules used array indexes as React keys. When two canonical values were equal, deleting an earlier row could transfer its unfinished input (for example `10.`) to the remaining row, even though that row previously held valid `10.0`. Two private regressions failed before the fix. Stable local row keys now follow each line/rule through insertion/removal, stay outside financial payloads/digests and preserve the remaining input. A real IndexedDB regression verifies saving and reloading the remaining sample line.
2. **A rejected create prevented correcting the form.** After an authoritative validation failure or duplicate supplier reference, the form's uncertain-save guard retained the old payload and blocked corrected fields. Both private correction regressions failed before the fix; the existing ambiguity cases passed. The JSON client now identifies parsed 400/422 and explicit `409 DUPLICATE_REFERENCE` rejections; sample input/supplier validation identifies only pre-write failures. The form releases its pending payload only for these definite rejections and retains the same create UUID. Network/503, generic 409, malformed responses and storage/receipt uncertainty keep the conservative retry behavior. Two uncertainty regressions ensure edited payloads are blocked and the original payload/UUID can be replayed. A sample duplicate-reference correction is also saved/reloaded through IndexedDB.

The six focused private cases and two persisted sample cases pass after these fixes. No account/authentication removal, new API payload, schema, migration, dependency, financial authority or runtime deployment change was required. Comments explain local row identity and the boundary between rejected and uncertain writes. Existing folders and import paths remain stable.


### Runtime and release limits for the final pass

The fresh local database is PostgreSQL 17.6 on Debian; Node is 24.19.0 and npm is 11.9.0. Local Prisma generation/runtime uses the documented official pinned 6.19.3 native engine override (commit `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`), preserving normal TLS/checksum verification. These are local compatibility results, not proof of Vercel's production native runtime or this Neon project's settings. The earlier PostgreSQL 18 evaluation remains historical rather than being represented as rerun here.

- All seven schema/example validators and all seven OpenAPI descriptions pass; OpenAPI lint retains 29 existing nonblocking warnings. Full application and AP-only synthetic backup/restore rehearsals pass, including approved invoice/PDF/export bytes, history/routes/policies/grants and tenant constraints. The first restore attempt omitted the environment's required native engine override; the properly configured rerun passed without changing the rehearsal or migrations.
- A fresh standard Docker build remains **blocked** at Prisma's pinned `schema-engine.gz.sha256` download with proxy 403. No checksum/TLS bypass was applied and no successful standard container is claimed.
- A fresh HEAD request to the requested hosted invoice URL remains **blocked before reaching the origin** by outbound proxy CONNECT403. This does not establish either origin health or failure. No Vercel/Neon private bindings, hosted accounts/grants, real scanner/provider, deployment or production data was accessed/changed.
- Real-company release still requires the reviewed code to be merged/deployed, private runtime configuration and account/AP grants, scanner/provider readiness and a hosted end-to-end smoke test using the deployment handoff. Public sample routes stay clearly separate from authenticated company routes. Production availability, operational acceptance and the absence of undiscovered defects are not certified by local tests.

The repository/file catalog remains complete for all 339 tracked files, exactly once; local relative links resolve and private/generated artifacts remain ignored. Report/navigation entries now link to this final pass. Dated earlier reports retain their original counts/hashes rather than being silently rewritten.


### Final measured matrix and delivery

Both applications completed frozen dependency installs, typecheck, lint and build. Backend `npm test` passed **87** tests (0 skipped). The frontend/browser/API/transport matrix below passed **224** checks (0 skipped), for **311 automated checks total**. Both npm audits report **0 vulnerabilities**. Contract validation, restore and asset results are additional checks, not additions to that test count. Focused/red reproduction runs are not counted again; the same browser tests run against Vite and the standalone built runtime are distinct runtime checks.

| Command (frontend/) | Result | Checks | Seconds |
| --- | --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | — | 7 |
| `npm run typecheck` | PASS | — | 10 |
| `npm run lint` | PASS | — | 3 |
| `npm run build` | PASS | — | 17 |
| `npm run test` | PASS | 67 | 122 |
| `npm run test:invoice-demo` | PASS | 15 | 37 |
| `npm run test:checklist` | PASS | 14 | 30 |
| `npm run test:subscriptions` | PASS | 4 | 14 |
| `npm run test:session` | PASS | 1 | 14 |
| `npm run test:receivables` | PASS | 5 | 12 |
| `npm run test:receivables:production` | PASS | 1 | 14 |
| `npm run test:workspace` | PASS | 18 | 30 |
| `npm run test:workspace:production` | PASS | 2 | 27 |
| `npm run test:assistant` | PASS | 20 | 36 |
| `npm run test:assistant:production` | PASS | 1 | 26 |
| `npm run test:public-chat` | PASS | 22 | 24 |
| `npm run test:vercel` | PASS | 6 | 46 |
| `npm run test:payables` | PASS | 27 | 86 |
| `npm run test:payables-transport` | PASS | 12 | 71 |
| `npm run test:payables:integration` | PASS | 9 | 144 |
| `node scripts/check-assets.ts` | PASS | — | 0 |
| `npm audit` | PASS | — | 0 |

The nine final real-database invoice cases exercise remote, embedded and private packaged runtimes: original PDF persistence, mismatch/coding correction, factual verification, two sequential approvals, immutable balanced export and restart; private FinAI facts/proposals/explicit confirmation, uncertain retry and stale proposals; and session/CSRF, scope/grants, assignment, money/version/idempotency controls. Providers/scanners use controlled local fixtures. This is complete checked-in suite execution, not a claim that every possible line/branch/input or real hosted provider was covered. The final 27-case controlled invoice suite includes every new regression. Formatting, patch cleanliness, the 339-file catalog/links and tracked Neon-password/private-key-marker checks pass; no secret values were printed. Fresh 320px sample and 1440px private-detail screenshots were inspected, with containment checks retained.

Local command logs, before-fix traces/screenshots, command summaries and all 339 file hashes are retained in ignored `frontend/artifacts/invoice-final-verification/`. The source inventory records exactly the reviewed files, not executed-line coverage. The final public-only runnable sample is `frontend/artifacts/invoice-final-verification/finai-invoices-reviewed.zip`; run `node serve.mjs` after unzipping and open `http://127.0.0.1:4173/demo/invoices`. Archive integrity and the build metadata's index digest are verified. It contains 29 files, 1002968 bytes, SHA-256 `166c3f970b022bb2a288e208b8690d7f9d23369418308d69cff5514d95586445`. This archive is local ignored evidence, not an uploaded GitHub artifact or authenticated company service.

Delivery branch: `fix/invoice-final-verification`, based on merged main `43b0481`. The scoped source/tests/documentation are committed and pushed for review; main and hosting are unchanged. The final local suite is green; the standard Docker download and hosted-origin checks remain blocked as documented above. Production activation and live smoke verification remain operator steps in the existing handoff, and no zero-hidden-bug or immediate live-company-readiness guarantee is made.
