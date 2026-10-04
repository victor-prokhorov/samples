// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "14. Sharding: each shard its own server, with read replicas")
  .box("router", 40, 220, 200, 170, "App router\nmd5(customer_id)\n% 2\n\nwrites: primary\nreads: replicas,\nround-robin")
  .frame("s0", 340, 90, 620, 200, "Shard 0 (alice)")
  .box("p0", 360, 140, 240, 120, "shard0-primary :55441\nthe only writer")
  .box("r01", 700, 140, 240, 50, "shard0-replica-1")
  .box("r02", 700, 210, 240, 50, "shard0-replica-2")
  .arrow("p0", "r01", { label: "WAL" })
  .arrow("p0", "r02", { label: "WAL" })
  .frame("s1", 340, 320, 620, 200, "Shard 1 (dave)")
  .box("p1", 360, 370, 240, 120, "shard1-primary :55442\nstopped: its writes\nfail (no failover)", { dashed: true })
  .box("r11", 700, 370, 240, 50, "shard1-replica-1")
  .box("r12", 700, 440, 240, 50, "shard1-replica-2")
  .arrow("p1", "r11", { dashed: true, label: "WAL" })
  .arrow("p1", "r12", { dashed: true, label: "WAL" })
  .arrow("router", "s0", { label: "alice" })
  .arrow("router", "s1", { label: "dave" })
  .text(40, 550, "Replicas are read-only and asynchronous: a paused replica still answered 2 orders after the 3rd committed\n(no read-your-writes), then caught up. With shard 1's primary down, its replicas keep answering and shard 0\nkeeps taking writes. Replicas scale reads only; writes scale by adding shards.")
  .write(dirname(fileURLToPath(import.meta.url)));
