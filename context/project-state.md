# Source inventory — 2026-10-19

Inspected repository: `connectiot-org/New-FInAI`, branch `main`, full HEAD `f1400308b2a2acc83b38c89465f0367bed6e52f3` (Refine FinAI branding, content, and UI accessibility). Earlier commits add REA audits, public pages, and local accounting workflows. Initial working tree was clean. No existing AGENTS.md or backend source was found. Root README contains only the project name. This design adds documents and contracts, not services.

User-supplied deployment reference: <https://new-f-in-ai.vercel.app/>. Deployment commit, runtime configuration and current availability were not verified. The older `connectiot-org/FinAI` Next.js project and Ledgerlane handover are separate projects.

Actual stack: React 19, TypeScript 5.9, Vite 7, Redux Toolkit, React Router, Zod, Radix, Tailwind, Recharts, Playwright. See `frontend/package.json`, its lockfile, `tsconfig.json`, `vite.config.ts`, and `playwright.config.ts`. Installed toolchain during onboarding: Node 24.19.0/npm 11.9.0; Chromium 154. No backend package, HTTP client for business data, production identity, database or API proxy is present.

| Capability | Classification | Source evidence and limits |
| --- | --- | --- |
| Public site, product pages, resources, customers, about | Demo-only | `src/app/router.tsx`, `src/features/marketing/content.ts` and `Marketing.tsx`; public product language describes fixture workflows |
| Workspace entry, entities, periods, personas/settings | Demo-only | Router Welcome dispatches `enter`; `Administration.tsx` dispatches `scope`/preferences; no login or membership service |
| Journals/accounts/ledger/audit | Demo-only | `Accounting.tsx` → store `journalSave`/`journalStep`; `demo/selectors.ts` calculates posted balances; local before/after audit |
| Invoices/receipts, bills/payments, customers/vendors/contracts | Demo-only | `Operations.tsx` → `invoiceStep`/`billStep`; fixtures and local source journals, not real money movement |
| Banking/reconciliation | Demo-only | `Operations.tsx` → `bankMatch`; small statement fixture, no bank connection |
| Close evidence, review, approval, locks | Demo-only | `Close.tsx` → `taskStep`/`lock`; four states, local evidence metadata, session-local file contents |
| Reports/consolidation/overview | Demo-only | `Reports.tsx`, `Overview.tsx`, selectors; USD fixture calculations and simulated 1.00 FX/zero eliminations |
| Assistant | Demo-only | `Assistant.tsx` matches question text and proposes local `taskStep`; no LLM API |
| Automations/integrations | Demo-only | `Administration.tsx` → local run results/connection flags/logs; no external service |
| Persistent checklist HTTP API, production auth, durable server audit | Absent | No server source, migrations or DB; proposed below |
| Backend-connected product capability | Absent | No business API wiring found; `DemoService` is a local interface |
| Public deployment provenance, security/recovery controls | Implemented status unverified | URL is a supplied reference, not evidence of server controls |

Paths in the table are relative to `frontend/` unless explicitly prefixed. `frontend/docs/route-matrix.md` supplies the complete route list; labels alone are not evidence.

## Traced data paths

1. `features/Close.tsx` selects entity and due-date month, substitutes September 2026 for `all`, counts **Approved**, dispatches `taskStep` complete → submit → approve. `store/index.ts:apply` checks current local role/entity/lock and updates status/evidence. Slice records before/after; store subscription writes `finai-demo-v1`. Reload parses through Zod with seed fallback. `tests/workflows.spec.ts` checks lifecycle and reload.
2. `components/shared/FinanceSnapshot.tsx` independently applies the same month fallback and Approved count. Its text saying “complete” does not make the stored status a boolean. No live data should be mixed into this calculation.
3. `features/Accounting.tsx:JournalDetail` dispatches `journalStep`; store requires balance/approval before local posting and creates a linked reversing journal for eligible manual entries. `demo/selectors.ts:ledger` filters Posted; reports derive from it. This validates demo behavior, not financial correctness for real customers.
4. `features/Operations.tsx` issues an invoice or applies a receipt through `invoiceStep`; the store updates local balances/journals and persistence. `features/Assistant.tsx` dispatches a local task completion only after explicit UI approval.

`types/domain.ts:DemoService` exposes load/save/reset of entire DemoState; `store/index.ts:localDemoService` implements browser storage, while Redux also loads/subscribes directly. It is not an existing remote repository abstraction suitable for copying wholesale.

## Unknowns

Prompt 02 endpoint/field semantics; chosen identity provider and membership lifecycle; real organisation/entity model; production hosting/domain/region and access controls; retention/privacy requirements; database ownership/backup operations; finance-approved expected outputs for future accounting. No real integration/AI credentials are required for the proposed first slice. No deployment or security audit is claimed.

## Prompt 02 implementation update

Backend and the separate frontend checklist were completed on 2026-10-19. Contract 1.0.0 supersedes the provisional design. Verified stack: NestJS 11.2.7, Prisma 6.19.3, PostgreSQL 17.6 with pinned image digest, existing React/Vite frontend. Prisma access is restored. Gates A–C passed: 8 backend, 11 checklist browser and 33 original tests. The original demo remains independent; API mode enables only the new screen. No public deployment/identity or Gate D readiness is claimed. Baseline inventory above describes the original commit, not the later implementation. See progress.md and review.md for exact current evidence.

## Copy/session release update — 2026-10-21

Starting checkout a285efa93bcf8918958b13139dabd9857edd0e72 was clean and revalidated. Contract 1.1.0 adds atomic previous-month title copying into empty destinations. Shared administrative Argon2id accounts, database sessions/rate limits, secure cookies, CSRF and same-origin proxy foundations are now implemented. Public deployment remains unverified/unauthorized. See `copy-release.md` for current verification, source inventory and gates; historical baseline descriptions above remain historical.

## Subscription renewals — 2026-10-22

Implemented `/tools/subscriptions` with one additive SubscriptionRenewal table, scoped CRUD/archive, bounded search/pagination, server organisation-timezone date indicators, existing sessions/permissions, and shared sign-in UI. No automatic billing/reminders or new auth platform. See `subscriptions.md` for current verification, files, migration/startup commands and production limits.

## Payment due-date calculator — 2026-10-22

`/tools/payment-due-date` and POST `/api/v1/payment-due-date-checks` are implemented on `feature/payment-due-date` from7c918477. Existing production sessions/CSRF/entity read authorization reused unchanged; explicit supplied as-of date, Gregorian calendar-day arithmetic and real0001–9999 dates, with clear422 on overflow. No business persistence/schema/dependency additions. Fresh local checks total85 passing tests plus typecheck/lint/build/contracts/audits/asset scan/synthetic restore/container build. Earlier inventory descriptions remain historical. No push, hosted CI, public deployment or production configuration verification is claimed. See [payment-due-date.md](payment-due-date.md) for the complete handover.


Subsequent user authorization: calculator commit/push to `feature/payment-due-date` is now requested after fresh verification. All85 tests and both application build/typecheck/lint, contract, asset and audit checks passed again. Main merge and deployment remain outside scope. GitHub-hosted CI status is unverified because API requests return Forbidden; remote publication is verified separately through Git.
