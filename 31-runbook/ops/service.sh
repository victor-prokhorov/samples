#!/usr/bin/env bash
# usage: service.sh start <version> | stop | status
set -euo pipefail
mkdir -p .run
case "$1" in
  start)
    APP_VERSION="$2" nohup node --import tsx src/app.ts >> .run/app.log 2>&1 &
    echo $! > .run/app.pid
    for _ in $(seq 50); do curl -fsS localhost:53041/health >/dev/null 2>&1 && { echo "started $2 (pid $(cat .run/app.pid))"; exit 0; }; sleep 0.1; done
    echo "service did not become healthy" >&2; exit 1 ;;
  stop)
    if [ -f .run/app.pid ] && kill "$(cat .run/app.pid)" 2>/dev/null; then
      while kill -0 "$(cat .run/app.pid)" 2>/dev/null; do sleep 0.05; done
      echo "stopped pid $(cat .run/app.pid)"
    else echo "not running"; fi
    rm -f .run/app.pid ;;
  status) curl -fsS localhost:53041/health; echo ;;
esac
