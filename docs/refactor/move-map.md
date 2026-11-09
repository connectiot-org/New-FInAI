# Refactor move map — phase 1 plan (for user approval)

One row per planned relocation or verbatim extraction, grouped by phase. Rules
obeyed everywhere: `git mv` for whole files (history preserved), verbatim cuts of
top-level units only, import/export-specifier updates only, no identifier
renames, no logic/JSX/CSS/text/route/API/schema changes, catalog
(`docs/repository-guide.md`) rows updated in the same commit as each move.

Gate per phase (from the refactor brief): full baseline matrix equal to
`docs/refactor/baseline.md`, line-conservation check clean, contracts
regeneration byte-identical, `git diff pre-refactor-baseline -- backend/prisma`
empty, pixel diff clean (frontend phases). Known baseline deviations that stay
acceptable: the single environment-caused checklist failure documented in the
baseline.

Notation: **move** = `git mv` whole file; **extract** = verbatim cut of listed
top-level units into a new file (+ `export` keyword on them, + re-import in the
origin file); **create** = new barrel/docs file only.

---

## Phase B2 — Backend: relocate loose root files

| # | Old path | New path | Kind | Reason |
| --- | --- | --- | --- | --- |
| 1 | `backend/src/checklist.repository.ts` | `backend/src/checklist/repository.ts` | move | Domain file out of `src/` root into its feature folder |
| 2 | `backend/src/checklist.service.ts` | `backend/src/checklist/service.ts` | move | Same |
| 3 | `backend/src/checklist.controller.ts` (inline class `ChecklistController`, `app.ts` lines 79–183) | `backend/src/checklist/controller.ts` | extract | Domain controller does not belong in the composition root (mirrors every other domain) |
| 4 | `backend/src/subscription.controller.ts` | `backend/src/subscriptions/controller.ts` | move | Singular→plural folder mirrors frontend `features/subscriptions/` |
| 5 | `backend/src/subscription.repository.ts` | `backend/src/subscriptions/repository.ts` | move | Same |
| 6 | `backend/src/subscription.service.ts` | `backend/src/subscriptions/service.ts` | move | Same |
| 7 | `backend/src/subscription.validation.ts` | `backend/src/subscriptions/validation.ts` | move | Same |
| 8 | `backend/src/auth.ts` | `backend/src/auth/auth.ts` | move | Own feature folder per target tree |
| 9 | `backend/src/audit.ts` | `backend/src/common/audit.ts` | move | Cross-domain helper → `common/` |
| 10 | `backend/src/validation.ts` | `backend/src/common/validation.ts` | move | Cross-domain helper → `common/` |

Resulting `backend/src/` root: `main.ts`, `app.ts`, `config.ts`, `database.ts`,
`errors.ts` + folders `common/ auth/ checklist/ subscriptions/ assistant/
payables/ ledger/ receivables/ workspace/` — exactly the target tree.

Import specifier updates required (from the measured reference map):

- `backend/src/app.ts` — all nine moved modules + the extracted controller.
- `backend/src/checklist/service.ts` (imports `./checklist.repository` → `./repository`).
- `backend/src/subscription.controller.ts` / `repository` / `service` (relative
  specifiers become same-folder `./service`, `./repository`, `./validation`).
- `backend/src/assistant/facts.ts`, `assistant/service.ts`, `ledger/source.ts`,
  `receivables/*.repository.ts`, `receivables/repository.ts` (import
  `../checklist.repository` / `../auth` / `../audit` / `../validation`).
- `backend/test/checklist.test.ts`, `assistant.test.ts`,
  `invoice-assistant.test.ts`, `receivables.test.ts`, `receivables-changes.test.ts`
  (source-relative specifiers).
- `backend/scripts/accounts.mts` (`dist/src/auth.js` → `dist/src/auth/auth.js`),
  `cleanup.mts` + `workspace-admin.mts` (`dist/src/audit.js` → `dist/src/common/audit.js`),
  `import-ledger.mts` + `import-receivables.mts` (`dist/src/checklist.repository.js`,
  `dist/src/validation.js` → new paths).
- `frontend/scripts/session-fixture.ts` (dynamic import
  `../../backend/dist/src/checklist.repository.js` → `…/checklist/repository.js`).
