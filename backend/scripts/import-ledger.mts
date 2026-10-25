import { parseArgs } from "node:util";
import { open } from "node:fs/promises";
import { Database } from "../dist/src/database.js";
import { ChecklistRepository } from "../dist/src/checklist.repository.js";
import { LedgerService } from "../dist/src/ledger/source.js";
import { uuid, parse } from "../dist/src/validation.js";
const db = new Database();
try {
  const { values: v } = parseArgs({
    options: {
      file: { type: "string" },
      organisation: { type: "string" },
      actor: { type: "string" },
      entity: { type: "string" },
      "expected-version": { type: "string" },
      apply: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!v.file || !/^(0|[1-9]\d*)$/.test(v["expected-version"] || ""))
    throw new Error();
  const f = await open(v.file, "r");
  let bytes: Buffer;
  try {
    if (!(await f.stat()).isFile()) throw new Error();
    const b = Buffer.alloc(5 * 1024 * 1024 + 1);
    let size = 0;
    while (size < b.length) {
      const r = await f.read(b, size, b.length - size, null);
      if (!r.bytesRead) break;
      size += r.bytesRead;
    }
    if (size > b.length - 1) throw new Error();
    bytes = b.subarray(0, size);
  } finally {
    await f.close();
  }
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (raw.charCodeAt(0) === 0xfeff) throw new Error();
  console.log(
    JSON.stringify(
      await new LedgerService(db, new ChecklistRepository(db)).import(
        {
          organisationId: parse(uuid, v.organisation),
          userId: parse(uuid, v.actor),
        },
        parse(uuid, v.entity),
        Number(v["expected-version"]),
        JSON.parse(raw),
        v.apply,
      ),
    ),
  );
} catch {
  console.error(
    "Ledger import failed. Check normalized source, scoped import permission and expected version; no success confirmed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
