#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/30-pipeline.log) 2>&1
cd 30-pipeline
echo "# 30-pipeline run $(date -u +%FT%TZ)"
echo "== fresh state: no pipeline state, cache, artifacts or deployments =="
rm -rf .gitlab-ci-local .npm dist reports .deploy src/oops.ts
command -v rsync >/dev/null || { echo "gitlab-ci-local --shell-isolation needs rsync"; exit 1; }
npm install --silent --no-audit --no-fund
echo "node $(node --version), gitlab-ci-local $(npx gitlab-ci-local --version), shell executor (no Docker images)"
echo "== demo: .gitlab-ci.yml run locally by gitlab-ci-local, one copy of the project per job =="
npm run --silent demo
echo
echo "== proof: the unit job's JUnit artifact (GitLab shows it in the merge request) =="
cat reports/junit.xml
echo "== proof: deployments (one directory per release, current is a symlink) =="
ls -l .deploy .deploy/releases | sed "s#$PWD/##"
for r in .deploy/releases/*; do echo "$r: $(cat "$r/release.json")"; done
echo "== proof: the deploy job's own log, as gitlab-ci-local recorded it =="
sed "s#$PWD/##g" .gitlab-ci-local/output/deploy.log
