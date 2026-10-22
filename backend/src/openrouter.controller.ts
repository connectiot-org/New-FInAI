import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Identity } from "./config";
import { parse } from "./validation";
import { aiEntity, aiPrompt } from "./openrouter.validation";
import { OpenRouterService } from "./openrouter.service";
type AiRequest = Request & { identity: Identity; openRouterKey?: string };
async function connected<T>(
  response: Response,
  run: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  response.once("close", abort);
  try {
    return await run(controller.signal);
  } finally {
    response.off("close", abort);
  }
}
@Controller("api/v1/ai")
export class OpenRouterController {
  constructor(@Inject(OpenRouterService) private service: OpenRouterService) {}
  @Get("models") models(
    @Req() req: AiRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { entityId } = parse(aiEntity, query);
    return connected(response, (signal) =>
      this.service.models(req.identity, entityId, req.openRouterKey, signal),
    );
  }
  @Post("chat")
  @HttpCode(200)
  chat(
    @Req() req: AiRequest,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    parse(z.strictObject({}), query);
    const input = parse(aiPrompt, body);
    return connected(response, (signal) =>
      this.service.chat(req.identity, input, req.openRouterKey, signal),
    );
  }
}
