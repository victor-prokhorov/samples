// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "10. Change data capture: WAL -> Debezium -> Kafka")
  .box("writer", 40, 110, 200, 90, "Any writer\nplain SQL, knows\nnothing about Kafka")
  .box("pg", 290, 110, 220, 90, "Postgres: orders\nwal_level=logical\nREPLICA IDENTITY FULL")
  .box("slot", 560, 110, 220, 90, "WAL, read through\nslot \"debezium\"\n(pgoutput)")
  .box("dbz", 830, 110, 220, 90, "Debezium\non Kafka Connect", { bold: true })
  .box("kafka", 830, 280, 220, 90, "Kafka topic\napp.public.orders\nkey = id")
  .box("consumer", 560, 280, 220, 90, "Consumer: one event\nper row change: op,\nbefore, after, lsn, txId")
  .box("rollback", 290, 280, 220, 90, "tx 737 rolled back:\nnever emitted", { dashed: true })
  .arrow("writer", "pg")
  .arrow("pg", "slot")
  .arrow("slot", "dbz")
  .arrow("dbz", "kafka")
  .arrow("kafka", "consumer")
  .arrow("slot", "rollback", { dashed: true })
  .box("before", 40, 420, 1010, 60, "Before: app code writes the database and the index or cache itself: races, half-done writes,\nand every script or manual SQL is missed", { dashed: true })
  .text(40, 500, "Only committed changes come out, in commit order; one transaction's changes share a txId.\nThe catch: events are row diffs, not business intent, and an unwatched slot keeps WAL until the disk fills.")
  .write(dirname(fileURLToPath(import.meta.url)));
