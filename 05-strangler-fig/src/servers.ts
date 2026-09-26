import http from "node:http";

export type Route = { prefix: string; port: number };

const users: Record<string, object> = { "1": { id: 1, name: "alice" } };

const orders: Record<string, object> = { "1": { id: 1, userId: 1, total: "42.50", status: "paid" } };

const invoices: Record<string, object> = { "1": { id: 1, orderId: 1, amount: "42.50" } };

function json(res: http.ServerResponse, servedBy: string, status: number, body: object) {
  res.writeHead(status, { "content-type": "application/json", "x-served-by": servedBy });
  res.end(JSON.stringify(body));
}

function listen(server: http.Server, port: number) {
  return new Promise<http.Server>((resolve) => server.listen(port, () => resolve(server)));
}

export function startLegacy(port: number, hits: { count: number }) {
  const tables: Record<string, Record<string, object>> = { users, orders, invoices };
  return listen(
    http.createServer((req, res) => {
      hits.count++;
      const [, table, id] = (req.url ?? "").split("/");
      const row = tables[table]?.[id];
      return row ? json(res, "legacy-monolith", 200, row) : json(res, "legacy-monolith", 404, { error: "not found" });
    }),
    port,
  );
}

export function startModern(port: number) {
  const handlers: Record<string, (id: string) => object | undefined> = {
    orders: (id) => orders[id],
    invoices: (id) => invoices[id],
    users: (id) => users[id],
  };
  return listen(
    http.createServer((req, res) => {
      const [, resource, id] = (req.url ?? "").split("/");
      const row = handlers[resource]?.(id);
      return row ? json(res, "new-service", 200, row) : json(res, "new-service", 404, { error: "not found" });
    }),
    port,
  );
}

export function startProxy(port: number, fallbackPort: number, routes: Route[]) {
  return listen(
    http.createServer((req, res) => {
      if (req.method === "PUT" && req.url === "/_proxy/routes") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          routes.splice(0, routes.length, ...(JSON.parse(body) as Route[]));
          json(res, "proxy", 200, { routes });
        });
        return;
      }
      const port = routes.find((r) => req.url?.startsWith(r.prefix))?.port ?? fallbackPort;
      const upstream = http.request({ host: "localhost", port, path: req.url, method: req.method, headers: req.headers }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      });
      upstream.on("error", (err) => json(res, "proxy", 502, { error: err.message }));
      req.pipe(upstream);
    }),
    port,
  );
}