- `docs/repository-guide.md` — path column of the 10 affected purpose rows
  (guard `check:repository` enforces exact paths; new row for
  `backend/src/checklist/controller.ts`).

Caution while executing: imports of `"./validation"` / `"../validation"` inside
`assistant/` and `receivables/` refer to those domains' own `validation.ts`, not
the root file — only specifiers that actually resolve to `src/validation.ts` are
touched. Verified with the TypeScript compiler after the phase.

## Phase B3 — Backend: Tier A extraction from oversized files

| # | Origin | New file | Units extracted (verbatim, top-level) | Effect |
| --- | --- | --- | --- | --- |
| 1 | `backend/src/payables/service.ts` (983) | `backend/src/payables/errors.ts` | `const missing`, `const conflict` (error factories) | service.ts ≈ 975 |
| 2 | same | `backend/src/payables/types.ts` | `type Tx`, `type Grant`, `type Invoice` | service.ts ≈ 965 |
| 3 | `backend/src/assistant/service.ts` (914) | `backend/src/assistant/errors.ts` | `const missing`, `const conflict` | service.ts ≈ 900 |
| 4 | same | `backend/src/assistant/serializers.ts` | `const conversation`, `const turn` (record serializers) | service.ts ≈ 875 |
| 5 | `backend/src/ledger/source.ts` (427) | `backend/src/ledger/domain.ts` | `const cents`, `const account`, `const ledgerInput`, `type LedgerInput`, `function validateLedger`, `function mappingDigest`, `function exact`, `function calculateLedger` | source.ts ≈ 195 (service+controller); mirrors the `payables/domain.ts` convention |

Import updates: `payables/service.ts`, `assistant/service.ts` re-import the
extracted units; `backend/scripts/evaluate-assistant.mts` and
`import-ledger.mts` update `dist/src/ledger/source.js` specifiers for the moved
pure functions; `backend/test/assistant.test.ts` (validateLedger/calculateLedger
imports, if sourced from `./ledger/source`); catalog rows for the three new
files.

Written justification for files that stay >500 after Tier A (required by the
brief): `payables/service.ts` and `assistant/service.ts` are single
`@Injectable()` classes (`PayablesService` ≈ 932 lines, `AssistantService` ≈
861) whose method bodies may not be split under Tier A; Tier B (class split) is
explicitly not approved by default — recorded in `observations.md` with proposed
follow-ups. `assistant/facts.ts` (615) is one class + one 9-line helper:
extraction adds no value; recorded. `app.ts` (546 → ≈ 440 after B2) is the
composition root and stays by rule.

## Phase F4 — Frontend: demo sandbox (`features/demo/`)

State layer first (all moves):

| # | Old path | New path |
| --- | --- | --- |
| 1 | `frontend/src/store/index.ts` | `frontend/src/features/demo/state/store.ts` |
| 2 | `frontend/src/demo/seed.ts` | `frontend/src/features/demo/state/seed.ts` |
| 3 | `frontend/src/demo/selectors.ts` | `frontend/src/features/demo/state/selectors.ts` |
| 4 | `frontend/src/types/domain.ts` | `frontend/src/features/demo/state/domain.ts` |

Screens (one folder per screen; split only along existing top-level units;
every unit keeps its exact exported name):

