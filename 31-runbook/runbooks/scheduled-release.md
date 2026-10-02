# Scheduled release

Deploy a new version of the member service and the schema migration it needs, in the agreed release window (Tuesdays 06:00-08:00, announced to employers a week ahead).

Owner: on-call engineer
Parameters: VERSION (the release, e.g. v2), MIGRATION (the schema version that release needs, e.g. 2)

## Preconditions

### 1. The database is reachable
```sh
ops/psql.sh -c "SELECT 1" >/dev/null
```

### 2. The release has its migration
```sh
ls migrations/$(printf '%03d' "$MIGRATION")_*.up.sql migrations/$(printf '%03d' "$MIGRATION")_*.down.sql
```

### 3. No change freeze is in force
```sh
test ! -f .run/freeze
```

## Steps

### 1. Record the running release, so rollback knows where to return
```sh
mkdir -p .run
if [ -f .run/current ]; then cp .run/current .run/previous; else printf 'VERSION=none\nMIGRATION=0\n' > .run/previous; fi
cat .run/previous
```

### 2. Back up the database
```sh
docker compose exec -T postgres pg_dump -U postgres --clean --if-exists > ".run/backup-before-$VERSION.sql"
wc -c ".run/backup-before-$VERSION.sql"
```

### 3. Migrate the schema
Migrations are additive (expand/contract, sample 02), so the running version keeps working on the new schema.
```sh
npx tsx ops/migrate.ts up "$MIGRATION"
```

### 4. Restart the service on the new version
```sh
ops/service.sh stop
ops/service.sh start "$VERSION"
```

### 5. Smoke test
```sh
ops/smoke.sh "$VERSION"
```

### 6. Record the new release
```sh
printf 'VERSION=%s\nMIGRATION=%s\n' "$VERSION" "$MIGRATION" > .run/current
```

## Verification

### 1. The service reports the new version
```sh
ops/service.sh status | grep -q "\"version\":\"$VERSION\""
```

### 2. The schema is at the release's migration
```sh
test "$(ops/psql.sh -c 'SELECT max(version) FROM schema_migrations')" = "$MIGRATION"
```

## Rollback

### 1. Roll back to the recorded release
The same procedure an engineer runs by hand: [rollback.md](rollback.md).
```sh
npx tsx src/runner.ts runbooks/rollback.md --operator "$RUNBOOK_OPERATOR" --parent "$RUNBOOK_RUN_ID"
```
