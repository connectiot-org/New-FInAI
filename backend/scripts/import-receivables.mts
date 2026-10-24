import { parseArgs } from "node:util";
import { open } from "node:fs/promises";
import { Database } from "../dist/src/database.js";
import { ChecklistRepository } from "../dist/src/checklist.repository.js";
import { ReceivablesRepository } from "../dist/src/receivables/repository.js";
import {
  MAX_BYTES,
  parseRegister,
} from "../dist/src/receivables/validation.js";
import { parse, uuid } from "../dist/src/validation.js";
const db = new Database();
try {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      organisation: { type: "string" },
      entity: { type: "string" },
      actor: { type: "string" },
      "expected-version": { type: "string" },
      apply: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.file || !/^(0|[1-9]\d*)$/.test(values["expected-version"] || ""))
    throw new Error();
  const organisationId = parse(uuid, values.organisation),
    userId = parse(uuid, values.actor),
    entityId = parse(uuid, values.entity);
  const file = await open(values.file, "r");
  let bytes: Buffer;
  try {
    if (!(await file.stat()).isFile()) throw new Error();
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        null,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    bytes = buffer.subarray(0, size);
  } finally {
    await file.close();
  }
  const repo = new ReceivablesRepository(db, new ChecklistRepository(db));
  console.log(
    JSON.stringify(
      await repo.import(
        { organisationId, userId },
        entityId,
        Number(values["expected-version"]),
        parseRegister(bytes),
        values.apply,
      ),
    ),
  );
} catch {
  console.error(
    "Import failed. Check input, permissions, database/schema and expected version; no success confirmed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
