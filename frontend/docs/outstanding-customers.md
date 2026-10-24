# Outstanding by customer

Adds one read-only card to `/overview`, immediately after FinanceSnapshot and before Recent activity. This summarizes existing **browser-owned demo invoice data**, not a live accounting integration.

## Inspection and scope

Started on clean main at `55e79b3ba16b0c1f455d01ac9f09e125dea92da8`; fetched main still matched that audited commit. Its tracked tree matches restored3011b0c. No equivalent card existed. Created only `feat/overview-outstanding-customers` in the existing checkout, without agents/worktrees. No reverted feature branch is reintroduced. Installed dependencies were already present and lockfiles unchanged, so npm ci was unnecessary.

Acceptance: exact existing scope/Outstanding semantics, safe integer cents, complete totals before top-five selection, deterministic ties, safe missing/foreign references, explicit unavailable data, existing links/global scope, no mutations/API calls, and preserved homepage/entry/navigation/auth/backend. Baseline frontend typecheck/lint/build and all34 original browser tests passed in this environment. Before screenshots were captured before editing at1440/390/320px.

Allowed and actual files:

| Path | Reason |
| --- | --- |
| src/features/Overview.tsx | One import and one JSX insertion only |
| src/features/receivables/outstandingCustomers.ts | Pure typed scope/validation/grouping/selection function |
| src/features/receivables/OutstandingCustomers.tsx | Isolated read-only summary, table, empty/unavailable state and existing links |
| src/features/receivables/outstanding-customers.css | New styles scoped entirely below .outstanding-customers |
| tests/outstanding-customers.spec.ts |9 calculation tests and6 browser tests in the existing runner |
| docs/outstanding-customers.md | Scope, semantics, reproduction and evidence |
| ../context/progress.md | Separate coordinator append only |

Backend, contracts, proxy, routing/Shell/navigation/main entry, auth/SessionGate, shared selectors/types, Redux, fixtures, FinanceSnapshot, shared table, global styles, dependency manifests/locks, environment, build/hosting configuration and CI are unchanged.

## Calculation and limits

Uses existing inScope for selected entity and invoice **issue date** period. Period=all includes every stored date in that entity. Preserves exactly `status !== "Draft" && paid < amount`; remaining cents are amount minus paid. Groups by customer ID, counts every qualifying invoice, totals all groups before selecting at most five, then sorts remaining cents descending with deterministic ascending ID ties. Existing money helper formats USD for display only.

Names resolve only for matching customer ID **and selected entity**. Missing/foreign references retain their balance/count as “Customer unavailable” with no customer link. Missing entity, unsupported currency, invalid scoped amount/paid (including drafts/fully-paid records), or unsafe grouped/total addition produces unavailable with no numeric summary/table or misleading links. Valid empty selections show explicit zero totals and no invented rows. Source arrays/state are not changed.

Paid values are current cumulative amounts. The card is a current summary of invoices issued in a selected period, **not** historical month-end aging, payment verification, FX conversion or ledger reconciliation. Its explanatory note distinguishes invoice balances from the ledger-based receivables KPI. There are no overdue buckets, new actions, exports, loading states, API/LLM calls, storage writes or audit entries. Existing store updates, including demo receipts, update the view normally.

Independently recomputed unchanged seed values and asserted them:

| Scope | Invoices | Customers | Total cents | Display |
| --- | ---: | ---: | ---: | --- |
| US/all |30|14|14217000|$142,170.00|
| US/September2026 |5|5|2700500|$27,005.00|
| Europe/all |6|6|2909550|$29,095.50|
| Europe/September2026 |1|1|526300|$5,263.00|

US/all top five: Evergreen Energy(cus-10),3/$19,073.50; Pioneer Mobility(cus-9),3/$18,246.00; Atlas Learning(cus-6),4/$14,881.00; Canvas Media(cus-11),2/$12,639.00; Harbor Robotics(cus-7),3/$11,488.00. Values come from records, never hard-coded into the card.

## Local commands and tests

