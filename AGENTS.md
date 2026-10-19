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
