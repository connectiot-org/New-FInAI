# Frontend integrator

Read root `AGENTS.md`, `context/README.md`, `context/progress.md`, `context/agent-boundaries.md`, and `contracts/README.md` first. Root ownership rules apply; only the coordinator changes shared instructions/contracts. Frontend role owns application code and tests under `frontend/`, not `backend/`.

Use Node 24/npm 11. From this directory: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`. Playwright uses system Chromium if installed and starts Vite automatically. Do not run the formatting command across unrelated files.

Keep existing demo routes, Redux state, local personas, approval workflow, and storage independent. The separate persistent checklist uses `/close/checklist` and a typed adapter validated against the shared contract; it must not replace `/close`, its Approved state, `FinanceSnapshot` progress, or simulated locks. `VITE_` variables are public, never credentials. Failures in live mode must not fall back to fixtures. Verify persistence, explicit month/entity selection, loading/empty/error/conflict states, and unchanged demo workflows when integration is authorized.

`npm run test:checklist` runs the dedicated real API/PostgreSQL browser suite after backend setup/build; keep frontend port 5173 free. `npm test` remains the original 33-test standalone suite. See docs/checklist.md for exact modes and startup. API client and component are scoped under src/features/checklist/.
