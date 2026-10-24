# Production workspace conversion — 24 October 2026, Asia/Dhaka

Starting main: 3f5af0931f3b324e9880e2a67970fef71a1aa41c (PRs6/7 merged). Clean starting checkout. The cited local production-workspace increment/branch was not present in this machine or remote heads; implemented the specified foundation on feat/production-workspace, reusing existing modules. Sequential coordinator/backend/frontend/review roles; no agents/worktrees, reset, force push, target configuration changes, deployment or real-data import.

## Route/action ownership inventory

| Routes | Actions/data owner and truth | Permission/persistence and production status |
| --- | --- | --- |
| /, /product/:product, /resources, /about, /customers | Marketing, guide bookmarking, fictional previews/navigation | Public; guide bookmark only is local; not customer production data |
| /welcome | Enter demo, optional demo name; separate private sign-in link | Public; synthetic finai-demo-v1 only; never server authority |
| /overview | FinanceSnapshot, financial demo audit; optional legacy imported card | Synthetic financial store; imported card alone has its own session/API; not the new private workspace |
| /accounting/ledger, /accounting/journals, /accounting/journals/:id, /accounting/accounts, /accounting/trial-balance | Demo chart/accounts/journals, save/submit/approve/post/reverse/export | Demo personas/localStorage; no production posting/accounting claim |
| /receivables/invoices, /receivables/invoices/:id, /receivables/customers, /receivables/customers/:id | Demo draft/issue/receipt, customer/contact/history, CSV | Synthetic browser records; no real invoice/receipt mutation |
| /payables/bills, /payables/bills/:id, /payables/vendors, /payables/vendors/:id | Demo coding/review/payment and party views | Synthetic only; no money movement |
| /revenue/contracts, /revenue/contracts/:id, /revenue/schedules | Demo commitments/schedules | Synthetic read views; no real recognition |
| /banking/accounts, /banking/reconciliation | Demo balances/suggestions, match/unmatch | Local simulation, no bank connection |
| /close | Demo evidence preview/notes, completion/review/approval/lock | Browser simulation; never authenticated production approval/lock |
| /close/checklist | Existing session/local API task CRUD/copy, or explicit session demo mode | Scoped persisted ChecklistTask API in api mode; old demo shell remains separate |
| /tools/subscriptions | Scoped create/edit/archive/search/page/indicators | Persisted SubscriptionRenewal; existing auth and CAS, no billing/reminder automation |
| /reports, /reports/profit-and-loss, /reports/balance-sheet, /reports/cash-flow | Demo statements, drilldown/export/print | Synthetic ledger; no production financial report |
| /entities, /entities/consolidation | Demo scope/FX/eliminations display | Synthetic USD examples; no production multi-currency policy |
| /assistant | Demo fixed answers and explicitly approved local task proposal | No production AI provider or access |
| /automations, /automations/:id, /integrations | Demo preview/run/configuration/connection logs | Local simulation; no real integration/jobs/provider calls |
| /audit-log, /settings, /settings/:section | Demo role/preferences/reset/dimensions/review policy/audit views | Local state; not server administration/audit |
| /workspace, /workspace/overview | New shared authenticated private entry; imported receivables only | Session + entity API; no FinanceSnapshot, Northstar, persona controls or demo audit. Module selectors independent |
| /workspace/checklist | Existing task CRUD/copy under enclosing session | Persisted/authorized; completion is not accounting approval or lock |
| /workspace/subscriptions | Existing saved renewal module under enclosing session | Persisted/authorized; no automatic billing |
| /workspace/* unknown | Explicit private not-found body | Does not fall into demo routes; no synthetic financial fallback |

## Foundation implementation

All four public flags are required before mounting the session gate: VITE_AUTH_MODE=session, VITE_API_BASE_URL=/api/v1, VITE_CHECKLIST_MODE=api, VITE_RECEIVABLES_MODE=api. Invalid/missing configuration shows an error and makes no private requests. Schema-validated session/login responses alone may authenticate; 200 HTML/malformed JSON never does. One enclosing SessionGate context owns check/login/logout; nested module gates inherit it without extra controls. Concurrent bootstrap checks share only a pending bounded request in one identity epoch; settled responses are never cached. 401 from shared API/checklist reads/writes unmounts the private body; aborted/stale requests cannot expire a newer session. Failed logout reports failure without pretending success. Account/private responses are not persisted in localStorage/IndexedDB.

No new contract or migration is required for Release1. Existing csrf-only session response is preserved; authenticated user/organisation/permission bootstrap is a deliberate later contract extension. The separate demo financial store is unchanged. Current backend and Prisma include imported snapshots; historical absence statements are superseded by source. Public marketing and demo remain accessible.

Release1 evidence: frontend typecheck/lint; eight workspace mock-browser cases passed; real built frontend -> HTTPS same-origin proxy -> session backend -> isolated PostgreSQL journey passed, including imported A/B, saved tasks/subscriptions, reload/restart, failed logout/expiry and zero private browser storage. Synthetic screenshots in frontend/artifacts/workspace and frontend/artifacts/workspace-production at1440/390/320. Initial test diagnostics corrected a composite subscription-cell locator; StrictMode duplicate bootstrap checks prompted bounded in-flight session deduplication. No assertion/security setting was disabled. Broader regression, later slice and hosted results are recorded in subsequent progress entries.

Financial-reporting input remains a real release gate: use a documented vendor-neutral normalized format as requested, but finance-approved mapping/expected results and actual owner source data cannot be invented or claimed from synthetic fixtures. No P&L/balance sheet/cash flow will be fabricated from invoices. Target hosting/private DB/TLS/proxy settings and operator ownership remain unverified; implementation is not a production completion certificate.
