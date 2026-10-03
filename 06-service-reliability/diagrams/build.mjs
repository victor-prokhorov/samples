// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "06. Reliability between services: one guard per failure")
  .frame("caller", 40, 90, 480, 520, "Caller, src/resilience.ts (no library)")
  .box("bulk", 60, 140, 440, 70, "Bulkhead: at most 4 payments calls\nin flight, reject the rest at once")
  .box("breaker", 60, 235, 440, 70, "Circuit breaker: open after 5 failures,\none half-open probe after 1s")
  .box("retry", 60, 330, 440, 70, "Retries: transient errors only,\nfull jitter, retry budget")
  .box("timeout", 60, 425, 440, 70, "Timeout on every attempt,\nremaining budget in x-deadline-ms")
  .box("key", 60, 520, 440, 70, "POST /charges with one Idempotency-Key\nper operation, reused on every retry", { bold: true })
  .arrow("bulk", "breaker")
  .arrow("breaker", "retry")
  .arrow("retry", "timeout")
  .arrow("timeout", "key")
  .box("pay", 640, 470, 300, 120, "payments :53010\nSET LOCAL statement_timeout\n= the caller's deadline\n(faults switched by the demo)", { dashed: true })
  .box("db", 640, 290, 300, 100, "Postgres\ncharges + idempotency_keys\n(key is the primary key,\nresponse stored in the same tx)")
  .box("cat", 640, 140, 300, 70, "catalog :53011\nhealthy, its own socket pool")
  .arrow("key", "pay")
  .arrow("pay", "db")
  .arrow("bulk", "cat", { label: "own pool" })
  .text(40, 630, "Deadline propagation: 15050 -> 2045 ms of DB time. Lockstep retries: 25 of 100 callers succeed, full jitter: 100.\nOutage with a retry budget: 110 requests instead of 500. No key: alice pays twice; with a key bob pays once.\nBreaker: 9 of 40 calls reach a degraded payments instead of 40. Bulkhead: catalog answers in 2 ms, not 1457 ms.")
  .write(dirname(fileURLToPath(import.meta.url)));
