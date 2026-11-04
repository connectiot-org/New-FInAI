# FinAI frontend

For architecture, module boundaries and future products, see [the development guide](../docs/architecture.md).

React 19, TypeScript and Vite browser application with a separate Node/Vercel API adapter. Start at the [repository guide](../docs/repository-guide.md) for each file's purpose and the [root README](../README.md) for end-to-end setup. There is no root npm workspace: install and run commands in this directory.

## Runtime boundaries

| Surface | Routes and behavior |
| --- | --- |
| Public invoice sample | `/demo/invoices` redirects to `/demo/payables/invoices`; `/development/payables/*` also redirects to samples. No sign-in/private API. Six sample invoices cover the workflow stages and a total mismatch; their sample PDFs and changes persist in separate IndexedDB `finai-invoices-development-v1`. |
| Company invoices | `/workspace/payables/*` uses sessions, explicit AP grants, PostgreSQL and private original PDFs. FinAI links preserve company/month/GBP/invoice scope and require confirmation for proposed actions. |
| Private financial Assistant | `/workspace/assistant` redirects to `/workspace/assistant/records`; authorized facts/history and confirmed proposals, without browser persistence of private records. |
| Public model chat | `/demo/assistant` and `/assistant`; separate general model chat with no company-record access. Server configuration is required. |
| Original Northstar sample | `/welcome` and the other demo routes use `finai-demo-v1`; local accounting, banking, reports, approvals and automations are simulations. The deterministic Assistant example remains at `/demo/assistant/offline`. |

The public sample is never an automatic fallback for a failed company API. Database/provider/session errors remain visible. Demo persona selection is not authentication. Supported real invoice behavior and limits are in [backend/PAYABLES.md](../backend/PAYABLES.md).

## Install, run and build

Use Node 24/npm 11:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
npm run check:repository
npm run test:repository
npm run typecheck
npm run lint
npm run build
npm test
```

Open `http://127.0.0.1:5173/demo/invoices` for sample invoices. Plain Vite serves the browser app; it does not start Nest or execute the Vercel/public-chat API handlers. Server features need their documented API/runtime configuration. Browser tests use the checked-in Chromium configuration; run `npx playwright install chromium` if needed, or set the documented `PLAYWRIGHT_CHROMIUM_PATH`. Dedicated suites start their own servers; run them sequentially to avoid port/artifact conflicts.

`npm run build:invoice-demo` produces `artifacts/invoice-demo/` with public assets and `serve.mjs`. Run `node artifacts/invoice-demo/serve.mjs` to open its README's standalone entry. It needs no account/database and performs no real scanning/payment/posting. Use sample files only.

`npm run build:vercel` instead packages the private Nest backend outside public `dist/`, typechecks the Node API and builds session/API browser modes. It does not provision databases/accounts or run migrations/seeds. Keep database/provider/proxy settings server-only; `VITE_*` values are public. See [Vercel deployment](docs/vercel.md).

## Source organization

- `src/main.tsx` mounts the app; `src/app/` owns routes and shells.
- `src/features/` groups screens/clients by domain; lowercase feature folders group public/sample/private modules by domain; each retains its documented data boundary.
- `src/demo/`, `src/store/` and `src/types/` implement the original sample data and transitions.
- `src/lib/` contains shared private API/session helpers; `src/components/` contains shared presentation.
- `api/proxy.ts` and `server/` run on Node, not in the browser.
- `scripts/` contains build, fixture/service and transport verification utilities; `tests/` contains browser suites. Each `playwright.*.config.ts` selects its matching suite.
- `docs/` contains feature, routing, design-reference and hosting guides. Validation JSON files are historical generated evidence for the version named inside them, not live hosting certificates.

See the [complete file catalog](../docs/repository-guide.md#frontend-files) and [verification map](../docs/repository-guide.md#verification).

## Working safely

Preserve the original `finai-demo-v1` and separate invoice sample store. Do not persist company records, credentials or financial chat history in browser storage. Do not put secrets into generated public assets. Generated `dist/`, `.finai-server/`, `.vercel/`, `node_modules/`, `artifacts/` and browser results are ignored output; edit their source/generator instead.

Current feature guides: [checklist](docs/checklist.md), [subscriptions](docs/subscriptions.md), [receivables](docs/outstanding-customers.md), [workspace](docs/production-workspace.md), [private Assistant](docs/assistant.md), [public chat readiness](docs/assistant-production.md), and [Vercel/invoice routing](docs/vercel.md). The latest [production verification report](../context/production-verification.md) separates measured local checks from unresolved hosted release requirements.
