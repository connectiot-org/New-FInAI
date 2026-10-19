import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (existsSync(".env")) {
  console.log("Existing .env preserved.");
} else {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `${readFileSync(".env.example", "utf8")}\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://finai:${password}@127.0.0.1:55432/finai?schema=public\n`,
    { mode: 0o600 },
  );
  console.log("Created private local configuration; no values printed.");
}
