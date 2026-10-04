# 07. File upload API with ETags

**Pain: a file API that loses writes, duplicates creates and serves torn downloads.** A client retries a create that timed out and gets two files. Two clients read version 1 and both write, and the second silently erases the first. A download resumed after the file changed splices the start of the old bytes onto the end of the new ones. A client syncing "what changed since" on `updated_at` never sees a change whose transaction committed late.

**Reach for it when** clients create, overwrite and download files (or any resource) over HTTP, retry on timeouts, cache what they read, resume large downloads, or keep a local copy in sync with a change feed.

**Do not reach for it when** the files are large or numerous: keep the bytes in object storage (S3, GCS), make `upload_file_url` a presigned URL the client uploads to directly, and keep only the metadata, version and state machine here; multipart or tus uploads handle resuming uploads. Only one writer ever touches a file: `If-Match` still costs nothing, but the lost update cannot happen. A client needs every change as an event, in order and pushed: publish them through an outbox (09) instead of polling a feed.

An Express 5 API (`src/server.ts`), a separate process with metadata and content in Postgres, and a client (`src/demo.ts`) that starts it and runs 7 scenarios against it: `POST /v1/files` (metadata, `Idempotency-Key`), `PUT /v1/files/{fileId}/content` (`If-Match`), `GET /v1/files/{fileId}`, `GET /v1/files/{fileId}/content` (`If-None-Match`, `Range`, `If-Range`) and `GET /v1/files?changed_since=&limit=&cursor=`. The ETag is the file's `version`. Every call carries `Authorization: Bearer` with one of two static tokens, `token-alice` and `token-bob`.

## Run

One shot with proof: `./run-07-file-upload.sh` from the repo root (log in [`../logs/07-file-upload.log`](../logs/07-file-upload.log)).

Each claim in the Proof section below is also a `check(label, condition)` in the code. A failed check marks the process failed, so the script exits non-zero; the log ends each process with `N checks passed` or `FAILED: ...`.

By hand, from this folder (ports: Postgres 55450, HTTP 53020 files API):

```sh
docker compose up -d --wait
npm i
npm run setup    # files, idempotency_keys
npm run server   # the API on :53020
npm run demo     # starts the server itself (stop the one above first), runs the scenarios, stops it
```

The API:

```
POST /v1/files                         Authorization, Idempotency-Key (UUID); body {name, content_type, size?}
                                       -> 201 {fileId, status: "pending", upload_file_url}, ETag "1"
PUT  /v1/files/{fileId}/content        Authorization, If-Match (required), Content-Type: application/octet-stream
                                       -> 200 {status: "complete"}, ETag "2" (the new version); 412 if If-Match is stale, 428 if missing
GET  /v1/files/{fileId}                Authorization, If-None-Match? -> 200 File, or 304
GET  /v1/files/{fileId}/content        Authorization, If-None-Match?, Range? + If-Range? -> 200, 206, 304 or 416; binary
GET  /v1/files?changed_since=&limit=&cursor=
                                       Authorization -> 200 [File], next page in Link: <...>; rel="next"
```

## Files

- `src/server.ts` bearer auth scoped to an owner, the idempotency claim, `If-Match` checked inside the `UPDATE`, `If-None-Match`, `Range` and `If-Range`, and the change feed on `(changed_xid, id)`.
- `src/demo.ts` the client: each scenario and what the server answered, plus an `updated_at` client run next to the feed to show what it misses.
- `src/setup.ts` the `files` and `idempotency_keys` tables.

## Concepts

