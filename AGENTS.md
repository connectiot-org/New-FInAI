# FinAI working instructions

Read `context/README.md`, `context/project-state.md`, `context/progress.md`, and the instructions in your target directory before editing. Context files are not automatically loaded memory. Verify summaries against source and contracts.

For each task state role, allowed edit paths, acceptance criteria, and expected handoff. Work sequentially unless the user explicitly requests parallel agents. Use the existing isolated checkout; do not create a worktree unless requested. If concurrent implementations are explicitly requested, use independent branches/worktrees with separate role scopes.

| Role | Owns | Reads | Must not edit |
| --- | --- | --- | --- |
| Context coordinator | `context/`, `contracts/`, root and directory agent instructions | Both applications | Application source, secrets, live data |
| Backend engineer | `backend/`, including its tests and infrastructure | Frontend and contracts | `frontend/`, shared contracts/instructions |
| Frontend integrator | `frontend/`, including browser tests | Backend and contracts | `backend/`, shared contracts/instructions |
| Reviewer | Scoped review evidence/report | All scoped work | Unrelated source |

Shared contract changes go through the coordinator: propose the delta and compatibility impact, update schema/examples first, then adapt consumers. Routine compatible choices do not need repeated user confirmation. Use `context/agent-boundaries.md` templates.

Keep manifests, lockfiles, environment files and commands separate per application. Preserve existing changes; inspect Git status before work and the full diff afterward. Never revert someone else's work. Paths and review rules are guardrails, not filesystem isolation; no CODEOWNERS or branch protection is configured by these instructions.

Do not merge the separate `connectiot-org/FinAI` or Ledgerlane projects. Demo persona selection is never authentication. Preserve the existing demo and its `finai-demo-v1` storage when adding the separate live checklist. Live errors must stay visible. Never save secrets, private browser state, or real customer data in context or examples.

Prompt 01 supplied the design. Prompt 02 now authorizes the local monthly checklist implementation in sequential coordinator, backend, frontend, and verification roles. Contract 1.0.0 supersedes the provisional proposal. Production deployment remains unauthorized. Run checks suitable for the actual change and record real outcomes.

Current copy/session release work (2026-10-21): contract 1.1.0 and previous-month copying are implemented alongside administratively provisioned PostgreSQL sessions. Read `context/copy-release.md` and `backend/RELEASE.md` for actual current checks, required host/proxy configuration and remaining gates. Production local identity is still rejected. Public deployment, paid resources and publication are not authorized by this work.

Product boundary update (2026-10-22): the default frontend build is the authenticated product, containing only implemented live tools. Legacy demo workflows remain source/test fixtures behind explicit local/test VITE_APP_MODE=demo and must never authorize requests or be imported into product assets. Read context/architecture.md and context/production-review.md first for current system design and release evidence; old absence-of-auth/default-demo notes are historical. New work must preserve the product/demo build boundary and rerun check:product plus HTTPS product tests when shared UI/entry/auth changes.

OpenRouter extension (2026-10-22): the user explicitly authorizes free-model text chat at /tools/ai-chat. Read context/openrouter.md and contracts/openrouter.openapi.yaml. Only manually entered text is sent externally; no automatic finance-record attachment, paid models/fallback, tools or saved history. Keys are server-only, relayed only by the trusted proxy or configured in the backend. Missing configuration fails visibly. Public deployment and secret-setting are still operator tasks; fixture transport tests do not prove live inference.
