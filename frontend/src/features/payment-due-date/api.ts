import { z } from "zod";
import { apiRequest } from "../../lib/api";
import { validCalendarDate } from "../../lib/calendar";
const calendarDate = z.string().refine(validCalendarDate);
export const paymentInputSchema = z.strictObject({
  entityId: z.uuid(),
  invoiceDate: calendarDate,
  termsDays: z.number().int().min(0).max(365),
  asOfDate: calendarDate,
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;
const resultSchema = z.strictObject({
  ...paymentInputSchema.shape,
  dueDate: calendarDate,
  daysUntilDue: z.number().int().min(-3652058).max(3652058),
  status: z.enum(["not_due", "due_today", "overdue"]),
});
export type PaymentResult = z.infer<typeof resultSchema>;
export async function checkPaymentDueDate(
  input: PaymentInput,
  signal: AbortSignal,
) {
  const result = await apiRequest("/payment-due-date-checks", resultSchema, {
    method: "POST",
    body: input,
    signal,
    expectedStatus: 200,
  });
  const day = (date: string) =>
    new Date(`${date}T00:00:00Z`).getTime() / 86400000;
  const days = day(result.dueDate) - day(result.asOfDate);
  if (
    result.entityId !== input.entityId ||
    result.invoiceDate !== input.invoiceDate ||
    result.termsDays !== input.termsDays ||
    result.asOfDate !== input.asOfDate ||
    day(result.dueDate) !== day(input.invoiceDate) + input.termsDays ||
    result.daysUntilDue !== days ||
    result.status !==
      (days > 0 ? "not_due" : days === 0 ? "due_today" : "overdue")
  )
    throw new Error(
      "The calculation response could not be verified. Please calculate again.",
    );
  return result;
}
