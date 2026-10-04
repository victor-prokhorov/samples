# Backup and restore drill

Prove that the backups restore, before the day they have to: take a base backup, keep working, lose data on purpose (a DELETE without its WHERE clause), find the transaction that lost it in the WAL archive, restore a copy to just before that transaction in a fresh container, check the copy row by row, put the lost rows back, and measure what was lost (RPO) and how long it took (RTO) against the targets. Run it every quarter, on a test copy of production, by whoever is next on call.

Owner: on-call engineer
Parameters: RPO_TARGET (seconds of writes the service may lose, e.g. 60, the archive_timeout), RTO_TARGET (seconds from noticing the loss to the data being back, e.g. 300)

## Preconditions

### 1. WAL archiving is on and has never failed
Without the archive, a restore can only go back to the base backup: every write since then is lost.
```sh
ops/psql.sh -c "SELECT 'archive_mode ' || current_setting('archive_mode') || ', segments archived ' || archived_count || ', failed ' || failed_count FROM pg_stat_archiver"
test "$(ops/psql.sh -c "SELECT current_setting('archive_mode') = 'on' AND failed_count = 0 FROM pg_stat_archiver")" = t
```

### 2. No restore container is left from an earlier drill
```sh
test -z "$(docker compose --profile drill ps -aq restore)"
```

## Steps

### 1. Take a base backup
pg_basebackup copies the data directory of the running server; the WAL archive then holds every change made after it. The fingerprint (rows and md5 per table) is what restoring this backup alone would give back.
```sh
rm -rf .run/drill && mkdir -p .run/drill
docker compose exec -T -u postgres postgres bash -c 'rm -rf /drill/base && pg_basebackup -D /drill/base -X stream -c fast'
docker compose exec -T postgres cat /drill/base/backup_label > .run/drill/backup_label
sed -n 's/^START WAL LOCATION: \([^ ]*\).*/\1/p' .run/drill/backup_label > .run/drill/start-lsn
ops/psql.sh -c "SELECT extract(epoch FROM clock_timestamp())" > .run/drill/backup-at
ops/psql.sh < ops/fingerprint.sql > .run/drill/at-backup
echo "base backup $(docker compose exec -T postgres du -sh /drill/base | cut -f1), WAL from $(cat .run/drill/start-lsn)"
cat .run/drill/at-backup
```

### 2. Keep working: the monthly load and a member request run after the backup
```sh
npx tsx src/runner.ts runbooks/monthly-data-update.md --set FILE=data/contributions-2026-10.csv --set PERIOD=2026-10 --operator "$RUNBOOK_OPERATOR" --parent "$RUNBOOK_RUN_ID"
npx tsx src/runner.ts runbooks/user-request.md --set MEMBER_ID=3 --set NEW_EMAIL=carol@initech.example --set TICKET=SUP-1050 --yes --operator "$RUNBOOK_OPERATOR" --parent "$RUNBOOK_RUN_ID"
```

### 3. Record the state the restore must give back
In a real incident nobody has this: the drill keeps it to prove the restore lost nothing.
```sh
ops/psql.sh < ops/fingerprint.sql | tee .run/drill/expected
```

### 4. Lose data: a DELETE without its WHERE clause
```sh
ops/psql.sh -c "SELECT count(*) || ' contributions before' FROM contributions"
ops/psql.sh -c "DELETE FROM contributions"
ops/psql.sh -c "SELECT count(*) || ' contributions after' FROM contributions"
```

### 5. Find the transaction that lost the data
The RTO clock starts: the loss has been noticed. Close the current WAL segment so the archiver ships it, then read the archive with pg_waldump: the DELETE records on the contributions table, and the commit of their transaction.
```sh
date +%s.%N > .run/drill/clock-started
end=$(ops/psql.sh -c "SELECT pg_current_wal_lsn()")
seg=$(ops/psql.sh -c "SELECT pg_walfile_name(pg_current_wal_lsn())")
ops/psql.sh -c "SELECT pg_switch_wal()" >/dev/null
for _ in $(seq 100); do
  test "$(ops/psql.sh -v seg="$seg" <<'SQL'
SELECT coalesce(last_archived_wal >= :'seg', false) FROM pg_stat_archiver
SQL
)" = t && break
  sleep 0.1
done
rel=$(ops/psql.sh -c "SELECT dattablespace || '/' || oid || '/' || pg_relation_filenode('contributions') FROM pg_database WHERE datname = current_database()")
waldump() { docker compose exec -T -u postgres postgres pg_waldump -p /drill/wal -s "$(cat .run/drill/start-lsn)" -e "$end" "$@"; }
waldump --rmgr=Heap --relation="$rel" > .run/drill/heap.txt
grep 'desc: DELETE' .run/drill/heap.txt | sed -E 's/.*tx: *([0-9]+),.*/\1/' | uniq -c | awk '{ print $1 " DELETE records on contributions in transaction " $2 }'
xid=$(grep 'desc: DELETE' .run/drill/heap.txt | tail -1 | sed -E 's/.*tx: *([0-9]+),.*/\1/')
[[ "$xid" =~ ^[0-9]+$ ]]
echo "$xid" > .run/drill/xid
waldump --rmgr=Transaction --xid="$xid" | grep -o 'COMMIT [0-9-]* [0-9:.]* [A-Z]*' | tee .run/drill/loss-commit
```

