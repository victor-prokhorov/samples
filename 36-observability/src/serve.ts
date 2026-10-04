// A tiny node:http router shared by the web and API processes. For every request it:
// - tells the HTTP instrumentation the route template (RPC metadata), so the server span is named
//   "GET /employers/:code/dashboard" and the standard http.server.request.duration histogram carries
//   http.route: that histogram is the RED metric (count = Rate, status >= 500 = Errors, buckets = Duration);
// - writes one JSON log line with pino; the pino instrumentation adds trace_id and span_id to it.
import { createServer, type IncomingMessage } from "node:http";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { getRPCMetadata, RPCType } from "@opentelemetry/core";
import pino from "pino";
import { SLO_MS } from "./config.js";

export const log = pino({ base: { service: process.env.OTEL_SERVICE_NAME }, timestamp: pino.stdTimeFunctions.isoTime });

export type Reply = { status: number; body: unknown; type?: string };
export type Handler = (params: Record<string, string>, req: IncomingMessage) => Promise<Reply>;
type Route = { method: string; template: string; pattern: RegExp; keys: string[]; handler: Handler };

export function server(routes: Array<[string, string, Handler]>) {
  const table: Route[] = routes.map(([method, template, handler]) => {
    const keys: string[] = [];
    const pattern = new RegExp(`^${template.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
    return { method, template, pattern, keys, handler };
  });
  return createServer(async (req, res) => {
    const started = performance.now();
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/health") return res.end("ok");
    let route = "unmatched";
    let reply: Reply;
    try {
      const hit = table.find((r) => r.method === req.method && r.pattern.test(path));
      if (!hit) reply = { status: 404, body: { error: "not found" } };
      else {
        route = hit.template;
        const rpc = getRPCMetadata(context.active());
        if (rpc?.type === RPCType.HTTP) rpc.route = route;
        const values = hit.pattern.exec(path)!.slice(1);
        reply = await hit.handler(Object.fromEntries(hit.keys.map((k, i) => [k, decodeURIComponent(values[i])])), req);
      }
    } catch (err) {
      const e = err as Error;
      const span = trace.getActiveSpan();
      span?.recordException(e);
      span?.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
      log.error({ error: { type: e.name, message: e.message } }, "unhandled error");
      reply = { status: 500, body: { error: "internal error" } };
    }
    const fields = { method: req.method, route, path, status: reply.status, duration_ms: Math.round(performance.now() - started) };
    if (reply.status >= 500) log.error(fields, "request failed");
    else if (fields.duration_ms > SLO_MS) log.warn(fields, "slow request");
    else log.info(fields, "request");
    res.writeHead(reply.status, { "content-type": reply.type ?? "application/json" });
    res.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body));
  });
}
