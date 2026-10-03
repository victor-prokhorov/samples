# 27. Monthly data import from CSV files

**Pain: a monthly data load that duplicates on rerun and half-applies on a bad row.** Employers send CSV files of members and contributions. The first version inserts row by row: running it twice doubles every contribution, and a typo on line 4 leaves lines 2 and 3 applied and the rest missing, so the corrected resend duplicates them. Nobody can say which file produced which row, or whether the table adds up to what the employer sent.

**Reach for it when** files from outside (employers, partners, a legacy export) feed tables you own on a schedule, files can be resent, late, truncated or wrong, and someone has to answer "what did we load from whom, and does it add up".

**Do not reach for it when** the source can call an API one record at a time and get an answer back: validate at the API instead (06, 07). The data is large enough that one transaction per file holds locks too long: load per partition (13) or into a new table and swap it in. The source is a database you can read: stream its changes (10) instead of exporting files.

A loader (`src/importer.ts`) for files named `<employer>-<YYYY-MM>-<members|contributions>[-suffix].csv`, each with a `.ctl` control file declaring its row count (and, for contributions, the amount total). It streams the file with `COPY` into a staging table, validates it in SQL into `import_rejects`, computes a diff, upserts the valid rows on the natural key and records the batch with the file's sha256, all in one transaction. A naive row-by-row loader (`src/naive.ts`) runs first on the same files to show the pain. The files are in `data/`.

## Run

One shot with proof: `./run-27-import.sh` from the repo root (log in [`../logs/27-import.log`](../logs/27-import.log)).

By hand, from this folder (ports: Postgres 55457):

```sh
docker compose up -d --wait
npm i
npm run setup                                               # tables
npm run import -- data/acme-2026-08-members.csv             # apply one file
npm run import -- --dry-run data/acme-2026-09-members.csv   # rejects and diff, rolled back
npm run demo                                                # the whole scenario (on a fresh database)
```

## Files

- `src/importer.ts` hash and batch row, `COPY ... HEADER match` into a TEMP stage, control count, rules into `import_rejects`, reject threshold, diff (new / changed / unchanged / missing), control total (the amounts that parse must add up to the declared one), upsert with `IS DISTINCT FROM`, batch counts and net amount change; a refused batch keeps its rejects.
- `src/kinds.ts` per file kind: columns, natural key, compared values, typed casts and the validation rules as SQL.
- `src/naive.ts` the row-by-row loader.
- `src/show.ts` prints a report; `src/cli.ts` imports files given on the command line.
- `src/demo.ts` the 9 steps and their checks; `src/setup.ts` the tables.
- `data/` the files employers send, each with its `.ctl`.

## Concepts