### 6. Restore a copy to just before that transaction, in a fresh container
The fresh server starts from the base backup, replays the archived WAL and stops before the DELETE commits (recovery_target_xid, not inclusive), then promotes itself.
```sh
docker compose exec -T postgres bash -c 'cat > /drill/recovery.conf' <<EOF
restore_command = 'cp /drill/wal/%f %p'
recovery_target_xid = '$(cat .run/drill/xid)'
recovery_target_inclusive = off
recovery_target_action = 'promote'
EOF
docker compose --profile drill up -d restore 2>&1 | tail -1
restored() { docker compose exec -T restore psql -U postgres -v ON_ERROR_STOP=1 -qtAX "$@"; }
for _ in $(seq 300); do test "$(restored -c 'SELECT NOT pg_is_in_recovery()' 2>/dev/null)" = t && break; sleep 0.2; done
test "$(restored -c 'SELECT NOT pg_is_in_recovery()')" = t
docker compose logs restore 2>&1 | grep -oE '(starting point-in-time recovery|recovery stopping before commit of transaction|redo done at|selected new timeline ID|database system is ready to accept connections).*' | sed 's/ system usage.*//'
restored -c "SELECT extract(epoch FROM pg_last_xact_replay_timestamp())" > .run/drill/recovered-at
```

### 7. Check the copy before trusting it
```sh
docker compose exec -T restore psql -U postgres -v ON_ERROR_STOP=1 -qtAX < ops/fingerprint.sql > .run/drill/restored
cat .run/drill/restored
diff .run/drill/expected .run/drill/restored
echo "the restored copy matches the state before the loss, table by table"
```

### 8. Put the lost rows back
Copy the table out of the restored copy and insert what is missing, in one transaction; rows that are still there are left alone.
```sh
docker compose exec -T restore psql -U postgres -v ON_ERROR_STOP=1 -qtAX -c "COPY contributions TO STDOUT" > .run/drill/contributions.copy
{
  printf 'BEGIN;\nCREATE TEMP TABLE recovered (LIKE contributions);\nCOPY recovered FROM STDIN;\n'
  cat .run/drill/contributions.copy
  printf '\\.\n'
  printf "WITH put AS (INSERT INTO contributions SELECT * FROM recovered ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) || ' rows put back' FROM put;\nCOMMIT;\n"
} | ops/psql.sh
```

### 9. Remove the restore container
```sh
docker compose --profile drill rm -sfv restore 2>&1 | tail -1
```

## Verification

### 1. The live database matches the state before the loss
```sh
ops/psql.sh < ops/fingerprint.sql > .run/drill/after
diff .run/drill/expected .run/drill/after
echo "live database matches, table by table: $(paste -sd';' .run/drill/after | sed 's/ md5 [0-9a-f]*//g; s/;/, /g')"
```

### 2. RPO and RTO are within their targets
RPO: how far before the loss the restore reaches, and what that window holds. RTO: from noticing the loss to the data being back.
```sh
loss=$(date -d "$(sed 's/^COMMIT //' .run/drill/loss-commit)" +%s.%N)
rto=$(awk -v a="$(cat .run/drill/clock-started)" -v b="$(date +%s.%N)" 'BEGIN { printf "%.1f", b - a }')
rpo=$(awk -v a="$(cat .run/drill/recovered-at)" -v b="$loss" 'BEGIN { printf "%.1f", b - a }')
base=$(awk -v a="$(cat .run/drill/backup-at)" -v b="$loss" 'BEGIN { printf "%.1f", b - a }')
lost=$(diff .run/drill/expected .run/drill/after | grep -c '^>' || true)
echo "RPO ${rpo} s (target ${RPO_TARGET} s): restored to ${rpo} s before the DELETE committed, ${lost} of 4 tables differ from the state before the loss"
echo "RTO ${rto} s (target ${RTO_TARGET} s): from finding the transaction to the rows being back"
echo "the base backup alone would reach back ${base} s and miss what was written since: $(join --nocheck-order .run/drill/at-backup .run/drill/expected | awk '$5 != $9 { printf "%s%s %s", s, $1, $2 == $6 ? "changed (same " $2 " rows)" : $2 " of " $6 " rows"; s = ", " }')"
awk -v rpo="$rpo" -v rto="$rto" -v rpot="$RPO_TARGET" -v rtot="$RTO_TARGET" 'BEGIN { exit !(rpo <= rpot && rto <= rtot) }'
```

## Rollback

### 1. Remove the restore container
The live database is only written by step 8, in one transaction, so a failure before or during it leaves it as the DELETE left it.
```sh
docker compose --profile drill rm -sfv restore 2>&1 | tail -1
```

### 2. Escalate if rows are still missing
```manual
If the drill stopped before step 8, the rows are still missing: keep the service in maintenance mode, restore the base backup and the WAL archive by hand (docs: PostgreSQL "Continuous Archiving and Point-in-Time Recovery"), and record in the ticket why the drill failed. A drill that fails is the point of the drill: fix the backup, not the drill.
```
