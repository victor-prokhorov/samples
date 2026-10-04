import { pool, migrate } from "./db.js";
import { createProduct, deleteProduct, getProduct, history, updateProduct } from "./products.js";
import { check } from "./check.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function main() {
  await migrate();
  step("1. Create", "INSERT the row and an audit entry (before=null, after=row) in one transaction");
  const p = await createProduct("alice", { name: "Keyboard", price: "49.00" });
  console.log("   created:", p);
  const h1 = await history(p.id);
  check("create writes one audit row: before=null, after=the new row", h1.length === 1 && h1[0].action === "create" && h1[0].before === null && h1[0].after?.price === "49.00");
  step("2. Update", "lock the row (SELECT ... FOR UPDATE), capture before, UPDATE, write audit with before and after");
  console.log("   bob:", await updateProduct("bob", p.id, { price: "39.00" }));
  console.log("   alice:", await updateProduct("alice", p.id, { name: "Mech Keyboard" }));
  const h2 = await history(p.id);
  check(
    "each update writes one audit row with the before and after values",
    h2.length === 3 && h2[1].actor === "bob" && h2[1].before.price === "49.00" && h2[1].after.price === "39.00" && h2[2].before.name === "Keyboard" && h2[2].after.name === "Mech Keyboard",
  );
  step("3. Atomicity", "if the audit insert fails (empty actor violates CHECK), the data change rolls back with it");
  const rejected = await updateProduct("", p.id, { price: "0.01" }).then(
    () => false,
    (err) => (console.log(`   rejected: ${err instanceof Error ? err.message : String(err)}`), true),
  );
  const price = (await getProduct(p.id))?.price;
  console.log("   price still:", price);
  check("the update with an empty actor is rejected", rejected);
  check("the rolled-back update left the price unchanged and wrote no audit row", price === "39.00" && (await history(p.id)).length === 3);
  step("4. Delete", "the row disappears from products, but the audit entry keeps its last value (before=row, after=null)");
  await deleteProduct("carol", p.id);
  const gone = await getProduct(p.id);
  console.log("   read after delete:", gone);
  check("the row is gone from products after the delete", gone === null);
  step("5. History", "the products table only knows the present; audit_log answers who changed what, when, from what to what");
  const all = await history(p.id);
  for (const h of all) {
    console.log(`   ${h.at.toISOString()} ${h.action.padEnd(6)} by ${h.actor.padEnd(5)} before=${JSON.stringify(h.before)} after=${JSON.stringify(h.after)}`);
  }
  check(
    "the history survives the delete: one audit row per change (create, update, update, delete), the last one keeping the final value",
    all.map((h) => `${h.action}:${h.actor}`).join(",") === "create:alice,update:bob,update:alice,delete:carol" &&
      all[3].before?.name === "Mech Keyboard" &&
      all[3].after === null,
  );
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE after->>'price' = '0.01'");
  check("audit_log holds no row from the rolled-back change", rows[0].n === 0);
  await pool.end();
}

main();
