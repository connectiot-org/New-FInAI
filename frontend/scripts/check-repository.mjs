/** Development-only repository/catalog and literal-import checks; never an authorization boundary. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { posix, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, "")),
);
const serverPackages = [
  "@nestjs",
  "@prisma",
  "@vercel/functions",
  "@neondatabase/serverless",
  "argon2",
  "express",
  "pg",
];
const generated = new Set([
  "node_modules",
  "dist",
  "artifacts",
  ".finai-server",
  ".vercel",
  "test-results",
  "playwright-report",
  "__pycache__",
]);

function catalogPaths(markdown) {
  const paths = [];
  let table = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      table = false;
      continue;
    }
    if (/^\|\s*File\s*\|/.test(line)) {
      table = true;
      continue;
    }
    if (!table) continue;
    const match = /^\|\s*(?:`([^`]+)`|\[[^\]]+\]\(([^)]+)\))\s*\|/.exec(line);
    if (match)
      paths.push({
        file:
          match[1] ||
          posix.normalize(posix.join("docs", match[2].split("#")[0])),
        purpose: line.slice(match[0].length).split("|")[0].trim(),
      });
  }
  return paths;
}

function imports(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const add = (node, value) =>
    found.push({
      specifier: value && ts.isStringLiteralLike(value) ? value.text : null,
      line:
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      add(node, node.moduleSpecifier);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      add(node, node.moduleReference.expression);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node, node.argument.literal);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      add(node, node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

export function checkRepository(root, files) {
  const errors = [];
  const paths = new Set(files);
  let catalog;
  try {
    catalog = catalogPaths(
      readFileSync(resolve(root, "docs/repository-guide.md"), "utf8"),
    );
  } catch {
    return {
      errors: ["Missing readable docs/repository-guide.md"],
      sources: 0,
    };
  }
  const counts = new Map();
  for (const { file, purpose } of catalog) {
    counts.set(file, (counts.get(file) || 0) + 1);
    if (!purpose) errors.push(`Empty file purpose: ${file}`);
  }
  for (const file of paths)
    if (!counts.has(file)) errors.push(`Missing file purpose: ${file}`);
  for (const [file, count] of counts) {
    if (!paths.has(file)) errors.push(`Stale file purpose: ${file}`);
    if (count !== 1) errors.push(`Duplicate file purpose: ${file}`);
  }
  let sources = 0;
  for (const file of paths) {
    const parts = file.split("/");
    if (
      parts.some((part) => generated.has(part)) ||
      /\.(?:tsbuildinfo|pyc)$/.test(file)
    )
      errors.push(`Generated/private output must stay ignored: ${file}`);
    if (/^\.env(?:\.|$)/.test(parts.at(-1)) && parts.at(-1) !== ".env.example")
      errors.push(`Private environment file must stay ignored: ${file}`);
    if (!/^(?:frontend|backend)\/src\/.*\.[cm]?[jt]sx?$/.test(file)) continue;
    sources++;
    const browser = file.startsWith("frontend/");
    const base = browser ? "frontend/src/" : "backend/src/";
    let text;
    try {
      text = readFileSync(resolve(root, file), "utf8");
    } catch {
      errors.push(`Missing readable source: ${file}`);
      continue;
    }
    for (const { specifier, line } of imports(file, text)) {
      if (specifier === null) {
        errors.push(
          `Computed import requires a reviewed static boundary: ${file}:${line}`,
        );
        continue;
      }
      const spec = specifier.replaceAll("\\", "/").split(/[?#]/)[0];
      if (spec.startsWith("/") && !browser) {
        errors.push(
          `Absolute backend source import: ${file}:${line} -> ${spec}`,
        );
        continue;
      }
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const target = posix.normalize(
          spec.startsWith("/")
            ? (browser ? "frontend" : "backend") + spec
            : posix.join(posix.dirname(file), spec),
        );
        if (!target.startsWith(base))
          errors.push(
            `Source import leaves ${base}: ${file}:${line} -> ${target}`,
          );
      } else if (
        browser &&
        (spec.startsWith("node:") ||
          builtins.has(spec) ||
          serverPackages.some(
            (name) => spec === name || spec.startsWith(name + "/"),
          ))
      ) {
        errors.push(
          `Server dependency in browser source: ${file}:${line} -> ${spec}`,
        );
      }
    }
  }
  return { errors, sources };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(import.meta.dirname, "../..");
  try {
    // Include new, nonignored files so local checks catch missing catalog entries before staging.
    const files = [
      ...new Set(
        execFileSync(
          "git",
          ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
          { cwd: root, encoding: "utf8" },
        )
          .split("\0")
          .filter(Boolean),
      ),
    ];
    const { errors, sources } = checkRepository(root, files);
    if (errors.length) {
      process.stderr.write(errors.join("\n") + "\n");
      process.exitCode = 1;
    } else
      process.stdout.write(
        `PASS: ${files.length} file purposes; ${sources} application source modules respect literal-import boundaries.\n`,
      );
  } catch {
    process.stderr.write(
      "Repository check could not complete. Verify Git access and frontend npm ci.\n",
    );
    process.exitCode = 1;
  }
}
