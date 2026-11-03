import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
const Ajv = require("ajv/dist/2020").default,
  addFormats = require("ajv-formats").default;
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const spec = JSON.parse(
  readFileSync(new URL("./payables.openapi.json", import.meta.url)),
);
const example = JSON.parse(
  readFileSync(new URL("./payables-examples/bill.json", import.meta.url)),
);
const validate = ajv.compile(spec.components.schemas.CreateInvoice);
assert.ok(validate(example), JSON.stringify(validate.errors));
for (const invalid of [
  { ...example, currency: "USD" },
  { ...example, approved: true },
  { ...example, declaredGross: "120.00" },
  { ...example, lines: [] },
])
  assert.equal(validate(invalid), false);
for (const schema of Object.values(spec.components.schemas))
  ajv.compile(schema);
console.log(
  "Payables payload schemas compile; 1 valid and 4 invalid examples verified. Domain refinements require application tests.",
);
