import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
export function sendError(error: unknown, req: Request, res: Response) {
  const requestId = res.getHeader("X-Request-Id")?.toString() || randomUUID();
  res.setHeader("X-Request-Id", requestId);
  let e = error instanceof ApiError ? error : undefined;
  if (!e && error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      e = new ApiError(
        409,
        "CREATE_CONFLICT",
        "Task identifier is already in use.",
      );
    else
      e = new ApiError(
        503,
        "UNAVAILABLE",
        "The database is unavailable. Retry shortly.",
      );
  }
  if (
    !e &&
    (error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientUnknownRequestError)
  )
    e = new ApiError(
      503,
      "UNAVAILABLE",
      "The database is unavailable. Retry shortly.",
    );
  if (!e && error instanceof HttpException && error.getStatus() === 404)
    e = new ApiError(404, "NOT_FOUND", "Resource not found.");
  if (
    !e &&
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  )
    e = new ApiError(422, "VALIDATION_FAILED", "JSON body is too large.");
  if (!e && error instanceof SyntaxError)
    e = new ApiError(400, "BAD_REQUEST", "Malformed JSON.");
  e ??= new ApiError(
    500,
    "INTERNAL_ERROR",
    "The request could not be completed.",
  );
  if (e.status === 500)
    console.error(
      JSON.stringify({
        requestId,
        event: "request_failed",
        method: req.method,
      }),
    );
  res.status(e.status).json({
    code: e.code,
    message: e.message,
    requestId,
    ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}),
  });
}
@Catch()
export class ApiFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    sendError(error, http.getRequest(), http.getResponse());
  }
}
