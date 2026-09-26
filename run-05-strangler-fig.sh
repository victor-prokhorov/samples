#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/05-strangler-fig.log) 2>&1
cd 05-strangler-fig
echo "# 05-strangler-fig run $(date -u +%FT%TZ)"
echo "== no infra: legacy monolith, new service and routing proxy as three real HTTP servers =="
npm install --silent --no-audit --no-fund
npm run --silent start
