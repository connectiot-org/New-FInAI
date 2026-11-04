# Production verification — 4 November 2026 (Asia/Dhaka)

**Local application/test matrix: PASS. Standard Docker build and hosted activation: BLOCKED/UNCLEARED.**

Baseline: merged main `73f76dd44b6fe6721fb8ef45f542a8c55389230d`, clean checkout. Review branch `fix/production-verification`. Previous deadline/identity/PDF fixes are included.

Coordinator owns this report and shared contract decisions; backend/frontend fixes remain sequential and within their directories. Independent read-only backend, frontend and runtime reviews complement the coordinated fixes and tests. No worktrees, production data/configuration changes or main merge/deployment. Preserve public no-login samples, private company authentication and explicit FinAI confirmation.

Acceptance: reproduce/fix concrete remaining bugs, execute all checked-in application/browser/API suites, validate contracts/audits/assets/recovery and review final changes. Existing hosted access and standard-container engine-download blockers remain separate from local pass evidence. Application test success is not exhaustive proof of all possible inputs or a real-company production activation.

## Corrected findings

| Area | Reproduction / defect | Correction and regression |
| --- | --- | --- |
| Invoice and policy amounts | Removing the first of differently priced lines/rules reused a money input whose displayed value still belonged to the deleted row, while the saved canonical amount belonged to the remaining row. Both browser cases failed before correction. | Reconcile an externally changed canonical amount while preserving the user's decimal draft when the parent echoes the same value. Tests check displayed price/threshold, saved minor units and trailing decimal typing. |
| Private PDF eligibility | A previously clean PDF remained rendered after an infected/quarantined rescan reloaded its metadata. Both unsafe-verdict browser regressions failed before correction. | Bind preview bytes to the exact authorized detail snapshot and document ID, require current scan eligibility, invalidate pending previews on reload/rescan/unmount and clear obsolete state. Tests cover both unsafe rescans and ordinary unsafe metadata reload. |
| Pending form edits | A user could change invoice fields after the save request captured them, then successful completion closed the form and discarded those later edits. The pending-save regression failed before correction. | Freeze editable invoice/supplier/policy controls while saving; preserve visible values and errors and re-enable on failure. No form-layout or payload-field changes. |
| Same-file upload retry | A failed upload left the native file selection unchanged, making the same selection unable to fire a normal deliberate retry. | Clear the native selection after capturing the File; preserve the immutable File and retry operation/version. The regression retries identical bytes with the same fixed file metadata and operation ID. |
| Scanner latency budgets | A valid two-command scanner operation can take up to 20 seconds, but rescan/upload clients previously aborted at 10/15 seconds. | Narrow longer limits: 35 seconds for rescan POST, 45 for PDF upload; ordinary 10-second requests and 15-second downloads stay bounded. Browser tests wait through controlled 11/16-second responses and observe the persisted verdict/refreshed controls. |
| Production scanner configuration | Production Compose omitted AP_CLAMD_HOST/PORT. The rendering regression showed the configured host missing. RELEASE.md also prescribed a blanket 16 KiB ingress cap that blocked supported original PDFs/import previews. | Forward the explicit private scanner host/port, default port 3310 and quarantine when unconfigured; document exact POST-only 1 MiB upload exceptions and private-network/scanner prerequisites. Add safe setting names/comments to the environment example. |
| Invoice modification metadata | Rescan changed version/revision/state but left updated_at stale. The real PostgreSQL regression failed before correction. | Update the modification timestamp in the same invoice transaction; existing scan/history/revision checks remain. |
| Remote forwarding lifetime | A controlled TLS backend kept streaming after the browser disconnected; a drip response evaded socket inactivity timeout. Both transport regressions failed before correction. | Cancel unfinished upstream work on downstream finish/close; 25-second inactivity and 30-second absolute response limits clear their timers/listeners. The deadline also closes unfinished downstream delivery after the backend has completed. Tests verify prompt disconnect closure and active-stream termination at 30 seconds. |
| Safe error correlation | Locally generated proxy/embedded failures omitted the contract's X-Request-Id header. | Generate one UUID for header/body, avoid late writes after response end/destruction and assert correlation for real JSON/PDF timeout errors in both adapters. |

These are compatible frontend/runtime/configuration corrections. No financial payload schema, migration, dependency or automatic financial authority changed. The backend's session/CSRF/AP assignment/version/idempotency/audit rules remain the authority for every confirmed action. Read-only reviews found no new high-confidence tenant/auth bypass or unconfirmed model write in the inspected paths; this is bounded source review, not a security certification.

## File/folder organization

The user's added organization request is completed through [the repository guide](../docs/repository-guide.md): **all 338 tracked/planned files have exactly one grouped purpose row**, with no omissions or duplicates. Root/frontend/backend READMEs now explain current modes, setup, source organization, tests and operation guides. Current Assistant/checklist routes and build instructions are corrected; original prototype route/progress records are labelled historical. Existing source/import/deployment/migration paths stay stable. Frontend ignore rules also protect plain environment files while retaining deliberately safe examples.

The guide distinguishes browser vs server code, sample vs company data, generated vs authored files, ordered migrations, tests/operator scripts, private settings, binary/reference evidence and historical reports. Important module-boundary and non-obvious money/PDF/retry/deadline invariants have concise comments. JSON/lockfiles and binary assets are documented externally rather than corrupted with comments. Local guide coverage and documentation links are checked programmatically.

## Verification scope and remaining gates

