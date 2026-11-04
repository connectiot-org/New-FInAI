# Supplier invoice approvals

The latest public invoice navigation and legacy `/development/payables/*` URLs open the labelled browser-only demo directly; real company routes remain authenticated. A separate public development preview is available at `/demo/payables/invoices` with browser-only sample records and no login/database requirement. It never calls this private API, grants a company identity, or claims document scanning/real approval. See `../frontend/README.md` for that preview.

Private application entry: `/workspace/payables/invoices`. Suppliers, accounting export, approval policies and invoice-access settings live under `/workspace/payables/`. The existing demo Bills screen remains independent.

The manual-entry pilot supports supplier records, original PDFs, validation and coding, factual verification, one/two sequential approvals, correction requests, challenge/rejection, immutable history and balanced versioned CSV exports. It does not execute payments or post to an external ledger.

## Install and validate

Use Node24/npm11 and the separate lockfiles. From `backend/`:

```sh
npm ci
npm run db:init
npm run db:up
npm run generate
npm run typecheck
npm run lint
npm run build
npm test
```

`db:init` preserves existing private configuration. Tests use isolated local schemas; never reset or seed unknown databases. For an authorized application database, explicitly deploy the additive migrations with `npm run db:migrate`; do not migrate or seed automatically on server startup. Migration `202611030001_payables` adds eight AP tables and preserves existing modules. AP grants cascade when the corresponding EntityAccess is revoked; financial documents, invoices and history remain intact.

If prebuilt Prisma downloads are restricted, the optional `bash scripts/build-local-prisma.sh` builds the exact official engine commit pinned by the installed Prisma package. It uses Rust1.90, a clean verified source checkout, Cargo.lock checksums and normal TLS; it refuses a mismatched pin. Then source `/workspace/.finai-tools/prisma-env.sh` before commands. This is a native development build, not a RHEL hosting compatibility claim. Normal connected CI/hosting uses Prisma's vendor binaries. Never disable TLS or checksum verification.

