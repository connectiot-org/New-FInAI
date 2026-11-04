import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { checkRepository } from "./check-repository.mjs";

function fixture(t, sources = {}, extraRows = "") {
  const root = mkdtempSync(join(tmpdir(), "finai-layout-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = ["docs/repository-guide.md", ...Object.keys(sources)];
  for (const [file, text] of Object.entries(sources)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "docs/repository-guide.md"),
    "| File | Purpose |\n| --- | --- |\n" +
      files.map((f) => `| \`${f}\` | Explanation |`).join("\n") +
      "\n" +
      extraRows,
  );
  return { root, files };
}

test("catalog accepts each file once, Markdown links and browser/domain imports", (t) => {
  const { root, files } = fixture(t, {
    "frontend/src/features/new-product/View.tsx":
      'import {z} from "zod"; import "../../lib/api"; export {thing} from "./types";',
    "frontend/src/lib/api.ts":
      'export const call = () => fetch("/api/v1/new-product");',
    "backend/src/new-product/service.ts":
      'import {randomUUID} from "node:crypto"; import {Database} from "../database";',
    "backend/.env.example": "# Deliberately safe settings template\n",
  });
  const guide = join(root, "docs/repository-guide.md");
  writeFileSync(
    guide,
    "| File | Purpose |\n| --- | --- |\n" +
      files.map((f) => `| [${f}](../${f}) | Explanation |`).join("\n"),
  );
  const result = checkRepository(root, files);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sources, 3);
});

test("catalog rejects an undocumented new file, duplicate and stale purpose", (t) => {
  const { root, files } = fixture(
    t,
    {},
    "| `docs/repository-guide.md` | Duplicate |\n| `removed.ts` | Stale |\n",
  );
  const { errors } = checkRepository(root, [...files, "frontend/src/new.ts"]);
  assert.ok(errors.includes("Missing file purpose: frontend/src/new.ts"));
  assert.ok(
    errors.includes("Duplicate file purpose: docs/repository-guide.md"),
  );
  assert.ok(errors.includes("Stale file purpose: removed.ts"));
});

test("private environment values and generated build/cache folders cannot become tracked source", (t) => {
  const sources = Object.fromEntries(
    [
      "frontend/.env.production",
      "backend/.env",
      "frontend/dist/app.js",
      "frontend/.finai-server/app.js",
      "backend/node_modules/pkg/index.js",
      "frontend/tsconfig.tsbuildinfo",
    ].map((file) => [file, "synthetic"]),
  );
  const { root, files } = fixture(t, sources);
  assert.equal(
    checkRepository(root, files).errors.length,
    Object.keys(sources).length,
  );
});

for (const statement of [
  'import {readFile} from "node:fs";',
  'export {readFile} from "fs/promises";',
  'const db = import("@prisma/client");',
  'const server = require("express");',
  'import type {IncomingMessage} from "node:http";',
  'type Database = import("@prisma/client").PrismaClient;',
  'import server = require("@nestjs/core");',
])
  test(`browser rejects server coupling: ${statement}`, (t) => {
    const { root, files } = fixture(t, {
      "frontend/src/feature.ts": statement,
    });
    assert.match(
      checkRepository(root, files).errors.join("\n"),
      /Server dependency in browser source/,
    );
  });

for (const [file, statement] of [
  [
    "frontend/src/feature.ts",
    'export {handler} from "../server/handler.js?raw";',
  ],
  [
    "frontend/src/feature.ts",
    'const handler = import("../../backend/src/app");',
  ],
  ["frontend/src/feature.ts", 'import handler from "/server/handler";'],
  [
    "backend/src/new-product/service.ts",
    'import {sample} from "../../../frontend/src/demo/seed";',
  ],
])
  test(`application cannot import across its runtime source boundary: ${statement}`, (t) => {
    const { root, files } = fixture(t, { [file]: statement });
    assert.match(
      checkRepository(root, files).errors.join("\n"),
      /Source import leaves/,
    );
  });

test("computed imports require review rather than bypassing static checks", (t) => {
  const { root, files } = fixture(t, {
    "frontend/src/feature.ts": "const feature = import(chosenPath);",
  });
  assert.match(
    checkRepository(root, files).errors.join("\n"),
    /Computed import requires/,
  );
});

test("comments and strings mentioning server code are not imports", (t) => {
  const { root, files } = fixture(t, {
    "frontend/src/feature.ts":
      '// import db from "@prisma/client";\nconst note = \'require("node:fs")\';',
  });
  assert.deepEqual(checkRepository(root, files).errors, []);
});

test("a catalog entry must explain its file rather than have an empty purpose", (t) => {
  const { root, files } = fixture(t);
  writeFileSync(
    join(root, "docs/repository-guide.md"),
    "| File | Purpose |\n| --- | --- |\n| `docs/repository-guide.md` | |\n",
  );
  assert.deepEqual(checkRepository(root, files).errors, [
    "Empty file purpose: docs/repository-guide.md",
  ]);
});

test("absolute backend imports cannot masquerade as Vite browser-root imports", (t) => {
  const { root, files } = fixture(t, {
    "backend/src/service.ts": 'import service from "/src/other";',
  });
  assert.match(
    checkRepository(root, files).errors.join("\n"),
    /Absolute backend source import/,
  );
});
