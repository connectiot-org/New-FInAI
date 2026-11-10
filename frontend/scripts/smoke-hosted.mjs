/**
 * Hosted deployment smoke checks for a deployed FinAI environment.
 * Configuration comes only from environment variables; nothing is committed.
 * Read-only by default; SMOKE_WRITE=1 additionally creates one draft invoice
 * with a unique reference in a dedicated test company and stops there
 * (never approves, exports or deletes anything).
 * Output is one PASS/FAIL/SKIP line per check, a summary, and a non-zero
 * exit code on any FAIL. Tokens, cookies and credentials are redacted.
 */
import process from "node:process";
import { pathToFileURL } from "node:url";

// Repository convention: plain .mjs scripts use only node: module imports and
// ECMAScript built-ins; host globals are taken explicitly from globalThis.
const { URL, fetch, AbortSignal, crypto } = globalThis;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in smoke-hosted.test.mjs)
// ---------------------------------------------------------------------------

/** Redact secrets from any text before it is printed. */
export function redact(text, secrets = []) {
  let out = String(text ?? "");
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.replaceAll(secret, "<redacted>");
  }
  out = out
    // Session cookie values by cookie name (keeps the name visible).
    .replace(/((?:__Host-|__Secure-)?[a-zA-Z0-9_-]*session[a-zA-Z0-9_-]*=)[^;\s"']+/gi, "$1<redacted>")
    // Any other cookie header values not already redacted above.
    .replace(/((?:cookie|set-cookie)\s*:\s*)(?![^\r\n]*<redacted>)[^\r\n,]+/gi, "$1<redacted>")
    // CSRF tokens and bearer/basic authorization material.
    .replace(/("csrfToken"\s*:\s*)"[^"]*"/gi, '$1"<redacted>"')
    .replace(/("password"\s*:\s*)"[^"]*"/gi, '$1"<redacted>"')
    .replace(/\b(authorization\s*:\s*)(bearer|basic)\s+\S+/gi, "$1$2 <redacted>")
    // Long hex tokens that look like session material.
    .replace(/\b[a-f0-9]{64,}\b/gi, "<redacted>");
  return out;
}

/**
 * Evaluate security response headers. HSTS only applies over HTTPS;
 * frame protection is satisfied by X-Frame-Options or CSP frame-ancestors.
 */
export function evaluateSecurityHeaders(headers, { https }) {
  const get = (name) => {
    const direct = headers[name] ?? headers[name.toLowerCase()];
    if (direct !== undefined) return String(direct);
    const found = Object.keys(headers).find(
      (k) => k.toLowerCase() === name.toLowerCase(),
    );
    return found === undefined ? undefined : String(headers[found]);
  };
  const csp = get("content-security-policy");
  const xcto = get("x-content-type-options");
  const referrer = get("referrer-policy");
  const frame =
    get("x-frame-options") ??
    (csp && /frame-ancestors/i.test(csp) ? csp : undefined);
  const hsts = get("strict-transport-security");
  return {
    csp: csp !== undefined ? "present" : "missing",
    xContentTypeOptions: xcto !== undefined ? "present" : "missing",
    referrerPolicy: referrer !== undefined ? "present" : "missing",
    frameProtection: frame !== undefined ? "present" : "missing",
    hsts: !https ? "n/a (HTTP)" : hsts !== undefined ? "present" : "missing",
  };
}

/** Parse a Set-Cookie header into name, value and safety flags. */
export function parseSetCookie(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const [pair, ...attributes] = value.split(";");
  const eq = pair.indexOf("=");
  if (eq < 1) return null;
  const name = pair.slice(0, eq).trim();
  const flags = {};
  for (const raw of attributes) {
    const attr = raw.trim().toLowerCase();
    const colon = attr.indexOf("=");
    const key = colon === -1 ? attr : attr.slice(0, colon);
    if (key === "httponly") flags.httpOnly = true;
    else if (key === "secure") flags.secure = true;
    else if (key === "samesite")
      flags.sameSite = attr.slice(colon + 1).trim();
    else if (key === "max-age") flags.maxAge = attr.slice(colon + 1).trim();
    else if (key === "path") flags.path = attr.slice(colon + 1).trim();
    else if (key === "domain") flags.domain = attr.slice(colon + 1).trim();
  }
  return { name, value: pair.slice(eq + 1).trim(), flags };
}

/** Parse and validate the smoke environment. Throws on unusable input. */
export function parseEnv(env = process.env) {
  const base = env.SMOKE_BASE_URL;
  if (!base) throw new Error("SMOKE_BASE_URL is required (deployed origin, e.g. https://app.example)");
  const baseUrl = new URL(base);
  if (!/^https?:$/.test(baseUrl.protocol))
    throw new Error("SMOKE_BASE_URL must be an http(s) URL");
  const api = env.SMOKE_API_URL ? new URL(env.SMOKE_API_URL) : baseUrl;
  if (!/^https?:$/.test(api.protocol))
    throw new Error("SMOKE_API_URL must be an http(s) URL");
  return {
    baseUrl,
    apiUrl: api,
    https: baseUrl.protocol === "https:",
    email: env.SMOKE_EMAIL || "",
    password: env.SMOKE_PASSWORD || "",
    organisationId: env.SMOKE_ORGANISATION_ID || "",
    write: /^(1|true|yes)$/i.test(env.SMOKE_WRITE || ""),
    sampleMarker: env.SMOKE_SAMPLE_MARKER || "Sample data stays in this browser",
    timeoutMs: Number(env.SMOKE_TIMEOUT_MS || 20000),
  };
}

/** Exit code for a result list: non-zero on any FAIL. */
export function exitCodeFor(results) {
  return results.some((r) => r.status === "FAIL") ? 1 : 0;
}

const SCRIPT_SRC = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
const PRELOAD_HREF = /<link[^>]+href=["']([^"']+\.js)["']/gi;

/** Absolute script/preload asset URLs referenced by an HTML document. */
export function extractScriptSources(html, baseUrl) {
  const urls = new Set();
  for (const re of [SCRIPT_SRC, PRELOAD_HREF]) {
    re.lastIndex = 0;
    for (const m of html.matchAll(re)) {
      try {
        urls.add(new URL(m[1], baseUrl).toString());
      } catch {
        /* ignore malformed references */
      }
    }
  }
  return [...urls];
}

/** Chunk URLs referenced from already-fetched JavaScript text (depth 2). */
export function extractChunkSources(js, documentUrl) {
  const urls = new Set();
  for (const m of js.matchAll(/["'`]((?:\.\/)?[A-Za-z0-9_./-]+\.js)["'`]/g)) {
    try {
      urls.add(new URL(m[1], documentUrl).toString());
    } catch {
      /* ignore malformed references */
    }
  }
  return [...urls];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

class Smoke {
  constructor(config) {
    this.config = config;
    this.results = [];
    this.secrets = [];
    if (config.password) this.secrets.push(config.password);
  }

  say(text) {
    process.stdout.write(redact(text, this.secrets) + "\n");
  }

  record(status, id, note) {
    const line = `[${status}] ${id} — ${note}`;
    this.results.push({ status, id, note });
    this.say(line);
    return status === "PASS";
  }

  async fetch(url, options = {}) {
    return fetch(url, {
      redirect: options.redirect || "follow",
      signal: AbortSignal.timeout(this.config.timeoutMs),
      ...options,
      headers: {
        // Browser-faithful: same-origin requests carry Origin, and the
        // session-mode backend enforces exact origin + JSON on mutations.
        origin: this.config.baseUrl.origin,
        "user-agent": "finai-smoke-hosted/1 (+repository tooling)",
        ...(options.headers || {}),
      },
    });
  }

  async text(response) {
    const clone = response.clone();
    try {
      return await clone.text();
    } catch {
      return "";
    }
  }
}

async function checkDemoSampleRoute(smoke) {
  const { baseUrl } = smoke.config;
  let response;
  try {
    response = await smoke.fetch(new URL("/demo/payables/invoices", baseUrl));
  } catch (error) {
    return smoke.record("FAIL", "demo-sample-route", `request failed: ${error.message}`);
  }
  if (response.status !== 200)
    return smoke.record(
      "FAIL",
      "demo-sample-route",
      `expected 200, got ${response.status}`,
    );
  const html = await smoke.text(response);
  if (!/text\/html/.test(response.headers.get("content-type") || ""))
    return smoke.record("FAIL", "demo-sample-route", "response is not HTML");
  // The label renders client-side; search the document and its reachable JS
  // chunks for the known sample-boundary marker.
  const seen = new Set();
  let queue = extractScriptSources(html, response.url || baseUrl.toString());
  let found = html.includes(smoke.config.sampleMarker);
  for (let depth = 0; depth < 2 && !found && queue.length; depth++) {
    const next = [];
    for (const url of queue.slice(0, 60)) {
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const js = await smoke.fetch(url);
        const body = await smoke.text(js);
        if (body.includes(smoke.config.sampleMarker)) found = true;
        for (const chunk of extractChunkSources(body, url)) next.push(chunk);
      } catch {
        /* unreachable chunk is not itself a failure */
      }
      if (found) break;
    }
    queue = next;
  }
  if (found)
    return smoke.record(
      "PASS",
      "demo-sample-route",
      "200 HTML and the labelled sample boundary is reachable from served assets",
    );
  return smoke.record(
    "FAIL",
    "demo-sample-route",
    `200 HTML but sample marker not found in document/scripts (marker may have changed; override with SMOKE_SAMPLE_MARKER)`,
  );
}

async function checkWorkspaceUnauthenticated(smoke) {
  const { baseUrl } = smoke.config;
  let response;
  try {
    response = await smoke.fetch(
      new URL("/workspace/payables/invoices", baseUrl),
      { redirect: "manual" },
    );
  } catch (error) {
    return smoke.record(
      "FAIL",
      "workspace-unauthenticated",
      `request failed: ${error.message}`,
    );
  }
  const redirect = [301, 302, 303, 307, 308].includes(response.status);
  if (redirect)
    return smoke.record(
      "PASS",
      "workspace-unauthenticated",
      `no session redirects (${response.status}) before any company data`,
    );
  if (response.status !== 200)
    return smoke.record(
      "FAIL",
      "workspace-unauthenticated",
      `expected redirect or HTML shell, got ${response.status}`,
    );
  const html = await smoke.text(response);
  const embeddedData =
    /"organisationId"\s*:/.test(html) ||
    /"entityId"\s*:/.test(html) ||
    /"invoices"\s*:\s*\[/.test(html);
  if (embeddedData)
    return smoke.record(
      "FAIL",
      "workspace-unauthenticated",
      "HTML shell embeds company-shaped data for anonymous visitors",
    );
  return smoke.record(
    "PASS",
    "workspace-unauthenticated",
    "anonymous request serves the SPA shell only; sign-in gating is client-rendered, so the API 401 check below is the authoritative boundary",
  );
}

async function checkAnonymousApi(smoke) {
  const { apiUrl } = smoke.config;
  try {
    const response = await smoke.fetch(
      new URL("/api/v1/payables/invoices?entityId=00000000-0000-4000-8000-000000000000", apiUrl),
    );
    if ([401, 403].includes(response.status))
      return smoke.record(
        "PASS",
        "api-unauthenticated-401",
        `unauthenticated invoice list rejected with ${response.status}`,
      );
    return smoke.record(
      "FAIL",
      "api-unauthenticated-401",
      `expected 401/403 for anonymous invoice list, got ${response.status}`,
    );
  } catch (error) {
    return smoke.record(
      "FAIL",
      "api-unauthenticated-401",
      `request failed: ${error.message}`,
    );
  }
}

async function checkHealth(smoke) {
  const { apiUrl } = smoke.config;
  const observed = {};
  for (const name of ["live", "ready"]) {
    try {
      const response = await smoke.fetch(new URL(`/health/${name}`, apiUrl));
      observed[name] = response.status;
    } catch (error) {
      observed[name] = `unreachable(${error.message})`;
    }
  }
  const findings = Object.entries(observed).map(
    ([name, state]) => `${name}=${state}`,
  );
  const states = Object.values(observed);
  if (states.every((s) => s === 200))
    return smoke.record(
      "PASS",
      "health",
      "liveness and readiness endpoints respond 200",
    );
  if (states.every((s) => s === 404))
    return smoke.record(
      "SKIP",
      "health",
      `no health endpoint (finding); observed ${findings.join(", ")}`,
    );
  if (states.some((s) => s === 200))
    return smoke.record(
      "PASS",
      "health",
      `partial health surface (finding); observed ${findings.join(", ")}`,
    );
  return smoke.record(
    "FAIL",
    "health",
    `health endpoints did not respond 200 (${findings.join(", ")})`,
  );
}

async function checkSecurityHeaders(smoke) {
  const { baseUrl, apiUrl, https } = smoke.config;
  const report = [];
  let ok = true;
  for (const [label, url] of [
    ["document", new URL("/", baseUrl)],
    ["api", new URL("/api/v1/payables/invoices", apiUrl)],
  ]) {
    try {
      const response = await smoke.fetch(url);
      const evaluated = evaluateSecurityHeaders(
        Object.fromEntries(response.headers.entries()),
        { https },
      );
      const parts = Object.entries(evaluated).map(
        ([name, state]) => `${name}=${state}`,
      );
      report.push(`${label}: ${parts.join(" ")}`);
      const missing = parts.filter((p) => p.endsWith("missing")).length;
      if (missing) report.push(`finding: ${missing} header(s) missing on ${label}`);
    } catch (error) {
      ok = false;
      report.push(`${label}: request failed (${error.message})`);
    }
  }
  return smoke.record(ok ? "PASS" : "FAIL", "security-headers", report.join("; "));
}

async function signIn(smoke) {
  const { apiUrl, email, password, organisationId } = smoke.config;
  try {
    const response = await smoke.fetch(new URL("/auth/login", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: email,
        password,
        organisationId,
      }),
    });
    if (response.status !== 200) {
      smoke.record(
        "FAIL",
        "signin",
        `expected 200 sign-in, got ${response.status}`,
      );
      return null;
    }
    const cookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    const session = cookies
      .map(parseSetCookie)
      .find((c) => c && /session/i.test(c.name));
    const body = await response.json().catch(() => ({}));
    if (!session || !body.csrfToken) {
      smoke.record(
        "FAIL",
        "signin",
        "200 but session cookie or CSRF token missing from response",
      );
      return null;
    }
    smoke.secrets.push(session.value, body.csrfToken);
    const flags = session.flags;
    const cookieOk =
      flags.httpOnly === true &&
      flags.secure === true &&
      Boolean(flags.sameSite);
    smoke.record(
      cookieOk ? "PASS" : "FAIL",
      "signin",
      `signed in; session cookie flags HttpOnly=${Boolean(flags.httpOnly)} Secure=${Boolean(flags.secure)} SameSite=${flags.sameSite || "missing"} Max-Age=${flags.maxAge || "?"}`,
    );
    return { cookie: `${session.name}=${session.value}`, csrfToken: body.csrfToken };
  } catch (error) {
    smoke.record("FAIL", "signin", `request failed: ${error.message}`);
    return null;
  }
}

async function checkCsrfRequired(smoke, session) {
  const { apiUrl } = smoke.config;
  try {
    const response = await smoke.fetch(new URL("/auth/logout", apiUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
      },
    });
    if ([401, 403].includes(response.status))
      return smoke.record(
        "PASS",
        "csrf-required",
        `state-changing call without CSRF token rejected with ${response.status}`,
      );
    return smoke.record(
      "FAIL",
      "csrf-required",
      `expected 401/403 without CSRF token, got ${response.status} (session may have been logged out)`,
    );
  } catch (error) {
    return smoke.record(
      "FAIL",
      "csrf-required",
      `request failed: ${error.message}`,
    );
  }
}

async function checkScopedData(smoke, session) {
  const { apiUrl } = smoke.config;
  try {
    const context = await smoke.fetch(new URL("/api/v1/workspace/context", apiUrl), {
      headers: { cookie: session.cookie },
    });
    if (context.status !== 200)
      return smoke.record(
        "FAIL",
        "scoped-data",
        `workspace context expected 200, got ${context.status}`,
      );
    const body = await context.json().catch(() => null);
    const entities = Array.isArray(body?.entities) ? body.entities : [];
    if (!entities.length)
      return smoke.record(
        "FAIL",
        "scoped-data",
        "workspace context returned no entities for this account",
      );
    const entityId = entities[0].id ?? entities[0].entityId;
    if (!entityId)
      return smoke.record("FAIL", "scoped-data", "entity id missing in context");

    const list = await smoke.fetch(
      new URL(`/api/v1/payables/invoices?entityId=${encodeURIComponent(entityId)}&limit=5`, apiUrl),
      { headers: { cookie: session.cookie } },
    );
    if (list.status !== 200)
      return smoke.record(
        "FAIL",
        "scoped-data",
        `invoice list expected 200, got ${list.status}`,
      );
    const invoices = await list.json().catch(() => null);
    if (
      !invoices ||
      typeof invoices.total !== "number" ||
      !Array.isArray(invoices.items)
    )
      return smoke.record("FAIL", "scoped-data", "invoice list shape unexpected");

    // An ungranted entity must be refused even with a valid session.
    const foreign = await smoke.fetch(
      new URL("/api/v1/payables/invoices?entityId=00000000-0000-4000-8000-000000000000", apiUrl),
      { headers: { cookie: session.cookie } },
    );
    if (![401, 403, 404].includes(foreign.status))
      return smoke.record(
        "FAIL",
        "scoped-data",
        `invoice list for ungranted entity expected 401/403/404, got ${foreign.status}`,
      );
    return smoke.record(
      "PASS",
      "scoped-data",
      `invoices listed only for the session's own entity (${invoices.total} total) and an ungranted entity is refused (${foreign.status})`,
    );
  } catch (error) {
    return smoke.record("FAIL", "scoped-data", `request failed: ${error.message}`);
  }
}

async function checkWriteDraft(smoke, session) {
  const { apiUrl } = smoke.config;
  try {
    const context = await smoke.fetch(new URL("/api/v1/workspace/context", apiUrl), {
      headers: { cookie: session.cookie },
    });
    const body = await context.json().catch(() => null);
    const entityId = body?.entities?.[0]?.id ?? body?.entities?.[0]?.entityId;
    if (!entityId)
      return smoke.record("SKIP", "write-draft-invoice", "no entity available for write checks");
    const headers = {
      "content-type": "application/json",
      cookie: session.cookie,
      "x-csrf-token": session.csrfToken,
    };

    // Reuse an existing supplier when possible; otherwise create one.
    const suppliers = await smoke.fetch(
      new URL(`/api/v1/payables/suppliers?entityId=${encodeURIComponent(entityId)}`, apiUrl),
      { headers: { cookie: session.cookie } },
    );
    const supplierBody = await suppliers.json().catch(() => null);
    const existing = Array.isArray(supplierBody?.items) ? supplierBody.items[0] : null;
    let supplierId = existing?.id;
    if (!supplierId) {
      const createdSupplierId = crypto.randomUUID();
      const created = await smoke.fetch(new URL("/api/v1/payables/suppliers", apiUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: createdSupplierId,
          entityId,
          name: `Smoke supplier ${Date.now()}`,
          taxId: "",
        }),
      });
      if (![200, 201].includes(created.status))
        return smoke.record(
          "FAIL",
          "write-draft-invoice",
          `supplier create expected 2xx, got ${created.status}`,
        );
      supplierId = createdSupplierId;
    }

    const invoiceId = crypto.randomUUID();
    const reference = `SMOKE-${Date.now()}`;
    const today = new Date();
    const due = new Date(today.getTime() + 30 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    const draft = {
      id: invoiceId,
      entityId,
      supplierId,
      reference,
      invoiceDate: iso(today),
      dueDate: iso(due),
      currency: "GBP",
      declaredGross: "10000",
      lines: [
        {
          description: "Hosted smoke draft",
          quantity: "1",
          unitMinor: "10000",
          taxCode: "NONE",
          taxBps: 0,
          recoverable: false,
          account: "6000",
          taxAccount: "2200",
          payableAccount: "2100",
          costCentre: "Operations",
        },
      ],
    };
    const created = await smoke.fetch(new URL("/api/v1/payables/invoices", apiUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(draft),
    });
    if (![200, 201].includes(created.status))
      return smoke.record(
        "FAIL",
        "write-draft-invoice",
        `draft create expected 2xx, got ${created.status}`,
      );

    const detail = await smoke.fetch(
      new URL(`/api/v1/payables/invoices/${invoiceId}`, apiUrl),
      { headers: { cookie: session.cookie } },
    );
    if (detail.status !== 200)
      return smoke.record(
        "FAIL",
        "write-draft-invoice",
        `read-back expected 200, got ${detail.status}`,
      );
    const read = await detail.json().catch(() => null);
    if (
      read?.id !== invoiceId ||
      read?.state !== "review" ||
      read?.data?.reference !== reference
    )
      return smoke.record(
        "FAIL",
        "write-draft-invoice",
        "read-back payload did not match the created draft",
      );
    return smoke.record(
      "PASS",
      "write-draft-invoice",
      `draft ${reference} created and read back in state review; stopping (no approve/export/delete)`,
    );
  } catch (error) {
    return smoke.record(
      "FAIL",
      "write-draft-invoice",
      `request failed: ${error.message}`,
    );
  }
}

