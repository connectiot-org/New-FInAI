import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { Identity } from "../config";
import { parse } from "../validation";
import { scope } from "./validation";
import { ReceivablesService } from "./service";
@Controller("api/v1/receivables")
export class ReceivablesController {
  constructor(
    @Inject(ReceivablesService) private service: ReceivablesService,
  ) {}
  @Get("outstanding-customers") summary(
    @Req() req: Request & { identity: Identity },
    @Query() query: unknown,
  ) {
    return this.service.summary(req.identity, parse(scope, query));
  }
}
