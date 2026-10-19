# Monthly checklist contract 1.0.0

OpenAPI **3.1.1**, contract **1.0.0**, URI `/api/v1`. Reconciled with supplied Prompt 02, replacing 0.1.0-proposal.1 before implementation. Coordinator owns shared schema/examples. Application roles propose deltas before edits; no silent drift. Production identity remains a separate release gate; local/test identity is server-owned, explicit and loopback-only.

| Operation | Input | Response |
| --- | --- | --- |
| GET `/entities` | No query/body | 200 `{items:[{id,name}]}` authorized entities |
| GET `/checklist-tasks` | entityId UUID, month YYYY-MM | 200 `{items,summary:{total,completed,percent}}` |
| POST `/checklist-tasks` | `{id,entityId,month,title}` | 201 new task, 200 identical safe retry |
| PATCH `/checklist-tasks/{id}` | `{completed,expectedVersion}` | 200 persisted task/new version |
| DELETE `/checklist-tasks/{id}` | `If-Match: "2"` (quoted displayed version) | 204 no body |

Tasks expose id/entityId/month/title/completed/version/createdAt/updatedAt only. Dates are RFC3339 UTC, month is explicit YYYY-MM (0001–9999). Server trims titles, validates 1–200 Unicode characters, rejects controls/unpaired surrogates and raw payloads >1000 characters. Reject unknown body/query fields. No organisation/user/role may come from clients.

One entity/month has at most 200 active tasks, enforced transactionally with consistent PostgreSQL advisory locks. GET returns all rows sorted by createdAt/id; summary uses precisely those rows, percent rounded to nearest integer, empty = zero. No cursors or pagination. POST normalizes UUIDs/month/title and stores immutable original create digest. Same authorized ID/payload returns current task; changed payload is CREATE_CONFLICT/409, capacity is CAPACITY_REACHED/409. Foreign IDs return safe 404. Deletion ends retry lifetime; no tombstones. PATCH is absolute assignment with version CAS; accepted same-value updates increment version. DELETE requires If-Match version; stale →409; missing/repeated/foreign →404. No demo/ledger records are touched.

All responses carry server-generated X-Request-Id; errors use `{code,message,requestId,fieldErrors?}`. 400 malformed JSON; 401 missing/invalid identity; 403 forbidden action/untrusted origin; 404 absent/inaccessible record; 409 version/create/capacity conflict; 422 invalid input; 500 safe internal failure; 503 unavailable dependency. No traces/SQL/secrets. All mutations require JSON Content-Type (including DELETE) and reject untrusted Origin/forwarding/identity override headers in local mode. Exact local frontend origins are configured server-side; curl with no Origin is local-only and cannot select identity. OPTIONS preflights advertise only allowed methods/headers. CORS is not authentication. Public operation is disabled until verified identity and membership integration exists.

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