| # | Old path | New files | Units (as measured) |
| --- | --- | --- | --- |
| 5 | `features/Overview.tsx` (46) | `demo/overview/OverviewPage.tsx` | `Overview` (single unit; file named `*Page.tsx` as the routed composition) |
| 6 | `features/Accounting.tsx` (890) | `demo/accounting/AccountingPage.tsx` + `journal-editor.tsx`, `journals.tsx`, `journal-detail.tsx`, `ledger.tsx`, `accounts.tsx`, `trial-balance.tsx`, `audit.tsx`, `accounting-support.ts` | `JournalEditor`, `Journals`, `JournalDetail`, `Ledger`, `Accounts`, `TrialBalance`, `Audit`; support file: `amountPattern`, `toCents`, `journalSchema`, `type JournalValues` |
| 7 | `features/Operations.tsx` (1242) | `demo/operations/OperationsPage.tsx` (re-export barrel of routed units) + `invoice-editor.tsx`, `invoices.tsx`, `invoice-detail.tsx`, `parties.tsx`, `party-detail.tsx`, `bills.tsx`, `bill-detail.tsx`, `contracts.tsx`, `contract-detail.tsx`, `schedules.tsx`, `bank-accounts.tsx`, `reconciliation.tsx`, `operations-support.ts` | the 12 exported screen components + `InvoiceEditor`; support: `invoiceSchema`, `type InvoiceValues` |
| 8 | `features/Reports.tsx` (530) | `demo/reports/ReportsPage.tsx` + `statement.tsx`, `entities.tsx`, `consolidation.tsx`, `reports-support.ts` | `Reports`, `Statement`, `Entities`, `Consolidation`, `OperationalSnapshot`; support: `reportData`, `ReportSection`, `previous`, `ReportRow`, `ReportGroup` |
| 9 | `features/Close.tsx` (200) | `demo/close/ClosePage.tsx` | `Close` (single unit) |
| 10 | `features/Administration.tsx` (781) | `demo/administration/AdministrationPage.tsx` + `automations.tsx`, `automation-editor.tsx`, `integrations.tsx`, `settings.tsx`, `administration-support.ts` | `Automations`, `AutomationDetail`, `AutomationEditor`, `Integrations`, `Settings`; support: `catalog` |
| 11 | `features/LegacyAssistant.tsx` | `demo/legacy-assistant/LegacyAssistantPage.tsx` | `LegacyAssistant` (single unit; lazy route keeps a single-component module) |
| 12 | `features/Assistant.tsx` (public chat wrapper) | `demo/public-assistant-slot/PublicAssistantSlot.tsx` | `Assistant` (exported name unchanged; folder name disambiguates the three Assistants) |

Naming note: `*Page.tsx` files are thin composition/entry files; every other
file is named after the exact unit it contains. Kebab-case for non-component
files per the convention.

Import updates: `app/router.tsx` (static imports + the two lazy specifiers
`features/LegacyAssistant` → `features/demo/legacy-assistant/LegacyAssistantPage`,
`features/Assistant` → `features/demo/public-assistant-slot/PublicAssistantSlot`),
`app/Shell.tsx`, `app/navigation.ts`, `main.tsx` (`../store` →
`../features/demo/state/store`), all demo screens' cross-imports
(`Administration`→`Accounting`, `Operations`→`Accounting`, `seed`→`Operations`
types), `features/marketing/ProductPreview.tsx` + `ReferenceHome.tsx` (import
demo selectors/store), `features/payables/development-store.ts` (Operations
types), `frontend/tests/outstanding-customers.spec.ts`, `workflows.spec.ts`
(`../src/demo/seed`, `../src/types/domain`, `../src/store`…), catalog rows.

Gate additions: pixel diff of all 44 routes × 3 viewports byte-identical; lazy
chunk boundaries unchanged (lazy specifiers still point at single-component
modules).

## Phase F5 — Frontend: feature folders, barrels and the payables split

### payables/ (the 2,267-line file)

| # | Old | New | Units |
| --- | --- | --- | --- |
| 1 | `payables/api.ts` (160) | `payables/api/client.ts` | whole file (`request`, `binary`, `PayablesClient`, `PayablesClientContext`, `usePayablesClient`, `amount` money formatter) |
| 2 | `payables/schemas.ts` | `payables/api/schemas.ts` | whole file — **requires the sanctioned `contracts/generate-payables.mts` require-path update** (only contracts edit allowed) |
| 3 | `payables/PdfPreview.tsx` | `payables/components/pdf-preview.tsx` | whole file |
| 4 | `payables/Payables.tsx` (2267) | `payables/pages/payables.tsx` | `Payables` (routed switcher, ~99 lines) + `Scoped`, `Caps`, `memberName` (scope helpers used by pages) |
| 5 | same | `payables/pages/register.tsx` | `Register` (456) |
| 6 | same | `payables/pages/invoice-detail.tsx` | `Detail` (564) |
| 7 | same | `payables/pages/suppliers.tsx` | `Suppliers` (169) |
| 8 | same | `payables/pages/policies.tsx` | `Policies`, `PolicyEditor`, `ChainFields` + `type Chain`, `chainSchema`, `definitionSchema`, `policyResponse` |
| 9 | same | `payables/pages/access-grants.tsx` | `InvoiceAccess`, `AccessRow` + `accessSchema` |
| 10 | same | `payables/components/invoice-form.tsx` | `InvoiceForm` (331) |
| 11 | same | `payables/components/money-input.tsx` | `MoneyInput` |
| 12 | same | `payables/components/notices.tsx` | `Notice`, `ShieldNotice` |
| 13 | same | `payables/components/register-support.ts` | `labels`, `blankLine`, `fresh`, `useLoad` |
| 14 | `payables/DevelopmentPayables.tsx` | `payables/sample/DevelopmentPayables.tsx` | whole file (lazy route import updated to single-component module) |
| 15 | `payables/development-store.ts` (937) | `payables/sample/development-store.ts` | whole file (single cohesive IndexedDB store; internal top-level units stay — see observations) |
| 16 | `payables/payables.css` | `payables/styles/payables.css` | move |
| 17 | (new) | `payables/index.ts` | barrel exporting the public door only: `Payables`, `DevelopmentPayables` (+ PdfPreview if consumed outside) |

