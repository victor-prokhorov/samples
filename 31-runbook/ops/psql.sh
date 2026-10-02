#!/usr/bin/env bash
# psql inside the compose Postgres, unaligned and quiet, failing on the first error
exec docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -qtAX "$@"
