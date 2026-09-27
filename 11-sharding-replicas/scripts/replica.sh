#!/usr/bin/env bash
set -euo pipefail
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  chmod 700 "$PGDATA"
  until pg_basebackup -d "host=$PRIMARY_HOST user=replicator password=replicator application_name=$HOSTNAME" -D "$PGDATA" -R -X stream; do
    rm -rf "${PGDATA:?}"/*
    sleep 1
  done
fi
exec postgres -c hot_standby=on
