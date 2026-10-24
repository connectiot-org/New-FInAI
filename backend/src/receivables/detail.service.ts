import { Inject, Injectable } from "@nestjs/common";
import type { Identity } from "../config";
import { ReceivablesDetailRepository } from "./detail.repository";
import type { DetailInput } from "./detail.validation";
@Injectable()
export class ReceivablesDetailService {
  constructor(
    @Inject(ReceivablesDetailRepository)
    private repo: ReceivablesDetailRepository,
  ) {}
  history(
    identity: Identity,
    input: { entityId: string; offset: number; limit: number },
  ) {
    return this.repo.history(identity, input);
  }
  page(
    identity: Identity,
    input: DetailInput,
    view: "invoice" | "customer" | "issue-period",
    exporting = false,
  ) {
    return this.repo.page(identity, input, view, exporting);
  }
}
