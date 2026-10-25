import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Inject,
  Req,
  Query,
  Body,
  Param,
  HttpCode,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import type { Identity } from "../config";
import { parse, uuid, month } from "../validation";
import { ApiError } from "../errors";
import { AssistantService } from "./service";
import { create, send, list, page, preference, version } from "./validation";
const empty = z.strictObject({});
type R = Request & { identity: Identity; sessionHash?: string };
@Controller("api/v1/assistant")
export class AssistantController {
  constructor(@Inject(AssistantService) private service: AssistantService) {}
  hash(r: R) {
    if (!r.sessionHash)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "An authenticated session is required for private assistant memory.",
      );
    return r.sessionHash;
  }
  @Get("source") source(@Req() r: R, @Query() q: unknown) {
    const p = parse(
      page.extend({
        entityId: uuid,
        month,
        kind: z.enum(["checklist", "subscriptions"]),
      }),
      q,
    );
    return this.service.operationalSource(
      r.identity,
      p.entityId,
      p.month,
      p.kind,
      p.offset,
      p.limit,
      this.hash(r),
    );
  }
  @Get("capabilities") capabilities(@Req() r: R, @Query() q: unknown) {
    this.hash(r);
    parse(empty, q);
    return this.service.capabilities();
  }
  @Get("conversations") list(@Req() r: R, @Query() q: unknown) {
    const p = parse(list, q);
    return this.service.list(
      r.identity,
      p.entityId,
      p.offset,
      p.limit,
      this.hash(r),
    );
  }
  @Post("conversations") @HttpCode(200) create(
    @Req() r: R,
    @Query() q: unknown,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.create(r.identity, parse(create, b), this.hash(r));
  }
  @Get("conversations/:id") read(
    @Req() r: R,
    @Query() q: unknown,
    @Param("id") id: string,
  ) {
    parse(empty, q);
    return this.service.read(r.identity, parse(uuid, id), this.hash(r));
  }
  @Get("conversations/:id/turns") turns(
    @Req() r: R,
    @Query() q: unknown,
    @Param("id") id: string,
  ) {
    const p = parse(page, q);
    return this.service.read(
      r.identity,
      parse(uuid, id),
      this.hash(r),
      p.offset,
      p.limit,
    );
  }
  @Delete("conversations/:id") remove(
    @Req() r: R,
    @Query() q: unknown,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.remove(
      r.identity,
      parse(uuid, id),
      parse(z.strictObject({ expectedVersion: version }), b).expectedVersion,
      this.hash(r),
    );
  }
  @Post("conversations/:id/turns") @HttpCode(202) send(
    @Req() r: R,
    @Query() q: unknown,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.reserve(
      r.identity,
      parse(uuid, id),
      parse(send, b),
      this.hash(r),
    );
  }
  @Delete("conversations/:id/turns/:turnId") cancel(
    @Req() r: R,
    @Query() q: unknown,
    @Param("id") id: string,
    @Param("turnId") t: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.cancel(
      r.identity,
      parse(uuid, id),
      parse(uuid, t),
      parse(z.strictObject({ expectedVersion: version }), b).expectedVersion,
      this.hash(r),
    );
  }
  @Get("preferences") preferences(@Req() r: R, @Query() q: unknown) {
    const p = parse(z.strictObject({ entityId: uuid }), q);
    return this.service.preferences(r.identity, p.entityId, this.hash(r));
  }
  @Put("preferences/:id") preference(
    @Req() r: R,
    @Query() q: unknown,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    return this.service.preference(
      r.identity,
      parse(uuid, id),
      parse(preference, b),
      this.hash(r),
    );
  }
  @Delete("preferences/:id") forget(
    @Req() r: R,
    @Query() q: unknown,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    parse(empty, q);
    const p = parse(
      z.strictObject({ entityId: uuid, expectedVersion: version }),
      b,
    );
    return this.service.forget(
      r.identity,
      parse(uuid, id),
      p.entityId,
      p.expectedVersion,
      this.hash(r),
    );
  }
}