async function checkSignOut(smoke, session) {
  const { apiUrl } = smoke.config;
  try {
    const response = await smoke.fetch(new URL("/auth/logout", apiUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": session.csrfToken,
      },
    });
    if (![200, 204].includes(response.status))
      return smoke.record(
        "FAIL",
        "signout",
        `logout expected 2xx, got ${response.status}`,
      );
    const after = await smoke.fetch(new URL("/auth/session", apiUrl), {
      headers: { cookie: session.cookie },
    });
    if ([401, 403].includes(after.status))
      return smoke.record(
        "PASS",
        "signout",
        "session revoked; post-logout session lookup rejected",
      );
    return smoke.record(
      "FAIL",
      "signout",
      `expected session lookup to be rejected after logout, got ${after.status}`,
    );
  } catch (error) {
    return smoke.record("FAIL", "signout", `request failed: ${error.message}`);
  }
}

async function run() {
  const config = parseEnv();
  const smoke = new Smoke(config);
  smoke.say(
    `FinAI hosted smoke against base ${config.baseUrl} (api ${config.apiUrl}); mode ${config.write ? "read+write" : "read-only"}`,
  );

  await checkDemoSampleRoute(smoke);
  await checkWorkspaceUnauthenticated(smoke);
  await checkAnonymousApi(smoke);
  await checkHealth(smoke);
  await checkSecurityHeaders(smoke);

  const canSignIn = Boolean(config.email && config.password);
  if (!canSignIn) {
    smoke.record(
      "SKIP",
      "signin",
      "SMOKE_EMAIL/SMOKE_PASSWORD not provided; authenticated checks skipped",
    );
  } else if (!config.organisationId) {
    smoke.record(
      "SKIP",
      "signin",
      "SMOKE_ORGANISATION_ID not provided; the API sign-in requires it, so authenticated checks were skipped",
    );
  }
  if (canSignIn && config.organisationId) {
    const session = await signIn(smoke);
    if (session) {
      await checkCsrfRequired(smoke, session);
      await checkScopedData(smoke, session);
      if (config.write)
        await checkWriteDraft(smoke, session);
      else
        smoke.record(
          "SKIP",
          "write-draft-invoice",
          "SMOKE_WRITE not enabled; write checks skipped",
        );
      await checkSignOut(smoke, session);
    }
  } else {
    smoke.record(
      "SKIP",
      "csrf-required",
      "no signed-in session for this run",
    );
    smoke.record("SKIP", "scoped-data", "no signed-in session for this run");
    smoke.record(
      "SKIP",
      "write-draft-invoice",
      config.write
        ? "SMOKE_WRITE=1 but no signed-in session (requires SMOKE_EMAIL/SMOKE_PASSWORD/SMOKE_ORGANISATION_ID)"
        : "SMOKE_WRITE not enabled",
    );
    smoke.record("SKIP", "signout", "no signed-in session for this run");
  }

  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of smoke.results) counts[r.status] += 1;
  smoke.say(
    `summary: ${counts.PASS} pass, ${counts.FAIL} fail, ${counts.SKIP} skip (${smoke.results.length} checks)`,
  );
  process.exitCode = exitCodeFor(smoke.results);
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  run().catch((error) => {
    process.stderr.write(redact(error?.stack || String(error)) + "\n");
    process.exitCode = 1;
  });
}
