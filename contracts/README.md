# Monthly checklist contract 1.1.0

OpenAPI **3.1.1**, contract **1.1.0**, URI `/api/v1`. Reconciled with supplied Prompt 02, replacing 0.1.0-proposal.1 before implementation. Coordinator owns shared schema/examples. Application roles propose deltas before edits; no silent drift. Contract 1.1.0 adds administrative session authentication; target infrastructure and public-release verification remain gated. Local/test identity is still server-owned, explicit and loopback-only.

| Operation | Input | Response |
| --- | --- | --- |
| GET `/entities` | No query/body | 200 `{items:[{id,name}]}` authorized entities |
| GET `/checklist-tasks` | entityId UUID, month YYYY-MM | 200 `{items,summary:{total,completed,percent}}` |
| POST `/checklist-tasks` | `{id,entityId,month,title}` | 201 new task, 200 identical safe retry |
| PATCH `/checklist-tasks/{id}` | `{completed,expectedVersion}` | 200 persisted task/new version |
| DELETE `/checklist-tasks/{id}` | `If-Match: "2"` (quoted displayed version) | 204 no body |

Tasks expose id/entityId/month/title/completed/version/createdAt/updatedAt only. Dates are RFC3339 UTC, month is explicit YYYY-MM (0001–9999). Server trims titles, validates 1–200 Unicode characters, rejects controls/unpaired surrogates and raw payloads >1000 characters. Reject unknown body/query fields. No organisation/user/role may come from clients.

One entity/month has at most 200 active tasks, enforced transactionally with consistent PostgreSQL advisory locks. GET returns all rows sorted by createdAt/id; summary uses precisely those rows, percent rounded to nearest integer, empty = zero. No cursors or pagination. POST normalizes UUIDs/month/title and stores immutable original create digest. Same authorized ID/payload returns current task; changed payload is CREATE_CONFLICT/409, capacity is CAPACITY_REACHED/409. Foreign IDs return safe 404. Deletion ends retry lifetime; no tombstones. PATCH is absolute assignment with version CAS; accepted same-value updates increment version. DELETE requires If-Match version; stale →409; missing/repeated/foreign →404. No demo/ledger records are touched.

All responses carry server-generated X-Request-Id; errors use `{code,message,requestId,fieldErrors?}`. 400 malformed JSON; 401 missing/invalid identity; 403 forbidden action/untrusted origin; 404 absent/inaccessible record; 409 version/create/capacity conflict; 422 invalid input; 500 safe internal failure; 503 unavailable dependency. No traces/SQL/secrets. All mutations require JSON Content-Type (including DELETE) and reject untrusted Origin/forwarding/identity override headers in local mode. Exact local frontend origins are configured server-side; curl with no Origin is local-only and cannot select identity. OPTIONS preflights advertise only allowed methods/headers. CORS is not authentication. Production mode requires database sessions, exact configured hosts/origin and the authenticated same-origin proxy; public deployment remains unauthorized until the release gates are completed.

## Local examples

These commands require the seeded local API. No credentials are needed for local identity; never expose it publicly.

```sh
api_base=http://127.0.0.1:3000/api/v1
entity_id=22222222-2222-4222-8222-222222222222
task_id=$(node -e 'console.log(crypto.randomUUID())')
curl --fail-with-body "$api_base/entities"
curl --fail-with-body "$api_base/checklist-tasks?entityId=$entity_id&month=2026-09"
curl --fail-with-body -X POST "$api_base/checklist-tasks" -H 'Content-Type: application/json' \
  --data "{\"id\":\"$task_id\",\"entityId\":\"$entity_id\",\"month\":\"2026-09\",\"title\":\"Review bank statement\"}"
curl --fail-with-body -X PATCH "$api_base/checklist-tasks/$task_id" -H 'Content-Type: application/json' \
  --data '{"completed":true,"expectedVersion":1}'
curl --fail-with-body -X DELETE "$api_base/checklist-tasks/$task_id" -H 'Content-Type: application/json' -H 'If-Match: "2"'
```

Inline synthetic response examples in openapi.yaml are authoritative. Actual HTTP responses must be validated against these schemas in backend tests.

## Frontend boundary

Separate `/close/checklist`; feature-specific typed/validated client and server state. `/close`, FinanceSnapshot Approved counts, locks, personas and finai-demo-v1 remain independent. `VITE_CHECKLIST_MODE=demo|api` and `VITE_API_BASE_URL` are public only; default demo never calls API. API mode uses authorized `/entities`, explicit month, source label, pending controls, visible failures and refetch after confirmed writes. Create retries retain client UUID and original payload until resolved; no new UUID on an ambiguous retry. On 409 refetch, explain conflict and require deliberate action. Cancel/ignore old-scope requests. Demo reset must not erase API data. No API credentials or DB URLs in VITE_ variables.

## Validation

From repository root: `python contracts/validate_examples.py` (PyYAML/jsonschema versions in requirements.txt). OpenAPI: install `@redocly/cli@2.8.0` outside application manifests then `redocly lint contracts/openapi.yaml --extends minimal`. Backend tests must validate real response JSON against schemas as well as persistence/isolation/concurrency. Schema checks alone do not establish runtime correctness. See context/progress.md for actual evidence.

## Contract 1.1.0 — copy and session release
POST `/api/v1/checklist-tasks/copy-previous-month` accepts only entityId and destination month. Server computes previous month (January crosses years; 0001-01 rejected). 201 returns sourceMonth/destinationMonth/copiedCount; empty source returns 200/zero. Occupied destination returns 409 DESTINATION_NOT_EMPTY. Titles only, new UUIDs, incomplete/version 1, atomic batch, source unchanged. Reload destination after uncertain responses; repeat against occupied destination conflicts.

