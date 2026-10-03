// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "28. Statement campaign: a resumable batch job")
  .box("enqueue", 40, 110, 240, 110, "enqueue: one job per\n(year, member);\nrun twice: 16, then 0")
  .box("jobs", 340, 110, 280, 110, "statement_jobs\npending, sending, retry,\nsent, dead; lease,\nattempts, pdf_sha256", { bold: true })
  .box("workers", 680, 110, 280, 110, "Workers (processes)\nclaim FOR UPDATE SKIP\nLOCKED + a lease;\n5 sends/s each")
  .box("smtp", 1020, 110, 240, 110, "SMTP sink :52528\nbob 451 twice,\ncarol 550,\ndan 451 always")
  .arrow("enqueue", "jobs")
  .arrow("jobs", "workers")
  .arrow("workers", "smtp")
  .box("pdf", 680, 280, 280, 90, "pdfkit: deterministic\nPDF (fixed date) ->\nsha256 on the job")
  .box("retry", 1020, 280, 240, 90, "4xx: retry, backoff\nwith jitter, max 4", { dashed: true })
  .box("dead", 1020, 430, 240, 90, "5xx or 4 attempts:\ndead letter,\nreason kept", { dashed: true })
  .box("doubt", 340, 280, 280, 90, "crash after SMTP said OK:\nlease expires, resent with\nthe same Message-ID", { dashed: true })
  .box("report", 340, 430, 280, 90, "Report: sent, retried,\nin doubt, dead letters")
  .arrow("workers", "pdf")
  .arrow("smtp", "retry", { dashed: true })
  .arrow("retry", "dead", { dashed: true })
  .arrow("jobs", "doubt", { dashed: true })
  .arrow("doubt", "report")
  .text(40, 560, "Before: a loop that renders, sends, next member. It crashed after member 7 and was run again: four members\ngot two statements, greylisted bob got none. The job table makes progress, retries and the report queries.")
  .write(dirname(fileURLToPath(import.meta.url)));
