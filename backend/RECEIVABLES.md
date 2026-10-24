# Imported receivables 1.0.0 — operator and release runbook

This is a read-only USD invoice-register insight. Two append-only feature tables (`ReceivableSnapshot`, `ReceivableSnapshotInvoice`) store complete imported registers. No accounting entries, payments, invoice issuance, external connector or public importer is provided. The owner must normalize and approve the source export. New imports update balances; this is **not real-time synchronization**. The latest committed per-entity import version is authoritative for this read model only.

`GET /api/v1/receivables/outstanding-customers?entityId=<authorized UUID>&period=all|YYYY-MM` uses the existing session/proxy and entity permissions. Period means invoice issue dates, using current cumulative paid values in the latest snapshot; historical selections are not as-of month-end reports. Full sums/counts precede top-five selection. SQL numeric/BigInt arithmetic is checked before JSON serialization. Unsupported totals return 503, never zero. No snapshot differs from an imported empty register. Missing migrations/database failures fail readiness and reads. Request IDs/no-store/safe JSON errors and all existing authentication/CSRF protections remain intact.

## Source schema and normalization

See `../contracts/receivables-examples/import-v1.json` (synthetic only) and `../contracts/receivables.openapi.yaml`. Header: schemaVersion 1, currency USD, bounded sourceName, UTC sourceCapturedAt, completeRegister true, invoices array. Each row: invoiceId, customerId, nullable customerName, issuedOn, status, amountCents, paidCents. Dates must be Gregorian years 0001–9999; source timestamps are UTC and allow at most five minutes of clock skew into the future. Capture time is the source export's time, not import or response time; importedAt is assigned by the database. Timestamps normalize to milliseconds for the digest.

File limit is 5 MiB UTF-8; row limit is 10,000. Files larger than the limit are rejected without reading their entire contents or truncating a register. Invoice IDs must be unique. IDs/names/source names trim surrounding whitespace, contain 1–200 Unicode characters without controls/unpaired surrogates, and all rows for a customer must have the same nullable name. Unknown fields, mixed currency, duplicate invoice IDs and incomplete-register declarations are rejected. Money must be exact nonnegative safe-integer cents and paid <= amount. The CLI validates original JSON numeric tokens to reject numbers rounded by JSON parsing. Draft/Issued have paid=0, Partial has 0<paid<amount, Paid has paid=amount. The summary predicate remains status != Draft AND paid<amount. These stricter import rules do not change the independent demo.

Do not guess mappings for voided invoices, credit notes, overpayments, other currencies, partial pages, mismatched customer identifiers or unsupported statuses. Obtain an explicitly normalized complete USD register and source-total reconciliation from its owner. Missing customer names are allowed and displayed as Customer unavailable; production detail links are omitted because no authorized production customer/invoice screens exist.

## Build and import (trusted operator only)

Build `backend/` using the existing locked installation, `npm run generate && npm run build`. The CLI loads compiled backend modules and must run from that directory or the matching built container. Inject DATABASE_URL securely; no credentials in argv, source JSON, logs, VITE variables or chat. It accepts an existing actor User UUID, organisation/entity UUIDs and expected current snapshot version (0 when none). Active membership and entity **write** permission are rechecked under the same transaction. An HTTP read-only member cannot import. No demo seed or browser financial storage is ever a production import source.

Dry run is the default; substitute only owner-approved target IDs/file paths after separate release authorization:

```sh
node --import tsx scripts/import-receivables.mts \
  --file /secure/owner-approved-register.json \
  --organisation <existing-organisation-uuid> --entity <existing-entity-uuid> \
  --actor <existing-operator-user-uuid> --expected-version <current-version>
```

Review safe output (`status`, `version`, `rowCount`) and owner reconciliation. Apply uses the **same reviewed file and expected version**, adding `--apply`. The whole file is validated before a transaction writes anything. Per-entity advisory locks serialize imports, and all header/row batches commit atomically. Current identical-content retries return unchanged when expectedVersion equals the current version or the original previous version; other stale versions fail. Historical digest retries are rejected even with a fresh expected version, so old retries cannot reactivate older snapshots. Do not retry changed content blindly after a version conflict. Inspect the authorized current summary/version, reconcile the new source, and dry-run again. All other failure output is deliberately generic and contains no source/customer contents.