Production identity uses administratively provisioned Argon2id accounts and PostgreSQL opaque sessions. GET /auth/session supplies a CSRF token; all authenticated mutations require exact Origin and X-CSRF-Token. Login accepts username/password/organisationId; never persist credentials in browser storage. No signup or email recovery. Existing CRUD contracts remain unchanged.

## Subscription renewal contract 1.0.0

See `subscriptions.openapi.yaml` and `python contracts/validate_subscriptions.py`. Existing checklist contracts remain unchanged. Scoped GET/POST `/api/v1/subscription-renewals`, PATCH `/{id}` for allowlisted details with expectedVersion, PATCH `/{id}/archive` for archived/expectedVersion. Create uses a client UUID and permits identical retries; changed payload/occupied ID conflicts. All access uses server membership and entity permissions, never financial-demo personas. Dates are Gregorian YYYY-MM-DD (0001–9999), cancellation <= renewal, names trimmed 1–200 Unicode characters, nullable notes <=2000. Lists use offset/limit (default20/max50), active/archived/all and case-insensitive literal supplier/name search, sorted renewalDate/id. Indicators are separate strings/null; archived records have none. Organisation timezone is server configuration `ORGANISATION_TIMEZONES` JSON mapping organisation UUID to IANA timezone; missing entries use UTC. Invalid configured maps/zones fail startup. Indicator boundaries are inclusive today..30 (renewal) and today..7 (cancellation); past dates never assert an action occurred.

## Imported receivables contract 1.0.0

`receivables.openapi.yaml` defines the read-only session-authorized GET `/api/v1/receivables/outstanding-customers?entityId=<UUID>&period=all|YYYY-MM`, the ready/no_snapshot union, safe error envelope, and normalized import-v1 schema. Run `python contracts/validate_receivables.py`. Imported empty registers are ready/zero; absent snapshots have no totals or timestamps. Period filters invoice issue dates against current cumulative paid amounts in the latest complete snapshot, not historical month-end balances. Capture time is owner source time; import time is server time. Original1.0 operator imports required write permission; workspace operations1.0 introduces explicit canImport with upgrade backfill. Operator imports (5 MiB/10,000 rows, five-minute future allowance) require import permission and expected-version concurrency checks. Cross-field status/payment, name consistency, uniqueness and safe aggregate invariants are validated by focused application tests. Existing contracts remain unchanged.

## Receivables detail companion 1.1.0

`receivables-detail.openapi.yaml` adds authorized snapshot discovery, explicitly pinned invoice/customer/issue-period pages and bounded JSON export. The existing 1.0.0 summary/import schema is unchanged. Page metadata echoes entity/source/period/filters/order/pagination. Offset pages within an immutable snapshot remain stable when newer imports commit. Defaults: outstanding status, offset0, limit20/max50; export is max10,000 rows, no truncation, allowed to authorized read members. CSV generation uses exact cents and formula escaping as a deliberate download; no browser cache persistence. Missing/foreign snapshots return identical404. No due dates or overdue/as-of semantics are inferred.

## Workspace operations 1.0.0

Receivables-detail1.2.0 additionally defines read-only `/receivables/changes`: two authorized pinned snapshots, all issue dates/statuses, exact invoice-ID matching, nullable absent sides, full-source totals/bridge and changed-only C-collated pagination. All new monetary fields are canonical decimal integer strings, including aggregate values above JavaScript's safe integer range. Old detail responses remain unchanged. See `../context/receivables-changes.md` and the basic example under `receivables-examples/`.

`workspace.openapi.yaml` adds identity/permission context, scoped administrator tooling, safe audit reads and a reviewed import workflow. Current auth/session/login responses remain csrf-only for compatibility. Read grants, workflow-write grants and import grants are independent; organisation administrator manages existing organisation members/entities and grants but does not implicitly gain financial entity access. A trusted operator bootstraps the first administrator; last-active-admin removal is refused. Permission changes revoke the affected user's organisation sessions.

Only `/api/v1/receivables/imports/preview` accepts raw `application/octet-stream` JSON files up to1MiB, after session/import/CSRF checks. Ordinary16KiB limits remain; CLI5MiB remains available. Session-bound temporary previews expire after15minutes and require exact digest/expected-version confirmation. Dry-run previews create temporary staging data but no financial snapshot; CLI dry-run still writes nothing. Atomic apply/retry and permission rechecks reuse the validated importer. Import/source/access/workflow changes and prepared exports have bounded server audit references, never financial contents. Target binary-body handling/ingress limits still require staging verification before release.


Assistant and ledger contracts: [assistant.md](assistant.md), [assistant.openapi.yaml](assistant.openapi.yaml), [assistant.schema.json](assistant.schema.json), [ledger.md](ledger.md), [ledger.schema.json](ledger.schema.json). Validate with `node contracts/validate_assistant.mjs` from the repository root after backend npm ci. The ledger example is synthetic, never a production mapping approval.


Public model test chat is a separate stateless boundary: [public-chat.md](public-chat.md) and [public-chat.schema.json](public-chat.schema.json). It requires no financial session/database and cannot access financial sources. Existing private Assistant contracts stay unchanged; its page is now /workspace/assistant/records. Validate with `node contracts/validate_public_chat.mjs`.
