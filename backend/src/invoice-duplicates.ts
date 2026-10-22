import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Injectable,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { Database } from "./database";
import { ChecklistRepository } from "./checklist.repository";
import type { Identity } from "./config";
import { ApiError } from "./errors";
import { parse, uuid } from "./validation";
import { calendarDate } from "./subscription.validation";

export const MAX_CSV_BYTES = 131072;
const MAX_ROWS = 500;
export const invoiceCheckInput = z.strictObject({
  entityId: uuid,
  csv: z
    .string()
    .min(1)
    .max(MAX_CSV_BYTES)
    .refine(
      (value) =>
        value.isWellFormed() &&
        Buffer.byteLength(value, "utf8") <= MAX_CSV_BYTES,
      "Use valid Unicode CSV up to 128 KiB.",
    ),
});
const headers = [
  "supplier_id",
  "supplier_name",
  "invoice_number",
  "invoice_date",
  "amount",
  "currency",
] as const;
const invalid = (message: string) =>
  new ApiError(422, "VALIDATION_FAILED", message);

// Small, deliberately strict comma-separated grammar. Bounds are checked before parsing.
// Quotes may start only at a field boundary and close only before a delimiter or EOF.
function records(csv: string) {
  const result: { number: number; fields: string[] }[] = [];
  let fields: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    number = 1;
  const endField = () => {
    fields.push(field);
    if (fields.length > headers.length)
      throw invalid(`CSV record ${number}: expected six columns.`);
    field = "";
    closed = false;
  };
  const endRecord = () => {
    endField();
    if (!(fields.length === 1 && fields[0] === "")) {
      result.push({ number, fields });
      if (result.length > MAX_ROWS + 1)
        throw invalid("CSV supports at most 500 invoice records.");
    }
    fields = [];
    number++;
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === ",") endField();
    else if (c === "\r" || c === "\n") {
      endRecord();
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else if (closed)
      throw invalid(
        `CSV record ${number}: unexpected text after a closing quote.`,
      );
    else if (c === '"') {
      if (field)
        throw invalid(`CSV record ${number}: quote must start a field.`);
      quoted = true;
    } else field += c;
  }
  if (quoted) throw invalid(`CSV record ${number}: unclosed quoted field.`);
  if (field || fields.length || closed) endRecord();
  return result;
}
export type InvoiceCheckRow = {
  recordNumber: number;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  currency: string;
  group: number | null;
  groupSize: number;
};
export function analyzeInvoiceCsv(raw: string) {
  if (!raw.isWellFormed() || Buffer.byteLength(raw, "utf8") > MAX_CSV_BYTES)
    throw invalid("Use valid Unicode CSV up to 128 KiB.");
  const all = records(raw.replace(/^\uFEFF/, ""));
  const header = all.shift();
  const names = header?.fields.map((v) => v.trim()) || [];
  if (
    header?.number !== 1 ||
    names.length !== headers.length ||
    new Set(names).size !== headers.length ||
    headers.some((v) => !names.includes(v))
  )
    throw invalid(
      "CSV must start with exactly these headers: " + headers.join(",") + ".",
    );
  if (!all.length)
    throw invalid("CSV must contain at least one invoice record.");
  const rows: InvoiceCheckRow[] = all.map(({ number, fields }) => {
    if (fields.length !== headers.length)
      throw invalid(`CSV record ${number}: expected six columns.`);
    const values = Object.fromEntries(
      names.map((name, index) => [name, fields[index]]),
    );
    const value = (name: (typeof headers)[number]) => {
      const rawValue = values[name],
        trimmed = rawValue.trim();
      if (
        !trimmed ||
        Array.from(trimmed).length > 200 ||
        /[\u0000-\u001f\u007f]/.test(rawValue)
      )
        throw invalid(
          `CSV record ${number}, ${name}: use 1–200 characters without control characters.`,
        );
      return trimmed;
    };
    const supplierId = value("supplier_id"),
      supplierName = value("supplier_name"),
      invoiceNumber = value("invoice_number"),
      invoiceDate = value("invoice_date"),
      amount = value("amount"),
      currency = value("currency");
    if (!calendarDate.safeParse(invoiceDate).success)
      throw invalid(
        `CSV record ${number}, invoice_date: use a valid YYYY-MM-DD date.`,
      );
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount))
      throw invalid(
        `CSV record ${number}, amount: use a non-negative decimal, up to 12 integer digits and two fractional digits.`,
      );
    if (!/^[A-Z]{3}$/.test(currency))
      throw invalid(
        `CSV record ${number}, currency: use three uppercase letters.`,
      );
    const [whole, fraction = ""] = amount.split(".");
    return {
      recordNumber: number,
      supplierId,
      supplierName,
      invoiceNumber,
      invoiceDate,
      amount: `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`,
      currency,
      group: null,
      groupSize: 1,
    };
  });
  const groups = new Map<string, InvoiceCheckRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([
      row.supplierId,
      row.invoiceNumber.toUpperCase(),
    ]);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  let groupCount = 0,
    flaggedRowCount = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    groupCount++;
    flaggedRowCount += group.length;
    for (const row of group) {
      row.group = groupCount;
      row.groupSize = group.length;
    }
  }
  return {
    summary: { rowCount: rows.length, groupCount, flaggedRowCount },
    rows,
  };
}

@Injectable()
export class InvoiceDuplicateService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
  ) {}
  async check(identity: Identity, input: z.infer<typeof invoiceCheckInput>) {
    // Read permission is enough: uploaded values and results are never persisted.
    await this.db.$transaction((tx) =>
      this.permissions.authorize(tx, identity, input.entityId),
    );
    return { entityId: input.entityId, ...analyzeInvoiceCsv(input.csv) };
  }
}
@Controller("api/v1/invoice-duplicate-checks")
export class InvoiceDuplicateController {
  constructor(
    @Inject(InvoiceDuplicateService) private service: InvoiceDuplicateService,
  ) {}
  @Post()
  @HttpCode(200)
  check(
    @Req() req: Request & { identity: Identity },
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), query);
    return this.service.check(req.identity, parse(invoiceCheckInput, body));
  }
}