- **Natural key**: what identifies a row in the business, here `(employer, member_no)` for a member and `(employer, member_no, period)` for a contribution. It is the target table's primary key, so a duplicate cannot exist whatever the loader does. A surrogate `id SERIAL` alone, as in the naive table, lets every rerun append the same rows again.
- **Staging table and `COPY`**: the file is streamed with `COPY ... FROM STDIN (FORMAT csv, HEADER match)` into a `TEMP` table whose columns are all `text`, plus a `line_no` identity, so a malformed value never aborts the load: it becomes a reject with its line number. `HEADER match` (PostgreSQL 15+) refuses a file whose column names or order differ from what is expected, instead of loading amounts into the period column. `COPY` is one round trip for the whole file, against one per row for `INSERT`.
- **Validation in SQL, rejects with reasons**: each rule is a SQL condition on the staged row (`src/kinds.ts`): types with `pg_input_is_valid` (PostgreSQL 16, no exception on `1987-02-30` or `18O.00`), an ISO date format so `02/03/1987` is not read in the server's DateStyle, referential checks (the member exists for that employer), business rules (the period is the file's month, no negative amounts, the sender is the employer named in the file), and duplicate keys inside the file. One row per broken rule goes to `import_rejects` with the raw line as JSONB, so a line with three problems is reported once with three reasons, and the employer can fix them all in one go.
- **Dry run**: the same code path in a transaction that is rolled back: it prints the rejects, the diff and what the upsert would write, and leaves no row behind (not even the batch row). Operators run it before applying a file that looks unusual.
- **Diff**: valid rows compared to the target on the natural key: new (no row yet), changed (with the old and new value of each changed column), unchanged, and missing (in the target for this employer and month, absent from the file). A missing member is reported, not deleted: absence can mean a leaver or a forgotten line; a leaver is an explicit status the employer sends.
- **Upsert, idempotent**: `INSERT ... ON CONFLICT (natural key) DO UPDATE ... WHERE ROW(columns) IS DISTINCT FROM ROW(EXCLUDED.columns)`. Unchanged rows are not rewritten (no new row version, no dead tuple, no update trigger, and `last_batch_id` keeps pointing at the batch that last changed them), and `RETURNING (xmax = 0)` counts inserts against updates.
- **One transaction per file**: the batch row, the rejects and the upsert commit together, so a crash or a refused file leaves nothing half-applied. `pg_advisory_xact_lock` on the employer and file kind serialises two imports of the same feed.
- **Batch record and file hash**: every file gets an `import_batches` row with its sha256 and counts. A partial unique index (`UNIQUE (sha256) WHERE status = 'applied'`) allows one applied batch per content, so the same file again, even renamed, is a no-op (`INSERT ... ON CONFLICT DO NOTHING`). A refused file is recorded with its reason and its rejects, and can be sent again once fixed.
- **Control totals and reconciliation**: the sender declares the row count and the amount total in a control file. A count that differs means a truncated or padded file and refuses it whole. A contributions file whose `.ctl` has no `amount=` is refused: its total cannot be verified. The declared amount must equal the sum of every amount that parses, accepted or rejected; an amount that does not parse (`18O.00`) cannot be counted, so a file with one passes only if the sender's total left it out too, and is otherwise refused with a control-total mismatch. After the load, the target is reconciled with the batch log without assuming each file replaces the month: only batches write contributions, by insert or update and never delete, so per employer and month the rows equal the sum of what each applied batch inserted, and the amount total equals the sum of each batch's net change (`amount_net`: new minus old amount over the rows it wrote). Each row's `last_batch_id` must also point at an applied batch of its employer and month.
- **Whole-file refusal**: valid rows are applied and rejects reported, unless the file's shape is wrong: wrong header, row count mismatch, more than half the rows rejected (here: Globex sent contributions before its members file), or a control total that does not add up. Applying 0 of 3 rows would only hide the real problem. The refused batch keeps its rejects: the transaction that wrote them is rolled back, so they are written again under the refused batch's id, and the employer gets every reason.
- **Trade-offs**: rules in SQL are fast and set-based but harder to unit-test than code; keep them in one declarative list. Applying valid rows while rejecting others means a month can be partly loaded until the corrected file arrives; when that is not acceptable (a payroll run), refuse any file with a reject. A big file in one transaction holds row locks on the rows it touches until commit; load into a new table and swap it in, or apply per employer and month. Batch ids have gaps: a rolled-back or skipped `INSERT` still uses a sequence value.

## Proof (`logs/27-import.log`)

The naive loader: a rerun doubles the rows and the total; a bad line half-applies the file, and the corrected resend duplicates what had been committed:

```
   run 1: inserted 6 -> naive_contributions has 6 rows, total 1500.75
   run 2: inserted 6 -> naive_contributions has 12 rows, total 3001.50
   acme-2026-09-contributions.csv: inserted 2, then line 4: invalid input syntax for type numeric: "18O.00"
   naive_contributions: 2 rows (half-applied), total 560.50
   corrected file resent: inserted 6 -> 8 rows, total 1736.00 (the file says 1175.50); duplicated: M0001 x2, M0002 x2
```

The dry run of September's members file: one reject with its reason, the diff with the changed column, and nothing written:

