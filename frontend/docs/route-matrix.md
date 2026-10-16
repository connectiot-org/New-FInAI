# Route and interaction matrix

All visual reference confidence is **inferred**: public Rillet URLs were denied by the environment proxy. No screenshot fidelity has been verified. Browser smoke coverage loads 37 concrete shell URLs directly; `/welcome` is exercised by every workflow. Unknown and missing-record routes are explicitly covered.

| Route                          | Implemented behavior                                                                                                  | Verification                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/welcome`                     | Optional local name, seeded workspace entry                                                                           | Browser entry and all workflow tests                            |
| `/overview`                    | Posted-ledger metrics, six-month chart + data table alternative, scoped links, close progress, exceptions, activity   | Route smoke; four viewport screenshots; report controls         |
| `/accounting/ledger`           | Posted journal lines, URL account/search filters, entity/period scope, sort/select/paginate, source links, CSV        | Journal lifecycle, report drill-through, responsive containment |
| `/accounting/journals`         | Status tabs, balanced multiline draft form, inline validation, unsaved-change guard                                   | Journal workflow; browser-back/discard test                     |
| `/accounting/journals/:id`     | Draft edit, submit/review/post, local document preview, source links, linked manual reversal                          | Lifecycle, refresh persistence, reversal/audit test             |
| `/accounting/accounts`         | Type/activity filters, create/edit code/name/active state, account activity                                           | Route smoke; account creation and safe CSV test                 |
| `/accounting/trial-balance`    | Closing debit/credit balances, control total, account drill-down, CSV                                                 | Route smoke; fixture double-entry validation                    |
| `/receivables/invoices`        | Status tabs, period/entity/search filters, validated multiline draft editor                                           | Invoice lifecycle; route smoke                                  |
| `/receivables/invoices/:id`    | Edit draft, issue locally, partial/full receipt, balance updates, document preview, linked journals/customer          | Invoice receipt workflow + refresh                              |
| `/receivables/customers`       | Search/sort/paginate/export, scoped outstanding balances                                                              | Route smoke                                                     |
| `/receivables/customers/:id`   | Contact fixture, invoice history/balances, linked contracts                                                           | Route smoke; linked evidence/navigation                         |
| `/revenue/contracts`           | Searchable agreement list, dates, monthly commitment                                                                  | Route smoke                                                     |
| `/revenue/contracts/:id`       | Terms, customer link, line commitment, document preview, schedule link                                                | Route smoke                                                     |
| `/revenue/schedules`           | Contract selector, monthly commitment waterfall, posted invoice recognition totals, ledger links                      | Route smoke; canonical ledger selectors                         |
| `/payables/bills`              | Bill inbox/status tabs, search/scope/sort/selection/export                                                            | Route smoke; bill workflow                                      |
| `/payables/bills/:id`          | Local document preview, expense coding, submit/approve, local payment, activity/source journals                       | Coding → Reviewer approval → audit; period lock test            |
| `/payables/vendors`            | Scoped balances, search/sort/paginate/export                                                                          | Route smoke                                                     |
| `/payables/vendors/:id`        | Contact fixture, bill history, balances/activity links                                                                | Route smoke                                                     |
| `/banking/accounts`            | Demo operating/savings cards, closing ledger balances, connection state, reconciliation links                         | Route smoke                                                     |
| `/banking/reconciliation`      | Statement sample, match candidates, difference, match/unmatch, unmatched exception                                    | Match/unmatch + refresh test                                    |
| `/close`                       | Monthly tasks, owners/dates, evidence note/local file, completion/review/approval, lock/unlock                        | Close lifecycle, local PDF attachment, lock test                |
| `/reports`                     | Financial statement catalog, locally saved report shortcuts                                                           | Route smoke                                                     |
| `/reports/profit-and-loss`     | Expandable revenue/expense groups, net income, prior comparison, period/entity controls, source drill-down, CSV/print | Report filters, CSV download, journal lifecycle                 |
| `/reports/balance-sheet`       | Closing assets/liabilities/equity, opening retained earnings + current earnings, controls                             | Every seeded period/entity reconciles; post/reversal checks     |
| `/reports/cash-flow`           | Direct cash movements by activity, beginning/ending balances, controls                                                | Every seeded period/entity reconciles                           |
| `/entities`                    | Separate USD entity books, selection, period-scoped summary cards                                                     | Route smoke; scope controls                                     |
| `/entities/consolidation`      | Group USD summary, explicitly simulated 1.00 FX and zero eliminations                                                 | Route smoke                                                     |
| `/assistant` + shared drawer   | Deterministic questions, evidence links, unsupported fallback, preview + explicit approval of local close-task action | Supported/unsupported questions; approved proposal mutation     |
| `/automations`                 | Templates and new local automation                                                                                    | Route smoke                                                     |
| `/automations/:id`             | Name, trigger, amount condition, action, enablement; save/preview/run/history; unsaved-change guard                   | Configuration, preview/run/history workflow                     |
| `/integrations`                | Search catalog, demo connection/disconnection wizard, local sync log                                                  | Connection simulation workflow                                  |
| `/audit-log`                   | Search/actor filter, timestamps/objects, inspect actual local before/after                                            | Bill/journal/account mutation tests                             |
| `/settings/workspace`          | Workspace name; USD information                                                                                       | Route smoke                                                     |
| `/settings/members`            | Admin/Accountant/Reviewer demo controls and role descriptions                                                         | Role switch + permission checks                                 |
| `/settings/approvals`          | High-value document threshold; all journals/bills retain review                                                       | Route smoke                                                     |
| `/settings/dimensions`         | Add/remove local department labels                                                                                    | Route smoke                                                     |
| `/settings/notifications`      | Enable/pause local activity panel                                                                                     | Route smoke                                                     |
| `/settings/preferences`        | Density, controllable loading/empty/error states, reset                                                               | Error/retry; reset restores consistent seed                     |
| `/settings`                    | Redirect to workspace settings                                                                                        | Router definitions; welcome journey                             |
| Unknown route / missing record | Explicit recovery view                                                                                                | Browser missing route/record tests                              |

All listed areas are implemented for the bounded local demo. Contact/contract fixtures are read views. Reconciliation uses a September sample, not a statement ingestion system. Automation results are local review summaries/history, not external execution. File contents and conversation text are session-only. See README for the intentional domain limits.

Outstanding: reference-based visual comparison remains blocked; print CSS is checked through Chromium print-media emulation; physical printer/OS output is not tested. The test suite checks Chromium; other browser engines and assistive-technology audits have not been run. Route smoke is not exhaustive testing of every control.

## Public website follow-up

Visual confidence is **inferred**. Live Chromium was also blocked; there is no observed Rillet homepage reference. The following are original FinAI implementations, not verified copies.

| Route                               | Implemented behavior                                                                                                                            | Verification                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `/`                                 | Public homepage, product dropdown, local walkthrough chooser, canonical-data previews/search/record links, feature tabs, FAQ, footer navigation | Public browser tests; four viewport checks  |
| `/product/automated-general-ledger` | General-ledger presentation and live local preview; workflow links                                                                              | Direct load/refresh; navigation             |
| `/product/accounts-receivable`      | Receivables presentation, invoice preview and real detail links                                                                                 | Direct load/refresh; responsive containment |
| `/product/accounts-payable`         | Payables explanation, coding/review guidance, working bill-workflow link                                                                        | Direct load/refresh                         |
| `/product/financial-reporting`      | Reporting presentation, canonical overview preview and statement links                                                                          | Direct load/refresh                         |
| `/product/month-end-close`          | Close presentation, actual task preview and checklist link                                                                                      | Direct load/refresh                         |
| `/product/assistant`                | Assistant explanation, actual closing cash, ledger evidence and assistant link                                                                  | Direct load/refresh; demo-response labels   |
| `/resources`                        | Workflow guides and honest local-demo/privacy details                                                                                           | Direct load/refresh                         |
| `/about`                            | Original prototype description, accounting demo entry                                                                                           | Direct load/refresh; demo entry             |
| `/product/:unknown`                 | Public missing-product recovery                                                                                                                 | Browser recovery test                       |

The homepage replaces the earlier `/` → `/welcome` redirect. The `/welcome` demo entry and all accounting routes continue to work.
