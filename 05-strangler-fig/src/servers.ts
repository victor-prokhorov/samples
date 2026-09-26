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

type NewOrder = { orderId: number; customerId: number; totalCents: number; state: "PAID" | "PENDING" };

type NewInvoice = { invoiceId: number; orderId: number; amountCents: number };

type NewUser = { userId: number; displayName: string };

const newOrders: Record<string, NewOrder> = { "1": { orderId: 1, customerId: 1, totalCents: 4250, state: "PAID" } };

const newInvoices: Record<string, NewInvoice> = { "1": { invoiceId: 1, orderId: 1, amountCents: 4250 } };

const newUsers: Record<string, NewUser> = { "1": { userId: 1, displayName: "alice" } };

const money = (cents: number) => (cents / 100).toFixed(2);

export function startModern(port: number) {
  const handlers: Record<string, (id: string) => object | undefined> = {
    orders: (id) => {
      const o = newOrders[id];
      return o && { id: o.orderId, userId: o.customerId, total: money(o.totalCents), status: o.state.toLowerCase() };
    },
    invoices: (id) => {
      const i = newInvoices[id];
      return i && { id: i.invoiceId, orderId: i.orderId, amount: money(i.amountCents) };
    },
    users: (id) => {
      const u = newUsers[id];
      return u && { id: u.userId, name: u.displayName };
    },
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

function isRouteArray(value: unknown): value is Route[] {
  return Array.isArray(value) && value.every((r) => typeof r === "object" && r !== null && typeof r.prefix === "string" && typeof r.port === "number");
}

function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function matches(url: string, prefix: string) {
  return url === prefix || url.startsWith(`${prefix}/`);
}

export function startProxy(port: number, fallbackPort: number, routes: Route[]) {
  return listen(
    http.createServer((req, res) => {
      if (req.method === "PUT" && req.url === "/_proxy/routes") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const next = parse(body);
          if (!isRouteArray(next)) return json(res, "proxy", 400, { error: "expected [{ prefix, port }]" });
          routes.splice(0, routes.length, ...next);
          json(res, "proxy", 200, { routes });
        });
        return;
      }
      const port = routes.find((r) => matches(req.url ?? "", r.prefix))?.port ?? fallbackPort;
      const upstream = http.request({ host: "localhost", port, path: req.url, method: req.method, headers: req.headers }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      });
      upstream.on("error", (err) => (res.headersSent ? res.destroy(err) : json(res, "proxy", 502, { error: err.message })));
      req.pipe(upstream);
    }),
    port,
  );
}
