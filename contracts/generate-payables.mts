import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
const { z } = require("zod");
const {
  createSchema,
  patchSchema,
  policySchema,
  actionSchema,
  fields,
  lineSchema,
} = require("../backend/src/payables/domain.ts");
const {
  confirmedInvoiceCommand,
} = require("../backend/src/payables/assistant.ts");
const response = require("../frontend/src/features/payables/schemas.ts");
const uuid = z.uuid(),
  version = z.number().int().min(1).max(2147483647),
  supplierFields = {
    name: z.string().trim().min(1).max(200),
    taxId: z.string().trim().max(200),
  };
const schemas = Object.fromEntries(
  Object.entries({
    InvoiceFields: fields,
    InvoiceLine: lineSchema,
    CreateInvoice: createSchema,
    PatchInvoice: patchSchema,
    Policy: policySchema,
    Action: actionSchema,
    InvoiceCommand: confirmedInvoiceCommand,
    InvoiceCommandResult: z.union([
      z.strictObject({
        kind: z.literal("transition"),
        id: uuid,
        state: z.enum(["review", "verify", "approve", "approved", "rejected"]),
        version,
      }),
      z.strictObject({ kind: z.literal("export"), id: uuid }),
    ]),
    Grant: response.grant,
    Capabilities: response.capabilitiesSchema,
    InvoiceDetail: response.detailSchema,
    InvoiceList: response.listSchema,
    SupplierList: response.suppliersSchema,
    Saved: response.saved,
    CreateSupplier: z.strictObject({
      id: uuid,
      entityId: uuid,
      ...supplierFields,
    }),
    PatchSupplier: z.strictObject({
      expectedVersion: version,
      ...supplierFields,
      active: z.boolean(),
    }),
    SavePolicy: z.strictObject({
      operationId: uuid,
      entityId: uuid,
      expectedVersion: z.number().int().min(0),
      publish: z.boolean(),
      definition: policySchema,
    }),
    GrantRequest: z.strictObject({
      entityId: uuid,
      userId: uuid,
      ...response.grant.shape,
    }),
    ExportRequest: z.strictObject({
      operationId: uuid,
      expectedVersion: version,
    }),
    ActionResult: z.strictObject({ id: uuid, state: z.string(), version }),
    UploadResult: z.strictObject({
      id: uuid,
      scanState: z.enum(["synthetic", "quarantined", "clean", "infected"]),
    }),
    PolicyResult: z.strictObject({ version }),
    PolicyList: z.strictObject({
      item: z
        .strictObject({
          version,
          draft: policySchema,
          published: policySchema.nullable(),
          publishedVersion: version.nullable(),
        })
        .nullable(),
    }),
    GrantList: z.strictObject({
      items: z.array(
        z.strictObject({
          userId: uuid,
          name: z.string(),
          capabilities: response.grant,
        }),
      ),
    }),
    GrantResult: z.strictObject({ status: z.literal("saved") }),
    Error: z.strictObject({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      fieldErrors: z
        .array(z.strictObject({ field: z.string(), message: z.string() }))
        .optional(),
    }),
  }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: "input" })]),
);
const paths: Record<string, unknown> = {};
const operations: [string, string, string?][] = [
  ["/capabilities", "get"],
  ["/suppliers", "get"],
  ["/suppliers", "post", "CreateSupplier"],
  ["/suppliers/{id}", "patch", "PatchSupplier"],
  ["/invoices", "get"],
  ["/invoices", "post", "CreateInvoice"],
  ["/invoices/{id}", "get"],
  ["/invoices/{id}", "patch", "PatchInvoice"],
  ["/invoices/{id}/actions", "post", "Action"],
  ["/invoices/{id}/assistant-actions", "post", "InvoiceCommand"],
  ["/invoices/{id}/documents", "post"],
  ["/invoices/{id}/documents/{documentId}", "get"],
  ["/invoices/{id}/exports", "post", "ExportRequest"],
  ["/exports/{id}/file", "get"],
  ["/approval-policies", "get"],
  ["/approval-policies", "post", "SavePolicy"],
  ["/grants", "get"],
  ["/grants", "post", "GrantRequest"],
  ["/invoices/{id}/documents/{documentId}/scan", "post", "ExportRequest"],
];
const responseNames: Record<string, string> = {
  "get /capabilities": "Capabilities",
  "get /suppliers": "SupplierList",
  "post /suppliers": "Saved",
  "patch /suppliers/{id}": "Saved",
  "get /invoices": "InvoiceList",
  "post /invoices": "Saved",
  "get /invoices/{id}": "InvoiceDetail",
  "patch /invoices/{id}": "Saved",
  "post /invoices/{id}/actions": "ActionResult",
  "post /invoices/{id}/assistant-actions": "InvoiceCommandResult",
  "post /invoices/{id}/documents": "UploadResult",
  "post /invoices/{id}/exports": "Saved",
  "get /approval-policies": "PolicyList",
  "post /approval-policies": "PolicyResult",
  "get /grants": "GrantList",
  "post /grants": "GrantResult",
  "post /invoices/{id}/documents/{documentId}/scan": "UploadResult",
};
// Optional invoice-date month filter used by reproducible Assistant source links.
for (const [path, method, schema] of operations) {
  const full = "/api/v1/payables" + path;
  paths[full] ||= {};
  (paths[full] as Record<string, unknown>)[method] = {
    summary: method.toUpperCase() + " " + path,
    description:
      "See payables.md for scoped grants, payloads, replay, bounds and transitions. Session, origin and CSRF protections apply.",
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/" + schema },
              },
            },
          },
        }
      : {}),
    parameters: [
      ...(method !== "get"
        ? [
            {
              in: "header",
              name: "X-CSRF-Token",
              required: true,
              schema: { type: "string" },
            },
          ]
        : []),
      ...[...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
        in: "path",
        name: m[1],
        required: true,
        schema: { type: "string", format: "uuid" },
      })),
      ...([
        "/grants",
        "/capabilities",
        "/suppliers",
        "/invoices",
        "/approval-policies",
      ].includes(path) && method === "get"
        ? [
            {
              in: "query",
              name: "entityId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ]
        : []),
    ],
    responses: {
      [method === "post" ? "201" : "200"]: {
        description: "Authorized result, including identical safe replay",
        content: responseNames[method + " " + path]
          ? {
              "application/json": {
                schema: {
                  $ref:
                    "#/components/schemas/" +
                    responseNames[method + " " + path],
                },
              },
            }
          : {
              [path.endsWith("/file") ? "text/csv" : "application/pdf"]: {
                schema: { type: "string", format: "binary" },
              },
            },
      },
      "401": { description: "Expired/missing session" },
      "403": { description: "Forbidden capability or current assignment" },
      "404": { description: "Absent or inaccessible" },
      "409": { description: "Version, duplicate, or transition conflict" },
      "422": { description: "Invalid fields or blocked review" },
    },
  };
}
(paths["/api/v1/payables/invoices"] as any).get.parameters.push({
  in: "query",
  name: "month",
  required: false,
  schema: { type: "string", pattern: "^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$" },
});
const upload = (paths["/api/v1/payables/invoices/{id}/documents"] as any).post;
upload.requestBody = {
  required: true,
  content: {
    "application/pdf": {
      schema: { type: "string", format: "binary", maxLength: 1048576 },
    },
  },
};
upload.parameters.push(
  ...["entityId", "operationId", "expectedVersion", "filename"].map((name) => ({
    in: "query",
    name,
    required: true,
    schema: { type: "string" },
  })),
);
writeFileSync(
  new URL("./payables.openapi.json", import.meta.url),
  JSON.stringify(
    {
      openapi: "3.1.1",
      info: { title: "FinAI supplier invoice approvals", version: "1.1.0" },
      paths,
      security: [{ Session: [] }],
      components: {
        schemas,
        securitySchemes: {
          Session: {
            type: "apiKey",
            in: "cookie",
            name: "__Host-finai_session",
          },
        },
      },
    },
    null,
    2,
  ) + "\n",
);
