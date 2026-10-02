# 3. Release on a schedule, with a down migration for every up migration

Date: 2026-09-15

## Status

Accepted

## Context

Partner organisations want to know when the portal may change, and the team is too small to watch a release at any hour. A failed release must be reversible within minutes, by whoever is on call, without restoring a full backup unless data was written in the new shape.

## Decision

Releases go out in a weekly window (Tuesdays 06:00-08:00), through `runbooks/scheduled-release.md`. Schema changes are additive (expand/contract), so the running version keeps working while the schema moves forward, and each migration has a `.down.sql` that removes exactly what its `.up.sql` added. The release runbook takes a backup, migrates, restarts, smoke-tests, and on failure runs `runbooks/rollback.md`.

## Consequences

A broken release is rolled back automatically, in seconds, to the previous version and schema. Down migrations drop columns, so data written to a new column since the release is lost on rollback: if the release has been live long enough to write such data, restore the backup instead (the rollback runbook says so). Urgent fixes outside the window need an explicit exception recorded on the ticket.
