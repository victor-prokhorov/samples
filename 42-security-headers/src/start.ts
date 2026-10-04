// npm start: both portals and the attacker site, for poking at by hand in a browser.
import { randomBytes } from "node:crypto";
import { createAttacker } from "./attacker.js";
import { ATTACKER, HARDENED, HARDENED_PORT, INSECURE, INSECURE_PORT } from "./config.js";
import { createPortal } from "./portal.js";

if (!process.env.SESSION_KEYS) {
  process.env.SESSION_KEYS = randomBytes(32).toString("base64url");
  console.log("SESSION_KEYS not set: generated an ephemeral key (sessions end when the process stops)");
}
await createPortal("insecure", INSECURE_PORT).listen();
await createPortal("hardened", HARDENED_PORT).listen();
await createAttacker().listen();
console.log(`insecure portal ${INSECURE}/login\nhardened portal ${HARDENED}/login`);
console.log(`attacker: ${ATTACKER}/csrf?target=${INSECURE}  ${ATTACKER}/frame?target=${HARDENED}`);
