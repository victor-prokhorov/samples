import { check } from "./check.js";
import { auditDb, billingDb, closeAll, ordersDb } from "./db.js";

const central = async () => (await auditDb.query("SELECT count(*)::int AS n, count(DISTINCT event_id)::int AS events FROM audit_events")).rows[0];
const unshipped = async (db: typeof ordersDb) => (await db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE shipped_at IS NULL)::int AS unshipped FROM audit_outbox")).rows[0];

// `verify crashed` after shipper pass 1 dies; `verify final` once both outboxes are shipped and psql has had its go.
async function main() {
  if (process.argv[2] === "crashed") {
    const orders = await unshipped(ordersDb);
    check("after the crash orders' 2 events are still unshipped locally, yet already stored centrally", orders.total === 2 && orders.unshipped === 2 && (await central()).n === 2);
  } else {
    const before = await central();
    check("the central log has one row per event (3) despite the re-send", before.n === 3 && before.events === 3);
    const actors = await auditDb.query("SELECT string_agg(service || ':' || actor, ', ' ORDER BY occurred_at) AS a FROM audit_events");
    check("the timeline spans both services, with no event from mallory's rolled-back change", actors.rows[0].a === "orders:alice, orders:bob (support), billing:system:billing");
    const refused: string[] = [];
    for (const sql of ["UPDATE audit_events SET actor = 'nobody'", "DELETE FROM audit_events", "TRUNCATE audit_events"]) {
      await auditDb.query(sql).then(
        () => undefined,
        (err) => (err instanceof Error && err.message.includes("append-only") ? refused.push(sql.split(" ")[0]) : undefined),
      );
    }
    check("the central log is append-only: UPDATE, DELETE and TRUNCATE are all rejected", refused.join() === "UPDATE,DELETE,TRUNCATE" && (await central()).n === 3);
    const total = await ordersDb.query("SELECT total FROM orders WHERE id = 1");
    const audited = await auditDb.query("SELECT after->>'total' AS t FROM audit_events WHERE entity = 'order' AND entity_id = '1' ORDER BY occurred_at DESC LIMIT 1");
    check("the gap: the psql UPDATE set the total to 0 and left no audit trace (last audited total 38.25)", total.rows[0].total === "0.00" && audited.rows[0].t === "38.25");
    const [o, b] = [await unshipped(ordersDb), await unshipped(billingDb)];
    check("both local outboxes are drained", o.unshipped === 0 && b.unshipped === 0 && o.total + b.total === 3);
  }
  await closeAll();
}

main();
