import process from "node:process";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number(process.env.FINAI_DEMO_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid demo port.");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (/^\/(api|auth)(\/|$)/.test(path)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          message:
            "This standalone demo has no server accounts or financial API.",
        }),
      );
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    let file = resolve(root, "." + path);
    if (!file.startsWith(root + sep)) file = resolve(root, "index.html");
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      if (extname(path)) {
        res.writeHead(404);
        return res.end();
      }
      file = resolve(root, "index.html");
    }
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(
    `FinAI invoice demo: http://127.0.0.1:${port}/demo/invoices\n`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
