// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "12. Choreographed saga: services react to each other's events")
  .frame("bus", 40, 90, 1160, 230, "Each reaction is one local tx: processed_messages + effect + outbox; a relay per service -> Kafka")
  .box("orders", 60, 150, 200, 140, "orders\nstate machine,\nlistens to the\nother three")
  .box("inventory", 380, 150, 200, 140, "inventory\nreserve, release")
  .box("payments", 700, 150, 200, 140, "payments\ncharge, refund")
  .box("shipping", 980, 150, 200, 140, "shipping\nship")
  .arrow("orders", "inventory", { label: "OrderPlaced", via: [[320, 190]] })
  .arrow("inventory", "payments", { label: "Inventory\nReserved", via: [[640, 190]] })
  .arrow("payments", "shipping", { label: "Payment\nCharged", via: [[940, 190]] })
  .arrow("shipping", "payments", { dashed: true, label: "Shipment\nFailed", via: [[940, 260]] })
  .arrow("payments", "inventory", { dashed: true, label: "Payment\nFailed or\nRefunded", via: [[640, 260]] })
  .box("crash", 40, 370, 540, 80, "inventory crashes after its commit, before the offset commit:\nKafka redelivers OrderPlaced, processed_messages skips it")
  .box("timeline", 660, 370, 540, 80, "No one place knows the saga: timeline.ts rebuilds\norder-C from four outboxes by correlation id")
  .text(40, 480, "No orchestrator, same end state as 08 (stock 6). The price: three pairs of services depend on each other's\nevents, ordering holds only per partition, and changing the flow means redeploying several services.")
  .write(dirname(fileURLToPath(import.meta.url)));
