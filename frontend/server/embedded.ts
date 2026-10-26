import { IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";

type Request = IncomingMessage & { body?: unknown };
type App = {
  getHttpAdapter(): {
    getInstance(): (req: IncomingMessage, res: ServerResponse) => void;
  };
  close(): Promise<void>;
};
type AppOptions = {
  env: NodeJS.ProcessEnv;
  listen: false;
  retainAssistantWork: (work: Promise<unknown>) => void;
};
export type ApplicationModule = {
  createApplication(options: AppOptions): Promise<App>;
};

export function createEmbeddedHandler(options: {
  env?: NodeJS.ProcessEnv;
  loadApplication: () => ApplicationModule;
  retainWork: (work: Promise<unknown>) => void;
}) {
  const env = options.env || process.env;
  const proof = randomBytes(32).toString("hex");
  let application: Promise<App> | undefined;
  const handler = async (req: Request, res: ServerResponse) => {
    const fail = (status: number, code: string, message: string) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ code, message, requestId: randomUUID() }));
    };
    const domain =
      env.VERCEL_ENV === "preview"
        ? env.VERCEL_URL
        : env.VERCEL_PROJECT_PRODUCTION_URL;
    const origin =
      env.FINAI_PUBLIC_ORIGIN ||
      env.PUBLIC_ORIGIN ||
      (domain ? `https://${domain}` : "");
    if (!env.DATABASE_URL || !origin) {
      return fail(
        503,
        "DEPLOYMENT_NOT_CONFIGURED",
        !env.DATABASE_URL
          ? "The server database is not connected. Configure DATABASE_URL in Vercel and apply the database migrations. An OpenRouter key alone does not configure the workspace."
          : "The server public address is not configured. Set FINAI_PUBLIC_ORIGIN to this deployment's exact HTTPS origin.",
      );
    }
    let publicURL: URL;
    try {
      publicURL = new URL(origin);
      if (
        publicURL.protocol !== "https:" ||
        publicURL.origin !== origin ||
        publicURL.username ||
        publicURL.password
      )
        throw new Error();
    } catch {
      return fail(
        503,
        "DEPLOYMENT_NOT_CONFIGURED",
        "The configured server HTTPS origin is invalid.",
      );
    }
    if (req.headers.host !== publicURL.host)
      return fail(403, "FORBIDDEN", "Untrusted host.");
    const incoming = new URL(req.url || "/", origin);
    const route = incoming.searchParams.get("route") || "";
    if (
      !/^(api\/v1(?:\/[a-zA-Z0-9-]+)*|auth\/(login|logout|session))$/.test(
        route,
      )
    )
      return fail(404, "NOT_FOUND", "API route not found.");
    incoming.searchParams.delete("route");
    const upload =
      route === "api/v1/receivables/imports/preview" && req.method === "POST";
    const maxBytes = upload ? 1024 * 1024 : 16384;
    if (
      req.headers["content-encoding"] ||
      (upload && req.headers["content-type"] !== "application/octet-stream")
    )
      return fail(400, "BAD_REQUEST", "Uncompressed request bytes required.");
    let body: Buffer;
    try {
      if (upload && req.body !== undefined && !Buffer.isBuffer(req.body))
        throw new Error();
      if (Buffer.isBuffer(req.body)) body = req.body;
      else if (req.body !== undefined)
        body = Buffer.from(
          typeof req.body === "string" ? req.body : JSON.stringify(req.body),
        );
      else {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          const b = Buffer.from(chunk);
          bytes += b.length;
          if (bytes > maxBytes)
            return fail(422, "VALIDATION_FAILED", "Request too large.");
          chunks.push(b);
        }
        body = Buffer.concat(chunks);
      }
      if (body.length > maxBytes)
        return fail(422, "VALIDATION_FAILED", "Request too large.");
    } catch {
      return fail(400, "BAD_REQUEST", "Invalid request body.");
    }
    try {
      if (!application) {
        application = options.loadApplication().createApplication({
          listen: false,
          env: {
            ...env,
            NODE_ENV: env.NODE_ENV === "test" ? "test" : "production",
            CHECKLIST_IDENTITY: "session",
            PUBLIC_ORIGIN: origin,
            API_TRUSTED_HOST: publicURL.host,
            API_PROXY_TOKEN: proof,
          },
          retainAssistantWork: options.retainWork,
        });
        void application.catch(() => {
          application = undefined;
        });
      }
      const app = await application;
      const forwarded = new IncomingMessage(req.socket);
      // Bytes are already fully bounded/read; mark the cloned HTTP message complete
      // so its stream cleanup cannot abort the real Vercel response socket.
      forwarded.complete = true;
      forwarded.method = req.method;
      forwarded.url = "/" + route + (incoming.search ? incoming.search : "");
      forwarded.headers = {
        host: publicURL.host,
        "x-finai-proxy-token": proof,
        "x-finai-public-host": publicURL.host,
        "x-forwarded-proto": "https",
        "x-finai-client-ip": String(
          req.headers["x-vercel-forwarded-for"] || "unknown",
        )
          .split(",")[0]
          .slice(0, 100),
        "content-length": String(body.length),
      };
      for (const name of [
        "content-type",
        "cookie",
        "origin",
        "x-csrf-token",
        "if-match",
      ]) {
        const value = req.headers[name];
        if (typeof value === "string") forwarded.headers[name] = value;
      }
      forwarded.push(body);
      forwarded.push(null);
      await new Promise<void>((resolve, reject) => {
        res.once("finish", resolve);
        res.once("close", resolve);
        try {
          app.getHttpAdapter().getInstance()(forwarded, res);
        } catch (error) {
          reject(error);
        }
      });
    } catch {
      fail(
        503,
        "UNAVAILABLE",
        "The backend could not start or complete this request. Check database connectivity, applied migrations and the packaged server build.",
      );
    }
  };
  return {
    handler,
    close: async () => {
      if (application) await (await application).close();
    },
  };
}
