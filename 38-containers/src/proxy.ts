// The blue-green switch: a tiny reverse proxy in front of two app containers.
//   every request          -> forwarded to the active colour (blue on :53148 or green on :53248)
//   POST /__proxy/switch?to=green&mode=safe    polls green's /readyz every 100 ms and flips only after a 200
//   POST /__proxy/switch?to=green&mode=naive   flips at once, ready or not (the way it goes wrong)
//   GET  /__proxy/state                        the active colour and the switch history
// The proxy never retries: a failed upstream call becomes a 502, so the load generator sees every failure.
import http from "node:http";
import { type Color, PROXY_PORT, upstreamPort } from "./config.js";

let active: Color = (process.env.ACTIVE as Color) ?? "blue";
const history: { at: string; from: Color; to: Color; mode: string; waitedMs: number; polls: number }[] = [];

function log(msg: string) {
  console.log(`${new Date().toISOString()} [proxy] ${msg}`);
}

async function readyz(color: Color): Promise<{ status: number; reason: string }> {
  try {
    const res = await fetch(`http://localhost:${upstreamPort[color]}/readyz`, { signal: AbortSignal.timeout(1000) });
    const body = (await res.json()) as { reason?: string };
    return { status: res.status, reason: body.reason ?? "ready" };
  } catch (err) {
    return { status: 0, reason: (err as Error).cause ? String(((err as Error).cause as Error).message) : (err as Error).message };
  }
}

async function switchTo(to: Color, mode: string) {
  const from = active;
  const started = Date.now();
  let polls = 0;
  if (mode === "safe") {
    let last = "";
    for (;;) {
      polls++;
      const r = await readyz(to);
      if (r.status === 200) break;
      const line = `${to} /readyz ${r.status || "no answer"} (${r.reason}): keep sending traffic to ${from}`;
      if (line !== last) log(line);
      last = line;
      if (Date.now() - started > 30_000) throw new Error(`${to} not ready after 30 s, staying on ${from}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  active = to;
  const entry = { at: new Date().toISOString(), from, to, mode, waitedMs: Date.now() - started, polls };
  history.push(entry);
  log(`switched ${from} -> ${to} (${mode}${mode === "safe" ? `, ${to} answered /readyz 200 after ${entry.waitedMs} ms and ${polls} polls` : ", without asking"})`);
  return entry;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://proxy");
  if (url.pathname === "/__proxy/state") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ active, history }));
  }
  if (url.pathname === "/__proxy/switch" && req.method === "POST") {
    try {
      const entry = await switchTo(url.searchParams.get("to") as Color, url.searchParams.get("mode") ?? "safe");
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(entry));
    } catch (err) {
      res.writeHead(409, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }
  // The colour is chosen per request, when it arrives. A request already forwarded to blue stays on blue
  // and finishes there; blue keeps serving it while it drains.
  const color = active;
  // A new upstream connection per request (agent: false): no pooled keep-alive socket to an old colour
  // can be reused after the switch, or be closed under a request by a draining server.
  const upstream = http.request(
    { host: "localhost", port: upstreamPort[color], path: req.url, method: req.method, headers: req.headers, agent: false },
    (up) => {
      res.writeHead(up.statusCode ?? 502, { ...up.headers, "x-upstream": color });
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { "content-type": "application/json", "x-upstream": color });
    res.end(JSON.stringify({ error: `upstream ${color}: ${(err as NodeJS.ErrnoException).code ?? err.message}` }));
  });
  req.pipe(upstream);
});

server.listen(PROXY_PORT, () => log(`listening on :${PROXY_PORT}, active upstream ${active} (:${upstreamPort[active]})`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
