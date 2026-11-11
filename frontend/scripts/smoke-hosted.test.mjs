/** Unit tests for the hosted smoke script's pure logic (headers, redaction, env). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  redact,
  evaluateSecurityHeaders,
  parseSetCookie,
  parseEnv,
  exitCodeFor,
  extractScriptSources,
  extractChunkSources,
} from "./smoke-hosted.mjs";

test("redact removes session cookie values by name", () => {
  const input =
    'cookie: __Host-finai_session=abcdef0123456789abcdef0123456789; other=1';
  const output = redact(input);
  assert.equal(output.includes("abcdef0123456789"), false);
  assert.match(output, /__Host-finai_session=<redacted>/);
});

test("redact removes supplied secrets anywhere in the text", () => {
  const secrets = ["synthetic-browser-password", "csrf-secret-value-123456"];
  const output = redact(
    "login used synthetic-browser-password and csrf-secret-value-123456 in the body",
    secrets,
  );
  assert.equal(output.includes("synthetic-browser-password"), false);
  assert.equal(output.includes("csrf-secret-value-123456"), false);
});

test("redact masks password and csrfToken JSON fields", () => {
  const output = redact('{"password":"hunter2long","csrfToken":"tok1234567890"}');
  assert.match(output, /"password":"<redacted>"/);
  assert.match(output, /"csrfToken":"<redacted>"/);
});

test("redact masks authorization headers and long hex tokens", () => {
  const output = redact(
    "authorization: Bearer abcdef0123456789abcdef0123456789 token=0123456789abcdef0123456789abcdef",
  );
  assert.equal(output.includes("abcdef0123456789abcdef0123456789"), false);
  assert.match(output, /Bearer <redacted>/);
});

test("redact leaves ordinary diagnostic text intact", () => {
  const output = redact("expected 200, got 401 for /api/v1/payables/invoices");
  assert.equal(output, "expected 200, got 401 for /api/v1/payables/invoices");
});

test("evaluateSecurityHeaders reports presence and missing headers", () => {
  const evaluated = evaluateSecurityHeaders(
    {
      "content-security-policy": "default-src 'self'",
      "x-content-type-options": "nosniff",
    },
    { https: true },
  );
  assert.equal(evaluated.csp, "present");
  assert.equal(evaluated.xContentTypeOptions, "present");
  assert.equal(evaluated.referrerPolicy, "missing");
  assert.equal(evaluated.frameProtection, "missing");
  assert.equal(evaluated.hsts, "missing");
});

test("evaluateSecurityHeaders accepts frame-ancestors as frame protection", () => {
  const evaluated = evaluateSecurityHeaders(
    { "content-security-policy": "frame-ancestors 'none'" },
    { https: true },
  );
  assert.equal(evaluated.frameProtection, "present");
});

test("evaluateSecurityHeaders marks HSTS n/a over plain HTTP", () => {
  const evaluated = evaluateSecurityHeaders({}, { https: false });
  assert.equal(evaluated.hsts, "n/a (HTTP)");
});

test("parseSetCookie extracts flags from the session cookie", () => {
  const parsed = parseSetCookie(
    "__Host-finai_session=0123456789abcdef; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800",
  );
  assert.equal(parsed.name, "__Host-finai_session");
  assert.equal(parsed.value, "0123456789abcdef");
  assert.equal(parsed.flags.httpOnly, true);
  assert.equal(parsed.flags.secure, true);
  assert.equal(parsed.flags.sameSite, "strict");
  assert.equal(parsed.flags.maxAge, "28800");
  assert.equal(parsed.flags.path, "/");
});

test("parseSetCookie rejects malformed input", () => {
  assert.equal(parseSetCookie(""), null);
  assert.equal(parseSetCookie("novalue"), null);
});

test("parseEnv requires SMOKE_BASE_URL and rejects non-http schemes", () => {
  assert.throws(() => parseEnv({}), /SMOKE_BASE_URL/);
  assert.throws(() => parseEnv({ SMOKE_BASE_URL: "ftp://example" }));
  const env = parseEnv({ SMOKE_BASE_URL: "https://app.example" });
  assert.equal(env.apiUrl.toString(), "https://app.example/");
  assert.equal(env.write, false);
  const custom = parseEnv({
    SMOKE_BASE_URL: "http://127.0.0.1:4173",
    SMOKE_API_URL: "http://127.0.0.1:3000",
    SMOKE_WRITE: "1",
  });
  assert.equal(custom.apiUrl.toString(), "http://127.0.0.1:3000/");
  assert.equal(custom.write, true);
  assert.equal(custom.https, false);
});

test("exitCodeFor is non-zero only when a check failed", () => {
  assert.equal(exitCodeFor([{ status: "PASS" }, { status: "SKIP" }]), 0);
  assert.equal(
    exitCodeFor([{ status: "PASS" }, { status: "FAIL" }]),
    1,
  );
});

test("extractScriptSources resolves script and preload URLs", () => {
  const urls = extractScriptSources(
    '<script type="module" src="/assets/index-abc123.js"></script><link rel="modulepreload" href="/assets/chunk-def456.js">',
    "https://app.example/demo/payables/invoices",
  );
  assert.deepEqual(urls.sort(), [
    "https://app.example/assets/chunk-def456.js",
    "https://app.example/assets/index-abc123.js",
  ].sort());
});

test("extractChunkSources finds chunk references inside fetched JavaScript", () => {
  const urls = extractChunkSources(
    'import("./Payables-9f8e7d.js");import("Workspace-1a2b3c.js");import("/assets/Big-0a1b2c.js")',
    "https://app.example/assets/index-abc123.js",
  );
  assert.equal(urls.length, 3);
  assert.ok(urls.includes("https://app.example/assets/Payables-9f8e7d.js"));
  assert.ok(urls.includes("https://app.example/assets/Workspace-1a2b3c.js"));
  assert.ok(urls.includes("https://app.example/assets/Big-0a1b2c.js"));
});

test("extractChunkSources resolves relative to the document URL root", () => {
  const urls = extractChunkSources(
    'import("assets/Workspace-1a2b3c.js")',
    "https://app.example/index-abc123.js",
  );
  assert.deepEqual(urls, ["https://app.example/assets/Workspace-1a2b3c.js"]);
});
