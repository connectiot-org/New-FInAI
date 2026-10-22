# OpenRouter free-model chat

Route: `/tools/ai-chat`, in the authenticated product navigation. Select an authorized company, search/select a free text model, enter a prompt, then Send message. Responses appear only after backend confirmation. Reset, model/company/search/prompt changes, navigation and sign-out discard pending results. Cancel stops waiting; an already dispatched request may still run at the provider. The application never automatically retries a chat request.

The tool sends only the entered prompt to OpenRouter and its model provider. It does not attach records, call financial tools, save chat history or use demo responses. Responses render as plain text. Provider availability, quotas, retention and correctness are external constraints; unavailable providers produce visible errors. Review results and avoid submitting sensitive information. Free catalog entries are not a promise of unlimited inference.

## Existing Vercel deployment configuration

Project root `frontend`; Node24; build `npm run build`; output `dist`. Preserve the existing server-only proxy variables: FINAI_BACKEND_ORIGIN, FINAI_PUBLIC_ORIGIN, FINAI_PROXY_TOKEN. The deployed NestJS backend needs this release, existing PostgreSQL session authentication, exact TLS hosts/origin, account membership and entity permissions. A frontend key alone cannot create that infrastructure or authorize a user.

In Vercel Settings → Environment Variables, add **OPENROUTER_API_KEY** as a server-only secret for the intended environment. Never use VITE_OPENROUTER_API_KEY or place the value in source, browser storage, screenshots, logs or chat. After a separately authorized deployment, server functions receive the setting; a pre-existing deployment does not acquire new code through an environment edit alone. This task does not change hosting secrets or deploy publicly.

The proxy injects the key only on the two AI API paths over the configured TLS connection. It ignores browser-supplied provider credential headers. The backend validates the trusted proxy and session, entity access and CSRF before calling fixed OpenRouter URLs. An optional backend OPENROUTER_API_KEY takes precedence; production Compose supports that alternative. Keep ingress/header/body logging disabled or redacted. See [backend release instructions](../../backend/RELEASE.md).

The backend requires free IDs (`:free` or `openrouter/free`), text input/output, and all advertised catalog prices zero. It rechecks on every send; routing price ceilings are zero and paid fallback is disabled. No paid model selector is provided. Input is at most4000 characters, output at most512 tokens and response16000 characters. Chat is bounded by database-shared user/organisation/global limits. Free-account/provider quotas can be lower. Use provider account/key spending restrictions as an additional activation control.

## Prepared local development

Use the backend/frontend startup commands in product.md. Set OPENROUTER_API_KEY through private server configuration only (backend/.env for explicit loopback local mode). The local browser cannot relay its own key. There is no migration or new dependency. Missing keys disable only AI with a clear configuration error; the existing tools continue working.

## Verification and activation checklist

`npm run test:session` exercises the production build, real HTTPS proxy, NestJS and PostgreSQL sessions, using a **controlled provider transport and synthetic key**. Tests cover free catalog search/selection, no credential browser payloads, CSRF, provider errors, missing key/empty catalog, network failure, repeated-click guard, changed scope/reset, plaintext rendering, refresh, mobile and keyboard use. These tests do not establish live provider availability or key validity.

After operator-authorized deployment, sign in to `/tools/ai-chat`, confirm only free models appear, submit a non-sensitive synthetic prompt, verify a real reply and no provider charge, and check missing-CSRF/anonymous/cross-entity denial. Verify direct-link refresh, safe JSON errors, secret-free assets and redacted logs. Configure AI ingress timeout at least45s; non-AI limits stay unchanged. Live catalog/schema access from the implementation environment returnedHTTP403, so live provider compatibility/inference and target Vercel configuration remain pending.
