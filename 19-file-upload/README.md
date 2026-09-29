# 19-file-upload

**Pain: a file API that loses writes, duplicates creates and serves torn downloads.** A client retries a create that timed out and gets two files. Two clients read version 1 and both write, and the second silently erases the first. A download resumed after the file changed splices the start of the old bytes onto the end of the new ones. A client syncing "what changed since" on `updated_at` never sees a change whose transaction committed late.

**Reach for it when** clients create, overwrite and download files (or any resource) over HTTP, retry on timeouts, cache what they read, resume large downloads, or keep a local copy in sync with a change feed.

**Do not reach for it when** the files are large or numerous: keep the bytes in object storage (S3, GCS), make `upload_file_url` a presigned URL the client uploads to directly, and keep only the metadata, version and state machine here; multipart or tus uploads handle resuming uploads. Only one writer ever touches a file: `If-Match` still costs nothing, but the lost update cannot happen. A client needs every change as an event, in order and pushed: publish them through an outbox (07) instead of polling a feed.

An Express 5 API (`src/server.ts`), a separate process with metadata and content in Postgres, and a client (`src/demo.ts`) that starts it and runs 7 scenarios against it. The ETag is the file's `version`. Tokens are two static values, `token-alice` and `token-bob`.

```sh
docker compose up -d --wait
npm i
npm run setup    # files, idempotency_keys
npm run server   # the API on :53020
npm run demo     # starts the server itself (stop the one above first), runs the scenarios, stops it
```

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

- `src/server.ts` bearer auth scoped to an owner, the idempotency claim, `If-Match` checked inside the `UPDATE`, `If-None-Match`, `Range` and `If-Range`, and the change feed on `(changed_xid, id)`.
- `src/demo.ts` the client: each scenario and what the server answered, plus an `updated_at` client run next to the feed to show what it misses.
- `src/setup.ts` the `files` and `idempotency_keys` tables.

One-shot run with proof: `../run-19-file-upload.sh` (log in `../logs/19-file-upload.log`). Concepts explained in `../README.md`.
