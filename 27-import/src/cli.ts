import { db } from "./db.js";
import { importFile } from "./importer.js";
import { show } from "./show.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
for (const path of args.filter((a) => a !== "--dry-run")) show(await importFile(path, { dryRun }));
await db.end();
