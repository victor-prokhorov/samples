import { check } from "./check.js";
import { closeAll, db } from "./db.js";
import { rotateKek } from "./keys.js";

const fingerprint = async () => (await db("events").query("SELECT count(*)::int AS n, md5(string_agg(pii::text, ',' ORDER BY id)) AS md5 FROM events")).rows[0];

async function main() {
  const before = await fingerprint();
  const { to, rewrapped } = await rotateKek();
  console.log(`rotate: new KEK ${to} in the kms, ${rewrapped} DEKs unwrapped and rewrapped under it; not one event re-encrypted`);
  const after = await fingerprint();
  const keks = await db("keys").query("SELECT DISTINCT kek_id FROM subject_keys");
  check(`every DEK is now wrapped by KEK ${to}`, keks.rows.length === 1 && keks.rows[0].kek_id === to && rewrapped === 2);
  check("the events are untouched: same count, same PII fingerprint", before.n === after.n && before.md5 === after.md5);
  await closeAll();
}

main();
