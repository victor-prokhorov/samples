# Restore a backup

Owner: on-call engineer

## Steps

### 1. Restore
```sh
ops/psql.sh < .run/backup.sql
```

## Verification

Check that the portal works.
```sh
curl -fsS http://localhost:53041/health
```
