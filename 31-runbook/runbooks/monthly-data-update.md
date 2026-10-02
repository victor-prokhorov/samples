# Monthly data update

Load the contributions file the employers send each month. Sample 27 shows the full import (staging, rejects, dry run, diff); this runbook is the operating procedure around it.

Owner: data operations
Parameters: FILE (the CSV, e.g. data/contributions-2026-09.csv), PERIOD (e.g. 2026-09)

## Preconditions

### 1. The file is there and has not been loaded before
```sh
test -f "$FILE"
sha=$(sha256sum "$FILE" | cut -d' ' -f1)
loaded=$(ops/psql.sh -v sha="$sha" <<'SQL'
SELECT count(*) FROM import_batches WHERE sha256 = :'sha'
SQL
)
echo "sha256 ${sha:0:12}, batches already loaded from this file: $loaded"
test "$loaded" = 0
```

### 2. Every row is for the period being loaded
```sh
test "$(tail -n +2 "$FILE" | cut -d, -f2 | sort -u)" = "$PERIOD"
```

### 3. No batch is loaded for this period yet
A corrected file for a period already loaded replaces that batch, it is not a second load: first roll back the loaded batch (this runbook's Rollback, with the FILE it was loaded from), then run this runbook with the corrected file.
```sh
batches=$(ops/psql.sh -v period="$PERIOD" <<'SQL'
SELECT coalesce(string_agg('batch ' || id || ' from ' || file, ', '), 'none') FROM import_batches WHERE period = :'period'
SQL
)
echo "already loaded for $PERIOD: $batches"
test "$batches" = none
```

## Steps

### 1. Load the file into staging
```sh
ops/psql.sh -c "TRUNCATE staging_contributions"
tail -n +2 "$FILE" | ops/psql.sh -c "\copy staging_contributions FROM STDIN WITH (FORMAT csv)"
ops/psql.sh -c "SELECT count(*) || ' rows staged' FROM staging_contributions"
```

### 2. Check every member exists
```sh
unknown=$(ops/psql.sh -c "SELECT count(*) FROM staging_contributions s LEFT JOIN members m ON m.id = s.member_id WHERE m.id IS NULL")
echo "unknown members: $unknown"
test "$unknown" = 0
```

### 3. Apply in one transaction and record the batch
```sh
sha=$(sha256sum "$FILE" | cut -d' ' -f1)
ops/psql.sh -v period="$PERIOD" -v file="$FILE" -v sha="$sha" <<'SQL'
BEGIN;
INSERT INTO import_batches (period, file, sha256, rows, total)
  SELECT :'period', :'file', :'sha', count(*), sum(amount) FROM staging_contributions;
INSERT INTO contributions (member_id, period, amount, batch_id)
  SELECT member_id, period, amount, currval('import_batches_id_seq') FROM staging_contributions;
COMMIT;
SQL
```

## Verification

### 1. Control total: this batch matches the file
```sh
sha=$(sha256sum "$FILE" | cut -d' ' -f1)
file=$(tail -n +2 "$FILE" | awk -F, '{ n++; s += $3 } END { printf "%d rows, total %.2f", n, s }')
batch=$(ops/psql.sh -v sha="$sha" <<'SQL'
SELECT count(*) || ' rows, total ' || coalesce(sum(c.amount), 0) FROM import_batches b JOIN contributions c ON c.batch_id = b.id WHERE b.sha256 = :'sha'
SQL
)
echo "file $file; batch $batch"
test "$file" = "$batch"
```

## Rollback

### 1. Remove this batch, and only this batch
```sh
sha=$(sha256sum "$FILE" | cut -d' ' -f1)
ops/psql.sh -v sha="$sha" <<'SQL'
BEGIN;
DELETE FROM contributions WHERE batch_id = (SELECT id FROM import_batches WHERE sha256 = :'sha');
DELETE FROM import_batches WHERE sha256 = :'sha';
COMMIT;
SQL
```
