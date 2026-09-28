import { closeAll } from "./db.js";
import { erase } from "./keys.js";

async function main() {
  const email = process.argv[2];
  const subjectId = await erase(email);
  console.log(subjectId ? `erase: ${email} -> subject ${subjectId}, DEK deleted from the key store (its blind-index row cascades)` : `erase: no subject for ${email}`);
  await closeAll();
}

main();