The canonical digest includes normalized metadata and invoice rows sorted by source invoice ID; JSON property order and invoice order do not affect identity. Source/name/capture changes represent a new export. Only versions up to PostgreSQL's positive int range are supported. No automatic historical deletion is performed. The data owner is responsible for retention/access/backup policy and periodic source refresh. Application code never updates or deletes snapshot history. Database administrative edits are outside this utility and require their own controls.

## Production configuration and order

No new secret/provider is needed. Existing configuration:

- Frontend public: `VITE_RECEIVABLES_MODE=api`, `VITE_AUTH_MODE=session`, `VITE_API_BASE_URL=/api/v1`; preserve intended checklist mode independently.
- Vercel server-only: `FINAI_BACKEND_ORIGIN` (one exact backend HTTPS origin), `FINAI_PUBLIC_ORIGIN` (one exact frontend HTTPS origin), `FINAI_PROXY_TOKEN`.
- Backend: `NODE_ENV=production`, `CHECKLIST_IDENTITY=session`, `PUBLIC_ORIGIN` (matching frontend origin), `API_TRUSTED_HOST` (backend host, separate from the origin), `API_PROXY_TOKEN`, `DATABASE_URL`, `API_HOST`/`API_PORT` per the existing private topology.
- Proxy tokens match through secure settings. No wildcard hosts/origins. Verified TLS and private durable PostgreSQL are required; never use serverless filesystem/browser storage for data persistence.

The existing proxy emits “API proxy is not configured” when any of its three server-only names is absent; malformed origins are rejected separately. Check presence/shape in the hosting settings without printing values. This is an operator configuration condition, not a reason to weaken proxy/auth checks. No proxy route/body-limit change was needed for the new GET path. `FINAI_PUBLIC_ORIGIN` must not contain a newline or an API_TRUSTED_HOST assignment; that malformed historical runbook example is corrected.

Only after separate release authorization:

1. Record exact frontend/backend release SHA and image digest; back up the target and rehearse restore into a separate database. Establish source/data owner, credentials, retention and rollback ownership. Do not reuse test accounts/data.
2. Build `docker build -t finai-backend:<release-sha> backend`. Use an immutable tested image on the existing private topology from RELEASE.md. Migrate once with that image and securely injected DATABASE_URL: `node node_modules/prisma/build/index.js migrate deploy`. Additive migration **202610240001_receivable_snapshots** adds only two feature tables plus constraints/indexes; existing rows/migrations are preserved. Never reset or seed production.
3. Roll out the compatible session backend; check trusted `/health/ready` (including both feature tables/columns), JSON anonymous 401, login and authorized entity discovery. Build frontend with the public flags above and matching same-origin proxy configuration. Keep surrounding financial panels explicitly demo data.
4. Dry-run the owner-approved full normalized file; review counts and source reconciliation, then separately authorize `--apply`. The importing actor must already have active membership/entity write access.
5. Verify actual target SHAs/images/migrations, secure cookie, summary/entity/period/source captured/import labels and owner totals, refresh/backend restart, a reviewed subsequent import/version change, cross-entity denial/expiry, proxy JSON errors, no production browser persistence, unchanged checklist/subscriptions/demo, redacted logs, monitoring and backup/restore.

Rollback routes traffic to the previous compatible frontend/backend images and turns off the receivables API card (default demo) where appropriate. Keep all additive tables and imported data intact. Do not drop tables, revert migrations, restore over the active database or delete volumes. Keep public session authentication fail-closed. A rollback to an older backend must not claim support for imported receivables. Data recovery is a separate approved process.

## Checks and status

From backend/: `npm run generate`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (includes isolated PostgreSQL/HTTP import/receivables tests), `npm audit`, `bash scripts/restore-rehearsal.sh`. From root: the three `contracts/validate_*.py` validators and pinned Redocly 2.8.0 lint. Frontend commands/evidence are in `../frontend/docs/outstanding-customers.md` and `../context/receivables-production.md`.

Implementation testing uses disposable synthetic schemas/databases only. No real export, production credentials/target or deployment/import authorization has been supplied. Locally tested does not mean CI verified, preview verified, production deployed or production verified. Dependency advisories and external API access must be resolved before a release can be marked clear.
