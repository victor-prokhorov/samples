// The member portal's statement endpoint, every feature behind a flag. node:http, one FlagClient per process.
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { PORT, db } from "./db.js";
import { FlagClient } from "./flags.js";

const ttlMs = Number(process.env.FLAG_TTL_MS ?? 5000);
const flags = await new FlagClient(db, { ttlMs, listen: process.env.FLAG_LISTEN !== "off" }).start();
flags.onInvalidate = (key) => console.log(`   [server] NOTIFY flags_changed ${key}: cached copy dropped`);

async function statement(member: string, tenant: string) {
  const ctx = { targetingKey: member, tenant };
  const [page, projection, bulkUpload, liveValuation] = await Promise.all([
    flags.getBooleanValue("new-statement-page", false, ctx),
    flags.getBooleanValue("projection-v2", false, ctx),
    flags.getBooleanValue("employer-bulk-upload", false, ctx),
    flags.getBooleanValue("ops-live-valuation", true, ctx),
  ]);
  // the expensive part: a live call to the fund valuation service (simulated as 40 ms of waiting)
  let valuation: string | null = null;
  if (liveValuation) {
    await sleep(40);
    valuation = "live";
  }
  return { member, tenant, page: page ? "new" : "old", projection: projection ? "v2" : "v1", bulkUpload, valuation: valuation ?? "end of previous month" };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/statement") {
      const body = await statement(url.searchParams.get("member") ?? "", url.searchParams.get("tenant") ?? "");
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    } else if (url.pathname === "/flags/stats") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ...flags.stats, ttlMs, cached: flags.cached() }));
    } else if (url.pathname === "/health") {
      res.writeHead(200).end("ok");
    } else {
      res.writeHead(404).end();
    }
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(PORT, () => console.log(`   [server] statement API on :${PORT}, flag cache TTL ${ttlMs} ms, LISTEN ${flags.opts.listen ? "on" : "off"}`));

process.on("SIGTERM", () => server.close(async () => {
  await flags.stop();
  await db.end();
  process.exit(0);
}));
