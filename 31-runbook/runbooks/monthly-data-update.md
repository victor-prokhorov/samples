# Monthly data update

Load the contributions file the employers send each month. Sample 27 shows the full import (staging, rejects, dry run, diff); this runbook is the operating procedure around it.

Owner: data operations
Parameters: FILE (the CSV, e.g. data/contributions-2026-09.csv), PERIOD (e.g. 2026-09)

## Preconditions

### 1. The file is there and has not been loaded before
```sh
test -f "$FILE"
sha=$(sha256sum "$FILE" | cut -d' ' -f1)
loaded=$(ops/psql.sh -c "SELECT count(*) FROM import_batches WHERE sha256 = '$sha'")
echo "sha256 ${sha:0:12}, batches already loaded from this file: $loaded"
test "$loaded" = 0
```

### 2. Every row is for the period being loaded
```sh
test "$(tail -n +2 "$FILE" | cut -d, -f2 | sort -u)" = "$PERIOD"
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
ops/psql.sh <<SQL
BEGIN;
INSERT INTO import_batches (period, file, sha256, rows, total)
  SELECT '$PERIOD', '$FILE', '$sha', count(*), sum(amount) FROM staging_contributions;
INSERT INTO contributions (member_id, period, amount, batch_id)
  SELECT member_id, period, amount, currval('import_batches_id_seq') FROM staging_contributions;
COMMIT;
SQL
```

## Verification

### 1. Control total: the database matches the file
```sh
file_total=$(tail -n +2 "$FILE" | awk -F, '{ s += $3 } END { printf "%.2f", s }')
db_total=$(ops/psql.sh -c "SELECT sum(amount) FROM contributions WHERE period = '$PERIOD'")
echo "file $file_total, database $db_total"
test "$file_total" = "$db_total"
```

## Rollback

### 1. Remove the batch
```sh
ops/psql.sh -c "DELETE FROM contributions WHERE period = '$PERIOD'; DELETE FROM import_batches WHERE period = '$PERIOD'"
```
