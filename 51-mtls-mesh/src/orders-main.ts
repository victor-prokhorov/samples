// orders in the mesh: plaintext gRPC to its own sidecar on 127.0.0.1:15001. The sidecar finds payments, opens mTLS
// with orders' certificate and checks that the far end is payments. This file has no TLS code at all.
// It also takes requests from the demo on :53061 (GET /checkout, GET /bypass, GET /stats).
import { createServer } from "node:http";
import * as grpc from "@grpc/grpc-js";
import { CARD, Payments, charge } from "./grpc.js";

const toSidecar = new Payments("127.0.0.1:15001", grpc.credentials.createInsecure());
// The same call aimed straight at payments' plaintext port, around both sidecars: what an attacker inside the network would try.
const bypass = new Payments("payments-app:50051", grpc.credentials.createInsecure());

async function envoyStats(host: string) {
  const res = await fetch(`http://${host}:9901/stats?format=json&filter=ssl|rbac|upstream_cx_total|downstream_cx_total`);
  const { stats } = (await res.json()) as { stats: { name: string; value?: number }[] };
  return Object.fromEntries(stats.filter((s) => typeof s.value === "number").map((s) => [s.name, s.value]));
}

let n = 1000;
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://orders");
  const send = (body: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (url.pathname === "/health") return send({ ok: true });
    if (url.pathname === "/checkout") return send(await charge(toSidecar, { orderId: `order-${++n}`, cardNumber: CARD, amountCents: 4200 }));
    if (url.pathname === "/bypass") return send(await charge(bypass, { orderId: `order-${++n}`, cardNumber: CARD, amountCents: 4200 }, 1500));
    // orders' sidecar admin is on 127.0.0.1 in this namespace; payments' sidecar exposes its admin on the network for this demo only
    if (url.pathname === "/stats") return send({ orders: await envoyStats("127.0.0.1"), payments: await envoyStats("payments-app") });
    res.writeHead(404).end();
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
}).listen(53061, () => console.log("[orders] on :53061, payments via its sidecar on 127.0.0.1:15001"));