- **Two-step upload**: `POST /v1/files` creates the metadata in `pending` and answers `upload_file_url`; `PUT` on that URL sends the bytes and moves the file to `complete`. Here the URL points back at the API. In production it is a presigned object-storage URL, and the storage's upload notification (or a `HEAD` on the object) completes the file. A declared `size` is checked on the first upload (422 otherwise); a `sha256` is computed and stored.
- **Bearer token scoped to an owner**: every query filters on the owner the token maps to. Another owner's file is 404, not 403, so ids do not reveal which files exist. A missing or unknown token is 401 with `WWW-Authenticate: Bearer`.
- **Idempotency-Key on POST**: the same pattern as 06, scoped per owner (`PRIMARY KEY (owner, key)`). The key row, with the full response, and the file row commit in one transaction, so a key is never claimed without its file. A retry replays the stored `201`, `ETag` and body with `Idempotent-Replayed: true`. A concurrent duplicate blocks on the primary key until the first commits, then replays: no 409 is needed when the claim and the work share a database. The same key with a different body is 422, a missing or non-UUID key is 400.
- **ETag = version**: the ETag is the file's `version` in quotes, bumped by every write. A strong ETag must change whenever the bytes change, so `PUT` answers the *new* one (`"1"` then `"2"`): answering `"1"` again would let a stale client overwrite. Express's own automatic weak ETags are turned off.
- **If-Match, optimistic concurrency**: `PUT` without `If-Match` is 428 Precondition Required (RFC 6585), so no client can write blind. A stale tag is 412 with the current `ETag`, so the client re-reads, merges, and retries. The check is not just the `SELECT`: the `UPDATE` itself says `WHERE version = $read`, so two writers holding the same tag cannot both pass (in the run, writer B lost the race and got 412). `If-Match` uses the strong comparison, so `W/"2"` never matches.
- **If-None-Match, revalidation**: a client that kept the ETag gets 304 with no body while it is still current. This comparison is weak, so `W/"3"` matches `"3"`. `Cache-Control: private, no-cache` lets a client cache but makes it revalidate each time. On the content endpoint `If-None-Match` is evaluated before `Range` (RFC 9110 13.2.2).
- **Range and If-Range**: `Range: bytes=0-9`, `bytes=10-` and `bytes=-6` get 206 with `Content-Range`; a range past the end gets 416 with `Content-Range: bytes */36`; a multi-range or malformed header is ignored and the whole content sent, which RFC 9110 allows. `If-Range` makes resuming safe: the client sends the ETag of the part it already has, and if the file changed since, the server sends the whole new file (200) instead of the rest of a different one. Without it, the run shows the spliced result.
- **Change feed on `changed_xid`, not `updated_at`**: `updated_at = now()` is the time the writing transaction started, but other readers only see the row when it commits. A transaction that starts first and commits last produces a row stamped earlier than rows a client has already paged past, and a cursor on `updated_at` never looks back: the run shows an `updated_at` client losing a rename. The feed stores `changed_xid = pg_current_xact_id()` (64-bit, no wraparound) on every write and serves only rows whose transaction is older than every transaction still running (`changed_xid < pg_snapshot_xmin(pg_current_snapshot())`). Rows behind the cursor are then final, so keyset paging on `(changed_xid, id)` misses nothing: a late commit is held back, then served in order. A row updated again moves forward, so the feed is at-least-once: the client upserts by `fileId`.
- **The cursor is a sync token**: it is opaque (base64url of `changed_xid, id`), the next page is in `Link: <...>; rel="next"` (RFC 8288) so the body stays the plain `[File]` array, and an empty last page still returns the cursor. The client keeps it and polls with it later. `changed_since` only picks the starting point of a first sync.
- **What the sketch leaves out**: the xmin horizon is cluster-wide, so any long transaction (or an idle-in-transaction session) stalls the feed until it ends; set `idle_in_transaction_session_timeout`. Deletes need a tombstone row (`status = 'deleted'`) or the feed never reports them. Content lives in `bytea` and is buffered in memory, capped at 10 MB; stream it to object storage instead. The two tokens are hard-coded; a real service validates a JWT or looks the token up. Idempotency keys should expire after a retention window.

## Proof (`logs/07-file-upload.log`)

A retry and a concurrent duplicate both return the first file:

