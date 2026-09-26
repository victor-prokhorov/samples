import { pool, migrate } from "./db.js";
import { createProduct, deleteProduct, getProduct, history, updateProduct } from "./products.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function main() {
  await migrate();
  step("1. Create", "INSERT the row and an audit entry (before=null, after=row) in one transaction");
  const p = await createProduct("alice", { name: "Keyboard", price: "49.00" });
  console.log("   created:", p);
  step("2. Update", "lock the row (SELECT ... FOR UPDATE), capture before, UPDATE, write audit with before and after");
  console.log("   bob:", await updateProduct("bob", p.id, { price: "39.00" }));
  console.log("   alice:", await updateProduct("alice", p.id, { name: "Mech Keyboard" }));
  step("3. Atomicity", "if the audit insert fails (empty actor violates CHECK), the data change rolls back with it");
  await updateProduct("", p.id, { price: "0.01" }).catch((err) => console.log(`   rejected: ${err instanceof Error ? err.message : String(err)}`));
  console.log("   price still:", (await getProduct(p.id))?.price);
  step("4. Delete", "the row disappears from products, but the audit entry keeps its last value (before=row, after=null)");
  await deleteProduct("carol", p.id);
  console.log("   read after delete:", await getProduct(p.id));
  step("5. History", "the products table only knows the present; audit_log answers who changed what, when, from what to what");
  for (const h of await history(p.id)) {
    console.log(`   ${h.at.toISOString()} ${h.action.padEnd(6)} by ${h.actor.padEnd(5)} before=${JSON.stringify(h.before)} after=${JSON.stringify(h.after)}`);
  }
  await pool.end();
}

main();
