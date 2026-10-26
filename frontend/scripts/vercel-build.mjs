// Package the real backend as a private Vercel function dependency, never a browser asset.
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  cpSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const backend = resolve(root, "../backend");
const runtime = resolve(root, ".finai-server");
if (!existsSync(resolve(backend, "package-lock.json")))
  throw new Error(
    "Backend source unavailable. Enable Include source files outside Root Directory for this Vercel monorepo.",
  );
const run = (args, cwd, env = process.env) => {
  const result = spawnSync("npm", args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(
      "Vercel build step failed; no deployment artifact confirmed.",
    );
};
run(["ci", "--no-audit", "--no-fund"], backend);
run(["run", "generate"], backend);
run(["run", "build"], backend);
rmSync(runtime, { recursive: true, force: true });
mkdirSync(runtime, { recursive: true });
for (const name of ["package.json", "package-lock.json"])
  cpSync(resolve(backend, name), resolve(runtime, name));
run(
  [
    "ci",
    "--omit=dev",
    "--omit=peer",
    "--omit=optional",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  runtime,
);
cpSync(resolve(backend, "dist/src"), resolve(runtime, "src"), {
  recursive: true,
});
cpSync(
  resolve(backend, "node_modules/.prisma"),
  resolve(runtime, "node_modules/.prisma"),
  { recursive: true },
);
const sizeOf = (path) => {
  const stat = lstatSync(path);
  return stat.isDirectory()
    ? readdirSync(path).reduce(
        (sum, name) => sum + sizeOf(resolve(path, name)),
        0,
      )
    : stat.size;
};
const bytes = sizeOf(runtime);
if (bytes > 220 * 1024 * 1024)
  throw new Error("Private server bundle exceeds its Vercel size budget.");
process.stdout.write(
  `Packaged private backend: ${Math.ceil(bytes / 1024 / 1024)} MiB\n`,
);
run(["run", "typecheck"], root);
run(["run", "build"], root, {
  ...process.env,
  VITE_AUTH_MODE: "session",
  VITE_API_BASE_URL: "/api/v1",
  VITE_CHECKLIST_MODE: "api",
  VITE_RECEIVABLES_MODE: "api",
});