Node 24.19.0/npm 11.9.0, local PostgreSQL 17.6 and the checked-in Chromium configurations. Tests use isolated synthetic schemas and controlled TLS/scanner/model services; no real customer records or provider calls. Frozen application installs, backend typecheck/lint/build and 87 tests passed after the functional backend corrections. Both synthetic application/AP byte-storage restore rehearsals pass. All 7 contract validators and all 7 OpenAPI descriptions pass, with 29 existing nonblocking lint warnings. Final frontend matrix results follow below. Test counts do not double-count pre-fix or focused repeats.

The full frontend runner was interrupted during a transport stage; completed stages were retained and stages 18 onward were rerun against the unchanged functional source. A corrected test fixture queries all enabled mutable controls together rather than retaining index locators that shifted during asynchronous UI updates. No application assertions, financial checks or retry/deadline limits were weakened.

A fresh standard Docker build reaches Prisma generation, then fails fetching the pinned official schema-engine checksum from binaries.prisma.sh with 403. Normal CA/TLS/checksum verification remains enabled; this blocked path is not a pass. Local tests/private Vercel packaging use the documented exact-commit source-built native engine override. They do not certify the production RHEL engine.

The fresh hosted invoice request is blocked at outbound proxy CONNECT 403 (origin HTTP 000). Managed runtime status still has no ready private variables/secrets/outbound identities, and no Vercel/Neon/GitHub API tools are callable; ordinary Git transport works. No hosted database/accounts/AP grants/scanner/model/deployment was changed or verified. Exact-head hosted CI remains unobserved. Real-company activation requires the existing [deployment handoff](invoice-assistant-release.md), private rotated binding, reviewed migrations/accounts, reachable maintained scanner, approved provider/privacy/budget/finance rules, deployed smoke verification and target backup/monitoring gates.

Public invoices still open labelled browser samples without sign-in. Company invoice/Assistant routes stay authenticated. The supported real invoice workflow is manual-entry GBP approval/export; payments, external accounting posting, OCR/email intake and the original browser ERP/banking/reporting simulations are not made real by passing tests. Historical coverage/PG18 results remain in their dated reports; coverage was not remeasured in this pass.

## Fresh release matrix

| Frontend command | Outcome | Checks | Seconds |
| --- | --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | — | 5 |
| `npm run typecheck` | PASS | — | 11 |
| `npm run lint` | PASS | — | 4 |
| `npm run build` | PASS | — | 15 |
| `npm run test` | PASS | 60 | 111 |
| `npm run test:invoice-demo` | PASS | 8 | 24 |
| `npm run test:checklist` | PASS | 14 | 28 |
| `npm run test:subscriptions` | PASS | 4 | 13 |
| `npm run test:session` | PASS | 1 | 13 |
| `npm run test:receivables` | PASS | 5 | 11 |
| `npm run test:receivables:production` | PASS | 1 | 14 |
| `npm run test:workspace` | PASS | 18 | 29 |
| `npm run test:workspace:production` | PASS | 2 | 26 |
| `npm run test:assistant` | PASS | 20 | 37 |
| `npm run test:assistant:production` | PASS | 1 | 30 |
| `npm run test:public-chat` | PASS | 22 | 23 |
| `npm run test:vercel` | PASS | 6 | 42 |
| `npm run test:payables` | PASS | 17 | 64 |
| `npm run test:payables-transport` | PASS | 12 | 71 |
| `npm run test:payables:integration` | PASS | 9 | 140 |
| `node scripts/check-assets.ts` | PASS | — | 0 |
| `npm audit` | PASS | — | 0 |


The complete current matrix passes **87 backend + 200 frontend/API/transport = 287 tests**, with no skipped tests. Both npm audits report **0 vulnerabilities**. All three real invoice journeys pass through each of remote, embedded and private packaged runtimes: PDF/coding/verification/two approvals/immutable export/restart; scoped FinAI grounding/explicit confirmation/uncertain retry/stale proposals; and real HTTP/version/assignment/CSRF/grant/company isolation. Private model responses and scanner verdicts are controlled fixtures, not external provider evaluations.

After the final explanatory comments and formatting, both applications pass typecheck/lint/build again and the asset credential scan passes. The 338-file guide has no missing/duplicate purpose rows; final local documentation-link and Markdown-table checks pass. Dated historical source inventories remain unchanged and explicitly historical. No physical folder relocation, lockfile/dependency change, migration, real-data import or hosting mutation occurred.

## Evidence and delivery

Fresh per-command frontend logs/metadata: ignored `frontend/artifacts/production-verification/commands.json` and matching stage logs. Backend final functional suite: `/tmp/finai-production-backend-final.log`. Final comment/format quality checks: `/tmp/finai-production-backend-final-quality.log`, `/tmp/finai-production-frontend-final-quality.log`. Contract lint, synthetic recovery and standard-container attempt: `/tmp/finai-production-openapi.log`, `/tmp/finai-production-restore.log`, `/tmp/finai-production-container.log`.

Pre-fix failures: `/tmp/finai-production-ui-before.log` (four amount/unsafe-preview cases), `/tmp/finai-production-pending-before.log`, `/tmp/finai-production-compose-before.log`, `/tmp/finai-production-rescan-before.log`, `/tmp/finai-production-proxy-regressions-before.log`; browser traces retained under ignored `frontend/artifacts/production-verification/ui-before/`. Focused follow-up logs are local supporting evidence and are not counted again. Ignored logs/artifacts are not automatically present on GitHub.

Delivery branch: `fix/production-verification`, based on `73f76dd44b6fe6721fb8ef45f542a8c55389230d`; main was fetched again unchanged before delivery. All authorized source/tests/runbooks/file-guide changes and this report are committed and pushed for review. Main merge, hosted CI confirmation and deployed activation remain separate from this branch. Use the report's explicit blocked checks and the prior deployment handoff before real-company operation; local success cannot establish absence of all hidden defects or target operational readiness.
