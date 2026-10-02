import http from "node:http";
import { PORT, db } from "./db.js";

const version = process.env.APP_VERSION ?? "v1";

// each release reads the columns its migration added; v3 has a typo the smoke test catches (the column is statement_preference)
const memberQuery: Record<string, string> = {
  v1: "SELECT id, name, email FROM members WHERE id = $1",
  v2: "SELECT id, name, email, preferred_name FROM members WHERE id = $1",
  v3: "SELECT id, name, email, preferred_name, statement_pref FROM members WHERE id = $1",
};

http
  .createServer(async (req, res) => {
    const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    try {
      if (req.url === "/health") return send(200, { status: "ok", version });
      const m = /^\/members\/(\d+)$/.exec(req.url ?? "");
      if (!m) return send(404, { error: "not found" });
      const { rows } = await db.query(memberQuery[version], [m[1]]);
      return rows[0] ? send(200, rows[0]) : send(404, { error: "no such member" });
    } catch (err) {
      return send(500, { error: err instanceof Error ? err.message : String(err) });
    }
  })
  .listen(PORT, () => console.log(`member service ${version} on :${PORT} (pid ${process.pid})`));
