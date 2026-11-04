import type { IncomingMessage } from "node:http";

export class RequestBodyError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// The deadline measures the entire read, rather than inactivity between chunks.
// Hosting-level timeouts do not protect a handler waiting on an unfinished body.
export async function readRequestBody(
  req: IncomingMessage & { body?: unknown },
  maxBytes: number,
  rawUpload = false,
  deadlineMs = rawUpload ? 15000 : 5000,
): Promise<Buffer> {
  const invalid = () =>
    new RequestBodyError(400, "BAD_REQUEST", "Invalid request body.");
  const tooLarge = () =>
    new RequestBodyError(422, "VALIDATION_FAILED", "Request too large.");
  if (req.body !== undefined) {
    if (rawUpload && !Buffer.isBuffer(req.body)) throw invalid();
    let body: Buffer;
    try {
      body = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string" ? req.body : JSON.stringify(req.body),
          );
    } catch {
      throw invalid();
    }
    if (body.length > maxBytes) throw tooLarge();
    return body;
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", data);
      req.off("end", end);
      req.off("error", interrupted);
      req.off("aborted", interrupted);
      req.off("close", closed);
    };
    const discard = () => {
      // Disconnecting after an early rejection must not throw a late stream error.
      req.once("error", () => {});
      req.resume();
    };
    const fail = (error: RequestBodyError) => {
      cleanup();
      discard();
      reject(error);
    };
    const data = (chunk: Buffer) => {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) fail(tooLarge());
      else chunks.push(bytes);
    };
    const end = () => {
      cleanup();
      resolve(Buffer.concat(chunks, size));
    };
    const interrupted = () => fail(invalid());
    const closed = () => {
      if (!req.readableEnded) interrupted();
    };
    const timer = setTimeout(
      () =>
        fail(
          new RequestBodyError(
            408,
            "REQUEST_TIMEOUT",
            "The request upload took too long. Check your connection and try again.",
          ),
        ),
      deadlineMs,
    );
    timer.unref();
    if (req.aborted) return interrupted();
    if (req.readableEnded) return end();
    if (req.destroyed) return interrupted();
    req.on("data", data);
    req.once("end", end);
    req.once("error", interrupted);
    req.once("aborted", interrupted);
    req.once("close", closed);
  });
}
