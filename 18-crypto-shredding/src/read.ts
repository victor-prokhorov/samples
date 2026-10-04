import { parseArgs } from "node:util";
import { check } from "./check.js";
import { closeAll } from "./db.js";
import { ERASED, format, readEvents } from "./events.js";
import { findSubject } from "./keys.js";

async function main() {
  const { values } = parseArgs({
    options: { events: { type: "string", default: "events" }, keys: { type: "string", default: "keys" }, email: { type: "string" }, "expect-alice": { type: "string" } },
  });
  console.log(`read: events from database ${values.events}, keys from database ${values.keys}`);
  if (values.email) console.log(`read: lookup ${values.email} -> ${(await findSubject(values.email, values.keys)) ?? "no subject"}`);
  const events = await readEvents(values.events, values.keys);
  for (const e of events) console.log(`   ${format(e)}`);
  const expect = values["expect-alice"];
  if (expect) {
    // alice registered first (event #1); her events are the ones with her subject id.
    const alice = events.find((e) => String(e.id) === "1")?.subject_id;
    const alices = events.filter((e) => e.subject_id === alice);
    const bobs = events.filter((e) => e.subject_id !== alice);
    const erased = alices.every((e) => Object.values(e.pii).every((v) => v === ERASED));
    const readable = alices.every((e) => Object.values(e.pii).every((v) => v !== ERASED));
    check(`all 5 events are still there; alice's PII is ${expect}`, events.length === 5 && alices.length === 3 && (expect === "erased" ? erased : readable));
    check("bob's PII is untouched", bobs.length === 2 && bobs.every((e) => Object.values(e.pii).every((v) => v !== ERASED)) && bobs[0].pii.name === "Bob Keller");
  }
  await closeAll();
}

main();
