// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "09. Transactional outbox with a polling relay")
  .frame("bad", 40, 90, 1000, 130, "Before: dual write")
  .box("dual", 60, 140, 380, 60, "App: COMMIT the order, then publish")
  .box("lost", 560, 140, 460, 60, "crash in between: the event is lost (or sent\nfor a change that rolled back)", { dashed: true })
  .arrow("dual", "lost", { dashed: true })
  .frame("good", 40, 250, 1000, 310, "After: one transaction, a relay publishes")
  .box("app", 60, 300, 200, 80, "App\nemit() inside the\norder's transaction")
  .box("pg", 300, 300, 220, 80, "Postgres\norders + outbox row\n(one commit)")
  .box("relay", 560, 300, 220, 80, "Relay\nFOR UPDATE SKIP\nLOCKED, send, mark", { bold: true })
  .box("kafka", 820, 300, 200, 80, "Kafka\nkey = aggregate_id")
  .box("crash", 560, 450, 220, 80, "crash after send:\nrows stay unpublished,\nsent again", { dashed: true })
  .box("consumer", 820, 450, 200, 80, "Consumer\nskips an event_id\nit has seen")
  .arrow("app", "pg")
  .arrow("pg", "relay")
  .arrow("relay", "kafka")
  .arrow("kafka", "consumer")
  .arrow("relay", "crash", { dashed: true })
  .text(40, 580, "Send first, mark published second: a crash gives duplicates, never loss (at least once).\nIn the run the consumer received each event twice and processed each once.")
  .write(dirname(fileURLToPath(import.meta.url)));
