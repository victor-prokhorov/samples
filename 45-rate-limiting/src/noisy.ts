// Acme's two clients, in their own process so their request rate does not slow down the process that times the
// quiet tenants. Prints what it saw as one JSON line on stdout.
import { Run } from "./load.js";

const run = await new Run(Number(process.env.RUN_MS), Number(process.env.START_AT)).begin();
await Promise.all([run.hammer("acme", "acme-batch", 48), run.polite("acme", "acme-sync", 8)]);
process.stdout.write(JSON.stringify({ hits: run.hits, retryDelays: run.retryDelays }) + "\n");
