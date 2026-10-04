// The RUM collector on :53149. POST /vitals takes one metric per beacon and appends it to out/vitals.ndjson;
// GET /summary answers the p75 per page and metric, the way Core Web Vitals are judged.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { COLLECTOR_PORT, OUT } from "./paths.js";

export const STORE = join(OUT, "vitals.ndjson");
export const METRICS = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;

export interface Beacon {
  page: string;
  profile: string;
  name: string;
  value: number;
  rating: string;
  id: string;
  navigationType: string;
  receivedAt: string;
}

// p75 by nearest rank: the smallest value that at least 75% of the samples are at or below.
export function p75(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.75 * sorted.length) - 1)];
}

export function readBeacons(): Beacon[] {
  if (!existsSync(STORE)) return [];
  // A metric can be reported more than once per page view (CLS and INP grow); the last report per id wins.
  const byId = new Map<string, Beacon>();
  for (const line of readFileSync(STORE, "utf8").split("\n").filter(Boolean)) {
    const b = JSON.parse(line) as Beacon;
    byId.set(b.id, b);
  }
  return [...byId.values()];
}

export function summary() {
  const beacons = readBeacons();
  const out: Record<string, Record<string, { n: number; p75: number }>> = {};
  for (const b of beacons) (out[b.page] ??= {})[b.name] ??= { n: 0, p75: 0 };
  for (const page of Object.keys(out))
    for (const name of Object.keys(out[page])) {
      const values = beacons.filter((b) => b.page === page && b.name === name).map((b) => b.value);
      out[page][name] = { n: values.length, p75: p75(values) };
    }
  return out;
}

const ALLOWED = new Set<string>(METRICS);

export function startCollector(port = COLLECTOR_PORT) {
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/vitals") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          // Validate before storing: anyone can post to a public beacon endpoint.
          if (!ALLOWED.has(b.name) || typeof b.value !== "number" || !Number.isFinite(b.value) || !/^(slow|fast)$/.test(b.page)) throw new Error("bad beacon");
          const row: Beacon = { page: b.page, profile: String(b.profile).slice(0, 20), name: b.name, value: b.value, rating: String(b.rating), id: String(b.id).slice(0, 64), navigationType: String(b.navigationType), receivedAt: new Date().toISOString() };
          appendFileSync(STORE, JSON.stringify(row) + "\n");
          res.writeHead(204).end();
        } catch {
          res.writeHead(400).end();
        }
      });
      return;
    }
    if (req.method === "GET" && req.url === "/summary") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(summary(), null, 2));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise<typeof server>((resolve) => server.listen(port, () => resolve(server)));
}

export const resetStore = () => writeFileSync(STORE, "");

if (process.argv[1]?.endsWith("collector.ts")) {
  await startCollector();
  console.log(`RUM collector: POST http://localhost:${COLLECTOR_PORT}/vitals, GET /summary; stores ${STORE}`);
}
