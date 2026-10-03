// The provider: node:http, routed by the spec. Requests are validated before a handler runs (400 with every
// problem listed); responses are validated before they leave (enforce: a drifted response becomes a 500;
// warn: it is sent, and logged).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contract, summarise, type Issue } from "./contract.js";
import { seed } from "./data.js";
import { DEPRECATIONS, type Reply, handlers, problem } from "./handlers.js";
import { loadSpec } from "./spec.js";

export const PORT = 53043;
export const DRIFT_PORT = 53143;
export const SPEC = fileURLToPath(new URL("../openapi/v2.yaml", import.meta.url));
export const TOKENS = new Set(["portal-demo-token", "acme-demo-token"]);

export interface ProviderOptions {
  drift?: boolean;
  responses?: "enforce" | "warn";
  name?: string;
}

export function provider(opts: ProviderOptions = {}) {
  const doc = loadSpec(SPEC);
  const c = contract(doc);
  const impl = handlers(seed(), opts.drift ?? false);
  const name = opts.name ?? "provider";
  const drifted: { operationId: string; status: number; issues: Issue[] }[] = [];

  // Every operation in the spec has a handler, every handler an operation, every deprecated operation its dates.
  const ids = new Set(c.ops.map((o) => o.operationId));
  const missing = [...ids].filter((id) => !impl[id]);
  const extra = Object.keys(impl).filter((id) => !ids.has(id));
  const undated = c.ops.filter((o) => o.deprecated && !DEPRECATIONS[o.operationId]).map((o) => o.operationId);
  if (missing.length || extra.length || undated.length) throw new Error(`spec and code disagree: no handler for [${missing}], no operation for [${extra}], no sunset for [${undated}]`);

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString();

    if (req.method === "GET" && url.pathname === "/openapi.yaml") return void res.writeHead(200, { "content-type": "application/yaml" }).end(readFileSync(SPEC));
    if (req.method === "GET" && url.pathname === "/docs") return void res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(new URL("../out/api-reference.html", import.meta.url)));

    const found = c.match(req.method ?? "GET", url.pathname);
    if (found === null) return send(res, problem(404, "Not found", `no operation at ${url.pathname}`));
    if (found === "method") return send(res, { ...problem(405, "Method not allowed"), headers: {} });
    const { op, params } = found;

    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ") || !TOKENS.has(auth.slice(7))) {
      const reply = { ...problem(401, "Unauthorized", "send Authorization: Bearer <token>"), headers: { "www-authenticate": 'Bearer realm="members"' } };
      return send(res, reply);
    }

    const checked = c.checkRequest(op, params, { method: op.method, path: url.pathname, query: url.searchParams, contentType: req.headers["content-type"], rawBody });
    let reply: Reply = checked.matched ? impl[op.operationId](checked.matched) : problem(400, "Bad request", "the request does not match the API description", checked.issues);

    const out = { status: reply.status, headers: reply.headers ?? {}, contentType: contentType(reply.status), body: reply.body };
    const issues = c.checkResponse(op, out);
    if (issues.length) {
      drifted.push({ operationId: op.operationId, status: reply.status, issues });
      console.log(`   [${name}] response drift in ${op.operationId} ${reply.status}: ${summarise(issues).join("; ")}${opts.responses === "warn" ? " (sent anyway: warn mode)" : " (replaced by a 500: enforce mode)"}`);
      if (opts.responses !== "warn") reply = problem(500, "Internal server error", "the response did not match the API description");
    }
    send(res, reply);
  }

  return {
    drifted,
    server: null as Server | null,
    async listen(port: number) {
      this.server = createServer((req, res) => handle(req, res).catch((e) => send(res, problem(500, "Internal server error", String(e)))));
      await new Promise<void>((resolve) => this.server!.listen(port, resolve));
      return this.server;
    },
    async close() {
      await new Promise((resolve) => this.server?.close(resolve));
    },
  };
}

const contentType = (status: number) => (status >= 400 ? "application/problem+json" : "application/json");

function send(res: ServerResponse, reply: Reply) {
  const body = reply.body === undefined ? "" : JSON.stringify(reply.body);
  res.writeHead(reply.status, { ...(reply.headers ?? {}), ...(body ? { "content-type": contentType(reply.status) } : {}) });
  res.end(body);
}

// npm run server: the provider on its own, for curl or the contract test by hand.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const drift = process.env.DRIFT === "1";
  const p = provider({ drift, responses: (process.env.RESPONSE_VALIDATION as "warn" | "enforce") ?? "enforce" });
  const port = Number(process.env.PORT ?? (drift ? DRIFT_PORT : PORT));
  await p.listen(port);
  console.log(`provider on http://localhost:${port} (drift ${drift ? "on" : "off"}), spec at /openapi.yaml, reference at /docs`);
}