```
   acme-2026-09-members.csv [sha256 c1f47ccd29c0] -> DRY RUN (rolled back)
     rows: declared 6, received 6, rejected 1
     reject line 5 [birth_date] birth_date '1987-02-30' is not a YYYY-MM-DD date
     diff: new 1 ["M0007"], changed 1, unchanged 3, missing 1 ["M0004"]
       changed M0001 email: alice@acme.example -> alice.martin@acme.example
     upsert: inserted 1, updated 1
   members after the dry run: 6 rows, M0001 email still alice@acme.example; batches applied: 2
```

September's contributions: five valid rows applied, line 8 rejected for three reasons at once, and the control total matching the amounts that parse (the employer's total, 1075.50, left out the unreadable `18O.00` too):

```
   acme-2026-09-contributions.csv [sha256 add34e1f776c] -> APPLIED batch 5
     rows: declared 8, received 8, rejected 3
     reject line 4 [amount_type] amount '18O.00' is not a number
     reject line 8 [amount_sign] amount -120.00 is negative: corrections are sent as a corrected file, not a negative line
     reject line 8 [member] member M0009 is unknown for acme: send the members file first
     reject line 8 [period] period '2026-08' is not the file period 2026-09
     reject line 9 [duplicate] duplicate key, first seen on line 6
     diff: new 5 ["M0001/2026-09","M0002/2026-09","M0005/2026-09","M0006/2026-09","M0007/2026-09"], changed 0, unchanged 0, missing 0 []
     control total: declared 1075.50, amounts that parse 1075.50 (accepted 995.50 + rejected 80.00); 1 amount(s) not a number, counted on neither side
     upsert: inserted 5, updated 0
```

The same file again, and the same bytes under another name, then the corrected full month: one row inserted, five unchanged, no duplicate:

```
   acme-2026-09-contributions.csv [sha256 add34e1f776c] -> ALREADY APPLIED batch 5: same bytes as batch 5 (acme-2026-09-contributions.csv)
   acme-2026-09-contributions-resent.csv [sha256 add34e1f776c] -> ALREADY APPLIED batch 5: same bytes as batch 5 (acme-2026-09-contributions.csv)
   acme-2026-09-contributions-v2.csv [sha256 80ebe2eca757] -> APPLIED batch 8
     rows: declared 6, received 6, rejected 0
     diff: new 1 ["M0003/2026-09"], changed 0, unchanged 5, missing 0 []
     control total: declared 1175.50, amounts that parse 1175.50 (accepted 1175.50 + rejected 0)
     upsert: inserted 1, updated 0
```

Files refused as a whole: wrong columns, a truncated file, contributions for members not yet loaded, and an October file whose control total counts an amount that does not parse; the refused batches keep their rejects:

```
   initech-2026-09-contributions.csv [sha256 c932638267eb] -> REFUSED batch 10: COPY refused the file: column name mismatch in header line field 3: got "amount", expected "period"
   initech-2026-09-members.csv [sha256 9fc5704c1045] -> REFUSED batch 12: control count: the .ctl declares 5 rows, the file has 3 (truncated or padded file)
     rows: declared 5, received 3, rejected 0
   globex-2026-09-contributions.csv [sha256 59add450c029] -> REFUSED batch 14: 3 of 3 rows rejected, over the 50% threshold: nothing applied
     rows: declared 3, received 3, rejected 3
     reject line 2 [member] member M1001 is unknown for globex: send the members file first
     reject line 3 [member] member M1002 is unknown for globex: send the members file first
     reject line 4 [member] member M1003 is unknown for globex: send the members file first
   acme-2026-10-contributions.csv [sha256 a2e669c007ff] -> REFUSED batch 16: control total: the .ctl declares 1175.50, the amounts that parse add up to 1035.50 (1 amount(s) not a number: the total cannot be verified)
     rows: declared 6, received 6, rejected 1
     reject line 5 [amount_type] amount '14O.00' is not a number
     diff: new 5 ["M0001/2026-10","M0002/2026-10","M0003/2026-10","M0006/2026-10","M0007/2026-10"], changed 0, unchanged 0, missing 0 []
     control total: declared 1175.50, amounts that parse 1035.50 (accepted 1035.50 + rejected 0); 1 amount(s) not a number, counted on neither side
   rejects stored for the refused batches: batch 14: 3, batch 16: 1
```

