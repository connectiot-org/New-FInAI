#!/usr/bin/env bash
# Optional source build for restricted development environments. Does not change Prisma versions or disable verification.
set -euo pipefail
cd "$(dirname "$0")/.."
finai_tools="${FINAI_TOOL_ROOT:-/workspace/.finai-tools}"
finai_commit=c2990dca591cba766e3b7ef5d9e8a84796e47ab7
finai_source="$finai_tools/prisma-engines"
if [ "$(node -p 'require("@prisma/engines-version").enginesVersion')" != "$finai_commit" ]; then
 printf 'Prisma dependency engine version changed; review the source-build pin first.\n' >&2
 exit 1
fi
mkdir -p "$finai_tools"
if [ ! -d "$finai_source/.git" ]; then
 mkdir -p "$finai_source"
 git init -q "$finai_source"
 git -C "$finai_source" remote add origin https://github.com/prisma/prisma-engines.git
 git -C "$finai_source" fetch --depth 1 origin "$finai_commit"
 git -C "$finai_source" checkout --detach FETCH_HEAD
fi
if [ "$(git -C "$finai_source" rev-parse HEAD)" != "$finai_commit" ]; then
 printf 'Existing engine checkout differs from the pinned source; preserve it and use another FINAI_TOOL_ROOT.\n' >&2
 exit 1
fi
if [ -n "$(git -C "$finai_source" status --porcelain --untracked-files=normal)" ]; then
 printf 'Engine source has local changes; refusing to label it as the pinned source build.\n' >&2
 exit 1
fi
export RUSTUP_HOME="$finai_tools/rustup"
export CARGO_HOME="$finai_tools/cargo"
if [ ! -x "$CARGO_HOME/bin/rustup" ]; then
 finai_installer=$(mktemp /tmp/finai-rustup.XXXXXX)
 trap 'rm -f "$finai_installer"' EXIT
 curl --fail --silent --show-error https://sh.rustup.rs -o "$finai_installer"
 sh "$finai_installer" -y --profile minimal --no-modify-path --default-toolchain 1.90.0
else
 "$CARGO_HOME/bin/rustup" toolchain install 1.90.0 --profile minimal --no-self-update
fi
(
 cd "$finai_source"
 CARGO_PROFILE_DEV_DEBUG=0 "$CARGO_HOME/bin/cargo" +1.90.0 build --locked -p query-engine-node-api -p schema-engine-cli --jobs "${FINAI_ENGINE_BUILD_JOBS:-3}"
)
cp "$finai_source/target/debug/libquery_engine.so" "$finai_source/target/debug/libquery_engine.node"
"$finai_source/target/debug/schema-engine" --version | rg --fixed-strings "$finai_commit"
node - "$finai_source/target/debug/libquery_engine.node" "$finai_commit" <<'JS'
const assert=require('node:assert/strict');assert.equal(require(process.argv[2]).version().commit,process.argv[3]);
JS
printf 'export PRISMA_QUERY_ENGINE_LIBRARY=%q\nexport PRISMA_SCHEMA_ENGINE_BINARY=%q\n' "$finai_source/target/debug/libquery_engine.node" "$finai_source/target/debug/schema-engine" > "$finai_tools/prisma-env.sh"
printf 'Local pinned engines verified. Source %s/prisma-env.sh before development commands.\n' "$finai_tools"
