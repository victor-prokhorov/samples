import { closeAll } from "./db.js";
import { rotateKek } from "./keys.js";

async function main() {
  const { to, rewrapped } = await rotateKek();
  console.log(`rotate: new KEK ${to} in the kms, ${rewrapped} DEKs unwrapped and rewrapped under it; not one event re-encrypted`);
  await closeAll();
}

main();
