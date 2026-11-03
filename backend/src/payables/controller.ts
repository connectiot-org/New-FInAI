import { confirmedInvoiceCommand } from "./assistant";
import { ApiError } from "../errors";
import {
  Controller,
  Get,
  Post,
  Patch,
  Inject,
  Req,
  Res,
  Param,
  Query,
  Body,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Identity } from "../config";
import { parse } from "../validation";
import { PayablesService } from "./service";
import {
  id,
  text,
  version,
  createSchema,
  patchSchema,
  policySchema,
  actionSchema,
} from "./domain";
export const uploadQuery = z.strictObject({
  entityId: id,
  operationId: id,
  expectedVersion: z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .transform(Number)
    .pipe(version),
  filename: text.refine(
    (v) => v.toLowerCase().endsWith(".pdf") && !/[\\/]/.test(v),
  ),
});
type R = Request & {
  identity: Identity;
  apSynthetic?: boolean;
  sessionHash?: string;
};
const scope = z.strictObject({ entityId: id }),
  empty = z.strictObject({});
@Controller("api/v1/payables")
export class PayablesController {
  constructor(@Inject(PayablesService) private service: PayablesService) {}
  @Get("capabilities") capabilities(@Req() r: R, @Query() q: unknown) {
    return this.service.capabilities(r.identity, parse(scope, q).entityId);
  }
  @Get("grants") grantList(@Req() r: R, @Query() q: unknown) {
    return this.service.grantList(r.identity, parse(scope, q).entityId);
  }
  @Post("grants") grants(@Req() r: R, @Query() q: unknown, @Body() b: unknown) {
    parse(empty, q);
    return this.service.grants(
      r.identity,
      parse(
        z
          .strictObject({
            entityId: id,
            userId: id,
            view: z.boolean(),
            review: z.boolean(),
            verify: z.boolean(),
            approve: z.boolean(),
            manage: z.boolean(),
          })
          .refine(
            (v) => v.view || !(v.review || v.verify || v.approve || v.manage),
          ),
        b,
      ),
    );
  }
  @Get("suppliers") suppliers(@Req() r: R, @Query() q: unknown) {
    return this.service.suppliers(r.identity, parse(scope, q).entityId);
  }
  @Post("suppliers") supplier(
    @Req() r: R,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.supplier(
      r.identity,
      parse(
        z.strictObject({
          id,
          entityId: id,
          name: text,
          taxId: z.string().trim().max(200),
        }),
        b,
      ),
    );
  }
  @Patch("suppliers/:id") patchSupplier(
    @Req() r: R,
    @Param("id") n: string,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.patchSupplier(
      r.identity,
      parse(id, n),
      parse(
        z.strictObject({
          expectedVersion: version,
          name: text,
          taxId: z.string().trim().max(200),
          active: z.boolean(),
        }),
        b,
      ),
    );
  }
  @Get("invoices") list(@Req() r: R, @Query() q: unknown) {
    return this.service.list(
      r.identity,
      parse(
        z.strictObject({
          entityId: id,
          queue: z
            .enum(["all", "review", "verify", "approve", "export"])
            .default("all"),
          search: z.string().trim().max(200).default(""),
          offset: z.coerce.number().int().min(0).max(10000).default(0),
          limit: z.coerce.number().int().min(1).max(50).default(20),
          status: z
            .enum(["review", "verify", "approve", "approved", "rejected"])
            .optional(),
          dueBefore: z.iso.date().optional(),
          month: z
            .string()
            .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
          assignee: id.optional(),
        }),
        q,
      ),
    );
  }
  @Post("invoices") create(
    @Req() r: R,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.create(r.identity, parse(createSchema, b));
  }
  @Get("invoices/:id") detail(
    @Req() r: R,
    @Param("id") n: string,
    @Query() q: unknown,
  ) {
    parse(empty, q);
    return this.service.detail(r.identity, parse(id, n));
  }
  @Patch("invoices/:id") patch(
    @Req() r: R,
    @Param("id") n: string,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.patch(r.identity, parse(id, n), parse(patchSchema, b));
  }
  @Post("invoices/:id/actions") action(
    @Req() r: R,
    @Param("id") n: string,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.action(
      r.identity,
      parse(id, n),
      parse(actionSchema, b),
    );
  }
  @Post("invoices/:id/assistant-actions") async assistantAction(
    @Req() r: R,
    @Param("id") rawId: string,
    @Query() q: unknown,
    @Body() body: unknown,
  ) {
    if (!r.sessionHash)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "An authenticated session is required for Assistant commands.",
      );
    parse(empty, q);
    const command = parse(confirmedInvoiceCommand, body),
      invoiceId = parse(id, rawId),
      context = { entityId: command.entityId, channel: "assistant" as const };
    if (command.action === "export") {
      const result = await this.service.export(
        r.identity,
        invoiceId,
        {
          operationId: command.operationId,
          expectedVersion: command.expectedVersion,
        },
        context,
      );
      return { kind: "export" as const, id: result.id };
    }
    const result = await this.service.action(
      r.identity,
      invoiceId,
      {
        operationId: command.operationId,
        expectedVersion: command.expectedVersion,
        action: command.action,
        ...(command.reason ? { reason: command.reason } : {}),
      },
      context,
    );
    return { kind: "transition" as const, ...result };
  }
  @Post("invoices/:id/documents") upload(
    @Req() r: R,
    @Param("id") n: string,
    @Query() q: unknown,
    @Body() b: Buffer,
  ) {
    return this.service.upload(
      r.identity,
      parse(id, n),
      parse(uploadQuery, q),
      b,
      !!r.apSynthetic,
    );
  }
  @Post("invoices/:id/documents/:documentId/scan") rescan(
    @Req() r: R,
    @Param("id") n: string,
    @Param("documentId") d: string,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.rescan(
      r.identity,
      parse(id, n),
      parse(id, d),
      parse(z.strictObject({ operationId: id, expectedVersion: version }), b),
    );
  }
  @Get("invoices/:id/documents/:documentId") async document(
    @Req() r: R,
    @Param("id") n: string,
    @Param("documentId") d: string,
    @Query() q: unknown,
    @Res() res: Response,
  ) {
    parse(empty, q);
    const bytes = await this.service.document(
      r.identity,
      parse(id, n),
      parse(id, d),
    );
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${d}.pdf"`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      })
      .send(bytes);
  }
  @Get("approval-policies") policies(@Req() r: R, @Query() q: unknown) {
    return this.service.policies(r.identity, parse(scope, q).entityId);
  }
  @Post("approval-policies") policy(
    @Req() r: R,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.policy(
      r.identity,
      parse(
        z.strictObject({
          operationId: id,
          entityId: id,
          expectedVersion: z.number().int().min(0).max(2147483646),
          publish: z.boolean(),
          definition: policySchema,
        }),
        b,
      ),
    );
  }
  @Post("invoices/:id/exports") export(
    @Req() r: R,
    @Param("id") n: string,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.export(
      r.identity,
      parse(id, n),
      parse(z.strictObject({ operationId: id, expectedVersion: version }), b),
    );
  }
  @Get("exports/:id/file") async file(
    @Req() r: R,
    @Param("id") n: string,
    @Query() q: unknown,
    @Res() res: Response,
  ) {
    parse(empty, q);
    const bytes = await this.service.exportFile(r.identity, parse(id, n));
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-${n}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(bytes);
  }
}
