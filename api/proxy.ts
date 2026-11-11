// Vercel Node entrypoint for Vercel projects whose Root Directory is the
// repository root. Zero-config function discovery only scans an `api`
// directory at the build root, so the repository-root layout needs this
// committed entry; it re-exports the frontend deployment entry unchanged so
// the bundled function keeps every project-relative runtime path
// (`frontend/api`, `frontend/server`, `frontend/node_modules` traced
// dependencies and the private `frontend/.finai-server` package included by
// vercel.json) exactly as the frontend-root layout builds them.
export { config, default } from "../frontend/api/proxy.js";
