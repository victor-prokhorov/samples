#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/30-pipeline" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/30-pipeline.log) 2>&1
cd 30-pipeline
echo "# 30-pipeline run $(date -u +%FT%TZ)"
echo "== fresh state: no pipeline state, cache, artifacts, deployments or downloaded schemas =="
rm -rf .gitlab-ci-local .npm dist reports/coverage .deploy .cache
command -v rsync >/dev/null || { echo "gitlab-ci-local --shell-isolation needs rsync"; exit 1; }
npm install --silent --no-audit --no-fund
(cd ../tools && npm install --silent --no-audit --no-fund)
echo "node $(node --version), gitlab-ci-local $(npx gitlab-ci-local --version), vitest $(npx vitest --version | cut -d' ' -f1 | cut -d/ -f2), shell executor (no Docker images)"
echo "== demo: .gitlab-ci.yml run locally by gitlab-ci-local, one copy of the project per job; the GitHub Actions and Azure Pipelines files compared and validated =="
npm run --silent demo
echo
echo "== proof: the unit job's JUnit artifact (GitLab shows it in the merge request) =="
cat reports/junit.xml
echo "== proof: the unit job's coverage artifact (Cobertura, what GitLab and Azure Pipelines read), totals and per file =="
grep -o '<coverage [^>]*' reports/coverage/cobertura-coverage.xml | grep -o 'line[s-][a-z-]*="[^"]*"\|branch[a-z-]*="[^"]*"' | paste -sd' '
grep -o '<class name="[^"]*" filename="[^"]*" line-rate="[^"]*" branch-rate="[^"]*"' reports/coverage/cobertura-coverage.xml | sed 's/<class //'
echo "== proof: the coverage thresholds the gate enforces (vitest.config.ts) =="
grep -n "thresholds" vitest.config.ts
echo "== proof: the coverage gate in each pipeline file =="
grep -n "vitest run" .gitlab-ci.yml github-actions/ci.yml azure-pipelines.yml
echo "== proof: deployments (one directory per release, current is a symlink) =="
ls -l .deploy .deploy/releases | sed "s#$PWD/##"
for r in .deploy/releases/*; do echo "$r: $(cat "$r/release.json")"; done
echo "== proof: the deploy job's own log, as gitlab-ci-local recorded it =="
sed "s#$PWD/##g" .gitlab-ci-local/output/deploy.log
echo "== proof: screenshots of the coverage report, failed gate then passed =="
ls -l screenshots | awk 'NR > 1 {print $5, $9}'
