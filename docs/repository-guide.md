# Repository and file guide

This is the purpose catalog for every tracked repository file, grouped by responsibility. Start with [README.md](../README.md) for runnable entry points. The [latest verification report](../context/invoice-workspace-refresh.md#final-developertester-verification--4-november-2026) records tested behavior and remaining release gates; this guide explains where that behavior lives.

## Organization rules

Keep the browser, Node adapters, authoritative backend, shared contracts, operational guides and dated evidence in their existing folders. The Vercel project root, imports, npm scripts, CI working directories and migration history depend on those established paths; reorganizing their documentation does not require moving working code.

- Add browser features under `frontend/src/features/<domain>/`; keep shared controls/session helpers in their existing common folders.
- Add authoritative HTTP/domain/data code under the corresponding `backend/src/<domain>/`. Controllers validate transport; services/repositories enforce scoped transactions and financial rules.
- Change shared schemas/examples in `contracts/` before adapting consumers. Generate `contracts/payables.openapi.json` with its committed generator; do not hand-edit generated artifacts or npm lockfiles.
- Put current operating instructions in application READMEs/runbooks; put dated review/handoff evidence in `context/`. Mark original reference screenshots/validation JSON as historical evidence.
- Keep credentials, customer records, dependency directories and compiled/test artifacts out of Git. JSON/lockfiles and binary fixtures are explained here; adding source comments would corrupt JSON or provenance rather than clarify them.
- Use comments for intent and invariants: public/private boundaries, identity lifetimes, explicit confirmation, version/operation retries, exact money, document eligibility, deadlines and cleanup. Keep simple syntax self-explanatory.

## Generated and private folders

| Path | Meaning |
| --- | --- |
| `frontend/node_modules/`, `backend/node_modules/` | Installed dependency graphs recreated by each package's `npm ci`; ignored. |
| `frontend/dist/`, `backend/dist/` | Compiled public browser / server output recreated by builds; ignored. |
| `frontend/.finai-server/` | Private packaged Nest runtime for Vercel; never a public browser asset. |
| `frontend/artifacts/`, `frontend/test-results/`, `frontend/playwright-report/`, `frontend/.vercel/` | Generated samples, screenshots, test logs/traces and local deployment-builder output; ignored, not hosted release certificates. |
| `backend/.env`, application `*.local` settings | Private local runtime configuration; never commit values. Safe setting names live in examples/runbooks. |
| `backend_checklist_pgdata` / Compose PostgreSQL volumes | Persistent local or host-managed database storage outside source control. Stop without volume deletion when retaining records. |

## Frontend files

This guide explains every tracked file under `frontend/`; `npm --prefix frontend run check:repository` verifies the current inventory. Paths are grouped by responsibility, without moving files or breaking imports, routes, test commands, Vercel configuration or screenshot provenance. It includes the tracked npm lockfile, binary test fixture and historical evidence. It excludes ignored `node_modules/`, `dist/`, `artifacts/`, `.finai-server/`, `.vercel/`, browser reports, local settings and TypeScript build caches.

The application has three distinct data boundaries:

- The original accounting demo uses fictional Northstar records and `finai-demo-v1` browser state. Its personas are demonstrations.
- The public supplier-invoice preview uses its separate `finai-invoices-development-v1` IndexedDB store and no financial session/API. Public model chat is a separate stateless server-backed feature without access to company records.
- Private `/workspace/*` financial features use validated server sessions, organisation/entity/AP permissions and the real backend. Neither failed reads nor missing configuration may fall back to demo records.

`src/` is browser code, `api/` and `server/` are server-only deployment code, `scripts/` contains build/test/evidence tools, `tests/` contains regression suites, `public/` contains runtime artwork, and `docs/` contains runbooks or explicitly historical evidence. Named Playwright configurations remain at the package root because npm commands refer to those paths.

Each row below describes one exact file. Test source describes intended verification; execution evidence belongs in the current review report. Screenshot/JSON records describe their historical captures, not current hosted production readiness.


### Project entry, package and tooling settings

| File | Purpose |
| --- | --- |
| `frontend/.gitattributes` | Marks tracked PDF and PNG fixtures as binary so Git does not treat their contents as text diffs. |
| `frontend/.gitignore` | Excludes installed dependencies, build outputs, private packaged server, private environment/local settings and temporary browser evidence; safe environment examples stay reviewable. |
| `frontend/AGENTS.md` | Defines frontend ownership, supported tooling, separate application boundaries and contributor checks; keeps the default and dedicated test suites distinct. |
| `frontend/README.md` | Explains current runtime boundaries, local setup, package commands, source layout, private features and operating guides. |
| `frontend/package.json` | Declares frontend dependencies, Node version and separate repository-guard, browser-test, invoice-demo and Vercel packaging commands. |
| `frontend/package-lock.json` | Pins the complete npm dependency graph and integrity hashes for reproducible installs; regenerate with npm rather than hand editing. |
| `frontend/index.html` | Provides Vite’s HTML document, metadata and React root element; application routes render inside that root. |
| `frontend/eslint.config.js` | Sets TypeScript, React hook and browser/Node lint rules and excludes generated outputs from source linting. |
| `frontend/tsconfig.json` | Enables strict TypeScript checks for browser code, tests, Vite, every Playwright configuration and API entrypoints without emitting JavaScript. |
| `frontend/tsconfig.server.json` | Adds NodeNext module-resolution checks for API/server code so production server imports retain valid runtime extensions. |
| `frontend/vite.config.ts` | Registers React/Tailwind plugins and defines development hosting plus stable vendor bundle groups for browser builds. |
| `frontend/vercel.json` | Routes API/auth requests to the Node function, preserves the SPA fallback and includes the private backend package in deployment. |

### Playwright suite selection and runtime setup

| File | Purpose |
| --- | --- |
| `frontend/playwright.config.ts` | Base Chromium/browser setup for public and local demo tests; explicitly excludes suites that require their own authenticated or API setup. |
| `frontend/playwright.assistant-production.config.ts` | Selects the built private Assistant test and inherits the HTTPS/session test environment with a longer test timeout. |
| `frontend/playwright.assistant.config.ts` | Selects controlled private Assistant UI tests using the authenticated Vite configuration. |
| `frontend/playwright.checklist.config.ts` | Runs checklist tests serially against the dedicated local API on port 3001 and a fresh API-mode Vite server. |
| `frontend/playwright.invoice-demo.config.ts` | Runs no-login invoice tests against the independently built static demo server on port 4173. |
| `frontend/playwright.payables-integration.config.ts` | Selects serial real-database invoice journeys; each test group manages its own remote, embedded or packaged HTTPS fixture. |
| `frontend/playwright.payables.config.ts` | Selects controlled payables UI tests using the private workspace configuration. |
| `frontend/playwright.public-chat.config.ts` | Selects built public model-chat tests; controlled provider fixtures manage their own HTTPS service. |
| `frontend/playwright.receivables-production.config.ts` | Selects the built authenticated imported-receivables browser test. |
| `frontend/playwright.receivables.config.ts` | Starts a fresh session/API-mode Vite server for controlled imported-receivables tests. |
| `frontend/playwright.session.config.ts` | Base for built HTTPS/session tests that start their own fixture server instead of the Vite development server. |
| `frontend/playwright.subscriptions.config.ts` | Runs subscription tests serially against their isolated local API on port 3002. |
| `frontend/playwright.vercel.config.ts` | Selects private packaged-backend tests with listener-free startup and session/database assertions. |
| `frontend/playwright.workspace-production.config.ts` | Selects built private workspace and import-comparison tests using the HTTPS/session base. |
| `frontend/playwright.workspace.config.ts` | Starts a fresh fully configured private Vite workspace and selects controlled workspace/register/comparison tests. |

### Deployed server entry and private/public transport boundaries

| File | Purpose |
| --- | --- |
| `frontend/api/proxy.ts` | Vercel Node entrypoint: dispatches anonymous chat before private initialization, then selects validated embedded or remote private API transport. |
| `frontend/server/embedded.ts` | Lazily initializes the packaged Nest backend without opening a listener and forwards bounded requests with server-owned proxy proof. |
| `frontend/server/public-chat.ts` | Implements anonymous free-model discovery/completion with bounded input, provider deadlines, safe errors and no financial database access. |
| `frontend/server/request-body.ts` | Reads private request bodies with absolute deadlines, raw-byte requirements, byte caps and interruption/cleanup handling. |

### Build, evidence and synthetic integration scripts

| File | Purpose |
| --- | --- |
| `frontend/scripts/assistant-provider-fixture.ts` | Returns controlled model plans/composition for full-path tests; never supplies a production model or provider fallback. |
| `frontend/scripts/build-invoice-demo.mjs` | Builds the independent no-login invoice demo and writes its public assets, tiny server, usage README and build metadata under ignored artifacts. |
| `frontend/scripts/capture-rillet-reference.py` | Downloads an isolated static visual reference with normal TLS verification and rewrites supporting assets for reproducible comparison. |
| `frontend/scripts/check-repository.mjs` | Checks the complete file-purpose catalog, ignored-output/environment boundaries and application literal imports using the installed TypeScript parser; local and CI development tooling. |
| `frontend/scripts/check-repository.test.mjs` | Tests valid extension layouts and rejects catalog drift, private/generated files, browser server dependencies and cross-runtime/computed imports in disposable synthetic fixtures. |
| `frontend/scripts/check-assets.ts` | Scans built public browser assets for available injected credential values and rejects localhost API fallbacks in session-enabled builds. |
| `frontend/scripts/payables-fixture.ts` | Creates and cleans isolated synthetic invoice accounts/database state and serves real remote, embedded or packaged HTTPS integration runtimes. |
| `frontend/scripts/payables-pdf.ts` | Constructs the valid synthetic PDF shared by invoice transport and browser integration tests. |
| `frontend/scripts/payables-transport.test.ts` | Exercises private transport byte limits, exact PDF/CSV handling, allowlists, body deadlines, incomplete clients and cleanup against controlled runtimes. |
| `frontend/scripts/rea-ui-audit.mjs` | Invokes the pinned external REA CLI for reproducible public-page screenshots/comparisons and records provenance and limitations. |
| `frontend/scripts/serve-invoice-demo.mjs` | Serves only the standalone demo’s public dist files with SPA fallback; deliberately exposes no financial API or account service. |
| `frontend/scripts/smoke-hosted.mjs` | Environment-configured hosted deployment smoke checks (read-only by default, one draft invoice with `SMOKE_WRITE=1`); redacts tokens/cookies/credentials from all output and exits non-zero on any failed check. |
| `frontend/scripts/smoke-hosted.test.mjs` | Tests the smoke script’s pure logic: secret redaction, security-header evaluation, session-cookie parsing, environment validation, exit codes and asset/chunk URL extraction. |
| `frontend/scripts/session-fixture.ts` | Builds isolated synthetic PostgreSQL/session/HTTPS/proxy test state and controlled model data for built-workspace browser tests. |
| `frontend/scripts/subscriptions-fixture.ts` | Starts and cleans the dedicated synthetic PostgreSQL schema and local API for subscription browser tests. |
| `frontend/scripts/vercel-build.mjs` | Installs/builds backend dependencies separately, assembles the ignored private server package and builds session-enabled browser assets within the size budget. |

### Browser bootstrap and route layout

| File | Purpose |
| --- | --- |
| `frontend/src/main.tsx` | Mounts React with the demo Redux store, toast provider, global styling and application router. |
| `frontend/src/app/router.tsx` | Defines public/demo/private routes, compatibility redirects, lazy feature loading, entry screens and not-found handling. |
| `frontend/src/app/Shell.tsx` | Renders the original demo’s sidebar, global entity/period controls, search, Assistant panel and routed content. |
| `frontend/src/app/navigation.ts` | Declares demo navigation groups, routes/icons and page-title metadata used by the shell. |
| `frontend/src/lib/api.ts` | Shared typed private JSON client with same-origin configuration checks, CSRF, bounded requests and identity-epoch result fencing. |
| `frontend/src/lib/session.ts` | Validates session responses, deduplicates concurrent checks and invalidates private views across identity changes and browser tabs. |

### Shared browser controls

| File | Purpose |
| --- | --- |
| `frontend/src/components/SessionGate.tsx` | Owns validated sign-in/session checking and logout around private screens; nested consumers inherit the existing gate. |
| `frontend/src/components/shared/BrandMark.tsx` | Reusable original FinAI mark used across public pages, welcome, previews and workspace headers. |
| `frontend/src/components/shared/Common.tsx` | Shared demo page headers, tabs, periods, metric cells, back/missing states and bounded document/help presentation. |
| `frontend/src/components/shared/FinanceSnapshot.tsx` | Shows the original demo’s scoped posted-ledger metrics and approved close progress without implying private live financial data. |
| `frontend/src/components/shared/Table.tsx` | Reusable TanStack table rendering with sorting, selection, pagination and keyboard-accessible row actions. |
| `frontend/src/components/shared/useUnsaved.tsx` | Coordinates unsaved-change confirmation for dialog dismissal, router/back navigation and page unload while allowing completed saves. |
| `frontend/src/components/ui/index.tsx` | Exports common Radix dialogs/drawers, confirmations, badges, toast notifications and demonstration permission/state controls. |

### Original browser demo state and domain

| File | Purpose |
| --- | --- |
| `frontend/src/demo/seed.ts` | Creates balanced fictional Northstar entities, accounts, journals, subledger records and six-month demonstration data. |
| `frontend/src/demo/selectors.ts` | Computes scoped posted-ledger balances/metrics and supplies exact demo money and CSV presentation helpers. |
| `frontend/src/store/index.ts` | Validates/persists finai-demo-v1, executes local demo commands, enforces simulated roles/locks and records local audit before/after snapshots. |
| `frontend/src/types/domain.ts` | Defines serializable demo entities, financial/workflow records, commands, DemoState and the local DemoService interface. |

### Original demonstration screens

| File | Purpose |
| --- | --- |
| `frontend/src/features/Accounting.tsx` | Implements demo accounts, journals/editor/review/post/reversal, ledger, trial balance and audit views over local state. |
| `frontend/src/features/Administration.tsx` | Implements simulated automations, integrations, member personas, preferences and demo reset; no real provider or bank connection. |
| `frontend/src/features/Assistant.tsx` | Lazy public model-chat wrapper used in the existing demo conversation area; distinct from both LegacyAssistant and private assistant/Assistant. |
| `frontend/src/features/Close.tsx` | Implements local month-end tasks, evidence, completion/review/approval and simulated period locks. |
| `frontend/src/features/LegacyAssistant.tsx` | Preserves the original deterministic offline Assistant with fixture-derived answers and explicitly approved local close-task proposals. |
| `frontend/src/features/Operations.tsx` | Implements original demo receivable invoices/receipts, bills/payments, parties, contracts/schedules, bank accounts and reconciliation. |
| `frontend/src/features/Overview.tsx` | Composes the original demo dashboard, financial snapshot, outstanding-customer card, recent activity and scoped workflow links. |
| `frontend/src/features/Reports.tsx` | Builds demo report lists/statements/drilldowns, exports/print views, entity presentation and explicitly simulated USD consolidation. |

### Public marketing pages

| File | Purpose |
| --- | --- |
| `frontend/src/features/marketing/Marketing.tsx` | Provides public header/footer/layout, product/resource/about/customer pages and the homepage entry using original FinAI branding. |
| `frontend/src/features/marketing/ProductDetails.tsx` | Renders product feature sections, illustrations and workflow panels using explicitly fictional local records. |
| `frontend/src/features/marketing/ProductPreview.tsx` | Renders interactive miniature overview/ledger/receivables/close/Assistant product views for public page demonstrations. |
| `frontend/src/features/marketing/ReferenceHome.tsx` | Implements the responsive public homepage composition informed by captured public reference geometry, using FinAI content and assets. |
| `frontend/src/features/marketing/content.ts` | Declares public product copy, routes, preview types, feature descriptions and frequently asked questions. |

### Public stateless model chat

| File | Purpose |
| --- | --- |
| `frontend/src/features/public-chat/PublicChat.tsx` | Implements inline anonymous model selection, bounded current-page conversation, submit/cancel/clear, cooldown/errors and manual retry. |
| `frontend/src/features/public-chat/public-chat.css` | Styles public inline chat bubbles, model selector, composer, responsive layout and status/error states. |

### Private grounded FinAI Assistant

| File | Purpose |
| --- | --- |
| `frontend/src/features/assistant/Assistant.tsx` | Implements authenticated scoped conversations, grounded fact/source rendering, model choice, bounded polling, explicit preferences and history controls. |
| `frontend/src/features/assistant/InvoiceAction.tsx` | Presents a server-built invoice proposal, explicit confirmation/reason, frozen retry payload and prepared-export download. |
| `frontend/src/features/assistant/LedgerSource.tsx` | Displays authorized immutable imported ledger accounts/journals and approved source/mapping/coverage information. |
| `frontend/src/features/assistant/OperationalSource.tsx` | Displays current authorized operational rows behind an Assistant source link while distinguishing current records from historical answer facts. |
| `frontend/src/features/assistant/api.ts` | Defines strict private Assistant response/proposal schemas, typed operations and exact BigInt fact formatting. |
| `frontend/src/features/assistant/assistant.css` | Styles private conversation scope, saved chats, factual answers/sources, proposal confirmations and preferences. |

### Separate persisted monthly checklist

| File | Purpose |
| --- | --- |
| `frontend/src/features/checklist/MonthlyChecklist.tsx` | Implements explicit entity/month task CRUD, progress, previous-month copying, safe retry/conflict states and a separate demo mode. |
| `frontend/src/features/checklist/api.ts` | Defines the checklist contract/client, session/CSRF checks, identity fencing and strict task/summary/copy result validation. |
| `frontend/src/features/checklist/checklist.css` | Styles checklist scope controls, rows, progress, confirmations and responsive/error states. |

### Supplier invoice workflow and independent sample preview

| File | Purpose |
| --- | --- |
| `frontend/src/features/payables/DevelopmentPayables.tsx` | Hosts the labelled no-login sample company, local role selection/reset and context providers at the public demo invoice routes. |
| `frontend/src/features/payables/Payables.tsx` | Implements the shared invoice register/detail/metadata form, stable draft-row identity and safe create recovery, suppliers, PDF actions, approvals, immutable exports, policies and grant screens. |
| `frontend/src/features/payables/PdfPreview.tsx` | Renders bounded original PDF pages through PDF.js with actions/XFA disabled and lifecycle-safe document/worker cleanup. |
| `frontend/src/features/payables/api.ts` | Provides the private invoice JSON/binary client, definite-rejection metadata, CSRF/session and identity guards, deadlines/downloads, money formatting and injectable client context. |
| `frontend/src/features/payables/development-store.ts` | Implements the isolated finai-invoices-development-v1 IndexedDB sample backend, local transitions/retries and pre-write validation, sample documents and CSV exports. |
| `frontend/src/features/payables/payables.css` | Styles invoice navigation, queues, metadata dialogs/lines, PDF preview, assignment history, policy/access editors and mobile containment. |
| `frontend/src/features/payables/schemas.ts` | Defines shared invoice capability, register/detail, supplier, financial data and saved-result schemas used by private and sample clients. |

### Receivables display, source and comparison boundaries

| File | Purpose |
| --- | --- |
| `frontend/src/features/receivables/ImportedOutstandingCustomers.tsx` | Renders session-authorized source-backed outstanding balances with explicit company/period, safe scope changes and visible missing/error states. |
| `frontend/src/features/receivables/OutstandingCustomers.tsx` | Chooses the configured demo or imported outstanding-card implementation and rejects an invalid mode without silent fallback. |
| `frontend/src/features/receivables/api.ts` | Validates imported summary/entity responses and provides the scoped read-only outstanding-customer API client. |
| `frontend/src/features/receivables/changes-api.ts` | Provides typed source-comparison reads with strict scope, pinned source identifiers and response validation. |
| `frontend/src/features/receivables/changes.ts` | Defines and reconciles immutable import-comparison schemas, exact signed money, changed fields, contribution totals and deterministic ordering. |
| `frontend/src/features/receivables/detail-api.ts` | Validates pinned snapshot history/register/customer/export responses and exposes bounded typed detail endpoints. |
| `frontend/src/features/receivables/format.ts` | Formats exact USD cents/source identifiers and produces safe, deterministic receivables CSV downloads. |
| `frontend/src/features/receivables/outstanding-customers.css` | Styles demo/imported outstanding cards, totals, customer tables and explicit source/error states. |
| `frontend/src/features/receivables/outstandingCustomers.ts` | Calculates demo-only current outstanding balances by customer with safe integer checks and deterministic complete-total/top-five semantics. |
| `frontend/src/features/receivables/source-schema.ts` | Defines shared immutable snapshot provenance fields: identifier, version, owner source name/cutoff and import time. |

### Saved subscription-renewal records

| File | Purpose |
| --- | --- |
| `frontend/src/features/subscriptions/SubscriptionRenewals.tsx` | Implements authorized renewal CRUD, archive/unarchive, company/search/status/pagination and server-derived date indicators. |
| `frontend/src/features/subscriptions/api.ts` | Defines strict renewal/entity schemas and typed API-only create/update/archive operations with version/retry handling. |
| `frontend/src/features/subscriptions/subscriptions.css` | Styles renewal scope/filter controls, record tables, drawers, status indicators and responsive layouts. |

### Authenticated finance workspace screens

| File | Purpose |
| --- | --- |
| `frontend/src/features/workspace/Administration.tsx` | Provides private organisation member/entity/grant administration, safeguards and scoped security-audit reads. |
| `frontend/src/features/workspace/ImportChanges.tsx` | Implements pinned immutable receivables import selection/comparison, full-source reconciliation and changed-row pagination. |
| `frontend/src/features/workspace/Imports.tsx` | Implements authorized raw-file preview, review/digest/version confirmation and deliberate application of receivables imports. |
| `frontend/src/features/workspace/ReceivablesRegister.tsx` | Implements authorized pinned invoice/customer/issue-period browsing, source history, filtering/paging and explicit bounded export. |
| `frontend/src/features/workspace/Workspace.tsx` | Owns private layout/configuration gate, shared session/context, restricted navigation, safe error boundary and private not-found routes. |
| `frontend/src/features/workspace/context.tsx` | Validates/fetches current server identity, organisation, authorised entities and permission revision and provides them to private feature components. |
| `frontend/src/features/workspace/workspace.css` | Styles the private workspace header/navigation, context/scope controls, source/register/admin/import layouts and responsive/error states. |

### Shared style layers

| File | Purpose |
| --- | --- |
| `frontend/src/styles/global.css` | Defines global design tokens, base layout/forms/tables/dialogs and original demo styles including print/accessibility behavior. |
| `frontend/src/styles/marketing.css` | Loads self-hosted typefaces and styles shared public page layout, navigation, product cards and footer. |
| `frontend/src/styles/product-reference.css` | Styles public product-detail section geometry and FinAI feature artwork informed by public visual references. |
| `frontend/src/styles/reference-home.css` | Styles responsive homepage geometry, hero/product/workflow sections and visual reference layout measurements. |
| `frontend/src/styles/workspace-reference.css` | Applies the current neutral rail/purple product appearance to demo/workspace surfaces and responsive layouts. |

### Publicly served original artwork

| File | Purpose |
| --- | --- |
| `frontend/public/favicon.svg` | Original FinAI monogram served as the site icon and referenced by shared branding. |
| `frontend/public/visuals/finai-city.svg` | Original geometric city illustration used by public marketing artwork; not a competitor photograph. |

### Feature/runbook and historical review documents

| File | Purpose |
| --- | --- |
| `frontend/docs/assistant-production.md` | Describes anonymous public chat controls, deployment/provider settings, safe failure behavior and limits of operational verification. |
| `frontend/docs/assistant.md` | Explains authenticated conversations, source grounding and preferences; its original route/action descriptions need updates for current public/private split and confirmed invoices. |
| `frontend/docs/checklist.md` | Documents separate checklist modes, local startup, task/copy behavior, verification and production identity boundaries. |
| `frontend/docs/content-ui-review.md` | Records the historical FinAI content/branding/accessibility review, original-artwork replacements and evidence limits. |
| `frontend/docs/content-ui-validation.json` | Machine-readable historical content/UI validation results and limitations; not current hosted readiness evidence. |
| `frontend/docs/homepage-validation.json` | Historical route/viewport/homepage measurements and runtime-request observations; old copy and counts are not current acceptance results. |
| `frontend/docs/implementation-plan.md` | Historical plan for the original local accounting demo before the separate server-backed modules were added. |
| `frontend/docs/outstanding-customers.md` | Documents original demo outstanding semantics and later imported-summary extension, test evidence and source limitations. |
| `frontend/docs/production-validation.json` | Historical production-build/demo-route, viewport, print/CSV and fixture-count checks; “production” here describes a build, not a deployed company service. |
| `frontend/docs/production-workspace.md` | Documents private workspace configuration, identity/data separation, navigation, imports/admin operations and release prerequisites. |
| `frontend/docs/progress.md` | Historical frontend prototype implementation/verification log; later repository-wide context/progress.md records backend and private-product releases. |
| `frontend/docs/rea-section-comparison.json` | Historical measured DOM geometry for reference/application homepage sections with capture provenance and comparison limitations. |
| `frontend/docs/rea-validation.json` | Historical REA capture/comparison results, pinned tool provenance, evidence locations and explicit visual-match limitations. |
| `frontend/docs/rea-workflow.md` | Explains how to reproduce the external REA browser evidence workflow without vendoring its tools or changing trust verification. |
| `frontend/docs/receivables-changes.md` | Documents pinned import-comparison semantics, exact total bridge, source selection, private state handling and verification. |
| `frontend/docs/reference-assets.md` | Explains original runtime artwork/font/icon provenance and separates it from retained visual-reference evidence. |
| `frontend/docs/reference-map.md` | Records public visual-reference acquisition, verified static rendering, stylesheet integrity and uninspected private-screen/animation limitations. |
| `frontend/docs/route-matrix.md` | Historical original public/demo route and interaction inventory; current route authority is src/app/router.tsx and feature runbooks. |
| `frontend/docs/subscriptions.md` | Documents saved renewal semantics, local/session configuration, permissions, server timezone/date indicators and dedicated tests. |
| `frontend/docs/vercel.md` | Current same-project private backend/public-chat deployment guide, invoice entry behavior, server settings, packaging, migration/account setup and remaining release checks. |

### Retained external reference evidence (not runtime assets)

| File | Purpose |
| --- | --- |
| `frontend/docs/reference/capture-metadata.json` | Records inspected reference URL/date, isolated rendering method, CSS integrity and the exact retained reference filenames. |
| `frontend/docs/reference/computed-home-1440.json` | Historical desktop computed-style/DOM measurements captured from the isolated static public reference. |
| `frontend/docs/reference/rillet-home-1440-top.png` | Historical desktop top-of-homepage static reference screenshot used for visual comparison only. |
| `frontend/docs/reference/rillet-home-390-top.png` | Historical mobile top-of-homepage static reference screenshot used for visual comparison only. |

### Retained application screenshots (historical evidence, not a golden release contract)

| File | Purpose |
| --- | --- |
| `frontend/docs/screenshots/accounting-journals-J-INV-1001-1440.png` | Historical desktop screenshot of the demo source journal J-INV-1001 detail. |
| `frontend/docs/screenshots/accounting-ledger-1440.png` | Historical desktop screenshot of the demo general ledger. |
| `frontend/docs/screenshots/content-review-desktop.png` | Desktop public-page screenshot retained from the content/branding review. |
| `frontend/docs/screenshots/content-review-mobile.png` | Mobile public-page screenshot retained from the content/branding review. |
| `frontend/docs/screenshots/homepage-1024-top.png` | Historical top-of-homepage application capture at 1024 px viewport width. |
| `frontend/docs/screenshots/homepage-1024.png` | Historical full homepage application capture at 1024 px viewport width. |
| `frontend/docs/screenshots/homepage-1280-top.png` | Historical top-of-homepage application capture at 1280 px viewport width. |
| `frontend/docs/screenshots/homepage-1280.png` | Historical full homepage application capture at 1280 px viewport width. |
| `frontend/docs/screenshots/homepage-1440-top.png` | Historical top-of-homepage application capture at 1440 px viewport width. |
| `frontend/docs/screenshots/homepage-1440.png` | Historical full homepage application capture at 1440 px viewport width. |
| `frontend/docs/screenshots/homepage-390-top.png` | Historical mobile top-of-homepage application capture at 390 px viewport width. |
| `frontend/docs/screenshots/homepage-390.png` | Historical full mobile homepage application capture at 390 px viewport width. |
| `frontend/docs/screenshots/journal-editor-390.png` | Historical mobile demo journal-editor capture for field/dialog containment. |
| `frontend/docs/screenshots/overview-1024.png` | Historical demo overview/dashboard capture at 1024 px viewport width. |
| `frontend/docs/screenshots/overview-1280.png` | Historical demo overview/dashboard capture at 1280 px viewport width. |
| `frontend/docs/screenshots/overview-1440.png` | Historical demo overview/dashboard capture at 1440 px viewport width. |
| `frontend/docs/screenshots/overview-390.png` | Historical mobile demo overview/dashboard capture at 390 px viewport width. |
| `frontend/docs/screenshots/print-balance-sheet.png` | Historical browser print-layout capture of the demo balance sheet; not evidence of physical printer output. |
| `frontend/docs/screenshots/product-ledger-1440.png` | Historical desktop public general-ledger product-page capture. |
| `frontend/docs/screenshots/product-ledger-390.png` | Historical mobile public general-ledger product-page capture. |
| `frontend/docs/screenshots/receivables-invoices-INV-1001-1440.png` | Historical desktop demo receivable invoice INV-1001 detail capture. |
| `frontend/docs/screenshots/reports-balance-sheet-1440.png` | Historical desktop demo balance-sheet report capture. |

### Browser and contract-consumer regression tests

| File | Purpose |
| --- | --- |
| `frontend/tests/assistant-production.spec.ts` | Exercises the built private Assistant through HTTPS/session/PostgreSQL with controlled provider, isolation, source/history/preferences and restart behavior. |
| `frontend/tests/assistant.spec.ts` | Exercises controlled private Assistant UI, source/model/history/preferences, identity races, cross-tab clearing and response-error handling. |
| `frontend/tests/checklist.spec.ts` | Exercises actual local API/PostgreSQL checklist CRUD/copy, safe retries/conflicts, stale-scope handling, persistence and responsive behavior. |
| `frontend/tests/copy-demo.spec.ts` | Checks that standalone checklist copying stays session-only, resets copied completion and makes no checklist API requests. |
| `frontend/tests/fixtures/close-evidence.pdf` | Synthetic small evidence attachment for original demo close-task upload/persistence/browser checks. |
| `frontend/tests/marketing.spec.ts` | Checks public navigation, product content/previews, demo entry, mobile behavior and public invoice entry without private API calls. |
| `frontend/tests/outstanding-customers.spec.ts` | Checks demo outstanding arithmetic, complete totals/top-five ordering, invalid/unavailable sources, links and responsive card behavior. |
| `frontend/tests/payables-development.spec.ts` | Exercises no-login invoice sample storage, roles, original PDF rendering, approval/export, migration/reset, route aliases and PDF worker lifecycle. |
| `frontend/tests/payables-integration.spec.ts` | Runs real invoice and confirmed-FinAI company journeys through remote, embedded and packaged HTTPS/session/database runtimes. |
| `frontend/tests/payables-ui.spec.ts` | Checks controlled private invoice/policy/supplier presentation, scope/permission errors, keyboard/mobile layout and targeted UI regressions. |
| `frontend/tests/public-chat.spec.ts` | Checks anonymous catalog/completion HTTP and built chat UI with controlled providers, deadlines, errors, retries, cancellation and safe bounds. |
| `frontend/tests/receivables-api.spec.ts` | Checks imported outstanding-card API mode, authorised scope, source labels, stale responses, errors, session clearing and mobile text containment. |
| `frontend/tests/receivables-configuration.spec.ts` | Checks explicitly invalid/unavailable receivables mode configuration without silent demo/API fallback. |
| `frontend/tests/receivables-production.spec.ts` | Checks built authenticated imported receivables against the HTTPS/session/database fixture. |
| `frontend/tests/session-production.spec.ts` | Checks the built HTTPS sign-in/copy/subscription flow, cookies, CSRF rejection, refresh and logout against real session persistence. |
| `frontend/tests/subscriptions.spec.ts` | Runs saved-renewal API/database CRUD/archive, validation/conflicts, filters/pagination, date indicators, restart and stale-company checks. |
| `frontend/tests/vercel-backend.spec.ts` | Checks the real private backend package’s configuration errors, listener-free lifecycle, authentication, bounded bodies, retained jobs and instance replacement. |
| `frontend/tests/workflows.spec.ts` | Exercises original demo deep links, keyboard/responsive states, journal/invoice/bill/bank/close/report/automation workflows and local persistence. |
| `frontend/tests/workspace-changes-production.spec.ts` | Checks built authenticated import comparison against actual immutable snapshots, later imports/restart and private-session clearing. |
| `frontend/tests/workspace-changes.spec.ts` | Checks controlled import comparison validation, exact money/bridge, pinned scope, source history, pagination, errors and stale response handling. |
| `frontend/tests/workspace-detail.spec.ts` | Checks controlled pinned receivables invoice/customer/issue-period register details, filters, source provenance, export and long/mobile content. |
| `frontend/tests/workspace-production.spec.ts` | Checks built private workspace scope/permissions/import/admin/register flows through actual HTTPS sessions and PostgreSQL. |
| `frontend/tests/workspace.spec.ts` | Checks the controlled private shell/session gate, configuration, identity/permissions, no-fixture fallback, logout, scope changes and responsive containment. |

### Naming and instruction cautions

1. `src/features/Assistant.tsx` is the public chat wrapper; `src/features/assistant/Assistant.tsx` is the private financial Assistant; `LegacyAssistant.tsx` is the preserved offline fixture Assistant. Preserve these paths during this review and explain the boundary in module comments rather than casually renaming components/imports.
2. `DevelopmentPayables.tsx` and `development-store.ts` are legacy names for the public, browser-only sample feature. The current route is `/demo/payables/*`; `/development/payables/*` is a compatibility redirect. These names do not mark the authenticated private invoice product as unfinished development.
3. `src/features/Administration.tsx` contains demo settings and simulated integrations; `src/features/workspace/Administration.tsx` contains private real-account administration. Local personas must never become backend identities.
4. `src/features/receivables/outstandingCustomers.ts` is a demo calculation; `OutstandingCustomers.tsx` is the mode-selection/UI boundary. The differing case is deliberate but merits a short module comment.
5. Root/application READMEs and the private Assistant guide describe the current routes and runtime boundaries. Dated design/review documents retain historical observations; use the current source/contracts and the latest verification report when an older paragraph differs.
6. `docs/progress.md`, the original route matrix, reference screenshots and validation JSON are retained history. Keep the observations unchanged; add an explicit historical label or point to current source/release reports instead of rewriting old pass counts or screenshot captions as current facts. “productionRoutes” in the early JSON means production-build routes, not successful deployment.
7. Use Node 24 as required by the package engine and current READMEs. Source configurations and the current verification report define active test suites/counts; old reports retain the counts they actually measured.

### Useful comments without file churn

Prefer brief module-boundary comments where similarly named files could cause a wrong edit or leak between sample/private data. Keep detailed operations and per-file purposes here. Add comments beside non-obvious invariants such as identity epoch checks, unchanged retry UUIDs, exact money/draft reconciliation, PDF snapshot eligibility and source pinning. Do not restate every JSX tag or mechanically add boilerplate to all functions.

JSON configuration/lockfiles, PNG/PDF evidence and original SVG artwork do not need injected comments. JSON syntax does not support comments; package-lock content is generated by npm; modifying binary evidence to annotate it would destroy provenance. This guide provides the purpose of those files safely.



## Backend files

This section covers all tracked backend files, shared contract files and both GitHub Actions workflows. Paths are relative to the repository root. Generated dependencies, build output, private environment files and local artifacts are intentionally excluded. A file map explains responsibility; it does not certify hosted operation.

### How the backend is connected

`backend/src/main.ts` starts the ordinary listening server through `src/app.ts`. The same application factory can initialize without a listener for the private Vercel runtime packaged by the frontend build. The application composition root installs trust/session/CSRF/body-limit middleware, registers controllers and shares one Prisma database service. HTTP controllers validate input; services implement behavior; repository/domain code enforces scoped data and financial rules. The payables service keeps its financial checks, immutable events and retry receipts in the same database transactions. The private Assistant retrieves authorized facts and constructs proposals; only separately confirmed invoice commands invoke those transactions.

`backend/scripts/*.mts` operator tools import compiled `dist/src` modules, so compile the backend before using them. Local setup/seed commands are separate from production migrations and account provisioning. Startup and frontend builds do not migrate or seed an unknown database. Keep the two application manifests/lockfiles separate and keep database/provider credentials server-side.

### Database migration order

Prisma applies the eight committed migration folders in chronological order: checklist/tenant foundation → accounts/sessions/rate limits → subscriptions → immutable receivable sources → workspace/admin/audit/import staging → Assistant and ledger persistence → deletion receipts → invoice approvals. `schema.prisma` describes the current client models; SQL migrations retain the actual historical database changes. Preserve migration names/history; use an additive reviewed migration for a new schema change. `seed.ts` only ensures the explicitly local synthetic identity/entities.

### Backend configuration and operator documents

| File | Responsibility |
| --- | --- |
| `backend/.dockerignore` | Excludes dependencies, builds, private environment files and artifacts from the container build context; retains the safe environment example. |
| `backend/.env.example` | Lists local API, optional private scanner and disabled-by-default Assistant setting names without real database passwords or provider keys. |
| `backend/.gitignore` | Keeps dependencies, compiled output, private environment files and generated artifacts out of Git. |
| `backend/AGENTS.md` | Defines current backend domain/composition responsibilities, tenant/session/financial invariants, scoped tests and safe migration/deployment boundaries. |
| `backend/ASSISTANT.md` | Operator runbook for private model/privacy/budget settings, immutable ledger mappings, retention, evaluations and confirmed invoice actions. |
| `backend/Dockerfile` | Builds the Node 24 API and Prisma client, optionally trusts the managed build CA and runs the compiled server as a non-root user. |
| `backend/HANDOFF.md` | Historical Gate B checklist delivery evidence and API handoff; use newer release documents for current production requirements. |
| `backend/PAYABLES.md` | Supplier invoice runbook covering accounts/AP grants, ClamAV, GBP approval/export rules, recovery, FinAI confirmation and deferred integrations. |
| `backend/README.md` | Backend local setup, database and application commands; links to later subscription, receivables, workspace and invoice runbooks. |
| `backend/RECEIVABLES.md` | Explains complete imported receivable registers, trusted operator imports, exact balances, authorization and production/source release requirements. |
| `backend/RELEASE.md` | Production operator runbook for sessions/accounts, trusted host/proxy settings, migrations, backups, smoke checks and rollback. |
| `backend/WORKSPACE.md` | Workspace operations runbook for administrator recovery, entity/import grants, staged imports, cleanup and target deployment verification. |
| `backend/compose.production.yaml` | Production topology for an immutable API image and private PostgreSQL with required secret bindings, loopback ingress and restricted container privileges. |
| `backend/compose.yaml` | Local PostgreSQL service with a loopback-only published port, persistent development volume and health check; requires the generated local password. |
| `backend/eslint.config.mjs` | Backend TypeScript lint rules, including unused-parameter handling for server source, tests and scripts. |
| `backend/package-lock.json` | Exact backend dependency resolution used by npm ci; keep separate from the frontend lockfile. |
| `backend/package.json` | Backend dependency versions and commands for compilation, lint, tests, Prisma, local database setup and receivable import. |
| `backend/tsconfig.json` | Strict CommonJS server compilation with Nest decorator metadata; emits source, tests and seed files beneath dist. |

### Backend database models, migrations and local seed

| File | Responsibility |
| --- | --- |
| `backend/prisma/migrations/202610190001_checklist/migration.sql` | Migration 1: creates organisations, users, memberships, entities, entity access and versioned checklist tasks with relational scope constraints. |
| `backend/prisma/migrations/202610210001_sessions/migration.sql` | Migration 2: adds provisioned accounts, hashed opaque sessions/CSRF records and shared PostgreSQL rate limits. |
| `backend/prisma/migrations/202610220001_subscription_renewals/migration.sql` | Migration 3: adds scoped subscription renewal records, archive state and optimistic versions. |
| `backend/prisma/migrations/202610240001_receivable_snapshots/migration.sql` | Migration 4: adds immutable complete receivable snapshots and their invoice rows with company/entity foreign keys. |
| `backend/prisma/migrations/202610240002_workspace_operations/migration.sql` | Migration 5: adds administrator/import grants and versions, backfills import rights, and creates safe audits plus temporary reviewed import stages. |
| `backend/prisma/migrations/202610250001_assistant/migration.sql` | Migration 6: adds private Assistant conversations, turns, preferences, token budgets and imported immutable ledger snapshots. |
| `backend/prisma/migrations/202610250002_assistant_deletion_receipts/migration.sql` | Migration 7: adds bounded deletion receipts so stale create retries cannot resurrect deleted Assistant memory. |
| `backend/prisma/migrations/202611030001_payables/migration.sql` | Migration 8: creates AP grants, suppliers, policies, invoices, private PDF documents, business events, operation receipts and immutable exports. |
| `backend/prisma/migrations/migration_lock.toml` | Records PostgreSQL as the Prisma migration provider; this is migration metadata, not an application lock. |
| `backend/prisma/schema.prisma` | Prisma model/relationship definition for every persisted module; generates native and RHEL OpenSSL 3 client targets for local and Vercel runtimes. |
| `backend/prisma/seed.ts` | Loopback-only development seed that ensures the synthetic local identity and two entities without replacing existing tasks; never a company-data bootstrap. |

### Backend operator and development scripts

| File | Responsibility |
| --- | --- |
| `backend/scripts/accounts.mts` | Trusted terminal tool for account creation, password reset and explicit session revocation, with hidden password input and no entity grants on creation. |
| `backend/scripts/build-local-prisma.sh` | Optional development fallback that builds the exact pinned official Prisma engine commit with normal TLS and lockfile checks; writes a local engine selector script. |
| `backend/scripts/cleanup.mts` | Trusted retention tool with dry-run default and explicit apply mode for expired sessions, rate limits, import stages and Assistant memory/receipts. |
| `backend/scripts/evaluate-assistant.mts` | Synthetic-only provider evaluation; checks configuration by default and requires an explicit live-synthetic flag before bounded real model requests. |
| `backend/scripts/import-ledger.mts` | Trusted operator CLI for bounded UTF-8 ledger files, actor/entity scope and expected-version validation; defaults to dry run. |
| `backend/scripts/import-receivables.mts` | Trusted operator CLI for complete receivable registers, bounded file reads, canonical validation and expected-version imports; defaults to dry run. |
| `backend/scripts/init-local.mjs` | Creates a permission-restricted local .env with a random database password when none exists; preserves existing configuration and prints no secret values. |
| `backend/scripts/payables-storage-check.sh` | Disposable synthetic PostgreSQL backup/restore rehearsal for AP PDF/export bytes, history, routes, grants and tenant foreign keys; not an API acceptance test. |
| `backend/scripts/restore-rehearsal.sh` | Disposable full application restore rehearsal, including migrated records and a real AP approval/export service journey before backup. |
| `backend/scripts/workspace-admin.mts` | Trusted operator tool that promotes an existing organisation member to administrator for bootstrap/recovery, with dry-run/apply controls, session revocation and safe audits. |

### Backend application foundation

| File | Responsibility |
| --- | --- |
| `backend/src/app.ts` | Application composition root: Nest providers/controllers, trusted ingress, body limits, sessions/CSRF, raw uploads, health checks and listener-free bootstrap for Vercel. |
| `backend/src/audit.ts` | Provides request-local support IDs and transaction-scoped server audits with a bounded allowlist of safe metadata. |
| `backend/src/auth.ts` | Administrative account sign-in using Argon2id, secure opaque session cookies, CSRF digests, shared rate limiting and logout. |
| `backend/src/checklist.repository.ts` | Scoped checklist persistence and permission checks, monthly capacity locks, stable create replay, optimistic edits/deletes and atomic previous-month copying. |
| `backend/src/checklist.service.ts` | Formats checklist dates and API responses, calculates completion summaries and delegates persistent operations to the repository. |
| `backend/src/config.ts` | Validates explicit loopback local identity or trusted production/test session mode; defines the synthetic local IDs and private API settings. |
| `backend/src/database.ts` | Nest-managed Prisma client with application shutdown disconnect; all modules share this database service. |
| `backend/src/errors.ts` | Converts validation, HTTP and Prisma failures into safe correlated error envelopes without exposing SQL, stack traces or secrets. |
| `backend/src/main.ts` | Standalone API process entrypoint that creates the listening application and reports a safe startup failure. |
| `backend/src/subscription.controller.ts` | Scoped HTTP CRUD/archive routes for saved subscription renewals; validates inputs before calling the service. |
| `backend/src/subscription.repository.ts` | Subscription persistence with literal search, bounded paging, scoped write authorization, create replay and optimistic edit/archive conflicts. |
| `backend/src/subscription.service.ts` | Serializes subscription records and computes separate renewal/cancellation indicators using approved organisation timezone settings. |
| `backend/src/subscription.validation.ts` | Strict subscription scope, calendar-date, supplier/name/notes, pagination and versioned mutation schemas. |
| `backend/src/validation.ts` | Shared canonical UUID/month/title/version parsing and safe field errors, plus previous-month checklist boundary rules. |

### Backend private Assistant

| File | Responsibility |
| --- | --- |
| `backend/src/assistant/controller.ts` | HTTP boundary for private Assistant capabilities/models, scoped conversations/turns/preferences, cancellation and factual source pages. |
| `backend/src/assistant/facts.ts` | Retrieves authorized server-computed financial/operational facts and citations; constructs eligible invoice proposals without executing them. |
| `backend/src/assistant/provider.ts` | Fixed OpenRouter adapter for approved free structured models, model catalog validation, privacy/provider routing, finite deadlines and safe failures. |
| `backend/src/assistant/service.ts` | Persists owner-only conversations/preferences, reserves budgets and leases, coordinates grounded provider work and rechecks authority before publication. |
| `backend/src/assistant/validation.ts` | Strict Zod schemas for private Assistant inputs, read plans, facts, source references, proposals and rendered answers. |

### Backend supplier invoice approvals

| File | Responsibility |
| --- | --- |
| `backend/src/payables/assistant.ts` | Defines allowed invoice intents, strict confirmed commands and server-built proposal metadata shared by private FinAI and payables. |
| `backend/src/payables/controller.ts` | HTTP routes and strict transport validation for suppliers, invoice queues/details/documents, policy/access administration, decisions, exports and confirmed Assistant commands. |
| `backend/src/payables/domain.ts` | Authoritative payables schemas and pure financial rules: canonical digests/references, exact GBP totals, approval routing and balanced escaped CSV. |
| `backend/src/payables/scanner.ts` | Bounded private ClamAV VERSION/INSTREAM adapter with fresh-signature checks, concurrency limits, absolute command deadlines and quarantine on uncertainty. |
| `backend/src/payables/service.ts` | Transactional AP authority, suppliers/policies/grants, invoice revisions and assignments, private document scans, stable replay, immutable events and exports. |

### Backend imported ledger

| File | Responsibility |
| --- | --- |
| `backend/src/ledger/source.ts` | Validates/imports immutable complete ledger sources, checks approved mapping fingerprints, computes exact balances and exposes read-only ledger endpoints. |

### Backend imported receivables

| File | Responsibility |
| --- | --- |
| `backend/src/receivables/changes.repository.ts` | Compares two authorized pinned snapshots using exact invoice IDs, complete-source reconciliation and decimal-string money with stable changed-row paging. |
| `backend/src/receivables/controller.ts` | Read-only HTTP endpoint for the current imported outstanding-customer summary and explicit entity/period validation. |
| `backend/src/receivables/detail.controller.ts` | Read-only routes for snapshot history, pinned invoice/customer/issue-period pages, normalized export and snapshot change comparison. |
| `backend/src/receivables/detail.repository.ts` | Authorized immutable snapshot lookup, bounded filtering/pagination, exact detail aggregates and complete pinned exports. |
| `backend/src/receivables/detail.service.ts` | Thin orchestration layer joining snapshot detail/history/export reads with the change-comparison repository. |
| `backend/src/receivables/detail.validation.ts` | Strict query schemas for pinned snapshots, pagination/status/customer/search filters, exports and two-snapshot comparisons. |
| `backend/src/receivables/import.controller.ts` | Session-only browser import routes for raw preview, digest/version-confirmed apply and explicit stage discard. |
| `backend/src/receivables/import.service.ts` | Session-bound temporary import previews, summaries/expiry/capacity, explicit apply with permission rechecks, stable replay and transactional audits. |
| `backend/src/receivables/repository.ts` | Versioned complete-register import and exact current outstanding summaries, with entity/import authorization, serialization and overflow protection. |
| `backend/src/receivables/service.ts` | Delegates the current receivable summary request to its authorized repository. |
| `backend/src/receivables/validation.ts` | Strict complete-register schema, exact UTF-8 JSON money parsing, calendar/status/name/ID consistency and deterministic import digests. |

### Backend workspace administration

| File | Responsibility |
| --- | --- |
| `backend/src/workspace/controller.ts` | Private workspace context, administrator/member/entity/access routes and bounded safe audit listing. |
| `backend/src/workspace/permissions.ts` | Reusable active-membership administrator and independent import-grant checks for workspace and source operations. |
| `backend/src/workspace/service.ts` | Builds scoped workspace context and performs versioned administration, last-administrator protection, grant changes, session revocation and safe audits. |

### Backend tests

| File | Responsibility |
| --- | --- |
| `backend/test/assistant.test.ts` | Backend regressions for exact ledger imports/calculations, private Assistant grounding/history/budget/provider/model selection, retention and authorization races. |
| `backend/test/checklist.test.ts` | Real database/API checklist/session/subscription regressions, including isolation, validation, concurrency, copy/retry, CSRF and persistence. |
| `backend/test/config.test.ts` | Configuration acceptance/rejection boundaries for bounded local runtime settings. |
| `backend/test/invoice-assistant.test.ts` | Supplier-invoice Assistant service regressions for authorized facts, eligible proposals, confirmed transitions/export, stable retries and revocation before publication/history. |
| `backend/test/payables-domain.test.ts` | Pure rule regressions for exact totals/rounding, escaped balanced CSV, priority/fallback routing, strict schemas and canonical replay identities. |
| `backend/test/payables-scanner.test.ts` | Controlled local ClamAV protocol regressions for framing, verdicts, fresh/stale signatures, unavailable scanners and drip-fed absolute deadlines. |
| `backend/test/payables.test.ts` | Real database AP lifecycle regressions for suppliers/policies/PDFs, assignments, approvals, revisions, correction/rejection, audit rollback and private exports. |
| `backend/test/receivables-changes.test.ts` | Real database/HTTP snapshot-comparison regressions for exact reconciliation, source order, paging, large sums, strict inputs and session/company isolation. |
| `backend/test/receivables.test.ts` | Complete-register import/summary/detail and workspace/import-administration regressions, including exact money, races, outages, sessions and cleanup. |

### Shared API/domain contracts and examples

| File | Responsibility |
| --- | --- |
| `contracts/README.md` | Shared contract index and authoritative compatibility rules for checklist/session/copy, subscriptions, receivables, workspace, Assistant and invoice modules. |
| `contracts/assistant.md` | Private Assistant behavior/authority contract covering durable owner-only memory, exact grounding, leases/budgets, retention, provider policy and scoped sources. |
| `contracts/assistant.openapi.yaml` | HTTP OpenAPI description for private Assistant models, conversations/turns/preferences and operational source endpoints. |
| `contracts/assistant.schema.json` | JSON Schema companion for private Assistant plans, composition selections, exact facts, sources and answer shapes. |
| `contracts/examples/assistant-ledger.synthetic.json` | Synthetic complete ledger fixture used by source-validation tests and explicitly bounded provider evaluations; never approved customer accounting data. |
| `contracts/invoice-assistant.md` | Additive supplier-invoice grounding and explicit-confirmation contract; states scope/proposal authority, rechecks and public/private routing boundaries. |
| `contracts/invoice-assistant.schema.json` | JSON Schema companion for invoice proposals and confirmed command payload/results used by private Assistant contract validation. |
| `contracts/ledger.md` | Read-only imported-ledger contract specifying complete periods, exact money, balanced sources, approved mappings, stable versions and calculation limits. |
| `contracts/ledger.schema.json` | JSON Schema companion for the normalized complete ledger source and its account/journal/line fields. |
| `contracts/openapi.yaml` | Versioned checklist/session HTTP contract, examples and errors, including atomic previous-month copying. |
| `contracts/payables-examples/bill.json` | Synthetic valid GBP supplier bill payload for contract compilation/example checks. |
| `contracts/payables.md` | Supplier-invoice approval/export contract describing AP grants, document quarantine, revisioned routing, retry semantics and confirmed Assistant additions. |
| `contracts/payables.openapi.json` | Generated payables HTTP OpenAPI routes and request/response schemas; regenerate through the checked-in generator rather than hand-editing artifacts. |
| `contracts/public-chat.md` | Separate stateless public model-chat contract: no financial access/database session, bounded history, free routing and safe provider failures. |
| `contracts/public-chat.schema.json` | Strict request/model-catalog/answer schemas for the separate public free-model chat boundary. |
| `contracts/receivables-detail.openapi.yaml` | Pinned receivable snapshot history/detail/export and exact two-snapshot change-comparison HTTP contract with synthetic examples. |
| `contracts/receivables-examples/changes-basic.json` | Synthetic two-snapshot comparison example with exact decimal-string totals and added/removed/changed invoice records. |
| `contracts/receivables-examples/import-v1.json` | Synthetic normalized complete USD receivable register used by contract and importer tests. |
| `contracts/receivables.openapi.yaml` | Read-only outstanding-customer summary and normalized complete-register import schema, including explicit ready/no-snapshot states. |
| `contracts/reporting-source-proposal.md` | Decision record for future reporting inputs and finance approvals; a proposal, not an implemented production reporting API. |
| `contracts/requirements.txt` | Pinned Python dependencies for YAML parsing and JSON Schema example validators; separate from both application manifests. |
| `contracts/subscriptions.openapi.yaml` | Versioned subscription-renewal CRUD/archive/filtering HTTP contract with date, permission and response examples. |
| `contracts/workspace.openapi.yaml` | Session-authorized workspace context/admin/audit and staged browser import HTTP contract with independent read/write/import capabilities. |

### Contract generators and validators

| File | Responsibility |
| --- | --- |
| `contracts/generate-payables.mts` | Regenerates payables OpenAPI, including confirmed Assistant-command schemas, from executable backend payload rules and frontend response schemas. |
| `contracts/validate_assistant.mjs` | Checks Assistant companion schemas, invoice-plan/strict payload examples and a synthetic ledger source against its schema using backend validator dependencies. |
| `contracts/validate_examples.py` | Validates checklist/session/copy OpenAPI examples, strict request boundaries, summaries and frozen routes. |
| `contracts/validate_payables.mjs` | Compiles generated payables payload schemas and checks valid/invalid synthetic examples; database/domain refinements remain application tests. |
| `contracts/validate_public_chat.mjs` | Compiles public chat schemas and checks strict roles, model IDs, requests, model catalog and answer examples. |
| `contracts/validate_receivables.py` | Validates receivable summary/import examples and rejects invalid scopes, dates, amounts and extra fields. |
| `contracts/validate_receivables_detail.py` | Validates pinned history/detail/export/change examples, strict paging/date/money fields and decimal-string large comparison totals. |
| `contracts/validate_subscriptions.py` | Validates subscription OpenAPI examples and rejects invalid calendar dates, scope overrides and malformed create fields. |

### GitHub Actions workflows

| File | Responsibility |
| --- | --- |
| `.github/workflows/checklist-release.yml` | Full GitHub Actions release matrix: locked apps, PostgreSQL/backend tests, all contracts, browser suites, audits/assets, container build and synthetic restore. |
| `.github/workflows/payables.yml` | Invoice-focused GitHub Actions checks, real runtime journeys and storage restore; retains runnable sample builds and failure evidence as short-lived artifacts. |
| `.github/pull_request_template.md` | Pull request template with Summary/Changes/How to test/Risks/Checklist sections and repository-specific verification prompts (tenant isolation, integer minor units, additive migrations, suite commands). |


## Root and context files

This section inventories tracked files outside `backend/`, `frontend/`, `contracts/` and `.github/`, including the dated review records for the current feature work. Generated files, local credentials, dependency folders and ignored test artifacts are excluded. Preserve existing paths: application imports, Vercel root selection, Docker build context and CI working directories already depend on the separate application folders.

Current source, versioned contracts and executable runbooks determine behavior. A dated report records the checkout and checks that it names; its filename containing “production”, “final” or “sign-off” does not certify the deployed service. Historical inventories are evidence snapshots, not checksums of later modified source.

### Root entry points

| File | Purpose | How to use it |
| --- | --- | --- |
| [README.md](../README.md) | Repository landing page: product scope, directory map, local entry points, verification and deployment links. | Start here; detailed application commands belong in the application runbooks. |
| `.editorconfig` | Provides UTF-8/LF/final-newline defaults, two-space indentation with a Python four-space exception, and preserved Markdown hard breaks. | Editors apply it to future edits; no bulk source formatting is required. |
| `.gitignore` | Root-level ignore rule for private environment files and their variants while keeping reviewable `.env.example` files; complements the separate frontend/backend ignore files. | Applied by Git automatically; keeps stray root-level local values out of version control. |
| `.env.example` | Root inventory of environment variable names read across the backend, Vercel functions and Vite builds, with empty values and pointers to the authoritative `backend/.env.example` and hosting runbooks. | Documentation only; nothing loads a root-level `.env` and no secret values belong here. |
| [AGENTS.md](../AGENTS.md) | Repository ownership, edit boundaries, contract-first changes, preservation and secret-handling instructions. | Read before implementation, together with the instruction file in the target application. Dated milestones inside it describe earlier work, not a complete current feature inventory. |

### Context navigation and workflow

| File | Purpose | Status / interpretation |
| --- | --- | --- |
| [context/README.md](../context/README.md) | Explains the origin of the context documents and how to read source, contracts and task evidence. | Navigation/reference. Current entry links precede the original historical reading order, so the 19 October baseline is not mistaken for today's implementation. |
| [context/agent-boundaries.md](../context/agent-boundaries.md) | Ownership matrix, coordinator/backend/frontend/reviewer handoffs and task/scope templates. | Workflow reference; does not implement runtime behavior or grant deployment authority. |
| [context/progress.md](../context/progress.md) | Dated development and verification journal, including later source, fixes, commands and blockers. | Living history. Read the latest dated entries and compare their commit with the current checkout; the first heading is not the date of every entry. |
| [context/project-state.md](../context/project-state.md) | Original 19 October source inventory, traced demo data paths and later implementation updates. | Historical baseline with appendices. Statements that no backend/auth/database exists describe the original commit, not the current applications. |
| [context/backend-design.md](../context/backend-design.md) | Original modular-backend proposal, checklist architecture and identity/deployment decisions. | Design history/reference; later source and contracts supersede provisional module/status descriptions. |
| [context/roadmap.md](../context/roadmap.md) | Original ordered milestones and acceptance gates for the checklist, identity, operations and future finance work. | Historical planning/gate definitions. Its early “D and later remain planned” summary is not a current inventory of implemented session/Assistant/payables code. |

### Checklist, subscriptions and company-source history

| File | Purpose | Status / current operational reference |
| --- | --- | --- |
| [context/review.md](../context/review.md) | Initial 19 October checklist review: corrected defects, tests, audit findings and limits. | Historical QA for its stated baseline. Current backend setup: [backend/README.md](../backend/README.md); current release controls: [backend/RELEASE.md](../backend/RELEASE.md). |
| [context/copy-release.md](../context/copy-release.md) | Previous-month title copying, administrative session foundations and the 21 October release handoff. | Historical feature evidence. Current behavior is in checklist contracts/source and the release runbook. |
| [context/subscriptions.md](../context/subscriptions.md) | Manual subscription-renewal CRUD/archive/search/date-indicator implementation and tests. | Historical feature handoff; no automatic billing or reminder integration is implied. Feature guide: [frontend/docs/subscriptions.md](../frontend/docs/subscriptions.md). |
| [context/receivables-production.md](../context/receivables-production.md) | Imported immutable receivable registers, CLI ingestion, source validation and authorized summary extension. | Historical implementation/verification. Current import operations: [backend/RECEIVABLES.md](../backend/RECEIVABLES.md). |
| [context/receivables-changes.md](../context/receivables-changes.md) | Snapshot-to-snapshot Import Change Review and the accompanying 31 October dependency/audit remediation. | Historical implementation evidence; current comparison contract is under `contracts/`, and [frontend/docs/receivables-changes.md](../frontend/docs/receivables-changes.md) describes use. |
| [context/production-workspace.md](../context/production-workspace.md) | Conversion from demo navigation to authenticated workspace foundations, source registers, reviewed imports and administration. | Historical increment record. Current company setup/grants/imports: [backend/WORKSPACE.md](../backend/WORKSPACE.md). |

### Assistant and hosting implementation history

| File | Purpose | Status / interpretation |
| --- | --- | --- |
| [context/assistant-production.md](../context/assistant-production.md) | Original private grounded Assistant/ledger-source implementation, memory controls and release evidence. | Historical implementation handoff. Current provider, source and operational settings: [backend/ASSISTANT.md](../backend/ASSISTANT.md). |
| [context/assistant-engineering-review.md](../context/assistant-engineering-review.md) | Corrected Assistant entry behavior, Compose provider forwarding, price validation, retry scope and ledger-approval metadata. | Historical engineering findings and checks; route descriptions reflect that earlier release. |
| [context/assistant-model-selection.md](../context/assistant-model-selection.md) | Private free/structured-model catalog, per-turn selection and model-pinned retry/composition behavior. | Historical feature evidence. It does not prove current external provider compatibility or available quota. |
| [context/vercel-same-project.md](../context/vercel-same-project.md) | Same-project embedded Nest runtime, private Vercel packaging, retained background jobs and build-artifact tests. | Historical runtime integration evidence. Current deployment instructions: [frontend/docs/vercel.md](../frontend/docs/vercel.md). |
| [context/public-free-chat.md](../context/public-free-chat.md) | Introduction of database-free public model chat and its separation from financial records. | Historical feature evidence. Its original `/workspace/assistant` public-chat route was superseded; use today's router and current route map. |
| [context/assistant-inline-ui.md](../context/assistant-inline-ui.md) | Integration of public chat into the demo conversation/composer layout and preservation of the old offline approval example. | Historical UI increment. Its then-public `/workspace/assistant` alias is no longer the canonical route behavior. |
| [context/assistant-production-hardening.md](../context/assistant-production-hardening.md) | Public-chat input deadlines, cancellation, request IDs, safe logging, duplicate-send prevention, cooldown and keyboard improvements. | Historical hardening evidence. Operational guidance: [frontend/docs/assistant-production.md](../frontend/docs/assistant-production.md). |
| [context/final-assistant-qa.md](../context/final-assistant-qa.md) | 26 October Assistant release tests, provider authentication/access error handling and observed CI/network limits. | Historical QA snapshot; “final” is scoped to that commit and date. |

### Supplier invoices and release-review evidence

| File | Purpose | Status / interpretation |
| --- | --- | --- |
| [context/payables-invoices.md](../context/payables-invoices.md) | Original manual-entry supplier-invoice pilot: provenance, scope, financial/state rules, implementation and verification. | Historical implementation handoff; explicitly distinguishes the pilot from full Moss/payment/OCR/ERP functionality. Current operations: [backend/PAYABLES.md](../backend/PAYABLES.md). |
| [context/payables-verification.md](../context/payables-verification.md) | Full 3 November invoice regression and the reproduced/fixed narrow-screen document metadata layout defect. | Historical QA snapshot with local synthetic runtime results and external limits. |
| [context/invoice-assistant-release.md](../context/invoice-assistant-release.md) | Invoice-grounded Assistant facts/proposals, explicit confirmation, permission revocation and company deployment handoff. | Feature/release handoff; its top routing update records the later public no-login sample choice. Still distinguishes configuration steps from observed hosted success. |
| [context/final-product-review.md](../context/final-product-review.md) | Broad 4 November review, identity/PDF lifecycle fixes, source coverage, PostgreSQL versions, test matrix and readiness limits. | Historical review of its named baseline; not a current hosted-health certificate. |
| [context/final-review-inventory.tsv](../context/final-review-inventory.tsv) | Paths, line counts, SHA-256 values and verification groups for 306 application/contract/workflow files in that review. | Historical provenance inventory. It is not proof that every line executed or that later source still has those hashes. |
| [context/release-signoff.md](../context/release-signoff.md) | Follow-up review of private ingress/scanner deadlines, the 276-test local matrix, recovery and remaining external gates. | Historical sign-off record for `fix/release-signoff`; hosted activation explicitly remains uncleared. |
| [context/release-signoff-inventory.tsv](../context/release-signoff-inventory.tsv) | Updated 307-file scope/hash/line-count inventory from the release-signoff review. | Historical evidence for that source tree, not an automatically maintained live index. |
| [context/production-verification.md](../context/production-verification.md) | Prior review from merged main `73f76dd`: independent findings, coordinated corrections, checks and release disposition. | Full-codebase review record for `fix/production-verification`. Read its measured results and deployment gates alongside the newer invoice UI report; do not infer production readiness from the filename. |
| [context/invoice-workspace-refresh.md](../context/invoice-workspace-refresh.md) | Invoice workspace layout/filtering refresh and appended final full-matrix review from merged main `43b0481`, fixes, regression checks and delivery limits. | Latest verification and UI delivery record; the referenced Moss page and hosted origin were inaccessible, so no exact visual copy or hosted production success is claimed. |

### Architecture and navigation documents

| File | Purpose |
| --- | --- |
| `docs/architecture.md` | Explains current runtime/data boundaries, a concrete new-product workflow, independent-project decisions, naming/comments and executable maintenance checks. |
| `docs/feature-map.md` | Cross-stack feature map: one row per product feature linking its frontend folder, backend domain, contract files, database migration, tests and runbook. |
| `docs/repository-guide.md` | Complete grouped file/folder purpose catalog, generated/private boundaries and verification command map. |
| `docs/AUDIT.md` | Phase 0 baseline audit of Payables/Invoices from the `chore/baseline-audit` branch: stack summary, architecture sketch, demo-vs-workspace data flow, baseline command results, hygiene/security scans and a findings register (A-01..A-14) with file:line evidence. |
| `docs/CI_COVERAGE.md` | CI coverage review comparing both GitHub Actions workflows against the full local verification matrix, recording the pre-split job structure, measured wall-clock, per-check coverage, the parallel job split and the exact required-check job names. |
| `docs/RELEASE_CHECKLIST.md` | Ordered operator release checklist (preconditions, before-deploy, deploy, post-deploy smoke and manual invoice journey, rollback) linking to the authoritative runbooks and separating agent-verifiable from operator-only steps. |
| `docs/PRODUCTION_GAPS.md` | Read-only per-capability production gap map (49 capabilities across identity/security, money, workflow, accounting, ingestion, operations, compliance) verified from code on `docs/production-gap-map`, with status, file:line evidence, notes and S1-S4 risk. |
| `docs/PRODUCTION_TODO.md` | Phased production-readiness checklist for Payables/Invoices; every tick cites file:line evidence and partial markers track unfinished clauses. Companion to `docs/AUDIT.md` and `docs/PRODUCTION_GAPS.md`. |

### Structure-refactor working documents

| File | Purpose |
| --- | --- |
| `docs/refactor/baseline.md` | Measured phase-0 baseline of the structure-only refactor: full verification matrix, environment limits, size inventory and inbound-reference facts that later phases must reproduce. |
| `docs/refactor/move-map.md` | Approved old-path → new-path plan for every relocation and verbatim top-level extraction in each refactor phase, with per-phase import-update lists and gates. |
| `docs/refactor/observations.md` | Running log of defects, smells and couplings found during the refactor and intentionally left unchanged, with proposed follow-ups. |

## Verification

Use Node 24/npm 11, separate locked installs, local PostgreSQL and the configured Chromium browser. Run browser suites sequentially; they own ports and shared artifact directories. Test names containing `production` mean built runtime verification, not an observed public deployment.

| Scope | Commands and purpose |
| --- | --- |
| Repository structure | `npm --prefix frontend run test:repository`; `npm --prefix frontend run check:repository` from root: catalog/private-output/source-import guardrails. |
| Both applications | `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm audit` in each package. |
| Backend/database | `npm test` in `backend/`: isolated synthetic schemas, actual HTTP, auth/tenant/financial/Assistant/scanner/concurrency/persistence regressions. |
| Default browser and standalone invoices | `npm test`; `npm run test:invoice-demo`. |
| Checklist/subscriptions/session | `npm run test:checklist`; `npm run test:subscriptions`; `npm run test:session`. |
| Imported receivables/workspace | `npm run test:receivables`; `npm run test:receivables:production`; `npm run test:workspace`; `npm run test:workspace:production`. |
| Private/public Assistant | `npm run test:assistant`; `npm run test:assistant:production`; `npm run test:public-chat`. |
| Private packaged API | `npm run test:vercel` (includes private build). |
| Invoice UI/transports/runtime journeys | `npm run test:payables`; `npm run test:payables-transport`; `npm run test:payables:integration`. |
| Public asset secret scan | `node scripts/check-assets.ts` in `frontend/` after builds. |
| Shared contracts | Four `python3 contracts/validate_*.py` validators and `node contracts/validate_assistant.mjs`, `validate_public_chat.mjs`, `validate_payables.mjs` from root, then the CI's pinned Redocly lint over all seven OpenAPI descriptions. Python packages are pinned in `contracts/requirements.txt`. |
| Synthetic recovery | `bash backend/scripts/restore-rehearsal.sh`; `bash backend/scripts/payables-storage-check.sh` from root with local Docker/database. |
| Hosted deployment smoke | `npm run smoke:hosted` in `frontend/` against a deployed origin configured only through `SMOKE_*` environment variables; see [docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Its pure logic is tested by `npm run test:smoke-hosted`. |
| Container | `docker build -t finai-backend:<reviewed-sha> backend`; verified TLS/checksum vendor downloads remain required. |

For target hosting, follow the exact Vercel/remote mode and private account/database/scanner/provider setup in the operating runbooks, then test the deployed commit and backups. Local tests/fixtures do not provision or certify that environment.
