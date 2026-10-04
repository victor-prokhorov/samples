# Onboarding checklist

For a new member of the portal team. Tick each item in your first two weeks; ask your buddy when one is unclear.

## Week 1: understand

- [ ] Read the decision records: [0001](adr/0001-record-architecture-decisions.md), [0002](adr/0002-executable-runbooks.md), [0003](adr/0003-scheduled-releases-with-down-migrations.md).
- [ ] Read the five runbooks: [scheduled release](../runbooks/scheduled-release.md), [rollback](../runbooks/rollback.md), [monthly data update](../runbooks/monthly-data-update.md), [member request](../runbooks/user-request.md), [backup and restore drill](../runbooks/backup-restore-drill.md).
- [ ] Start the stack (`docker compose up -d --wait`) and run `npm run docs-lint`.
- [ ] Get read access to the production database and the support queue (ask the service owner).

## Week 2: operate, with your buddy watching

- [ ] Handle one member request with `npm run runbook -- runbooks/user-request.md`.
- [ ] Shadow a scheduled release, then run the next one yourself.
- [ ] Run the rollback runbook against a test environment.
- [ ] Run the backup and restore drill against a test environment, and write down the RPO and RTO it measured.
- [ ] Improve one runbook: automate a manual step, or fix what was unclear to you.
