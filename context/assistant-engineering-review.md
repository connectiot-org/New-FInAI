# Assistant engineering review — 25 October 2026

Reviewed the implementation after the user reported the screenshot still showed deterministic demo responses. The remote main had advanced to2586e3f (PR9 merged), which corrected the earlier stale merge status. Work is on fix/assistant-live-entry; no production deployment or secret change.

## Findings fixed

1. The demo shell's Ask FinAI control opened a deterministic demo drawer. It now navigates to /workspace/assistant. The preserved /demo/assistant is explicitly titled as a demo and offers a direct authenticated Assistant link. A browser regression covers both entries and confirms no demo drawer/result appears in the private route.
2. backend/compose.production.yaml omitted every Assistant variable. The manifest now forwards the key, enabled flag, exact model, provider allowlist, daily allowance, both price caps and ledger approvals to the API container, defaulting disabled. A real Compose configuration-resolution test with synthetic settings proves the resulting container environment reaches the adapter. No real secret was read or printed.
3. Blank price caps were coerced to zero. The adapter now rejects blank/whitespace values; explicit zero remains valid and prohibits paid routing. Existing privacy/no-fallback/model checks remain.
4. An uncertain conversation creation could retain its UUID/payload across reopening another reporting scope. Scope changes now clear that retained intent, and creation independently checks entity/month/currency before reusing a UUID. Regression verifies unchanged-scope retries preserve the ID while a changed month gets a new ID/payload.
5. Ledger import dry runs did not emit the review fingerprint described by the runbook. Dry-run/import/unchanged results now include canonical digest, mappingId, mappingDigest and mappingApproval candidate. Tests prove the dry-run matches the subsequent immutable source and writes no snapshot. Review metadata never enables an approval.

## Verification ledger

50 backend tests pass, zero skipped. Frontend98 distinct cases pass across the preserved default51, checklist14, subscriptions4, session1, receivables5, receivables-built1, workspace11, workspace-built1, Assistant9 and Assistant-built1 suites. The full sequence passed before the final entry correction; the affected suites are rerun against the frozen final application tree. One repeat default run passed50 and failed one test setup because its browser execution context was replaced during navigation; this is recorded rather than discarded. Final rerun outcome is appended below. No assertion was removed or relaxed. Both applications typecheck/lint/build; five contract validators and all six OpenAPI documents validate (four unused-component warnings). Both dependency audits report zero vulnerabilities. Five-mode asset scan passes. Seven-migration synthetic restore passes. Production-mode container readiness, anonymous Assistant/ledger/receivables401, malformedJSON400 and recovery smoke pass. Image finai-backend:assistant sha256:53f3f468db50f50236281f19605339821fdc62ec1c83573bc109a7725348fa0d.

Prior implementation CI atffac91b succeeded: https://github.com/connectiot-org/New-FInAI/actions/runs/40178221424 . Fix-branch hosted results must be checked separately; successful earlier CI is not evidence for these later fixes.

## Configuration and real-model limits

The user reports an OpenRouter key was set in Vercel. This architecture uses a Vercel frontend/proxy and a separate Nest backend. The proxy reads FINAI_BACKEND_ORIGIN, FINAI_PUBLIC_ORIGIN and FINAI_PROXY_TOKEN only. OPENROUTER_API_KEY set only in that frontend project does not reach Nest. Configure Assistant settings securely on the actual backend service, restart it under deployment authorization, and keep the key out of VITE variables/client bundles. Backend target identity/settings were not available for inspection here.

This execution environment still has no OpenRouter key/model/provider/budget/price caps/mapping approval. Actual-provider evaluation reports BLOCKED and makes no request. Public OpenRouter catalog and target site probes returned403 even after escalation. No actual model, free catalog/quota, live deployment or all-model compatibility is verified. Free variants still require configured access and quotas; strict structured output/privacy support varies. Both price caps0 enforce free-only routing but grant no unlimited token balance. No fake OpenRouter token count, key forwarding to browsers, paid fallback or invented model test result was introduced.

Next: provide the backend host/configuration status without secret values, approve exact free model/provider/privacy/budget settings, apply reviewed settings to the authorized backend, merge/deploy the fix through the normal release process, then perform authenticated actual-provider/source tests on that deployment. The implementation preserves private sources/history, original demo workflows, dependency locks and additive migrations. Passing tests reduce known risk; this is not a guarantee that no bugs exist.


Final frozen-tree rerun: default51, Assistant9 and built Assistant1 all passed; five-mode credential/fallback asset scan passed. The earlier execution-context failure did not recur, and its assertions remained unchanged. Actual-provider and hosted deployment limits above still apply.


User subsequently selected free models only. The adapter now rejects nonzero as well as blank price caps, and independently hardcodes outbound prompt/completion max_price0. Regression checks cover positive/negative/blank rejection and actual outbound zero caps. No paid routing is permitted; exact approved model/provider settings and real provider access remain external.


Hosted release checks for entry/configuration fixeccda6b passed: https://github.com/connectiot-org/New-FInAI/actions/runs/40192396032 (exact head confirmed). The later requested free-only restriction is a separate increment: backend50, Assistant UI9 and built integration1 pass again, with typecheck/lint/build/contract validation and container smoke. Free-only image sha256:928255412001e3f60970f685146a2addbeaeaefe2cff4fa60c482517a48c83d4. Latest-increment CI is checked separately after pushing; the earlier successful run does not cover that increment. The UI labels free-only routing and explicitly says provider quota is unavailable, rather than showing invented free tokens.


Follow-up hosting diagnosis: user reports the product/key are in Vercel. Repository configuration deploys frontend plus an HTTPS proxy; it does not deploy the Nest backend in that Vercel project. The proxy never consumes OPENROUTER_API_KEY. Asked for the exact key variable name and whether DATABASE_URL is configured, without secret values; no Vercel connector/credentials are available here. A Vercel-only backend adaptation is not already implemented or verified by this proxy configuration.

Hosted free-only run40193161315 at049ba94 failed. Public job metadata confirms backend and contracts passed; combined browser step failed, container/restore skipped. Exact logs returnForbidden/sign-in required. The built Assistant suite passes locally again with CI=true, which does not establish the cause of the hosted failure. Workflow now names every preserved browser suite separately and retains synthetic failure traces/reports for7 days; no test/assertion removed. Local CI-mode full rerun is recorded separately. Latest hosted status supersedes any earlier pending state.
