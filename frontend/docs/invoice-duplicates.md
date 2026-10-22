# Invoice duplicate checker

Open `/tools/invoice-duplicates` from the authenticated product navigation. Select an authorized company, download the sample, and upload your own UTF-8 comma-separated `.csv` file. Click **Check for duplicates**, review the groups, and download the full report. Maximum 128 KiB / 500 invoices. Dates must be YYYY-MM-DD; amounts must be non-negative plain decimals with up to 12 integer digits and two decimal places. Currency is three uppercase letters. Exactly these headers are required, in any order:

```csv
supplier_id,supplier_name,invoice_number,invoice_date,amount,currency
V001,Example,INV-1,2026-10-01,12.50,USD
V001,Example,inv-1,2026-10-02,15.00,EUR
```

Both example rows are possible matches despite different dates, amounts and currencies. The key is the exact trimmed supplier ID plus invoice number ignoring case/outer whitespace. Punctuation, internal spaces and leading zeros remain significant; supplier IDs remain case-sensitive. Every row in a repeated group is flagged. This checks only the uploaded file, not stored invoices. It does not post, pay, import or remove invoices. An invalid record rejects the whole file; diagnostics identify its logical CSV record number and field. Files/results are never saved by this feature, and clear on refresh, leaving, sign-out, clear, file change or company change. Download the report before leaving. Spreadsheet formula-like cells are escaped with an apostrophe, so exported text can visibly differ from the original.

Uses the existing separate backend, memberships/entity access and SessionGate. Read access is sufficient for this transient analysis. There is no new API key, paid integration, application dependency or database migration. Existing hosting/database operating costs still apply. API errors remain visible and never fall back to fixtures or demo localStorage.

For local development, follow `backend/README.md` to install/generate/migrate/seed the local backend, build and start it. In `frontend/`:

```sh
npm ci
VITE_APP_MODE=product VITE_AUTH_MODE=local VITE_CHECKLIST_MODE=api VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

For a production build use `npm run build` (session-authenticated product with same-origin API) and the existing exact-host HTTPS/authenticated proxy settings documented in `backend/RELEASE.md`. Do not expose local identity. The public site's “API proxy is not configured” error is a deployment configuration blocker, not a successful connection.

With a local PostgreSQL URL in the existing ignored `backend/.env`, backend built, and frontend port 5173 free:

```sh
npm run test:invoice-duplicates
```

This reuses the isolated migrated/seeded PostgreSQL fixture used by the subscription suite; it drops only its own generated test schema. Production session/proxy upload coverage is included in `npm run test:session`. Shared transport schema: `contracts/invoice-duplicates.openapi.yaml`; exact rules and current evidence: `context/invoice-duplicates.md`.

PR #4 integration now uses the product-only PageHeader/UI imports and route, preserving the separate legacy regression entry. Combined merge verification and Git publication evidence are recorded in context/invoice-merge.md.
