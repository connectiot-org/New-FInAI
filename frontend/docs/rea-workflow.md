# Reproduce the Rillet UI audit with REA

This workflow uses [morluto/rea](https://github.com/morluto/rea) and its [reverse-engineer-anything skill](https://github.com/morluto/rea/blob/180ba03bfddd5916251e81e97a500b1ede7a9eea/.agents/skills/reverse-engineer-anything/SKILL.md) to capture browser evidence and compare the visible public homepage. FinAI remains an interactive local accounting demo with its own name, synthetic records and honest demo labels. REA is an evidence tool; it does not automatically clone a website or establish that unseen pages are identical.

The scripts in this repository are original FinAI integration tools. They invoke the official `rea-agents@6.5.0` CLI and preserve its evidence, provenance and limitations. They do not vendor REA source or change agent registration, browser trust stores or native analysis engines.

## 1. Clone both repositories and read the skill

Use a supported Node release (`^22.19.0`, `^24.11.0`, or `>=26.0.0` for the inspected REA release), npm, Python 3, Git and an existing Chromium executable. These commands assume Linux and a writable `/workspace` directory. Adjust the browser path on another host.

```bash
cd /workspace
git clone https://github.com/connectiot-org/New-FInAI.git
git clone https://github.com/morluto/rea.git
git -C /workspace/rea checkout --detach 180ba03bfddd5916251e81e97a500b1ede7a9eea
cat /workspace/rea/.agents/skills/reverse-engineer-anything/SKILL.md
cat /workspace/rea/.agents/skills/reverse-engineer-anything/references/runtime-observation.md
```

If either checkout already exists, reuse it and inspect `git status` and `git rev-parse HEAD`; do not overwrite existing work. The pinned checkout makes the instructions reviewable. The CLI is acquired separately from the official npm package; a clone alone does not install REA's CLI or connect MCP tools.

## 2. Check the available CLI and browser

```bash
node --version
npm --version
python3 --version
/usr/bin/chromium --version
npx -y rea-agents@6.5.0 --version
```

The runner uses the skill's supported CLI fallback because this task needs browser evidence and no MCP registration or native engines. `npx` may download the pinned package into npm's cache. An optional existing cache can be selected through `npm_config_cache`; the runner preserves that setting without recording environment values. No `setup`, Hopper, Ghidra, account credentials or agent restart is required for this workflow.

## 3. Prepare an isolated public reference

```bash
cd /workspace/New-FInAI/frontend
python3 scripts/capture-rillet-reference.py --out /tmp/finai-rillet-reference-new
```

Choose a new output directory for every preparation. The script refuses to overwrite an earlier run. It fetches the public homepage with Python's default verified HTTPS, verifies the shared stylesheet against its declared SHA-384 integrity, downloads the referenced images/fonts, and writes a source-and-digest manifest. Asset redirects must remain on the declared HTTPS hosts. The only asset hosts allowed are `cdn.prod.website-files.com`, `fonts.googleapis.com` and `fonts.gstatic.com`; the public document is restricted to `rillet.com`/`www.rillet.com`.

The generated page removes scripts, frames, embedded active content, event handlers and responsive `srcset` selection. Video is represented by its public poster. Remote image/font/CSS references are rewritten to local downloaded files; undeclared resources are omitted. An injected Content Security Policy blocks scripts, connections, frames, objects and form submissions. This preserves a static visual reference without executing third-party JavaScript. Original source is retained as `.txt` for provenance, separate from the rendered `index.html`.

Inspect `/tmp/finai-rillet-reference-new/asset-manifest.json`. A successful run reports `shared_css_integrity_verified: true` and zero asset errors. A nonzero exit or a partial manifest is a blocker to claiming a complete static-asset capture. If verified HTTPS cannot reach the reference or an asset host, correct that host's access configuration or use an already verified capture. Do not disable certificate verification or silently substitute a guessed reference.

Serve the output in a separate terminal, bound only to loopback:

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory /tmp/finai-rillet-reference-new
```

This server is a temporary inspection aid. Its captured Rillet source, customer claims and screenshots do not become the FinAI application or production assets. The FinAI city background is separately documented in [reference-assets.md](reference-assets.md).

## 4. Build and serve FinAI

```bash
cd /workspace/New-FInAI/frontend
npm ci
npm run build
npm run lint
npm test
```

The browser tests use the Chromium setup described in the frontend README. Keep the production preview running in another terminal:

```bash
cd /workspace/New-FInAI/frontend
npm run preview -- --port 4173 --strictPort
```

## 5. Capture and compare through REA

Create the ignored artifact parent once, then select a new child directory for this run:

```bash
cd /workspace/New-FInAI/frontend
mkdir -p artifacts
node scripts/rea-ui-audit.mjs \
  --reference http://127.0.0.1:8766/ \
  --app http://127.0.0.1:4173/ \
  --browser /usr/bin/chromium \
  --out artifacts/rea-ui-run-01
```

The runner uses safe argument arrays and at most two concurrent CLI jobs. It creates separate disposable browser profiles, navigates to the declared homepage URL, waits for a visible `h1`, then waits 1.5 seconds. At 1440×1000 and 390×1000 with scale 1 and Asia/Dhaka timezone it requests viewport screenshots, DOM, accessibility, URL and page-error events. FinAI starts with the deterministic demo state of a fresh profile. No login, remote form submission or production record change is performed.

For each target/width, output includes:

- `*-scenario.json`: exact declared actions and capture settings.
- `*-evidence.json`: complete CLI envelope, including the REA Evidence ID.
- `*.png` and `*-screenshot.json`: extracted PNG and its self-verifying artifact; the runner checks byte length and SHA-256 before saving.
- `*-stderr.log`: CLI diagnostics without dumping the ambient environment.
- `comparison-*-evidence.json`: the real `compare-web-screenshots` result at channel threshold 12.
- `index.json`: compact finding ledger linking evidence IDs, screenshot digests, completeness, owned-browser cleanup, page errors, limitations and failures.

The runner returns nonzero for failed steps, missing/incomplete captures, page errors, unverified browser cleanup or failed comparisons. It also refuses to mix a new run into an existing output directory. Failed-command output remains available for diagnosis. A timeout terminates only the runner's owned CLI process group; inspect the resulting evidence because a timeout cannot establish normal provider cleanup.

## 6. Review the evidence and improve the UI

Open both screenshots at each width alongside the rendered pages. Read `index.json`, the referenced evidence records and the reference asset manifest together. A complete capture means the requested artifacts were collected; it does not mean the reconstructed interface is identical.

REA 6.5.0 reports the differing-pixel fraction as `normalized_result.changed_ratio`. For example, `0.10` means 10% of compared viewport pixels exceeded the per-channel threshold. It is **not** a semantic similarity rating. White space, text changes, logo differences, font rasterization and animation timing all influence this value. A lower ratio can guide review, but does not replace checking spacing, typography, navigation, responsive behavior and actual workflows.

Keep three categories explicit in review notes:

- **Observed:** public markup, measured layout, downloaded fonts/images, screenshot pixels, and the declared REA action results.
- **Implementation choices:** FinAI branding, synthetic customers/records, local demo labels, original component illustrations and working accounting routes.
- **Unknown:** authenticated Rillet screens, real accounting service behavior, script-driven reference animations and any route not captured in the scenario.

Make focused CSS/component changes and rerun into a new artifact directory. Use FinAI's existing regression tests to verify behavior; the two homepage viewport comparisons do not validate all application routes or ledger calculations. Keep raw runtime captures under ignored `artifacts/` because evidence can contain rendered page content. Copy only deliberate, reviewed evidence summaries/screenshots into documentation.

## 7. Review changes, then push authorized work

```bash
cd /workspace/New-FInAI
git diff --check
git status --short
git diff -- frontend
```

After reviewing the intended frontend changes and their checks, stage those exact paths and commit them. Push to the user's selected branch only when that publication is authorized. For this FinAI task the user explicitly requested pushing the completed work to the connected GitHub repository; the project workflow publishes the reviewed commit with `git push origin HEAD:main`. Confirm the remote commit matches the local one. Do not commit `node_modules`, temporary reference downloads or unreviewed raw evidence.

Stop the temporary reference server and preview with Ctrl-C when inspection is finished. Successful REA launch-mode evidence should report `browser.cleanup: "terminated-owned-process"`; this is separate from stopping the two servers you started.
