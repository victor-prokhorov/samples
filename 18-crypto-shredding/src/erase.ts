import { check } from "./check.js";
import { closeAll, db } from "./db.js";
import { erase, findSubject } from "./keys.js";

async function main() {
  const email = process.argv[2];
  const subjectId = await erase(email);
  console.log(subjectId ? `erase: ${email} -> subject ${subjectId}, DEK deleted from the key store (its blind-index row cascades)` : `erase: no subject for ${email}`);
  const key = await db("keys").query("SELECT 1 FROM subject_keys WHERE subject_id = $1", [subjectId]);
  check(`${email}'s DEK and blind-index row are gone from the key store`, subjectId !== null && key.rowCount === 0 && (await findSubject(email)) === null);
  await closeAll();
}

main();