```
   Idempotency-Key 99430603...
   POST /v1/files                                                 -> 201 [etag: "1"] {"fileId":"68ed1a97","status":"pending","upload_file_url":"http://localhost:53020/v1/files/68ed1a97/content"}
   POST /v1/files (retry, same key and body)                      -> 201 [etag: "1", idempotent-replayed: true] {"fileId":"68ed1a97","status":"pending","upload_file_url":"http://localhost:53020/v1/files/68ed1a97/content"}
   POST /v1/files (same key, different body)                      -> 422 {"status":422,"detail":"this Idempotency-Key was already used with a different body"}
   POST /v1/files (no Idempotency-Key)                            -> 400 {"status":400,"detail":"Idempotency-Key header must be a UUID"}
   POST /v1/files (concurrent duplicate 1 of 2)                   -> 201 [etag: "1"] {"fileId":"e4808e6e","status":"pending","upload_file_url":"http://localhost:53020/v1/files/e4808e6e/content"}
   POST /v1/files (concurrent duplicate 2 of 2)                   -> 201 [etag: "1", idempotent-replayed: true] {"fileId":"e4808e6e","status":"pending","upload_file_url":"http://localhost:53020/v1/files/e4808e6e/content"}
   => 1 fileId for 2 concurrent requests; files rows named report/race/other: 2 (the duplicate waited on the key's primary key, then replayed)
```

`If-Match` rejects the stale writer, the weak tag and the concurrent loser:

```
   PUT content (no If-Match)                                      -> 428 {"status":428,"detail":"If-Match is required: send the ETag you last saw"}
   PUT content If-Match "1", Content-Type: text/plain             -> 415 {"status":415,"detail":"Content-Type must be application/octet-stream"}
   PUT content If-Match "1", 3 bytes (declared 25)                -> 422 {"status":422,"detail":"content is 3 bytes, the file declares 25"}
   PUT content If-Match "1", 25 bytes                             -> 200 [etag: "2"] {"status":"complete"}
   GET /v1/files/68ed1a97                                         -> 200 [etag: "2"] {"fileId":"68ed1a97","name":"report.txt","content_type":"text/plain","size":25,"sha256":"659c31985f292f5213809064e25e81ed6944b467193d53357eaac01788c46f6d","status":"complete","version":2,"created_at":"2026-10-04T00:50:00.608Z","updated_at":"2026-10-04T00:50:01.134Z"}
   PUT content If-Match "1" (stale: someone already wrote "2")    -> 412 [etag: "2"] {"status":412,"detail":"If-Match \"1\" does not match the current ETag \"2\""}
   PUT content If-Match W/"2" (weak never matches If-Match)       -> 412 [etag: "2"] {"status":412,"detail":"If-Match W/\"2\" does not match the current ETag \"2\""}
   PUT content If-Match "2" (concurrent writer A)                 -> 200 [etag: "3"] {"status":"complete"}
   PUT content If-Match "2" (concurrent writer B)                 -> 412 [etag: "3"] {"status":412,"detail":"If-Match \"2\" lost the race to a concurrent write"}
   => exactly one writer won: version 3, content "writer A's version\n"
```

`If-None-Match` revalidates without a body:

```
   GET /v1/files/68ed1a97 If-None-Match "3"                       -> 304 [etag: "3"]
   GET /content If-None-Match "3"                                 -> 304 [etag: "3"]
   GET /content If-None-Match W/"3"                               -> 304 [etag: "3"]
   GET /content If-None-Match "1" (an old version)                -> 200 [etag: "3"] "writer A's version\n"
```

`If-Range` sends the whole new file instead of splicing two versions:

```
   GET /content before any PUT                                    -> 409 {"status":409,"detail":"the file has no content yet: PUT it to upload_file_url first"}
   GET /content Range: bytes=0-9 (connection drops after this)    -> 206 [etag: "2", content-range: bytes 0-9/36] "0123456789"
   GET /content Range: bytes=10- If-Range: "2"                    -> 206 [etag: "2", content-range: bytes 10-35/36] "abcdefghijklmnopqrstuvwxyz"
   GET /content Range: bytes=-6 (last 6 bytes)                    -> 206 [etag: "2", content-range: bytes 30-35/36] "uvwxyz"
   GET /content Range: bytes=100-                                 -> 416 [etag: "2", content-range: bytes */36] {"status":416,"detail":"range bytes=100- is outside the 36 bytes"}
   PUT content If-Match "2" (the file changes)                    -> 200 [etag: "3"] {"status":"complete"}
   GET /content Range: bytes=10- If-Range: "2" (stale)            -> 200 [etag: "3"] "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210"
   => with If-Range the client gets the new file whole; resuming with Range alone would have spliced "0123456789PONMLKJIHGFEDCBA9876543210"
```

