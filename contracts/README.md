# Monthly checklist contract 1.1.0

Additional independent tool contract: [invoice duplicate checker 1.0.0](invoice-duplicates.openapi.yaml).
POST `/api/v1/invoice-duplicate-checks` returns transient, scoped CSV analysis without database writes.
See `context/invoice-duplicates.md` for exact CSV/matching/limit/privacy semantics and verification.

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
