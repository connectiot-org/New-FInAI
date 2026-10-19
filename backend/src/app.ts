import "reflect-metadata";
import {
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  Body,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { Database } from "./database";
import { ChecklistRepository } from "./checklist.repository";
import { ChecklistService } from "./checklist.service";
import { LOCAL, Identity, readConfig } from "./config";
import { ApiError, ApiFilter, sendError } from "./errors";
import {
  parse,
  uuid,
  createInput,
  listInput,
  updateInput,
  parseVersion,
} from "./validation";
import { z } from "zod";
type AuthRequest = Request & { identity: Identity };
const empty = z.strictObject({});
@Controller("api/v1")
class ChecklistController {
  constructor(@Inject(ChecklistService) private service: ChecklistService) {}
  @Get("entities") entities(@Req() req: AuthRequest, @Query() query: unknown) {
    parse(empty, query);
    return this.service.entities(req.identity);
  }
  @Get("checklist-tasks") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    const input = parse(listInput, query);
    return this.service.list(req.identity, input.entityId, input.month);
  }
  @Post("checklist-tasks") async create(
    @Req() req: AuthRequest,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    parse(empty, query);
    const result = await this.service.create(
      req.identity,
      parse(createInput, body),
    );
    res.status(result.created ? 201 : 200).json(result.task);
  }
  @Patch("checklist-tasks/:id") change(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    parse(empty, query);
    const input = parse(updateInput, body);
    return this.service.change(
      req.identity,
      parse(uuid, id),
      input.expectedVersion,
      input.completed,
    );
  }
  @Delete("checklist-tasks/:id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query() query: unknown,
    @Headers("if-match") version: unknown,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    parse(empty, query);
    parse(empty, body ?? {});
    await this.service.change(
      req.identity,
      parse(uuid, id),
      parseVersion(version),
    );
    res.status(204).end();
  }
}
@Module({
  controllers: [ChecklistController],
  providers: [Database, ChecklistRepository, ChecklistService],
})
class AppModule {}
export async function createApplication(
  options: {
    env?: NodeJS.ProcessEnv;
    identity?: Identity;
    quiet?: boolean;
  } = {},
) {
  const config = readConfig(options.env);
  if (
    options.identity &&
    (options.env?.NODE_ENV || process.env.NODE_ENV) !== "test"
  )
    throw new Error("Identity injection is test-only");
  const identity: Identity = {
    organisationId: options.identity?.organisationId ?? LOCAL.organisationId,
    userId: options.identity?.userId ?? LOCAL.userId,
  };
  const app = await NestFactory.create(AppModule, {
    logger: false,
    bodyParser: false,
  });
  app.enableShutdownHooks();
  const db = app.get(Database);
  app.use((req: AuthRequest, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const started = Date.now();
    if (!options.quiet)
      res.on("finish", () =>
        console.log(
          JSON.stringify({
            requestId,
            method: req.method,
            route: req.route?.path || "unmatched",
            status: res.statusCode,
            ms: Date.now() - started,
          }),
        ),
      );
    try {
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress || "",
        )
      )
        throw new ApiError(403, "FORBIDDEN", "Local requests only.");
      const host = req.headers.host || "";
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))
        throw new ApiError(403, "FORBIDDEN", "Untrusted host.");
      if (
        Object.keys(req.headers).some((k) =>
          /^(forwarded|x-forwarded-|x-(user|role|tenant|organisation|organization|entity|auth))/.test(
            k,
          ),
        )
      )
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Identity and proxy overrides are not allowed.",
        );
      if (req.headers.authorization)
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "Local mode does not accept caller credentials.",
        );
      const origin = req.headers.origin;
      if (origin && !config.origins.includes(origin))
        throw new ApiError(403, "FORBIDDEN", "Untrusted request origin.");
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
      }
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PATCH,DELETE,OPTIONS",
        );
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,If-Match");
        res.status(204).end();
        return;
      }
      if (
        ["POST", "PATCH", "DELETE"].includes(req.method) &&
        !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")
      )
        throw new ApiError(
          422,
          "VALIDATION_FAILED",
          "Mutations require application/json.",
        );
      req.identity = identity;
      next();
    } catch (e) {
      sendError(e, req, res);
    }
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.path === "/health/ready") {
        await db.$queryRaw`SELECT 1 FROM "ChecklistTask" LIMIT 1`;
        const membership = await db.membership.findUnique({
          where: { organisationId_userId: identity },
        });
        if (!membership?.active)
          throw new ApiError(
            503,
            "UNAVAILABLE",
            "Local identity is not initialized.",
          );
        res.json({ status: "ready", mode: "local" });
        return;
      }
      const member = await db.membership.findUnique({
        where: { organisationId_userId: identity },
      });
      if (!member?.active)
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "No active server-owned membership.",
        );
      next();
    } catch (e) {
      sendError(e, req, res);
    }
  });
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) =>
    sendError(err, req, res),
  );
  app.useGlobalFilters(new ApiFilter());
  await app.listen(config.port, config.host);
  return app;
}
