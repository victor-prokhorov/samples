#!/usr/bin/env bash
# usage: smoke.sh <expected version>; the few requests that prove a release serves members
set -euo pipefail
health=$(curl -fsS localhost:53041/health)
echo "GET /health -> $health"
grep -q "\"version\":\"$1\"" <<<"$health" || { echo "expected version $1" >&2; exit 1; }
member=$(curl -sS -w ' %{http_code}' localhost:53041/members/1)
echo "GET /members/1 -> $member"
[[ "$member" == *' 200' ]] || { echo "member page is broken" >&2; exit 1; }
