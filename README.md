# FinAI (New-FInAI)

FinAI combines a public sample finance workspace with separate authenticated company workflows: supplier invoice review/approval/export, checklist tasks, subscription records, imported receivables and a grounded FinAI Assistant. The web app uses React 19/Vite; the API uses NestJS 11, Prisma and PostgreSQL. Each application has its own manifest and lockfile.

Start with the [repository and file guide](docs/repository-guide.md) for every folder/file's purpose and the [architecture and new-product guide](docs/architecture.md) for future development. The [latest verification](context/invoice-workspace-refresh.md#final-developertester-verification--4-november-2026) records the final full test matrix, fixes and outstanding hosting gates. The same report also describes the invoice workspace refresh; the [prior broad review](context/production-verification.md) retains its dated evidence. Historical reports describe the version they tested; they are not live deployment status.

## Choose the right entry

| Entry | What it does | Requirements |
| --- | --- | --- |
| `/demo/invoices` or `/demo/payables/invoices` | Labelled sample invoices, PDFs, roles, approvals and CSV; separate browser persistence | Browser; no sign-in, API or database |
| `/development/payables/invoices` | Compatibility redirect to sample invoices | Same sample boundary |
| `/workspace/payables/invoices` | Real company invoice workflow | Configured API/database, provisioned session/AP grants and private scanner |
| `/workspace/assistant/records` | Authorized financial facts and proposed invoice actions requiring confirmation | Session, authorized sources and approved model/provider settings |
| `/demo/assistant` or `/assistant` | Separate public general model chat; cannot access company records | Server-only OpenRouter configuration |
| `/welcome` | Existing Northstar accounting/banking/reporting sample | Browser-only fictional data |

The invoice feature supports a manual-entry GBP approval/export workflow. It does not execute payments, post to an external ledger or perform OCR/email ingestion. Original Northstar accounting, banking and automation screens remain sample workflows. A passing local suite does not establish hosted production readiness.

## Run the sample app

Use Node 24 and npm 11. From the repository root:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/demo/invoices`. Use sample documents only. Plain Vite does not start Nest or the Vercel/public-chat API handlers. Public model chat needs its separate server runtime/configuration; a frontend build never embeds provider/database secrets.

For an independent distributable sample: `npm run build:invoice-demo`, then run `node artifacts/invoice-demo/serve.mjs`. This sample bundle is separate from the real company backend.

## Run the local API

Docker Compose must be running. In a second terminal, from the repository root:

```sh
cd backend
npm ci
npm run db:init
npm run db:up
npm run generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

These commands initialize **local synthetic development data only**. `db:init` preserves an existing private `.env`; tests use disposable local schemas. Never seed/reset an unknown or company database. Production uses injected server settings, explicitly reviewed migrations and administratively provisioned accounts; follow [backend/RELEASE.md](backend/RELEASE.md) and [frontend/docs/vercel.md](frontend/docs/vercel.md).

## Folder map

| Folder | Responsibility |
| --- | --- |
| `frontend/src/` | Browser routes, UI, clients, sample stores and feature screens |
| `frontend/api/`, `frontend/server/` | Server-only Vercel entry, adapters and public model chat |
| `frontend/scripts/`, `frontend/tests/` | Build/package utilities, synthetic services and browser/transport tests |
| `backend/src/` | HTTP composition, identity and authoritative domain services |
| `backend/prisma/` | Database schema, ordered additive migrations and local synthetic seed |
| `backend/scripts/`, `backend/test/` | Operator/local setup, recovery utilities and real database/API regressions |
| `contracts/` | Shared API/source schemas, synthetic examples and validators |
| `docs/` | Repository navigation and per-file explanations |
| `context/` | Engineering context, scoped handoffs and dated verification evidence |
| `.github/workflows/` | CI checks and failure/sample artifacts |

Generated dependencies/builds, private `.env` files and browser artifacts stay outside Git. The [file guide](docs/repository-guide.md) explains their locations and which generated schemas have an authoritative generator. Preserve established import, route, migration and deployment paths when adding features.

## Validate changes

From the root, run `npm --prefix frontend run test:repository` and `npm --prefix frontend run check:repository` for file-purpose and runtime-import guardrails. Run `npm run typecheck`, `npm run lint`, `npm run build` and `npm test` separately in each application. Frontend `npm test` is the default sample suite; the additional `test:*` scripts cover private modules, built runtimes and invoice transports. See the [complete verification command map](docs/repository-guide.md#verification) and the current report for actual outcomes. Install the configured Chromium browser before browser tests.

Operational guides: [invoices/scanner](backend/PAYABLES.md), [identity/deployment](backend/RELEASE.md), [workspace administration/imports](backend/WORKSPACE.md), [private FinAI](backend/ASSISTANT.md), [Vercel runtime](frontend/docs/vercel.md), and [shared contracts](contracts/README.md).
