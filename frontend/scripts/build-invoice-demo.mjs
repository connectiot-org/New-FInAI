import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const frontend = resolve(import.meta.dirname, ".."),
  output = resolve(frontend, "artifacts/invoice-demo");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    resolve(frontend, "node_modules/vite/bin/vite.js"),
    "build",
    "--outDir",
    "artifacts/invoice-demo/dist",
  ],
  {
    cwd: frontend,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_AUTH_MODE: "demo",
      VITE_API_BASE_URL: "/api/v1",
      VITE_CHECKLIST_MODE: "demo",
      VITE_RECEIVABLES_MODE: "demo",
    },
  },
);
if (result.status !== 0)
  throw new Error("Standalone invoice demo build failed.");
cpSync(
  resolve(import.meta.dirname, "serve-invoice-demo.mjs"),
  resolve(output, "serve.mjs"),
);
writeFileSync(
  resolve(output, "README.md"),
  `# FinAI supplier invoice demo\n\nRequires Node 24 and a current browser. No npm install, account, database, API key or backend is needed to run this built demo.\n\n1. Unzip this folder.\n2. Run: node serve.mjs\n3. Open: http://127.0.0.1:4173/demo/invoices\n\nTry Review as Reviewer, Verify as Verifier, Approve as First/Second approver, and Accounting export as Reviewer. Six samples include every workflow stage and a total mismatch. You can add suppliers, create invoices, attach sample PDFs, edit coding, publish policies, challenge/reject and download balanced CSV. Changes and files stay in this browser; Reset preview restores the samples. No real payments, OCR, accounting posting or malware scanning occurs. Use sample documents only.\n\nStatic hosting: publish the contents of dist with a fallback to index.html for browser routes. Never upload the repository .env, backend or .finai-server directories. The existing Vercel project still needs the reviewed code merged and deployed before its URL includes this demo.\n`,
);
writeFileSync(
  resolve(output, "build.json"),
  JSON.stringify(
    {
      mode: "standalone-invoice-demo",
      entry: "/demo/invoices",
      requiresDatabase: false,
      requiresSignIn: false,
      builtAt: new Date().toISOString(),
      indexSha256: createHash("sha256")
        .update(readFileSync(resolve(output, "dist/index.html")))
        .digest("hex"),
    },
    null,
    2,
  ),
);
process.stdout.write(
  "Standalone demo ready at frontend/artifacts/invoice-demo. Run node serve.mjs inside that folder.\n",
);
