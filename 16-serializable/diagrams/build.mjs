// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

const rows = [
  ["One row: a stock counter", "conditional UPDATE ... WHERE stock > 0,\nor FOR UPDATE, or REPEATABLE READ + retry", false],
  ["Uniqueness: seat A1 of one event", "a constraint: UNIQUE (event_id, seat)", false],
  ["Many rows, one natural parent:\ncount(tickets) < capacity", "lock the parent row first\n(events ... FOR UPDATE), READ COMMITTED", false],
  ["Many rows and no parent,\nor too many rules to find", "SERIALIZABLE everywhere\n+ retry the whole transaction on 40001", true],
];
const d = diagram("overview", "16. Isolation: which tool for which rule")
  .box("skew", 40, 100, 1000, 70, "Write skew: count the tickets, then insert one. Every buyer sees 9 or fewer and inserts a different row:\n20 of 20 buyers told \"sold\" for 10 tickets under READ COMMITTED and under REPEATABLE READ", { dashed: true })
  .text(40, 200, "If the rule is on...", { bold: true })
  .text(560, 200, "use", { bold: true });
rows.forEach(([rule, fix, bold], i) => {
  const y = 240 + i * 95;
  d.box(`r${i}`, 40, y, 400, 70, rule).box(`f${i}`, 560, y, 480, 70, fix, { bold }).arrow(`r${i}`, `f${i}`);
});
d.text(40, 630, "With SERIALIZABLE + retries, and with the parent lock, the same 20 buyers got exactly 10 tickets.\nSSI's price: about 140 aborts on one hot event, and it only covers transactions that are all SERIALIZABLE.")
  .write(dirname(fileURLToPath(import.meta.url)));
