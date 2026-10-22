import { Inject, Injectable } from "@nestjs/common";
import type { Identity } from "./config";
import { ChecklistRepository } from "./checklist.repository";
import {
  calculatePaymentDueDate,
  type PaymentDueDateInput,
} from "./payment-due-date";
@Injectable()
export class PaymentDueDateService {
  constructor(
    @Inject(ChecklistRepository) private permissions: ChecklistRepository,
  ) {}
  async calculate(identity: Identity, input: PaymentDueDateInput) {
    // This POST calculates only; canWrite is deliberately not required.
    await this.permissions.requireEntityRead(identity, input.entityId);
    return calculatePaymentDueDate(input);
  }
}
