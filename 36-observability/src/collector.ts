// A tiny trace and metric collector: what Jaeger or the OpenTelemetry Collector would do here, in 150 lines.
// It accepts OTLP/HTTP with JSON bodies (POST /v1/traces, POST /v1/metrics), keeps the spans as flat JSON
// objects (in memory and appended to .collector/spans.jsonl), and answers:
//   GET /api/traces/<trace id>   every span of one trace, sorted by start time
//   GET /api/red?slo_ms=300      rate, errors, duration and requests within the objective, per service and route
// Standalone: `COLLECTOR_PORT=4318 npm run collector`, then point OTEL_EXPORTER_OTLP_ENDPOINT at it.
import { createServer, type Server } from "node:http";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export type Span = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  service: string;
  name: string;
  kind: string;
  startMs: number; // epoch milliseconds, fractional
  durationMs: number;
  status: "UNSET" | "OK" | "ERROR";
  attributes: Record<string, unknown>;
  events: Array<{ name: string; attributes: Record<string, unknown> }>;
};

export type RedRow = {
  service: string;
  route: string;
  requests: number;
  errors: number;
  ratePerSec: number;
  p50: string;
  p95: string;
  withinSlo: number; // requests that answered within the objective
};

type OtlpValue = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean; arrayValue?: { values: OtlpValue[] } };
type OtlpAttr = { key: string; value: OtlpValue };
const KINDS = ["UNSPECIFIED", "INTERNAL", "SERVER", "CLIENT", "PRODUCER", "CONSUMER"];
const STATUS = ["UNSET", "OK", "ERROR"] as const;

function value(v: OtlpValue): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue) return v.arrayValue.values.map(value);
  return null;
}
const attrs = (list: OtlpAttr[] = []) => Object.fromEntries(list.map((a) => [a.key, value(a.value)]));
const nanosToMs = (n: string | number) => Number(BigInt(n) / 1000n) / 1000;

type Point = { service: string; instance: string; attributes: Record<string, unknown>; count: number; bounds: number[]; buckets: number[]; startMs: number; timeMs: number };

