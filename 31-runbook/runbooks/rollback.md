# Roll back a release

Return the member service and its schema to the release recorded in `.run/previous`. Run it by hand when a problem shows up after a release, or let the release runbook run it when a step fails.

Owner: on-call engineer
Parameters: none (reads .run/previous)

## Preconditions

### 1. A previous release is recorded
```sh
cat .run/previous
```

## Steps

### 1. Stop the service
```sh
ops/service.sh stop
```

### 2. Migrate the schema down to the previous release
Down migrations only drop what the failed release added. If it already wrote data there, restore the backup instead.
```sh
. .run/previous
npx tsx ops/migrate.ts down "$MIGRATION"
```

### 3. Start the previous version
```sh
. .run/previous
ops/service.sh start "$VERSION"
```

### 4. Smoke test
```sh
. .run/previous
ops/smoke.sh "$VERSION"
cp .run/previous .run/current
```

## Verification

### 1. The service and schema match the previous release
```sh
. .run/previous
ops/service.sh status | grep -q "\"version\":\"$VERSION\""
test "$(ops/psql.sh -c 'SELECT coalesce(max(version), 0) FROM schema_migrations')" = "$MIGRATION"
```

## Rollback

### 1. Restore the backup taken before the release
Only if the steps above failed: the service stays down until this is done.
```manual
Restore .run/backup-before-<version>.sql with psql, start the previous version with ops/service.sh, and tell the employers' contacts the portal was down.
```
