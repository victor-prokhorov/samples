// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "11. Transactional outbox, relayed by Debezium (no polling)")
  .box("app", 40, 110, 200, 90, "App\nemit() inside the\norder's transaction")
  .box("pg", 290, 110, 240, 90, "Postgres\norders + outbox row,\none commit; the row can\nbe deleted at once")
  .box("dbz", 580, 110, 240, 90, "Debezium reads the\noutbox inserts from\nthe WAL; EventRouter", { bold: true })
  .box("kafka", 870, 110, 220, 90, "Kafka\noutbox.event.order\nkey = aggregateid")
  .box("consumer", 870, 280, 220, 90, "Consumer\nOrderPaid {orderId}\ndedupes on id header")
  .arrow("app", "pg")
  .arrow("pg", "dbz")
  .arrow("dbz", "kafka")
  .arrow("kafka", "consumer")
  .box("bob", 290, 280, 240, 90, "bob's order rolled back:\nits outbox insert is\nnever published", { dashed: true })
  .box("carol", 40, 420, 490, 70, "Before: commit carol's order, then producer.send();\na crash in between: the order exists, no event ever", { dashed: true })
  .arrow("pg", "bob", { dashed: true })
  .text(40, 520, "Same outbox as 09, but the relay tails the WAL: no poll interval, no published_at, no cleanup.\nThe outbox table ends at 0 rows, yet all three committed events arrived, in order, as business events.")
  .write(dirname(fileURLToPath(import.meta.url)));
