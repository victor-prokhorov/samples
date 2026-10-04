// node diagrams/build.mjs  ->  writes overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "31. Executable runbooks and a restore drill")
  .box("rb", 40, 110, 170, 80, "runbook.md\nOwner, Parameters")
  .box("pre", 250, 110, 170, 80, "Preconditions\nmay I start?")
  .box("steps", 460, 110, 170, 80, "Steps\nsh or manual blocks", { bold: true })
  .box("ver", 670, 110, 170, 80, "Verification\ndid it work?")
  .box("stop", 250, 250, 170, 70, "stop, exit 2:\nnothing changed", { dashed: true })
  .box("rollback", 460, 250, 380, 70, "Rollback: printed for the operator,\nor run (--rollback auto, rollback.md)", { dashed: true })
  .arrow("rb", "pre")
  .arrow("pre", "steps")
  .arrow("steps", "ver")
  .arrow("pre", "stop", { dashed: true, label: "fails" })
  .arrow("steps", "rollback", { dashed: true, label: "a step fails" })
  .arrow("ver", "rollback", { dashed: true, label: "fails" })
  .frame("drill", 40, 380, 1060, 190, "The drill (runbooks/backup-restore-drill.md, itself a runbook)")
  .box("backup", 60, 440, 190, 100, "base backup\n(pg_basebackup)\n+ WAL archive")
  .box("loss", 290, 440, 230, 100, "writes go on, then a\nDELETE without WHERE;\npg_waldump finds its xid", { dashed: true })
  .box("restore", 560, 440, 230, 100, "fresh container:\nreplay WAL to\njust before that xid")
  .box("verify", 830, 440, 250, 100, "row counts and md5 match,\nrows put back;\nRPO and RTO vs targets", { bold: true })
  .arrow("backup", "loss")
  .arrow("loss", "restore")
  .arrow("restore", "verify")
  .text(40, 600, "Each runbook is Markdown the runner executes; every run and step is recorded in ops.runs and ops.steps. Dashed: failure paths.\nThe drill measures what a restore loses (RPO) and how long it takes (RTO) instead of assuming them.")
  .write(dirname(fileURLToPath(import.meta.url)));
