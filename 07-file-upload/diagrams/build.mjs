// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

const rows = [
  ["POST /v1/files\nIdempotency-Key", "a retry replays the stored 201:\nno duplicate file"],
  ["PUT /content  If-Match: \"2\"\nUPDATE ... WHERE version = 2", "stale or losing writer gets 412:\nno lost update (428 if missing)"],
  ["GET  If-None-Match: \"3\"", "304, no body, while still current"],
  ["GET /content  Range: bytes=10-\nIf-Range: \"2\"", "file changed: 200 with the whole\nnew file, never a spliced one"],
  ["GET /v1/files?cursor=...\nkeyset on (changed_xid, id)", "a late commit is held back, then\nserved: not lost like updated_at"],
];
const d = diagram("overview", "07. File API: one HTTP header per failure it prevents")
  .frame("req", 40, 90, 400, 530, "Client sends (ETag = version)")
  .frame("res", 520, 90, 400, 530, "Express 5 API + Postgres answers");
rows.forEach(([req, res], i) => {
  const y = 140 + i * 95;
  d.box(`q${i}`, 60, y, 360, 70, req).box(`r${i}`, 540, y, 360, 70, res).arrow(`q${i}`, `r${i}`);
});
d.text(40, 640, "Two-step upload: POST creates the metadata (pending), PUT to upload_file_url sends the bytes (complete).\nEvery query is scoped to the bearer token's owner: another owner's file is 404.").write(dirname(fileURLToPath(import.meta.url)));
