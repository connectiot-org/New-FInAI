import {
  Controller,
  Post,
  Delete,
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
import { ApiError } from "../errors";
import { ReceivablesImportService } from "./import.service";
type AuthRequest = Request & { identity: Identity; sessionHash?: string };
const empty = z.strictObject({});
@Controller("api/v1/receivables/imports")
export class ReceivablesImportController {
  constructor(
    @Inject(ReceivablesImportService) private service: ReceivablesImportService,
  ) {}
  hash(r: AuthRequest) {
    if (!r.sessionHash)
      throw new ApiError(403, "FORBIDDEN", "Authenticated session required.");
    return r.sessionHash;
  }
  @Post("preview") preview(
    @Req() r: AuthRequest,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    const input = parse(
      z.strictObject({
        entityId: uuid,
        expectedVersion: z
          .string()
          .regex(/^(0|[1-9]\d{0,9})$/)
          .transform(Number)
          .pipe(z.number().int().max(2147483646)),
      }),
      q,
    );
    if (!Buffer.isBuffer(b))
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "A raw JSON file is required.",
      );
    return this.service.preview(
      r.identity,
      this.hash(r),
      input.entityId,
      input.expectedVersion,
      b,
    );
  }
  @Post(":stageId/apply") apply(
    @Req() r: AuthRequest,
    @Query() q: unknown,
    @Param("stageId") id: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.apply(
      r.identity,
      this.hash(r),
      parse(uuid, id),
      parse(
        z.strictObject({
          expectedVersion: z.number().int().min(0).max(2147483646),
          confirmDigest: z.string().regex(/^[a-f0-9]{64}$/),
        }),
        b,
      ),
    );
  }
  @Delete(":stageId") discard(
    @Req() r: AuthRequest,
    @Query() q: unknown,
    @Param("stageId") id: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    parse(empty, b ?? {});
    return this.service.discard(r.identity, this.hash(r), parse(uuid, id));
  }
}
