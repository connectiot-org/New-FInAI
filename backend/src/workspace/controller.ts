import {
  Controller,
  Get,
  Post,
  Patch,
  Inject,
  Req,
  Query,
  Body,
  Param,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import type { Identity } from "../config";
import { parse, uuid } from "../validation";
import { WorkspaceService } from "./service";
const empty = z.strictObject({}),
  version = z.number().int().min(1).max(2147483647),
  integer = z
    .string()
    .regex(/^\d{1,5}$/)
    .transform(Number);
const page = z.strictObject({
  offset: integer.pipe(z.number().max(10000)).default(0),
  limit: integer.pipe(z.number().min(1).max(50)).default(20),
});
type AuthRequest = Request & { identity: Identity };
@Controller("api/v1")
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private service: WorkspaceService) {}
  @Get("workspace/context") context(
    @Req() r: AuthRequest,
    @Query() q: unknown,
  ) {
    parse(empty, q);
    return this.service.context(r.identity);
  }
  @Get("admin/members") members(@Req() r: AuthRequest, @Query() q: unknown) {
    const p = parse(page, q);
    return this.service.list(r.identity, "members", p.offset, p.limit);
  }
  @Get("admin/entities") entities(@Req() r: AuthRequest, @Query() q: unknown) {
    const p = parse(page, q);
    return this.service.list(r.identity, "entities", p.offset, p.limit);
  }
  @Get("admin/audit") audit(@Req() r: AuthRequest, @Query() q: unknown) {
    const p = parse(page, q);
    return this.service.list(r.identity, "audit", p.offset, p.limit);
  }
  @Patch("admin/members/:userId") member(
    @Req() r: AuthRequest,
    @Query() q: unknown,
    @Param("userId") id: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.member(
      r.identity,
      parse(uuid, id),
      parse(
        z.strictObject({
          active: z.boolean(),
          administrator: z.boolean(),
          expectedVersion: version,
        }),
        b,
      ),
    );
  }
  @Post("admin/entities") entity(
    @Req() r: AuthRequest,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    const v = parse(
      z.strictObject({
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .refine((v) => v.isWellFormed() && !/[\u0000-\u001f\u007f]/.test(v)),
      }),
      b,
    );
    return this.service.entity(r.identity, v.name);
  }
  @Post("admin/access") access(
    @Req() r: AuthRequest,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.access(
      r.identity,
      parse(
        z
          .strictObject({
            userId: uuid,
            entityId: uuid,
            access: z.boolean(),
            canWrite: z.boolean(),
            canImport: z.boolean(),
            expectedVersion: z.number().int().min(1).max(2147483647),
          })
          .refine(
            (v) => v.access || (!v.canWrite && !v.canImport),
            "Revoked access cannot carry grants.",
          ),
        b,
      ),
    );
  }
}