Paging the feed, then a late commit: the `updated_at` client loses the rename, the feed holds `b.txt` back and serves both:

```
   page 1: 200 ["a.txt","b.txt"] Link: rel=next
   page 2: 200 ["c.txt","d.txt"] Link: rel=next
   page 3: 200 ["e.txt"] Link: rel=next
   page 4: 200 [] Link: rel=next
   both clients are caught up: the updated_at client at max(updated_at), the feed client at its last cursor
   slow transaction: renames a.txt (updated_at = its start time), not committed yet
   meanwhile PUT b.txt content -> 200, committed
   poll: updated_at client sees ["b.txt"] and moves its cursor past b.txt
   poll: feed client sees        [] (b.txt is held back while an older transaction is still running)
   slow transaction commits
   poll: updated_at client sees [] <- the rename is lost: it is stamped before b.txt
   poll: feed client sees        ["a-renamed.txt","b.txt"]
   poll: feed client again       [] (nothing new; same sync token)
```

The self-checks, one line per claim, then one summary per process; any failed check makes the run script exit non-zero:

```
   check ok: no token or a wrong one is 401 with WWW-Authenticate: Bearer
   check ok: the owner reads her file (200); another owner gets 404, not 403
   check ok: a retry with the same key replays the first answer (same fileId, Idempotent-Replayed)
   check ok: the same key with a different body is 422; no key is 400
   check ok: two concurrent requests with one key create one file; one row each for report.txt and race.txt
   check ok: PUT without If-Match is 428, wrong Content-Type 415, wrong size 422; the right PUT is 200 with ETag "2"
   check ok: a stale If-Match and a weak tag are both 412 (no lost update)
   check ok: of two concurrent writers on "2", one wins (version 3) and the other gets 412
   check ok: If-None-Match with the current ETag, strong or weak, is 304 with no body
   check ok: If-None-Match with an old version is 200 with the content
   check ok: content before any PUT is 409
   check ok: ranges are 206 with Content-Range, and the two parts join into the whole file
   check ok: a range outside the content is 416
   check ok: after the file changed, If-Range with the old ETag gets the whole new file (200), not a spliced one
   check ok: the feed pages through the 5 new files in order, 2 per page, each exactly once
   check ok: the updated_at cursor loses the slow transaction's rename
   check ok: the changed_xid feed holds b.txt back, then delivers both the rename and b.txt, and nothing twice
17 checks passed
```

## Origins and further reading

- RFC: 9110 "HTTP Semantics", sections 8.8.3 (ETag), 13 (conditional requests: If-Match, If-None-Match, If-Range, evaluation order) and 14 (range requests, 206, 416). https://www.rfc-editor.org/rfc/rfc9110
- RFC: 6585 "Additional HTTP Status Codes" (428 Precondition Required, to prevent lost updates). https://www.rfc-editor.org/rfc/rfc6585
- RFC: 8288 "Web Linking" (the `Link` header, `rel="next"`). https://www.rfc-editor.org/rfc/rfc8288
- Draft: "The Idempotency-Key HTTP Header Field", IETF httpapi. https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- Article: "Detecting the Lost Update Problem Using Unreserved Checkout", W3C note, 1999 (the If-Match pattern). https://www.w3.org/1999/04/Editing/
- Docs: "Transaction ID and Snapshot Information Functions", PostgreSQL 16 (`pg_current_xact_id`, `pg_current_snapshot`, `pg_snapshot_xmin`). https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-PG-SNAPSHOT
- Docs: Amazon S3 presigned URLs for uploads. https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- Protocol: tus, resumable uploads over HTTP. https://tus.io/protocols/resumable-upload
