#!/usr/bin/env node
/** Reproducible REA CLI evidence capture; no MCP or native-engine setup. */
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import path from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";

const REA_VERSION = "6.5.0";
const REA_COMMIT = "180ba03bfddd5916251e81e97a500b1ede7a9eea";
const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 390, height: 1000 },
];

function options(argv) {
  const result = { browser: "/usr/bin/chromium" };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (flag === "--help") {
      console.log(
        "Usage: node scripts/rea-ui-audit.mjs --reference URL --app URL --out NEW_DIR [--browser /absolute/path/to/chromium]",
      );
      process.exit(0);
    }
    if (
      !["--reference", "--app", "--out", "--browser"].includes(flag) ||
      !argv[index + 1]
    ) {
      throw new Error("Unknown option or missing value: " + flag);
    }
    result[flag.slice(2)] = argv[index + 1];
  }
  for (const key of ["reference", "app", "out"]) {
    if (!result[key]) throw new Error("Missing --" + key);
  }
  for (const key of ["reference", "app"]) {
    const url = new URL(result[key]);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error(
        "--" + key + " must be an HTTP(S) URL without credentials",
      );
    }
    result[key] = url.href;
  }
  if (!path.isAbsolute(result.browser))
    throw new Error("--browser must be an absolute path");
  result.out = path.resolve(result.out);
  return result;
}

async function json(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function runRea(args, prefix) {
  const outputPath = prefix + "-evidence.json";
  const stderrPath = prefix + "-stderr.log";
  const stdout = createWriteStream(outputPath, { flags: "wx" });
  const stderr = createWriteStream(stderrPath, { flags: "wx" });
  // Array arguments avoid shell expansion. Preserve the environment for configured
  // npm caches and trusted proxies; never print or serialize ambient environment.
  const child = spawn(
    "npx",
    [
      "-y",
      "rea-agents@" + REA_VERSION,
      ...args,
      "--format",
      "json",
      "--full-output",
    ],
    {
      env: process.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  let timedOut = false;
  let escalation;
  function terminate(signal) {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal); // Only this runner's owned child group.
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate("SIGTERM");
    escalation = setTimeout(() => terminate("SIGKILL"), 5000);
  }, 180_000);
  let status;
  try {
    status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    await Promise.all([finished(stdout), finished(stderr)]);
  } finally {
    clearTimeout(timeout);
    clearTimeout(escalation);
  }
  if (timedOut)
    throw new Error(
      "REA timed out; inspect saved output. Provider cleanup is unverified.",
    );
  let envelope;
  try {
    envelope = JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    throw new Error(
      "REA returned invalid/incomplete JSON; inspect " + outputPath,
    );
  }
  if (status.code !== 0 || !envelope.ok || !envelope.data) {
    throw new Error(
      "REA command failed; inspect " + outputPath + " and " + stderrPath,
    );
  }
  return envelope.data;
}

function scenario(url, viewport, browser) {
  return {
    browser: { mode: "launch", executable_path: browser },
    start_url: { url },
    environment: {
      viewport: { ...viewport, device_scale_factor: 1 },
      timezone: "Asia/Dhaka",
    },
    actions: [
      {
        step_id: "ready",
        action: "wait_for",
        locator: { kind: "css", selector: "h1" },
        state: "visible",
        timeout_ms: 10000,
      },
      { step_id: "settle", action: "wait_for_timeout", duration_ms: 1500 },
    ],
    capture: {
      at_end: ["screenshot", "dom", "accessibility", "url"],
      events: ["page-errors"],
    },
  };
}

function small(value) {
  if (typeof value === "string" && value.length > 1200)
    return "[retained in complete evidence; " + value.length + " characters]";
  if (Array.isArray(value)) return value.map(small);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, small(item)]),
    );
  return value;
}

async function capture(target, viewport, config) {
  const name = target + "-" + viewport.width;
  const prefix = path.join(config.out, name);
  await json(
    prefix + "-scenario.json",
    scenario(config[target], viewport, config.browser),
  );
  const evidence = await runRea(
    ["capture-browser-scenario", prefix + "-scenario.json"],
    prefix,
  );
  const result = evidence.normalized_result;
  const artifact = [...result.steps]
    .reverse()
    .find((step) => step.artifacts?.screenshot?.state === "captured")?.artifacts
    .screenshot.value;
  if (!artifact?.data_base64)
    throw new Error(name + ": no captured screenshot in evidence");
  const png = Buffer.from(artifact.data_base64, "base64");
  if (
    png.length !== artifact.bytes ||
    createHash("sha256").update(png).digest("hex") !== artifact.sha256
  ) {
    throw new Error(
      name + ": screenshot byte identity does not match REA evidence",
    );
  }
  await writeFile(prefix + ".png", png);
  await json(prefix + "-screenshot.json", artifact);
  const failedSteps = result.steps
    .filter((step) => step.status !== "completed")
    .map((step) => ({
      step_id: step.step_id,
      status: step.status,
      error: step.error,
    }));
  return {
    name,
    target,
    viewport,
    url: config[target],
    evidence_id: evidence.evidence_id,
    evidence_file: name + "-evidence.json",
    screenshot_file: name + ".png",
    screenshot_sha256: artifact.sha256,
    completeness: result.completeness,
    browser: result.browser,
    failed_steps: failedSteps,
    page_errors: result.events?.items ?? [],
    limitations: [
      ...new Set([
        ...(evidence.limitations ?? []),
        ...(result.limitations ?? []),
      ]),
    ],
  };
}

