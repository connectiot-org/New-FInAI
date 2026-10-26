# Operating the real public Assistant

The inline Assistant at `/demo/assistant` calls OpenRouter through the server. It has no canned answer fallback. Users select a current free text model and receive that provider's text. The existing `OPENROUTER_API_KEY` Secret (`Openrouter` alias accepted) stays server-only. No additional dependency or database is required for this public chat.

FinAI supplies fixed application context in the first user message, preserving the alternating roles required by models that do not support a system role. It states that no company books or records are connected, asks for missing company figures, and prohibits invented balances, sources or completed actions. This is model guidance. Financial grounding and record authorization belong to the separate private financial API; a language-model instruction is not an access control.

## Verified controls

- Strict 64 KiB requests, at most eleven alternating messages and 12000 combined client text units; a five-second deadline for incomplete raw uploads. Failed/aborted input releases its execution slot without a provider call.
- Eight-second, bounded catalog reads; forty-second provider deadline; 4096 output token cap; bounded response parsing. Function duration remains sixty seconds.
- Catalog eligibility and outbound zero-price caps are rechecked server-side. No paid fallback or automatic retry. Provider errors remain visible.
- Synchronous single-send guard, retained drafts, deliberate manual retry, cancellation/late-result protection and composer focus restoration. Only a valid server `Retry-After` starts a countdown; clearing a conversation does not bypass it. An unknown provider reset time is never invented.
- Every response has `X-Request-Id`. Error-body IDs match. The UI shows an error reference for support. Structured `finai_chat_request` logs contain request ID, sanitized route/method, status/code and elapsed milliseconds; they omit prompts, answers, keys, cookies and raw client IPs. Logging failure does not fail the request.
- Chat stays in current-page memory. FinAI does not save this public conversation in local/session storage. OpenRouter/provider retention policies still apply.

## Deployment verification

Run `npm run typecheck`, `npm run lint` and `npm run test:public-chat` in `frontend`, plus the existing release workflow. The public suite uses real HTTP and the built browser app against a controlled provider, including stalled/disconnected upload recovery, double submit, known cooldown, draft/focus, privacy-safe logs and all prior origin/model/price guards. Those tests do not certify every external model's availability.

On the deployed site, `/api/chat/models` must return `configured:true`, `freeOnly:true` and a current eligible list. Verify `X-Request-Id` on both success and a deliberately invalid model request, and match the error body's reference. An invalid selection must not issue a model completion. With allowance available, send one short question about unavailable company balances: the answer should explain that connected records are unavailable and ask for supplied figures. A quota error is a blocked live evaluation, not a successful answer. Never test with real credentials or confidential financial records.

For a failure report, find the response reference in Vercel's structured logs and inspect status/code/duration. No alerts or dashboards are claimed to be configured by adding logs. Use the existing key's secure OpenRouter settings for account-level allowances; never put a key in a browser variable, source file, screenshot or chat.

## Readiness boundaries

The public Assistant is a real stateless service, with finite controls. Free-provider quotas and availability remain external dependencies; they cannot provide a commercial availability guarantee. Application counters are per warm function instance (five requests/IP/minute, twenty/minute total, two active), not durable global limits across replicas. Public commercial operation still requires owner-verified traffic controls, capacity and monitoring on the target platform. No shared store or Vercel Firewall/alert configuration was provisioned in this session.

The private financial workspace currently reports `DEPLOYMENT_NOT_CONFIGURED` because its database is not connected. Real company-data answers and persistent financial memory require PostgreSQL, migrations, legitimate accounts/grants and approved source imports/mappings. The surrounding synthetic ledger must not be described as live company books. These requirements do not block general public chat, but they block a claim that the whole accounting product is production-ready.