From frontend/:

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm exec -- playwright test tests/outstanding-customers.spec.ts
npm run test:checklist
npm run test:subscriptions
npm run test:session
node scripts/check-assets.ts
npm audit
```

No new runner/config/package. `npm test` automatically includes the new filename. Calculation tests cover all audited scopes, partial/fully-paid/draft behavior, empty selections, same-name/different-ID groups, ordering/ties/top-five truncation with full totals, missing/foreign customers, invalid scoped money, aggregate overflow, currency/entity validation and frozen input immutability. Browser tests verify placement/full totals/top-five data, period/entity changes, existing links and global scope preservation, existing receipt workflow reducing $750 to $500, reviewer viewing without mutation controls, zero fetch/XHR, unchanged stored financial state/scope across hydration/navigation/re-render, plaintext hostile/long names, focus/keyboard and320/390px layout, empty and unavailable states with no runtime errors. Existing tests/assertions remain intact.

The local full default suite passed49 tests (34 existing+15 new) after the final styles. Backend typecheck/lint/build and17 real PostgreSQL/HTTP tests passed without backend edits. Both contract validators and pinned Redocly2.8.0 minimal lint passed. Final local results: **85 tests passed, zero skipped** (17 backend +49 default +14 checklist +4 subscriptions +1 HTTPS production-session). Both applications typecheck/lint/build, both full npm audits (zero known vulnerabilities), built asset credential scans and staged scope/secret checks passed. Both validators and OpenAPI lints passed. Existing Docker build and synthetic application dump/restore rehearsal also passed without backend edits; image finai-backend:outstanding-check, sha256:5227f80268972836ed6b34a9fe66c26a864790afb342ba22205e6c69f19ec8be. No historical CI result is substituted for these checks. Third-party Zod annotation and test color-environment warnings are nonfatal.

## Visual evidence

Local generated screenshots are intentionally ignored, outside the seven allowed tracked paths:

- frontend/artifacts/outstanding-customers/before-homepage-{1440,390,320}.png
- frontend/artifacts/outstanding-customers/after-homepage-{1440,390,320}.png
- frontend/artifacts/outstanding-customers/before-overview-{1440,390,320}.png
- frontend/artifacts/outstanding-customers/after-overview-{1440,390,320}.png
- frontend/artifacts/outstanding-customers/after-long-name-320.png

Compared before/after images and geometry: homepage PNGs are byte-identical at all3 widths; existing Overview header and FinanceSnapshot bounding boxes are identical; no page-level horizontal overflow. Only the new card and the corresponding downward shift of Recent activity/footer are intentional. The card table headings/column spacing were refined after screenshot review, then verified with the full suite. No tracked screenshot, generated output or environment change is included.

## Manual verification and unrelated limits

Enter the existing demo workspace → Overview → see US/all $142,170.00,30 invoices/14 customers → select September ($27,005.00,5/5) → Europe ($5,263.00,1/1) → open Prism Data → return using Overview → View outstanding invoices (one matching row). Existing entity/period selections remain. Applying a demo receipt through the existing invoice detail updates the card on return. Reviewer can view but the card has no financial controls.

The supplied review observed “API proxy is not configured” on deployed Subscription renewals. That unrelated hosting issue is outside this frontend feature; no hosting secrets/settings or live backend connection was changed or newly verified. The separately described Google/OpenRouter service and deployed build SHA remain unverified. No broader production readiness claim is made.

Publishing is authorized only to the new non-main branch. Existing CI is configured for pushes/PRs and is unchanged; production deployment, merging and paid resources are not authorized. Normal Vercel branch pushes may trigger previews; preview status and production deployment must be distinguished. GitHub API access returned403 while inspecting baseline Actions, so hosted status/draft PR creation require an available API and are reported separately from local verification.


## Fresh review — 24 October 2026 (Asia/Dhaka)

Reused the existing remote branch `feat/overview-outstanding-customers` at `b5c275c121950ceaca999f78c7dab1fadd292ba2`; fetched main remained `55e79b3ba16b0c1f455d01ac9f09e125dea92da8`. The checkout was clean. Sequential frontend reviewer/integrator and coordinator roles were used, without agents or worktrees. Review found no blocking defect in the pure calculation, card, scoped styles or existing tests, so application code and tests were preserved. Only this documentation and a coordinator append in `context/progress.md` changed during the fresh review. Earlier results above are historical evidence, not checks rerun by this session.

Fresh commands from `frontend/`, using Node 24.19.0/npm 11.9.0 and system Chromium 154:

- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npm test -- --workers=1`: **49 passed, zero skipped** (9 calculation, 6 feature browser, 34 existing regression tests). One worker was chosen after an intermittent blank-page failure in the earlier main onboarding run; that main test passed in isolation and all 34 main tests subsequently passed with one worker. Tracked runner settings and assertions remain unchanged.
- `VITE_CHECKLIST_MODE=api VITE_AUTH_MODE=session VITE_API_BASE_URL=/api/v1 npm exec -- vite build --outDir artifacts/session-dist`: passed; this builds assets, not an authenticated backend verification.
- `node scripts/check-assets.ts`: passed after preparing both asset directories. An initial scan correctly refused to run without session assets; no scan assertion was changed.
- An independent seed-only invoice grouping (without the feature function) confirmed all four totals/counts and the US/all top-five IDs, invoice counts and amounts listed above.
- `git diff --check` and seven-path scope review: passed before the review documentation commit.

Fresh visual evidence is outside the checkout at `/workspace/finai-outstanding-review-20261024/`: `before-homepage-{1440,390,320}.png`, `after-homepage-{1440,390,320}.png`, `before-overview-{1440,390,320}.png`, `after-overview-{1440,390,320}.png`, and `card-{1440,390,320}.png`. `before-geometry.json`, `after-geometry.json` and `comparison.json` record measurements. Main was captured by temporarily switching to the unchanged local `work` branch at the main SHA in the same checkout, then returning to the feature branch after capture; no reset, worktree or source rewrite was used. Homepage files are byte-identical at all three widths; Overview header and FinanceSnapshot rectangles match exactly. Recent activity moves down by 546px/641px/696px respectively, following the inserted card. Captures had no page errors or horizontal overflow. Desktop/mobile card captures were visually inspected. The existing feature suite also generated its ignored hostile-name capture at `frontend/artifacts/outstanding-customers/after-long-name-320.png`.

External limits: GitHub API calls (`gh pr list` and `gh run view 39924929050`) returned HTTP 403/Forbidden; the cited hosted result is supplied historical evidence, not independently verified here. Native Git read access works. The live reference request to `https://new-f-in-ai.vercel.app/` was denied by the egress proxy with HTTP 403, so live navigation and deployment provenance remain unverified. No hosting/environment/secret/network configuration was changed to bypass those restrictions. Backend and database integration suites were not rerun for this frontend-only review; the earlier onboarding Prisma download blocker remains separate. No merge, main push or production deployment is authorized or claimed.

Draft PR creation was attempted with the requested title/base/head and a prepared body using `gh pr create --draft --body-file /workspace/finai-outstanding-review-20261024/pr-body.md`; GitHub GraphQL returned Forbidden. No PR creation or status is confirmed. The body is retained for retry once API access is available.
