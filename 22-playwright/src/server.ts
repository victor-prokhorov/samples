import pg from "pg";
import { createApp } from "./app.js";
import { PORT, url } from "./db.js";

const pool = new pg.Pool({ connectionString: url("portal") });
createApp({ pool, apiDelayMs: Number(process.env.API_DELAY_MS ?? 300) }).listen(PORT, () => console.log(`portal on http://localhost:${PORT} (alice / alice-password)`));
