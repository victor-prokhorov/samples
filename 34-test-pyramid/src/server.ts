// The app as a browser sees it: the form (public/index.html + the esbuild bundle public/app.js) and the API,
// on one port. LATENCY_MS=0,1000 delays each POST in turn, the way a loaded CI machine would.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "./api/app.js";
import { pool } from "./api/db.js";

export const PORT = Number(process.env.PORT ?? 53044);
const database = process.env.DATABASE ?? "pyramid";
const latencyMs = (process.env.LATENCY_MS ?? "").split(",").filter(Boolean).map(Number);
const today = () => process.env.TODAY ?? new Date().toISOString().slice(0, 10);

const app = createApp({ pool: pool(database), today, latencyMs, publicDir: fileURLToPath(new URL("../public", import.meta.url)) });
createServer(app).listen(PORT, () => console.log(`app on http://localhost:${PORT} (database ${database}${latencyMs.length ? `, POST latency ${latencyMs.join("/")} ms in turn` : ""})`));
