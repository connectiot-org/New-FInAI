import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
if (existsSync("../backend/.env")) process.loadEnvFile("../backend/.env");
const names = [
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "API_PROXY_TOKEN",
  "FINAI_PROXY_TOKEN",
  "OPENROUTER_API_KEY",
  "Openrouter",
];
const secrets = names
  .map((name) => process.env[name])
  .filter((value): value is string => !!value && value.length >= 12);
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(root, entry.name))
      : [resolve(root, entry.name)],
  );
}
for (const root of [
  "dist",
  "artifacts/session-dist",
  "artifacts/receivables-dist",
  "artifacts/workspace-dist",
  "artifacts/assistant-dist",
]) {
  if (!existsSync(root))
    throw new Error(
      "Build demo, session, receivables, workspace and Assistant assets before scanning.",
    );
  const assets = files(root).filter((path) => /\.(js|css|html)$/.test(path));
  for (const path of assets) {
    const text = readFileSync(path, "utf8");
    if (secrets.some((secret) => text.includes(secret)))
      throw new Error(
        "Credential value found in frontend assets; release blocked.",
      );
    if (
      (root.includes("session-dist") ||
        root.includes("receivables-dist") ||
        root.includes("workspace-dist") ||
        root.includes("assistant-dist")) &&
      text.includes("http://127.0.0.1:3000/api/v1")
    )
      throw new Error(
        "Visitor localhost API URL found in production session assets.",
      );
  }
}
console.log(
  "PASS: demo/session/receivables/workspace/assistant assets contain none of the available backend credential values; production session API uses no localhost fallback",
);