Reconciliation, from every applied batch of the month (September is the first file plus the corrected one), and the batch log it is checked against:

```
   acme 2026-08: batch 2 inserted 6 = 6 rows, net 1500.75 = 1500.75; contributions has 6 rows / 1500.75 -> reconciled
   acme 2026-09: batch 5 + 8 inserted 5 + 1 = 6 rows, net 995.50 + 180.00 = 1175.50; contributions has 6 rows / 1175.50 -> reconciled
   every contribution: last_batch_id is an applied contributions batch of the same employer and month
   every applied batch: rows received = accepted + rejected

 id |             file_name             |    sha256    | status  | declared | received | accepted | rejected | inserted | updated | unchanged | missing | amount_declared | amount_accepted | amount_rejected | amount_net 
----+-----------------------------------+--------------+---------+----------+----------+----------+----------+----------+---------+-----------+---------+-----------------+-----------------+-----------------+------------
  1 | acme-2026-08-members.csv          | 9c01b120571a | applied |        6 |        6 |        6 |        0 |        6 |       0 |         0 |       0 |                 |                 |                 |           
  2 | acme-2026-08-contributions.csv    | 0e8f87ee05b7 | applied |        6 |        6 |        6 |        0 |        6 |       0 |         0 |       0 |         1500.75 |         1500.75 |            0.00 |    1500.75
  4 | acme-2026-09-members.csv          | c1f47ccd29c0 | applied |        6 |        6 |        5 |        1 |        1 |       1 |         3 |       1 |                 |                 |                 |           
  5 | acme-2026-09-contributions.csv    | add34e1f776c | applied |        8 |        8 |        5 |        3 |        5 |       0 |         0 |       0 |         1075.50 |          995.50 |           80.00 |     995.50
  8 | acme-2026-09-contributions-v2.csv | 80ebe2eca757 | applied |        6 |        6 |        6 |        0 |        1 |       0 |         5 |       0 |         1175.50 |         1175.50 |            0.00 |     180.00
 10 | initech-2026-09-contributions.csv | c932638267eb | refused |        1 |          |          |        0 |          |         |           |         |          150.00 |                 |                 |           
 12 | initech-2026-09-members.csv       | 9fc5704c1045 | refused |        5 |        3 |          |        0 |          |         |           |         |                 |                 |                 |           
 14 | globex-2026-09-contributions.csv  | 59add450c029 | refused |        3 |        3 |          |        3 |          |         |           |         |          985.00 |                 |                 |           
 16 | acme-2026-10-contributions.csv    | a2e669c007ff | refused |        6 |        6 |          |        1 |          |         |           |         |         1175.50 |                 |                 |           
(9 rows)
```

## Origins and further reading

- Book: *The Data Warehouse ETL Toolkit*, Ralph Kimball and Joe Caserta, 2004 (staging, data quality screens, error event tables, audit dimensions). https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/data-warehouse-dw-etl-toolkit/
- Docs: `COPY`, PostgreSQL 16 (`FORMAT csv`, `HEADER MATCH`). https://www.postgresql.org/docs/16/sql-copy.html
- Docs: `INSERT ... ON CONFLICT`, PostgreSQL 16. https://www.postgresql.org/docs/16/sql-insert.html#SQL-ON-CONFLICT
- Docs: `pg_input_is_valid` and `pg_input_error_info`, PostgreSQL 16. https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-INFO-VALIDITY
- Docs: "Populating a Database", PostgreSQL 16 (why `COPY` beats row-by-row `INSERT`). https://www.postgresql.org/docs/16/populate.html
- Article: "Idempotence Is Not a Medical Condition", Pat Helland, ACM Queue, 2012. https://queue.acm.org/detail.cfm?id=2187821
- Docs: `pg-copy-streams`, the Node.js `COPY` stream used here. https://github.com/brianc/node-pg-copy-streams
