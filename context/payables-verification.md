# Full invoice product verification — 3 November 2026

## Scope and provenance

Reviewer role: run all available application suites and scoped runtime/recovery checks; preserve existing data and unrelated source. Handoff: actual results, any reproducible defects, and limits of production evidence. Corrections use the owning frontend role; shared evidence uses the coordinator role. No parallel agents or worktrees.

The starting checkout was clean at `e729bdcb65429044cc6ecd1a501a512415303021` on `feat/supplier-invoice-approvals`. Remote main was `8f8fd5623276133763b0e2c2f31b6dc976daa4df`, the existing PR#21 merge. Its Git tree exactly matched the tested implementation tree `dfa4bbf321064b909e2f1b5dba5b10515da6b9f4`. This verification did not merge or deploy anything. The follow-up commit contains only the mobile correction, regression assertions and this evidence.

## Finding and correction

Screenshot review of the actual signed-in PDF journey found a narrow-screen defect despite the original containment tests passing: at320px, document controls consumed the row and the filename collapsed into a vertical column. A new regression assertion reproduced a metadata width of8.90625px against a minimum120px. That deliberate pre-fix reproduction failed as expected.

The scoped mobile CSS now reserves a row for the document icon/name/status and wraps action buttons below. Controlled fixtures include a long filename and a clean document with all three actions. Both controlled320/390/1440 checks and the real signed-in journey assert readable metadata width as well as horizontal containment. Screenshot review confirms readable wrapping. No backend, schema, dependency, public-page or global-style changes were needed.

Post-fix acceptance: all8 updated UI tests and all6 real application journeys passed, with no skips, alongside repeat frontend typecheck/lint/build and the asset scan. No application failure remains in the tested scope.

## Full regression results

The full run passed230 tests with zero failures/skips before the visual correction. After the correction, the affected UI8 and real-runtime6 passed again; backend and unrelated application source are unchanged. The final six-scenario runtime result is recorded above. These are local synthetic tests, not hosted CI or production traffic.

| Command (application directory) | Passed |
|---|---:|
| Backend `npm test` |77 |
| Frontend `npm test` |51 |
| `npm run test:checklist` |14 |
| `npm run test:subscriptions` |4 |
| `npm run test:receivables` |5 |
| `npm run test:session` |1 |
| `npm run test:receivables:production` |1 |
| `npm run test:workspace` |18 |
| `npm run test:workspace:production` |2 |
| `npm run test:assistant` |12 |
| `npm run test:assistant:production` |1 |
| `npm run test:public-chat` |22 |
| `npm run test:payables` |8 |
| `npm run test:payables-transport` |2 |
| `npm run test:payables:integration` |6 |
| Packaged `playwright.vercel.config.ts` |6 |
| Total |230 |

All21 browser test files were accounted for against the executed logs. The frontend total153 includes151 browser checks and2 Node transport checks. Backend tests use the actual PostgreSQL/HTTP paths and controlled provider protocols where appropriate. Browser suites run sequentially with fresh owned servers to avoid port/fixture collisions. Integration packaging runs after backend tests because it performs its own backend npm ci.

The real AP scenarios cover supplier creation, original PDF bytes larger than16KiB, a declared-total mismatch and correction, actual PDF canvas content, assigned factual verification, two sequential approvals, balanced immutable CSV, runtime restart/replay, duplicate/currency/CSRF/body-cap/assignment/concurrent-decision checks, foreign-resource denial, AP-grant session revocation and ordinary company-access removal. Tests labelled production use built local HTTPS fixtures; that name does not mean an external deployment was tested.

## Additional checks

- Separate locked `npm ci` installs, backend Prisma generation/schema validation, and both applications’ typecheck/lint/build passed. The frontend checks/build ran again after the CSS correction.
- Both full npm audits report0 vulnerabilities. No lockfiles or dependencies changed during verification.
- All seven contract validators passed; regenerated payables OpenAPI is deterministic. Redocly2.8.0 validates all seven OpenAPI files with zero errors. Its28 nonblocking warnings concern documentation operation IDs/unused components.
- `bash backend/scripts/payables-storage-check.sh` passed: private document/export byte and SHA256 preservation, route/history/policy/grants restore, cross-entity FK denial.
- `bash backend/scripts/restore-rehearsal.sh` passed: the real AP service reached approval/export before backup; restored application retained AP PDF/export/history plus existing checklist/subscription/receivable/Assistant state and all eight migrations.
- Local `prisma migrate status` reports all eight migrations applied. Actual liveness, readiness and database-backed entity endpoints returned200. No reset/reseed was performed for this verification.
- Built-asset scans cover demo/session/receivables/workspace/Assistant/public-chat/payables, including PDF worker mjs. Available backend credential values and production localhost fallback were absent.
- Native query/schema engine identities match the exact installed Prisma pin `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`. Verified source builds are a development fallback, not proof of RHEL hosting compatibility.

Ignored local evidence is under `frontend/artifacts/verification/`; actual and controlled screenshots are under `frontend/artifacts/payables/`. No synthetic passwords, browser state, database URLs or private documents are committed in this report.

## Unverified external boundaries

Native Git read/push works. Both GitHub Actions/check-runs API requests returned HTTP403, so hosted CI status could not be confirmed. A verified-TLS request to the existing Vercel site was also blocked by the environment proxy with HTTP403; this does not establish that the site itself is failing.

No production scanner, signature-update path, target hosting/database/session configuration, real provider integration, financial jurisdiction mapping, production backup RPO/RTO or compliance certification was verified. ClamAV protocol/fail-closed tests use a controlled server; synthetic PDF admission is test-only. Those operational gates and the deferred OCR/email/payment/ERP scope remain documented in `backend/PAYABLES.md`. No production access or deployment is implied by the passing local suites.