Router lazy specifiers updated to `features/payables/pages/payables` and
`features/payables/sample/DevelopmentPayables` (single-component modules — chunk
boundaries preserved).

### assistant/ (851-line file + companions)

| # | Old | New |
| --- | --- | --- |
| 1 | `assistant/Assistant.tsx` (851) | `assistant/components/ProductionAssistant.tsx` (entry, 269) + `assistant/components/Chat.tsx` (416) + `assistant/components/Memory.tsx` (150) — lazy route import points at `components/ProductionAssistant` |
| 2 | `assistant/InvoiceAction.tsx`, `LedgerSource.tsx`, `OperationalSource.tsx` | `assistant/components/…` (verbatim moves, same names) |
| 3 | `assistant/api.ts` | `assistant/api/client.ts` |
| 4 | `assistant/assistant.css` | `assistant/styles/assistant.css` |
| 5 | (new) | `assistant/index.ts` barrel |

### Other feature folders (moves + barrels only; no body splits)

| Feature | Moves | Barrel exports |
| --- | --- | --- |
| `receivables/` | `api.ts`→`api/client.ts`; `changes-api.ts`→`api/changes-client.ts`; `detail-api.ts`→`api/detail-client.ts`; `OutstandingCustomers.tsx`, `ImportedOutstandingCustomers.tsx`→`components/`; `changes.ts`, `source-schema.ts`, `format.ts`, `outstandingCustomers.ts`→`api/` (pure schema/format/calculation modules); `outstanding-customers.css`→`styles/` | `OutstandingCustomers`, `ImportedOutstandingCustomers` |
| `subscriptions/` | `api.ts`→`api/client.ts`; `SubscriptionRenewals.tsx` split → `components/SubscriptionRenewals.tsx` (routed entry) + `components/RenewalsBody.tsx` (496-line single unit — no body split); `subscriptions.css`→`styles/` | `SubscriptionRenewals` |
| `checklist/` | `api.ts`→`api/client.ts`; `MonthlyChecklist.tsx` split → `components/MonthlyChecklist.tsx` (entry) + `components/ChecklistBody.tsx` (440-line single unit); `checklist.css`→`styles/` | `MonthlyChecklist` |
| `workspace/` | screens → `components/` (`Workspace.tsx`, `Administration.tsx`, `Imports.tsx`, `ImportChanges.tsx` split → `components/ImportChanges.tsx` + `components/changes/…` if desired, `ReceivablesRegister.tsx` single-unit move, `context.tsx`→`context.tsx` at folder root); `workspace.css`→`styles/` | `Workspace` |
| `marketing/` | `Marketing.tsx` (686) split along top-level units: `MarketingLayout.tsx`, `HomePage.tsx`, `ProductPage.tsx`, `ResourcesPage.tsx`, `AboutPage.tsx`, `DemoCustomersPage.tsx`, `PublicMenu.tsx`, `BookmarkGuide.tsx`, `CallToAction.tsx`, `navigation-content.ts` (`coreSlugs`, `solutionGroups`, `partnerGroups`, `type PublicItem`); `ReferenceHome.tsx` (982) split: `ReferenceHome.tsx` (entry) + `ReferenceWalkthrough.tsx`, `HeroWorkspace.tsx`, `PlatformArt.tsx`, `AssistantIllustration.tsx`, `WorkflowStories.tsx`, `PreviewExplorer.tsx`, `reference-content.ts` (`platform`, `journeys`, `aiSections`); `ProductDetails.tsx` (376) split: `ProductDetails.tsx` + `RecordIllustration.tsx`, `ReviewIllustration.tsx`, `EntityIllustration.tsx`, `HistoryIllustration.tsx`, `RelatedProducts.tsx`; `ProductPreview.tsx` (354, single 321-line unit) moves as-is; `content.ts` stays | router imports via `marketing/index.ts` |
| `public-chat/` | `PublicChat.tsx`→`components/PublicChat.tsx` (391-line single unit, moves as-is); `public-chat.css`→`styles/` | `PublicChat` |

