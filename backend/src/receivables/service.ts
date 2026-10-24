import { Inject, Injectable } from "@nestjs/common";
import type { Identity } from "../config";
import { ReceivablesRepository } from "./repository";
import type { Scope } from "./validation";
@Injectable()
export class ReceivablesService {
  constructor(
    @Inject(ReceivablesRepository) private repo: ReceivablesRepository,
  ) {}
  summary(identity: Identity, scope: Scope) {
    return this.repo.summary(identity, scope);
  }
}
