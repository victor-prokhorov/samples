// By hand: MODE=sprinkled|policy npm run server, then e.g.
//   curl -H 'x-user: ana' localhost:53047/members/m-gil/contributions
import pg from "pg";
import { OWNER_URL, PORT } from "./db.js";
import { policyApp } from "./app.js";
import { sprinkledApp } from "./sprinkled.js";

const owner = new pg.Pool({ connectionString: OWNER_URL });
const mode = process.env.MODE === "sprinkled" ? "sprinkled" : "policy";
const server = mode === "sprinkled" ? sprinkledApp(owner) : policyApp(owner, { onDisagreement: (w) => console.warn(`DISAGREEMENT ${w}`) }).server;
server.listen(PORT, () => console.log(`${mode} app on :${PORT}; users: ana, ben, gil, ivo (members), erin (Acme admin), sam, sky (staff), aud (auditor)`));