export function collector(file = ".collector/spans.jsonl") {
  const spans: Span[] = [];
  const points = new Map<string, Point>(); // per process and attribute set: the sum of the deltas received since clearMetrics()
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "");

  function ingestTraces(body: any) {
    const out: Span[] = [];
    for (const rs of body.resourceSpans ?? []) {
      const service = String(attrs(rs.resource?.attributes)["service.name"] ?? "unknown");
      for (const ss of rs.scopeSpans ?? [])
        for (const s of ss.spans ?? []) {
          const startMs = nanosToMs(s.startTimeUnixNano);
          out.push({
            traceId: s.traceId,
            spanId: s.spanId,
            parentSpanId: s.parentSpanId || null,
            service,
            name: s.name,
            kind: KINDS[s.kind ?? 0],
            startMs,
            durationMs: nanosToMs(s.endTimeUnixNano) - startMs,
            status: STATUS[s.status?.code ?? 0],
            attributes: attrs(s.attributes),
            events: (s.events ?? []).map((e: any) => ({ name: e.name, attributes: attrs(e.attributes) })),
          });
        }
    }
    spans.push(...out);
    if (out.length) appendFileSync(file, out.map((s) => JSON.stringify(s)).join("\n") + "\n");
    return out.length;
  }

  function ingestMetrics(body: any) {
    for (const rm of body.resourceMetrics ?? []) {
      const r = attrs(rm.resource?.attributes);
      const service = String(r["service.name"] ?? "unknown");
      const instance = String(r["service.instance.id"] ?? r["process.pid"] ?? "");
      for (const sm of rm.scopeMetrics ?? [])
        for (const m of sm.metrics ?? []) {
          if (m.name !== "http.server.request.duration" || !m.histogram) continue;
          // Delta temporality (1): each point is what happened since the previous export, so points add up.
          if (m.histogram.aggregationTemporality !== 1) throw new Error("this collector sums delta histograms only");
          for (const p of m.histogram.dataPoints ?? []) {
            const a = attrs(p.attributes);
            const key = `${service}|${instance}|${JSON.stringify(a)}`;
            const prev = points.get(key);
            const buckets: number[] = p.bucketCounts.map(Number);
            points.set(key, {
              service,
              instance,
              attributes: a,
              count: (prev?.count ?? 0) + Number(p.count),
              bounds: p.explicitBounds.map(Number),
              buckets: prev ? buckets.map((n, i) => n + prev.buckets[i]) : buckets,
              startMs: prev?.startMs ?? nanosToMs(p.startTimeUnixNano),
              timeMs: nanosToMs(p.timeUnixNano),
            });
          }
        }
    }
  }

  // Duration from a histogram: the bucket that holds the q-th request. A histogram only keeps counts per
  // bucket, so the honest answer is a range ("100-200 ms"), never an exact p95.
  function quantile(boundsMs: number[], buckets: number[], q: number) {
    const total = buckets.reduce((s, n) => s + n, 0);
    let seen = 0;
    for (let i = 0; i < buckets.length; i++) {
      seen += buckets[i];
      if (seen >= q * total) return i === boundsMs.length ? `> ${boundsMs[i - 1]} ms` : `${i ? boundsMs[i - 1] : 0}-${boundsMs[i]} ms`;
    }
    return "-";
  }

  // The sums of each process, added up per service and route. sloMs must be a bucket edge,
  // so "requests within the objective" is an exact count, not an estimate.
  function red(sloMs: number): RedRow[] {
    const groups = new Map<string, Point[]>();
    for (const p of points.values()) {
      if (p.attributes["http.route"] === undefined) continue; // /health and unmatched paths
      const key = `${p.service}|${p.attributes["http.request.method"]} ${p.attributes["http.route"]}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()]
      .map(([key, ps]) => {
        const [service, route] = key.split("|");
        const boundsMs = ps[0].bounds.map((b) => Math.round(b * 1000));
        const edge = boundsMs.indexOf(sloMs);
        if (edge < 0) throw new Error(`no bucket edge at ${sloMs} ms`);
        const buckets = ps[0].buckets.map((_, i) => ps.reduce((s, p) => s + p.buckets[i], 0));
        const requests = ps.reduce((s, p) => s + p.count, 0);
        const errors = ps.filter((p) => Number(p.attributes["http.response.status_code"]) >= 500).reduce((s, p) => s + p.count, 0);
        const withinSlo = buckets.slice(0, edge + 1).reduce((s, n) => s + n, 0);
        const seconds = (Math.max(...ps.map((p) => p.timeMs)) - Math.min(...ps.map((p) => p.startMs))) / 1000;
        return { service, route, requests, errors, ratePerSec: requests / seconds, p50: quantile(boundsMs, buckets, 0.5), p95: quantile(boundsMs, buckets, 0.95), withinSlo };
      })
      .sort((a, b) => a.service.localeCompare(b.service) || a.route.localeCompare(b.route));
  }

  const trace = (id: string) => spans.filter((s) => s.traceId === id).sort((a, b) => a.startMs - b.startMs);

  const http: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.method === "POST" && !String(req.headers["content-type"]).startsWith("application/json")) return send(415, { error: "OTLP/HTTP with JSON bodies only" });
      if (req.method === "POST" && req.url === "/v1/traces") return ingestTraces(JSON.parse(Buffer.concat(chunks).toString())), send(200, {});
      if (req.method === "POST" && req.url === "/v1/metrics") return ingestMetrics(JSON.parse(Buffer.concat(chunks).toString())), send(200, {});
      const m = /^\/api\/traces\/([0-9a-f]{32})$/.exec(req.url ?? "");
      if (req.method === "GET" && m) return send(200, trace(m[1]));
      if (req.method === "GET" && req.url?.startsWith("/api/red")) return send(200, red(Number(new URL(req.url, "http://x").searchParams.get("slo_ms") ?? 300)));
      send(404, { error: "not found" });
    });
  });

  return {
    http,
    spans,
    trace,
    red,
    clearMetrics: () => points.clear(),
    listen: (port = 0) => new Promise<number>((ok) => http.listen(port, () => ok((http.address() as { port: number }).port))),
    close: () => new Promise<void>((ok) => http.close(() => ok())),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const c = collector();
  const port = await c.listen(Number(process.env.COLLECTOR_PORT ?? 0));
  console.log(`collector on :${port}; export with OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:${port}`);
}
