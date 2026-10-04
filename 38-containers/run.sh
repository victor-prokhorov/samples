#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/38-containers" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/38-containers.log) 2>&1
cd 38-containers
echo "# 38-containers run $(date -u +%FT%TZ)"
echo "== fresh Postgres, no app containers left from an earlier run (docker compose down -v && up) =="
docker rm -f -v 38-containers-blue 38-containers-green >/dev/null 2>&1 || true
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
(cd ../tools && npm install --silent --no-audit --no-fund)
npm run --silent setup

echo "== base image: the Dockerfile pins node:22-slim by digest; fall back only if it cannot be pulled =="
PINNED=node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
if [ -z "${FORCE_FALLBACK:-}" ] && { docker image inspect "$PINNED" >/dev/null 2>&1 || docker pull -q "$PINNED" >/dev/null 2>&1; }; then
  export BASE=""
  export BASE_NOTE="$PINNED (the Dockerfile default; present locally or pulled)"
else
  # Only postgres:16 pulls: make a Debian base with this host's Node 22 binary and npm copied in.
  ctx=$(mktemp -d)
  cp "$(command -v node)" "$ctx/node"
  cp -r "$(dirname "$(readlink -f "$(command -v npm)")")/.." "$ctx/npm"
  docker build -q -t 38-containers-base:node22 -f base/Dockerfile "$ctx" >/dev/null
  rm -rf "$ctx"
  export BASE=38-containers-base:node22
  export BASE_NOTE="FALLBACK 38-containers-base:node22 = postgres:16 + host node $(node -v) (node:22-slim could not be pulled; see base/Dockerfile)"
fi
echo "base: $BASE_NOTE"

# This environment reaches the npm registry through a TLS-intercepting proxy: pass its CA as a build secret.
export NPM_CA="${NODE_EXTRA_CA_CERTS:-}"

echo "== image scanner: trivy, as a container (no binary download needed) =="
TRIVY=mirror.gcr.io/aquasec/trivy:0.75.0
if docker image inspect "$TRIVY" >/dev/null 2>&1 || docker pull -q "$TRIVY" >/dev/null 2>&1; then
  export TRIVY_IMAGE=$TRIVY
  docker volume create trivy-cache-38 >/dev/null
  echo "scanner: $TRIVY ($(docker run --rm "$TRIVY" --version 2>/dev/null | head -1))"
else
  export TRIVY_NOTE="trivy could not be pulled from mirror.gcr.io; scan skipped"
  echo "scanner: none ($TRIVY_NOTE)"
fi
SCANNER=ghcr.io/gitleaks/gitleaks:v8.30.1
if docker image inspect "$SCANNER" >/dev/null 2>&1 || docker pull -q "$SCANNER" >/dev/null 2>&1; then
  export SECRET_SCANNER_IMAGE=$SCANNER
  echo "secret scanner: $SCANNER"
else
  export SECRET_SCANNER_NOTE="gitleaks could not be pulled from ghcr.io; secret scan skipped"
  echo "secret scanner: none ($SECRET_SCANNER_NOTE)"
fi

echo "== demo: build two ways, inspect, scan, then two blue-green cutovers under load through the proxy on :53048 =="
npm run --silent demo
echo
echo "== proof: the images (docker image ls; DISK USAGE counts shared base layers once per image) =="
docker image ls --format 'table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}' | grep -E '^(REPOSITORY|38-containers|node:22|gcr.io/distroless)'
echo "== proof: docker history of the final image (the layers above ARG APP_VERSION are the app's; the rest is the base image) =="
docker history --format '{{.Size}}\t{{.CreatedBy}}' 38-containers-app:1.0.0 | cut -c1-140 | head -12
echo "== proof: the token check, raw: history lines of each image that mention NPM_TOKEN or authToken =="
for img in 38-containers-naive:1.0.0 38-containers-app:1.0.0; do
  n=$(docker history --no-trunc --format '{{.CreatedBy}}' "$img" | grep -c -E 'NPM_TOKEN|authToken' || true)
  echo "$img: $n line(s)"
done
echo "== proof: the running green container (user, healthcheck, state) =="
docker inspect --format 'name={{.Name}} image={{.Config.Image}} user={{.Config.User}} status={{.State.Status}} health={{.State.Health.Status}} failing_streak={{.State.Health.FailingStreak}}' 38-containers-green
docker inspect --format 'name={{.Name}} status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' 38-containers-blue
echo "== proof: green's log =="
docker logs 38-containers-green 2>&1 | tail -4
if [ -n "${TRIVY_IMAGE:-}" ]; then
  echo "== proof: trivy, CRITICAL findings left in the final image (all from the Debian base) =="
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache-38:/root/.cache \
    ${NPM_CA:+-v "$NPM_CA:/etc/ssl/certs/ca-certificates.crt:ro"} "$TRIVY_IMAGE" image --quiet --scanners vuln \
    --severity CRITICAL --format json 38-containers-app:1.0.0 \
    | jq -r '.Results[] | .Target as $t | (.Vulnerabilities // [])[] | "\($t): \(.VulnerabilityID) \(.PkgName) \(.InstalledVersion) fixed=\(.FixedVersion // "none") status=\(.Status)"'
fi
echo "== proof: screenshot of out/switch.html =="
node ../tools/render.mjs html out/switch.html screenshots/switch-timeline.png 1180
ls -l screenshots/switch-timeline.png | awk '{print $5, $9}'
docker rm -f -v 38-containers-blue 38-containers-green >/dev/null
echo "removed the blue and green containers"
