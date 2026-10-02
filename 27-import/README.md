# 27-import

**Pain: a monthly data load that duplicates on rerun and half-applies on a bad row.** Employers send CSV files of members and contributions. The first version inserts row by row: running it twice doubles every contribution, and a typo on line 4 leaves lines 2 and 3 applied and the rest missing, so the corrected resend duplicates them. Nobody can say which file produced which row, or whether the table adds up to what the employer sent.

**Reach for it when** files from outside (employers, partners, a legacy export) feed tables you own on a schedule, files can be resent, late, truncated or wrong, and someone has to answer "what did we load from whom, and does it add up".

**Do not reach for it when** the source can call an API with one record at a time and get an answer back: validate at the API instead (06, 07). The data is large enough that a single transaction per file holds locks too long: load per partition or per employer and month, or use a swap table. The source is a database you can read: use CDC (10) instead of exported files.

A loader (`src/importer.ts`) for files named `<employer>-<YYYY-MM>-<members|contributions>[-suffix].csv`, each with a `.ctl` control file declaring its row count (and amount total for contributions). It streams the file with `COPY` into a staging table, validates it in SQL into `import_rejects`, prints a diff, upserts the valid rows on the natural key, and records the batch with the file's sha256, all in one transaction. A naive row-by-row loader (`src/naive.ts`) runs first to show the pain. The files are in `data/`.

```sh
docker compose up -d --wait
npm i
npm run setup                                               # tables
npm run import -- data/acme-2026-08-members.csv             # apply one file
npm run import -- --dry-run data/acme-2026-09-members.csv   # rejects and diff, rolled back
npm run demo                                                # the whole scenario (on a fresh database)
```

- `src/importer.ts` hash and batch row, `COPY ... HEADER match` into a TEMP stage, control count, rules into `import_rejects`, reject threshold, diff (new / changed / unchanged / missing), control total, upsert with `IS DISTINCT FROM`, batch counts.
- `src/kinds.ts` per file kind: columns, natural key, compared values, typed casts and the validation rules as SQL.
- `src/naive.ts` the row-by-row loader.
- `src/show.ts` prints a report; `src/cli.ts` imports files given on the command line.
- `src/demo.ts` the 9 steps and their checks; `src/setup.ts` the tables.
- `data/` the files employers send, each with its `.ctl`.

One-shot run with proof: `../run-27-import.sh` (log in `../logs/27-import.log`). Concepts explained in `../README.md`.