### Shared components (Tier A split of the two dumping grounds)

| # | Old | New | Units |
| --- | --- | --- | --- |
| 1 | `components/shared/Common.tsx` (236) | `components/shared/page-header.tsx`, `tabs.tsx`, `period-selector.tsx`, `money-cell.tsx`, `metric.tsx`, `back.tsx`, `missing.tsx`, `document-preview.tsx`, `help.tsx` + `components/shared/index.ts` barrel | the 9 exported components, verbatim |
| 2 | `components/ui/index.tsx` (226) | `components/ui/badge.tsx`, `modal.tsx`, `confirm.tsx`, `empty.tsx`, `field.tsx`, `toast.tsx`, `permission.tsx`, `status-control.tsx` + `components/ui/index.ts` barrel | the 9 exported units (`Badge`, `Modal`, `Confirm`, `Empty`, `Field`, `useToast`+`ToastProvider`+`ToastContext`, `Permission`, `StatusControl`) |

Consumer import specifiers change from `…/shared/Common` and `…/ui` (file) to
`…/shared` and `…/ui` (barrels). Mechanical, compiler-verified.

## Phase F6 — Styles (conditional, risk-gated)

Only action: inspect `styles/global.css` (2735 lines) for a **contiguous**
original-demo block separable from tokens/base. If and only if a contiguous block
exists whose extraction preserves rule order and the single-stylesheet cascade
exactly (moved block imported once, immediately after the base file, no
interleaving), move it to `features/demo/styles/demo.css`. Otherwise leave the
file intact and document. Feature CSS files already co-located with features are
not touched. Gate: byte-identical pixel diff on all routes including print views
at 390 px; any difference reverts the phase.

## Phase X7 — Tests, scripts, configs: **recommend SKIP** (documented)

- Moving the 15 `playwright.*.config.ts` files under `frontend/config/playwright/`
  requires editing every `--config` reference in `frontend/package.json` scripts
  and both CI workflows for zero structural gain; the npm scripts are part of the
  frozen surface (rule 2 forbids dependency changes; script path edits are
  technically allowed but high-risk/low-value).
- Grouping `frontend/tests/` by feature changes 24 spec files' relative imports,
  the fixture path `tests/fixtures/close-evidence.pdf`, and the `testIgnore`
  filename regexes that keep suites disjoint.
- Grouping `backend/test/` changes the `test/*.test.ts` glob in
  `backend/package.json`.
Decision: skip all three; record in `observations.md`. This can be revisited
after the refactor lands.

## Phase D8 — Documentation

1. `README.md` per feature folder (frontend `features/*`, backend
   `common/ auth/ checklist/ subscriptions/ assistant/ payables/ ledger/
   receivables/ workspace/`) using the mandated template (purpose, public entry,
   where-to-change table, related, invariants).
2. Final `docs/feature-map.md` (one row per feature, cross-stack).
3. Final `docs/refactor/move-map.md` (this file, updated with actual results).
4. `docs/repository-guide.md`: purpose-row path updates accompany every phase;
   D8 additionally updates the "Organization rules" text (which currently says
   not to move working code) and the naming-cautions paragraphs to the new
   paths, and refreshes root/app README folder maps and `AGENTS.md` pointers.
5. Short module-boundary comments only where the three Assistants and
   demo/private Administration pairs could invite a wrong edit.

## Sequence and review checkpoints

B2 → B3 (backend, one commit per logical move) → F4 → F5 → F6 → D8 → final
verification. Each phase ends with the report block from the brief. The user may
stop after any phase; every phase leaves the tree green and the branch never
touches `main`.
