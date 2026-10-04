#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/04-parallel-run" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/04-parallel-run.log) 2>&1
cd 04-parallel-run
echo "# 04-parallel-run run $(date -u +%FT%TZ)"
echo "== no infra: legacy and rewritten shipping calculators in one process, 1000 seeded orders =="
npm install --silent --no-audit --no-fund
npm run --silent start
