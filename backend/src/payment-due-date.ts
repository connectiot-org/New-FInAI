import { z } from "zod";
import { calendarDate } from "./subscription.validation";
import { uuid } from "./validation";
import { ApiError } from "./errors";
export const paymentDueDateInput = z.strictObject({
  entityId: uuid,
  invoiceDate: calendarDate,
  termsDays: z.number().int().min(0).max(365),
  asOfDate: calendarDate,
});
export type PaymentDueDateInput = z.infer<typeof paymentDueDateInput>;
const calendarDay = (value: string) =>
  new Date(`${value}T00:00:00Z`).getTime() / 86400000;
/** Input dates have been validated. UTC midnights represent calendar days,
 * not local instants; string parsing preserves years 0001–0099. No clock is read. */
export function calculatePaymentDueDate(input: PaymentDueDateInput) {
  const dueDay = calendarDay(input.invoiceDate) + input.termsDays;
  const due = new Date(dueDay * 86400000);
  if (due.getUTCFullYear() > 9999)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "The calculated due date is beyond the supported year 9999.",
      [
        {
          field: "invoiceDate",
          message: "Choose an earlier invoice date or shorter payment terms.",
        },
      ],
    );
  const daysUntilDue = dueDay - calendarDay(input.asOfDate);
  return {
    entityId: input.entityId,
    invoiceDate: input.invoiceDate,
    termsDays: input.termsDays,
    asOfDate: input.asOfDate,
    dueDate: due.toISOString().slice(0, 10),
    daysUntilDue,
    status:
      daysUntilDue > 0
        ? ("not_due" as const)
        : daysUntilDue === 0
          ? ("due_today" as const)
          : ("overdue" as const),
  };
}
