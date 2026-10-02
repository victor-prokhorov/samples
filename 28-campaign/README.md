# 28-campaign

**Pain: a yearly mail-out that sends twice to some members and never to others.** The first version is a loop: render a PDF, send it, next member. It crashes at member 7 and is run again, so members 1 to 7 get two statements. A greylisted mailbox answers `451 try again later`, the loop logs it and moves on, and that member never gets one. Afterwards nobody can say who received what.

**Reach for it when** one job does the same side effect for many people (statements, notices, invoices, reminders, account migrations), it takes longer than a process can be trusted to stay up, and each person must get it exactly once, or at least know when that could not be guaranteed.

**Do not reach for it when** the provider already offers batch sends with an idempotency key per message and a delivery log you can query: then the job table only needs the key and the provider's id. The volume is large enough for a queue (SQS, RabbitMQ, Kafka) with consumers: the same rules apply (idempotency per member and year, a dead-letter queue, backoff), but the claim moves out of Postgres. The messages are transactional and one at a time (a password reset): send them from an outbox (09).

A campaign table `statement_jobs` with one row per (year, member), workers (`src/worker.ts`, separate processes) that claim due rows with `FOR UPDATE SKIP LOCKED` and a lease, render a PDF statement with pdfkit, send it with nodemailer and record the outcome. The SMTP server is a sink built on `smtp-server` (`src/sink.ts`, port 52528) with scripted faults: bob is greylisted twice, carol's mailbox is unknown (550), dan's server answers 451 every time.

```sh
docker compose up -d --wait
npm i
npm run setup                     # 16 members, 12 contributions each for 2025
npm run sink                      # in another terminal: the SMTP sink on :52528
npm run campaign -- enqueue       # one job per member for 2025
npm run campaign -- dry-run 3     # 3 sample PDFs in out/, nothing sent
WORKER=A RATE=5 npm run worker    # run one or several, stop and restart them at will
npm run campaign -- report
npm run demo                      # the whole scenario, with its own sink (stop the one above first; on a fresh database)
```

- `src/worker.ts` claim (`UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)`, lease, attempt count), in-doubt takeover of an expired lease, throttle, send, outcome fenced on `locked_by`, backoff with jitter, dead letter; `CRASH_ON` kills it after SMTP accepted a given member.
- `src/campaign.ts` `enqueue` (idempotent on year + member), `dryRun` (stable sample, files only), `report`.
- `src/statement.ts` the statement data, a deterministic PDF (fixed creation date, uncompressed) and `pdfText` to read it back.
- `src/mailer.ts` the transport, the stable `Message-ID` per year and member, and 4xx-versus-5xx classification.
- `src/sink.ts` the SMTP sink with scripted faults; `src/naive.ts` the loop that shows the pain.
- `src/demo.ts` the 8 steps and their checks; `src/setup.ts` the tables and seed.
- `out/` the dry-run sample PDFs from the last run.

One-shot run with proof: `../run-28-campaign.sh` (log in `../logs/28-campaign.log`). Concepts explained in `../README.md`.
