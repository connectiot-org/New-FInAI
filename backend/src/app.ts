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
  copyInput,
  listInput,
  updateInput,
  parseVersion,
} from "./validation";
import { z } from "zod";
import { Auth, digest, equal } from "./auth";
import { SubscriptionRepository } from "./subscription.repository";
import { SubscriptionController } from "./subscription.controller";
import {
  SubscriptionService,
  organisationTimezones,
} from "./subscription.service";
import { ReceivablesController } from "./receivables/controller";
import { ReceivablesService } from "./receivables/service";
import { ReceivablesRepository } from "./receivables/repository";
import { ReceivablesDetailController } from "./receivables/detail.controller";
import { ReceivablesDetailService } from "./receivables/detail.service";
import { ReceivablesDetailRepository } from "./receivables/detail.repository";
import { WorkspaceController } from "./workspace/controller";
import { WorkspaceService } from "./workspace/service";
import { ReceivablesImportController } from "./receivables/import.controller";
import {
  ReceivablesImportService,
  BROWSER_IMPORT_BYTES,
} from "./receivables/import.service";
import { requireImport } from "./workspace/permissions";
import { requestAuditContext } from "./audit";
type AuthRequest = Request & { identity: Identity; sessionHash?: string };
const isPreview = (req: Request) =>
  req.method === "POST" && req.path === "/api/v1/receivables/imports/preview";
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
  @Post("checklist-tasks/copy-previous-month") async copyPreviousMonth(
    @Req() req: AuthRequest,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    parse(empty, query);
    const input = parse(copyInput, body);
    const result = await this.service.copyPreviousMonth(
      req.identity,
      input.entityId,
      input.month,
    );
    res.status(result.copiedCount ? 201 : 200).json(result);
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
  controllers: [
    WorkspaceController,
    ReceivablesImportController,
    ChecklistController,
    SubscriptionController,
    ReceivablesController,
    ReceivablesDetailController,
  ],
  providers: [
    WorkspaceService,
    ReceivablesImportService,
    Database,
    ChecklistRepository,
    ChecklistService,
    SubscriptionService,
    SubscriptionRepository,
    ReceivablesService,
    ReceivablesRepository,
    ReceivablesDetailService,
    ReceivablesDetailRepository,
  ],
})
class AppModule {}
export async function createApplication(
  options: {
    env?: NodeJS.ProcessEnv;
    identity?: Identity;
    quiet?: boolean;
  } = {},
) {
  const timezones = organisationTimezones(
    (options.env || process.env).ORGANISATION_TIMEZONES,
  );
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
  app.get(SubscriptionService).timezones = timezones;
  const db = app.get(Database);
  const auth = new Auth(db);
  const server = app.getHttpServer();
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  app.use((_req: Request, _res: Response, next: NextFunction) =>
    requestAuditContext.run({ requestId: randomUUID() }, next),
  );
  app.use((req: AuthRequest, res: Response, next: NextFunction) => {
    const requestId = requestAuditContext.getStore()!.requestId;
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
      if (config.mode === "session") {
        if (
          !equal(
            req.headers["x-finai-proxy-token"]?.toString() || "",
            config.proxyToken,
          ) ||
          req.headers.host !== config.trustedHost ||
          req.headers["x-finai-public-host"] !== config.publicHost ||
          req.headers["x-forwarded-proto"] !== "https"
        )
          throw new ApiError(403, "FORBIDDEN", "Untrusted proxy or host.");
        if (
          req.headers.authorization ||
          Object.keys(req.headers).some((k) =>
            /^(x-(user|role|tenant|organisation|organization|entity|auth)|forwarded$)/.test(
              k,
            ),
          )
        )
          throw new ApiError(403, "FORBIDDEN", "Identity overrides forbidden.");
        if (req.headers.origin && req.headers.origin !== config.origins[0])
          throw new ApiError(403, "FORBIDDEN", "Untrusted request origin.");
        if (
          !["GET", "HEAD"].includes(req.method) &&
          (req.headers.origin !== config.origins[0] ||
            !(
              isPreview(req)
                ? /^application\/octet-stream$/i
                : /^application\/json(?:\s*;|$)/i
            ).test(req.headers["content-type"] || ""))
        )
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Exact origin and JSON required.",
          );
        next();
        return;
      }
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
  app.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isPreview(req)) return next();
    try {
      if (config.mode !== "session" || req.headers["content-encoding"])
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Uncompressed authenticated uploads required.",
        );
      const session = await auth.session(req);
      auth.csrf(req, session);
      await auth.limit(
        `import:${session.organisationId}:${session.userId}`,
        5,
        900,
      );
      const entityId = parse(uuid, req.query.entityId);
      await db.$transaction((tx) =>
        requireImport(
          tx,
          { organisationId: session.organisationId, userId: session.userId },
          entityId,
        ),
      );
      express.raw({
        type: "application/octet-stream",
        limit: BROWSER_IMPORT_BYTES,
        inflate: false,
      })(req, res, next);
    } catch (e) {
      sendError(e, req, res);
    }
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.path === "/health/live" && req.method === "GET") {
        res.json({ status: "alive" });
        return;
      }
      if (config.mode === "session") {
        if (req.path === "/health/ready" && req.method === "GET") {
          await db.$queryRaw`SELECT 1 FROM "ChecklistTask" LIMIT 1`;
          await db.$queryRaw`SELECT 1 FROM "SubscriptionRenewal" LIMIT 1`;
          await db.$queryRaw`SELECT id, organisation_id, entity_id, version, source_name, source_captured_at, imported_at, importing_actor_id, digest, row_count FROM "ReceivableSnapshot" LIMIT 1`;
          await db.$queryRaw`SELECT organisation_id, entity_id, snapshot_id, invoice_id, customer_id, customer_name, status, amount_cents, paid_cents, issued_on FROM "ReceivableSnapshotInvoice" LIMIT 1`;
          await db.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
          await db.$queryRaw`SELECT 1 FROM "Account" LIMIT 1`;
          await db.$queryRaw`SELECT 1 FROM "RateLimit" LIMIT 1`;
          await db.$queryRaw`SELECT is_administrator, version FROM "Membership" LIMIT 1`;
          await db.$queryRaw`SELECT can_import, version FROM "EntityAccess" LIMIT 1`;
          await db.$queryRaw`SELECT 1 FROM "ServerAudit" LIMIT 1`;
          await db.$queryRaw`SELECT 1 FROM "ReceivableImportStage" LIMIT 1`;
          res.json({ status: "ready", mode: "session" });
          return;
        }
        if (req.path === "/auth/login" && req.method === "POST") {
          await auth.login(req, res);
          return;
        }
        const session = await auth.session(req);
        if (!["GET", "HEAD"].includes(req.method)) {
          auth.csrf(req, session);
          await auth.limit(`mutation:${session.userId}`, 120, 60);
        }
        if (req.path === "/auth/session" && req.method === "GET") {
          res.json({ csrfToken: digest(`csrf:${auth.token(req)}`) });
          return;
        }
        if (req.path === "/auth/logout" && req.method === "POST") {
          await auth.logout(req, res);
          return;
        }
        req.sessionHash = digest(auth.token(req));
        req.identity = {
          organisationId: session.organisationId,
          userId: session.userId,
        };
        next();
        return;
      }
      if (req.path === "/health/ready") {
        await db.$queryRaw`SELECT 1 FROM "ChecklistTask" LIMIT 1`;
        await db.$queryRaw`SELECT 1 FROM "SubscriptionRenewal" LIMIT 1`;
        await db.$queryRaw`SELECT id, organisation_id, entity_id, version, source_name, source_captured_at, imported_at, importing_actor_id, digest, row_count FROM "ReceivableSnapshot" LIMIT 1`;
        await db.$queryRaw`SELECT organisation_id, entity_id, snapshot_id, invoice_id, customer_id, customer_name, status, amount_cents, paid_cents, issued_on FROM "ReceivableSnapshotInvoice" LIMIT 1`;
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
