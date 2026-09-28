import { parseArgs } from "node:util";
import { closeAll } from "./db.js";
import { format, readEvents } from "./events.js";
import { findSubject } from "./keys.js";

async function main() {
  const { values } = parseArgs({ options: { events: { type: "string", default: "events" }, keys: { type: "string", default: "keys" }, email: { type: "string" } } });
  console.log(`read: events from database ${values.events}, keys from database ${values.keys}`);
  if (values.email) console.log(`read: lookup ${values.email} -> ${(await findSubject(values.email, values.keys)) ?? "no subject"}`);
  for (const e of await readEvents(values.events, values.keys)) console.log(`   ${format(e)}`);
  await closeAll();
}

main();
