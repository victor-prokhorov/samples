// Prints the raw response headers of the signed-in account page of one build (for the run script's proof).
//   tsx src/dump-headers.ts insecure|hardened
import { HARDENED_PORT, INSECURE_PORT } from "./config.js";
import { type Mode, createPortal } from "./portal.js";
import { fetchSignedIn } from "./scan.js";

const mode = process.argv[2] as Mode;
const port = mode === "hardened" ? HARDENED_PORT : INSECURE_PORT;
const portal = createPortal(mode, port);
await portal.listen();
const { headers, setCookie } = await fetchSignedIn(`http://localhost:${port}`);
console.log(`set-cookie (at sign-in): ${setCookie.replace(/=[^;]+/, "=<value>")}`);
for (const [k, v] of headers) if (k !== "date") console.log(`${k}: ${v.replace(/nonce-[^']+/g, "nonce-<random>")}`);
portal.server.close();
