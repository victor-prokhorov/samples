// node diagrams/build.mjs -> overview.excalidraw and overview.svg. Dashed: the old path, through the app.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "48. Presigned uploads: the bytes skip the app server")
  .box("browser", 40, 110, 230, 80, "Browser\nupload page", { bold: true })
  .box("app", 470, 110, 260, 80, "App :53058\nsigns, records, HEADs")
  .box("pg", 880, 110, 260, 80, "Postgres\nuploads: metadata + status")
  .box("gate", 470, 330, 260, 80, "SigV4 gate :53158\nchecks expiry + signature")
  .box("s3", 880, 330, 260, 80, "s3rver (S3 emulator)\nquarantine/ clean/ rejected/")
  .box("scan", 880, 530, 260, 80, "Scanner\nEICAR? rejected/ : clean/")
  .box("proxy", 40, 470, 230, 80, "Old way: POST 50 MB\nthrough the app", { dashed: true })
  .arrow("browser", "app", { label: "1 ask: type, size" })
  .arrow("app", "pg", { label: "row: pending" })
  .arrow("browser", "gate", { label: "2 PUT bytes", via: [[220, 370], [400, 370]] })
  .arrow("gate", "s3", { label: "verified" })
  .arrow("scan", "s3", { label: "3 read, copy, delete" })
  .arrow("scan", "pg", { label: "status", via: [[1200, 570], [1200, 150]] })
  .arrow("browser", "proxy", { dashed: true, via: [[100, 300]] })
  .text(40, 650, "The app signs one PUT (key, content type, length, 60 s); storage refuses anything else.\nDownloads are presigned GETs with Content-Disposition, for clean/ only.")
  .write(dirname(fileURLToPath(import.meta.url)));