async function boundedMap(items, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        try {
          results[index] = { ok: true, value: await work(items[index]) };
        } catch (error) {
          results[index] = {
            ok: false,
            error: error.message,
            input: items[index],
          };
        }
      }
    }),
  );
  return results;
}

async function main() {
  const config = options(process.argv.slice(2));
  await access(config.browser);
  // Refuse to overwrite earlier evidence or mix observations from different runs.
  await mkdir(config.out, { recursive: false });
  const index = {
    created_at: new Date().toISOString(),
    tool: {
      repository: "https://github.com/morluto/rea",
      inspected_commit: REA_COMMIT,
      npm_package: "rea-agents",
      npm_version: REA_VERSION,
      surface: "CLI",
    },
    targets: { reference: config.reference, app: config.app },
    comparison_policy: {
      channel_threshold: 12,
      metric:
        "REA normalized_result.changed_ratio is the fraction of viewport pixels exceeding the channel threshold; lower means fewer differing pixels.",
      interpretation:
        "This is not a semantic similarity score, a claim of identical UI, or evidence of private-page coverage.",
    },
    scope: {
      viewport_only: true,
      scale: 1,
      timezone: "Asia/Dhaka",
      maximum_concurrent_jobs: 2,
    },
    limitations: [
      "Reference URL may be an isolated static rendering; consult its asset-manifest.json for source digests and omitted behavior.",
      "Only the declared homepage viewport and wait actions are captured; this does not validate full-page, private UI or accounting behavior.",
      "FinAI branding, synthetic records and honest demo labels intentionally differ from public Rillet content.",
      "Rendering, font rasterization, animation timing and changing content can affect the pixel comparison.",
      "No browser trust settings, agent registration, native engines or third-party target scripts are installed by this runner.",
    ],
    captures: [],
    comparisons: [],
    failures: [],
  };
  const tasks = VIEWPORTS.flatMap((viewport) =>
    ["reference", "app"].map((target) => ({ target, viewport })),
  );
  const captures = await boundedMap(tasks, (item) =>
    capture(item.target, item.viewport, config),
  );
  for (const result of captures) {
    if (result.ok) index.captures.push(result.value);
    else index.failures.push(result);
  }
  // Keep a usable ledger even if a later comparison fails.
  await json(path.join(config.out, "index.json"), index);
  const comparisons = await boundedMap(VIEWPORTS, async (viewport) => {
    if (
      !index.captures.some(
        (item) => item.name === "reference-" + viewport.width,
      ) ||
      !index.captures.some((item) => item.name === "app-" + viewport.width)
    ) {
      throw new Error("Missing one or both captures for " + viewport.width);
    }
    const name = "comparison-" + viewport.width;
    const evidence = await runRea(
      [
        "compare-web-screenshots",
        path.join(
          config.out,
          "reference-" + viewport.width + "-screenshot.json",
        ),
        path.join(config.out, "app-" + viewport.width + "-screenshot.json"),
        "--channel-threshold",
        "12",
      ],
      path.join(config.out, name),
    );
    return {
      viewport,
      evidence_id: evidence.evidence_id,
      evidence_file: name + "-evidence.json",
      normalized_result: small(evidence.normalized_result),
      limitations: evidence.limitations ?? [],
    };
  });
  for (const result of comparisons) {
    if (result.ok) index.comparisons.push(result.value);
    else index.failures.push(result);
  }
  index.success =
    index.failures.length === 0 &&
    index.captures.every(
      (item) =>
        item.completeness?.status === "complete" &&
        item.failed_steps.length === 0 &&
        item.browser?.cleanup === "terminated-owned-process" &&
        item.page_errors.length === 0,
    );
  await json(path.join(config.out, "index.json"), index);
  console.log(
    JSON.stringify({
      success: index.success,
      index: path.join(config.out, "index.json"),
      captures: index.captures.length,
      comparisons: index.comparisons.length,
      failures: index.failures.length,
    }),
  );
  if (!index.success) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
