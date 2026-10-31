import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { Identity } from "../config";
import { parse } from "../validation";
import { ReceivablesDetailService } from "./detail.service";
import {
  historyInput,
  pageInput,
  exportInput,
  changesInput,
} from "./detail.validation";
type AuthRequest = Request & { identity: Identity };
@Controller("api/v1/receivables")
export class ReceivablesDetailController {
  constructor(
    @Inject(ReceivablesDetailService) private repo: ReceivablesDetailService,
  ) {}
  @Get("changes") changes(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.repo.compare(r.identity, parse(changesInput, q));
  }
  @Get("snapshots") history(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.repo.history(r.identity, parse(historyInput, q));
  }
  @Get("invoices") invoices(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.repo.page(r.identity, parse(pageInput, q), "invoice");
  }
  @Get("customers") customers(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.repo.page(r.identity, parse(pageInput, q), "customer");
  }
  @Get("issue-periods") periods(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.repo.page(r.identity, parse(pageInput, q), "issue-period");
  }
  @Get("export") export(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.repo.page(
      r.identity,
      { ...parse(exportInput, q), offset: 0, limit: 50 },
      "invoice",
      true,
    );
  }
}
