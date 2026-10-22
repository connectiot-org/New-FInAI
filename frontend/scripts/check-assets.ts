import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
if (existsSync("../backend/.env")) process.loadEnvFile("../backend/.env");
const names = [
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "API_PROXY_TOKEN",
  "FINAI_PROXY_TOKEN",
  "OPENROUTER_API_KEY",
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
for (const root of ["dist", "artifacts/session-dist"]) {
  if (!existsSync(root))
    throw new Error(
      "Build both product and HTTPS-session assets before scanning.",
    );
  const assets = files(root).filter((path) => /\.(js|css|html)$/.test(path));
  for (const path of assets) {
    const text = readFileSync(path, "utf8");
    if (secrets.some((secret) => text.includes(secret)))
      throw new Error(
        "Credential value found in frontend assets; release blocked.",
      );
    if (text.includes("http://127.0.0.1:3000/api/v1"))
      throw new Error(
        "Visitor localhost API URL found in production session assets.",
      );
    if (
      [
        "finai-demo-v1",
        "Northstar Analytics",
        "Demo workspace",
        "Session-only checklist demo",
        "Checklist demo entity",
      ].some((marker) => text.includes(marker))
    )
      throw new Error("Demo runtime or fixtures found in product assets.");
  }
  if (
    assets.some((path) =>
      /(?:demo-entry|ReferenceHome|ProductPreview)/.test(path),
    )
  )
    throw new Error("Demo entry emitted in product assets.");
}
console.log(
  "PASS: product/session assets exclude demo runtime and fixtures, known backend credentials and localhost API fallbacks",
);
