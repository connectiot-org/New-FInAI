import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import type { Identity } from "./config";
import { parse } from "./validation";
import { paymentDueDateInput } from "./payment-due-date";
import { PaymentDueDateService } from "./payment-due-date.service";
@Controller("api/v1/payment-due-date-checks")
export class PaymentDueDateController {
  constructor(
    @Inject(PaymentDueDateService) private service: PaymentDueDateService,
  ) {}
  @Post()
  @HttpCode(200)
  calculate(
    @Req() req: Request & { identity: Identity },
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), query);
    return this.service.calculate(
      req.identity,
      parse(paymentDueDateInput, body),
    );
  }
}
