# FinAI frontend

A standalone accounting product demo for the fictional Northstar Analytics. React 19, TypeScript, Vite, Tailwind CSS, Radix dialogs/dropdowns, Redux Toolkit, TanStack Table, React Hook Form + Zod, Recharts, and Lucide. No backend, credentials, or external runtime services.

## Install and run

Use Node 24 (tested with 24.19.0) and npm 11. Vite also supports Node 20.19+ or 22.12+.

```sh
cd /workspace/New-FInAI/frontend
npm ci
npm run dev -- --port 5173
```

Open `http://localhost:5173/welcome`. Vite supports direct deep links. For a production static host, configure an SPA fallback to `index.html` for application paths; no API routes exist.

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run preview -- --port 4173
```

Playwright uses `/usr/bin/chromium` when available. Set `PLAYWRIGHT_CHROMIUM_PATH` to another system Chromium, or run `npx playwright install chromium` to use Playwright's bundled browser when no system Chromium is present. The browser suite starts a Vite server automatically and uses two workers. `npm run format` formats this directory only.

## Demo journeys

- Welcome → entity/period selectors → overview metric → scoped records.
- Journal entries → New → balance debits/credits → Save → Submit → switch to Reviewer → Approve → switch to Accountant/Admin → Post → inspect ledger/report/audit → Reverse. Drafts do not affect reports.
- Invoices → New → add lines → Save draft → Issue locally → apply partial/full demo receipts → inspect receivable and cash journals.
- Bills → Inbox → open a document → change account coding → Submit → Reviewer/Admin approval → inspect source entry/activity → optionally record a demo payment.
- Reconciliation → Unmatched → inspect a suggested journal → Confirm match → Unmatch. One unidentified statement fixture intentionally has no candidate.
- Month-end close → task → evidence note or local attachment → Complete → Request review → Reviewer/Admin approves. Admin can lock/unlock a month; posting and source changes then respect the lock.
- Reports → financial statement → change period/entity → expand groups → drill into an account and source journal → CSV export or print.
- Assistant → example question → linked evidence → preview close-task proposal → explicitly approve. Unsupported questions return an honest fallback.
- Automations → configure trigger, amount condition and review action → Save → Preview → Run locally → inspect result history. Integrations provide an explicit simulation wizard and local sync log.
- Settings → members/demo personas, review policy, departments, notifications, compact density, simulated loading/empty/error states, or Reset demo.

## Data and calculations

The seed covers April–September 2026: 44 accounts, 24 customers, 16 vendors, 72 invoices, 48 bills, 12 contracts, two entities and 408 seeded journal lines. USD is the functional currency for both entities; consolidation simply adds USD values and clearly shows simulated 1.00 FX / zero eliminations. No unlike-currency totals are presented.

Amounts use integer cents; conversion to dollars happens only for presentation/export. Posted double-entry journals are canonical for ledger and statements. Opening cash is funded by common stock and retained earnings. Balance-sheet current earnings are cumulative posted revenue less expenses. Cash flow includes operating receipts/payments and opening financing. Balance-sheet and cash-flow controls reconcile to zero for each seeded month/entity. Monthly-in-arrears invoices recognize revenue immediately; contract commitments are forecasts and deferred revenue is zero in the initial seed.

All demo business data lives in versioned `localStorage` under `finai-demo-v1`. Invalid/older data falls back to the consistent seed with a notice. Local mutations produce object-specific before/after audit events. Reset in Settings → Preferences restores the seed, clears saved report views and returns to the Admin persona. Browser storage failure leaves a visible warning and session-only changes.

PDF/image attachments use session object URLs, never an upload or remote OCR call. Only an evidence filename/note may be persisted; reselect the file after a refresh. No File object or object URL is persisted. Conversation text is session-only. Saved report shortcuts retain report identity; entity/period are the current global scope.

## Boundaries and limitations

All payments, connections, approvals, period locks, automations and assistant answers are simulations. Roles are UI demonstrations, not authentication or a security boundary. The review threshold highlights high-value documents; all bills/journals still require approval. Automation runs create local review results/history and never post entries or send messages. Source-linked journals cannot be reversed independently because that would detach invoice/bill balances; manual journals support linked reversals.

The frontend has no customer/vendor/contract creation engine, production tax logic, real multi-currency accounting, billing service, or API integration. Contact profiles and contract terms are fixture read views. Reconciliation is a deliberately small September statement sample, including an exception. Only the supported local rules described above are implemented.

Rillet reference URLs were blocked by the environment proxy. All workspace visuals are original and inferred; there is no verified pixel or visual match. See `docs/reference-map.md`. All requested route areas have implementations; the exact route behavior and verification coverage are in `docs/route-matrix.md`. Later visual comparison against supplied or accessible product screenshots remains outstanding.

## Future adapter boundary

`src/types/domain.ts` defines serializable domain records and `DemoService`; `src/store/index.ts` contains transitions and the `localDemoService` adapter. Replace that adapter in a separate integration task when APIs exist. UI components do not issue remote business requests. Calculation selectors are in `src/demo/selectors.ts`; report composition is in `src/features/Reports.tsx`. Do not connect a backend to run this prototype.

Existing backend and root repository files are untouched. No deployment has been performed. Development uses the existing isolated checkout; do not create a worktree unless explicitly requested.
