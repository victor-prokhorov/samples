#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/04-parallel-run.log) 2>&1
cd 04-parallel-run
echo "# 04-parallel-run run $(date -u +%FT%TZ)"
echo "== no infra: legacy and rewritten shipping calculators in one process, 1000 seeded orders =="
npm install --silent --no-audit --no-fund
npm run --silent start