From `frontend/` after backend setup:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:payables
npm run test:payables-transport
npm run test:payables:integration
```

The last command builds the actual private backend package, then executes the complete HTTPS/session/PDF/approval/export/restart journey through remote, embedded and packaged runtimes. It creates four synthetic accounts and two companies in an isolated schema, uses a valid PDF larger than16KiB, checks real CSRF/permissions/replays/concurrency, and cleans the schema. Controlled UI/transport tests are labelled separately. No production account or permission is provisioned by these commands.

## Operate with existing sessions and grants

Reuse `RELEASE.md`, `WORKSPACE.md`, `scripts/accounts.mts` and `scripts/workspace-admin.mts` for trusted account/organisation/entity administration. Account provisioning uses a hidden password prompt. A member must have active membership, an enabled account, EntityAccess, and explicit AP grants. `canWrite`/`canImport` and the administrator flag do not grant invoice approval authority.

An existing organisation administrator can visit `/workspace/payables/settings/access` to provision *other* existing company members. A reviewer with policy-management authority publishes the rules and mandatory fallback. Approvers and verifiers must be active eligible accounts; no submitter may approve their own submitted invoice. Changes revoke the affected member’s organisation sessions so permission changes require fresh authentication. The original administrative account need not receive financial permissions to provision a separate finance team. Initial organisation/entity/account setup remains an explicit trusted administrative process, not public signup or demo personas.

Use existing exact-origin, same-origin proxy and session settings. In Vercel embedded mode, configure the existing database/public-origin bindings described in `frontend/docs/vercel.md`. For a separate backend use the authenticated proxy settings in `RELEASE.md`. The build never migrates, seeds or provisions production accounts.

## Private document scanning

Server-only configuration names:

- `AP_CLAMD_HOST`: trusted private ClamAV daemon address. Prefer a same-host/pod sidecar; INSTREAM is a private TCP protocol and must not be exposed publicly.
- `AP_CLAMD_PORT`: private port, default3310.
- `AP_SYNTHETIC_PDF_SHA256`: exact fixture allowlist accepted only when NODE_ENV=test. Never a production scanner substitute.

The adapter streams bounded bytes to clamd, verifies the engine/signature date, refuses signatures older than seven days, and caps concurrent scans. Configure the daemon's ordinary PDF scanning, encrypted-document alerts, resource limits and signature updates. Real scanner deployment/signature-update access and target-network trust must be verified by the operator. No ClamAV service was provisioned in production by this change.

Missing/unreachable/stale/inconclusive scanners quarantine files. Infected files remain blocked. Encrypted PDFs are unsupported and quarantined even if a scanner would accept them; obtain an ordinary unencrypted supplier document. Review and download/preview require a clean or explicitly synthetic source. The latest source determines review eligibility. Rescan preserves original bytes, creates a review revision and records verdict/provenance history. Provider tests use an explicitly controlled protocol server, not a claim about malware-detection quality.

PDFs are limited to1MiB and retained as private PostgreSQL bytea, never public URLs or browser storage. PDF.js renders content in a dedicated worker with XFA/actions disabled, bounded page/image geometry, page navigation and zoom; the app never executes PDF actions or JavaScript. Originals download with generated safe names, no-store and nosniff. The narrowly scoped raw/binary exceptions work through both runtime adapters; ordinary JSON stays16KiB.

Each private ClamAV command has an absolute 10-second deadline, including connection and response bytes. Partial replies cannot extend it. Missing, stale, failed or timed-out scans remain quarantined, release their socket/scan slot and never satisfy the cleared-document requirement. This requires a reachable, maintained private scanner on the target hosting network; local protocol tests do not prove that connectivity.

## Financial and workflow rules

GBP only. Quantity has up to4 decimal places, money uses canonical integer minor-unit strings, and BigInt half-up rounding runs per line. Declared gross is retained separately. Positive bills are capped at GBP10m,50 lines and the ordinary JSON size limit. One explicitly confirmed tax treatment per invoice (NONE or STANDARD20%); mixed/unsupported cases remain blocked. Production use needs jurisdiction-specific, effective-dated tax/recoverability rules and finance-approved account mappings. Test fixtures do not establish those approvals.

Rules match in explicit priority order with decreasing amount thresholds and a mandatory fallback. Draft save and publication are separate; the UI preserves all up to10 rules. Submission freezes the published revision, selected rule explanation and assignees. Required verification precedes approval. Only the current authorised assignee can decide. Challenge starts a new review revision; rejection is terminal. A correction request blocks submission until corrected metadata is saved. Material edits invalidate current approval/export eligibility and retain prior snapshots.

Every mutation rechecks account, membership, entity and AP grants in its transaction. Row/advisory locks, expectedVersion and stable operation digests protect races/retries. Audit failures roll back both the transition and business history. Supplier-reference uniqueness uses explicit NFKC/trim/lowercase normalization within company/supplier; no fuzzy silent discard. The pilot permits500 suppliers per company and20 documents per invoice; the invoice register is bounded/paginated with complete filtered queue counts up to10000 matches. Activity shows the latest500 events; complete immutable history remains in the database.

Exports are immutable once per approved revision, balanced expense/nonrecoverable-tax and recoverable-tax debits against supplier payable credits. CSV includes supplier/reference/date/revision/currency/account/cost-centre snapshots and safely escaped cells. Replays return the same logical export. Historical exports remain downloadable and visibly superseded after material edits. Exported means prepared for accounting; it does not mean posted or paid.

## Recovery and remaining integrations

From the repository root, `bash backend/scripts/payables-storage-check.sh` verifies AP byte preservation and tenant FKs in disposable databases. `bash backend/scripts/restore-rehearsal.sh` additionally runs the real AP service through approval/export, backs up the complete synthetic application, restores it, and verifies documents, exports, policy, approval history and all eight migrations.

Use encrypted, access-controlled off-host backups and target restore rehearsals before real-company use. Local tests do not establish production RPO/RTO, scanner health, monitoring, jurisdictional compliance or hosting compatibility. Roll application code back compatibly while retaining additive AP tables/history; never use migrate reset, destructive reseeding or volume deletion.

OCR/email intake, purchase/budget matching, payments/settlement, advanced delegations/quorums, ERP acknowledgements and regulated exchange remain explicitly deferred integrations. No non-working payment, OCR or ERP controls are exposed. No production deployment, real-data import or paid resource was performed.

## Private FinAI Assistant

The additive [Invoice Assistant contract](../contracts/invoice-assistant.md) exposes read-only GBP invoice grounding and server-built proposals. Invoice links open `/workspace/assistant/records` with the authorized company and invoice-date month. An exact UUID from the question or bounded authorized prior references is required for an individual action. Summaries read at most1000 monthly records and distinguish registered gross (including rejected invoices) from approved workflow totals; neither is posted expenses, payable settlement or proof of payment.

`POST /api/v1/payables/invoices/:id/assistant-actions` requires a real session/CSRF and exact company/version. Review, verification, sequential approval, correction, challenge, rejection and CSV preparation delegate to existing transactions. No model calls a mutation. The UI requires review/confirmation and any reason; uncertain retries retain the original operation ID and payload. Assistant-channel provenance is recorded in the business event and security audit inside that transaction. AP view authorization is rechecked before sending evidence to composition, at final publication, when reading historical answers, and on stable turn replay. Historical facts/proposals can become stale; decisions always use current server state.

No new migration, automatic approval, payment, accounting posting, OCR, account provisioning or public demo identity is introduced. Configuring only an OpenRouter key is insufficient for private company data. Follow `ASSISTANT.md` and the existing database/session/scanner runbooks before hosted verification.
