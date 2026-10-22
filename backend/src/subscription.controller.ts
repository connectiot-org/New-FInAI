import {
  Controller,
  Get,
  Post,
  Patch,
  Inject,
  Req,
  Query,
  Body,
  Param,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Identity } from "./config";
import { parse, uuid } from "./validation";
import {
  subscriptionCreate,
  subscriptionList,
  subscriptionUpdate,
  subscriptionArchive,
} from "./subscription.validation";
import { SubscriptionService } from "./subscription.service";
type AuthRequest = Request & { identity: Identity };
const empty = z.strictObject({});
@Controller("api/v1/subscription-renewals")
export class SubscriptionController {
  constructor(
    @Inject(SubscriptionService) private service: SubscriptionService,
  ) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.list(req.identity, parse(subscriptionList, query));
  }
  @Post() async create(
    @Req() req: AuthRequest,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    parse(empty, query);
    const result = await this.service.create(
      req.identity,
      parse(subscriptionCreate, body),
    );
    res.status(result.created ? 201 : 200).json(result.record);
  }
  @Patch(":id") update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    parse(empty, query);
    return this.service.change(
      req.identity,
      parse(uuid, id),
      parse(subscriptionUpdate, body),
    );
  }
  @Patch(":id/archive") archive(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    parse(empty, query);
    return this.service.change(
      req.identity,
      parse(uuid, id),
      parse(subscriptionArchive, body),
    );
  }
}
