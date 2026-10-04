import { isDeepStrictEqual } from "node:util";
import { Route, startLegacy, startModern, startProxy } from "./servers.js";
import { check } from "./check.js";

const PROXY = 53000;
const LEGACY = 53001;
const MODERN = 53002;
const PATHS = ["/users/1", "/orders/1", "/invoices/1"];

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function setRoutes(routes: Route[]) {
  await fetch(`http://localhost:${PROXY}/_proxy/routes`, { method: "PUT", body: JSON.stringify(routes) });
  console.log(`   routes: ${routes.length === 0 ? "(none, everything falls through to legacy)" : routes.map((r) => `${r.prefix} -> ${r.port === MODERN ? "new" : "legacy"}`).join(", ")}`);
}

// Sends one request per path through the proxy, then checks the claim of the step: every response keeps legacy's
// contract, and exactly the paths in `moved` were served by the new service (legacy handled the rest).
async function traffic(hits: { count: number }, baseline: Map<string, unknown>, moved: string[]) {
  const before = hits.count;
  let same = true;
  const servedByNew: string[] = [];
  for (const path of PATHS) {
    const res = await fetch(`http://localhost:${PROXY}${path}`);
    const seen = { status: res.status, body: await res.json() };
    const by = res.headers.get("x-served-by");
    same = same && isDeepStrictEqual(seen, baseline.get(path));
    if (by === "new-service") servedByNew.push(path.split("/")[1]);
    console.log(`   GET ${path.padEnd(11)} -> ${by?.padEnd(15)} same contract as legacy: ${isDeepStrictEqual(seen, baseline.get(path))}`);
  }
  const legacy = hits.count - before;
  console.log(`   legacy handled ${legacy}/${PATHS.length} client requests`);
  check("every response keeps legacy's contract", same);
  const label = moved.length ? `only ${moved.join(", ")} served by the new service` : "everything served by legacy";
  check(`${label}; legacy handled ${PATHS.length - moved.length}/${PATHS.length}`, servedByNew.sort().join() === [...moved].sort().join() && legacy === PATHS.length - moved.length);
}

async function main() {
  const hits = { count: 0 };
  const routes: Route[] = [];
  const servers = await Promise.all([startLegacy(LEGACY, hits), startModern(MODERN), startProxy(PROXY, LEGACY, routes)]);
  const baseline = new Map<string, unknown>();
  for (const path of PATHS) {
    const res = await fetch(`http://localhost:${LEGACY}${path}`);
    baseline.set(path, { status: res.status, body: await res.json() });
  }
  hits.count = 0;
  console.log(`proxy :${PROXY} (clients only ever call this), legacy :${LEGACY}, new service :${MODERN}`);
  console.log("recorded legacy responses as the contract baseline");
  step("0. Put the facade in front", "clients switch to the proxy once; it forwards everything to legacy, nothing else changes");
  await setRoutes([]);
  await traffic(hits, baseline, []);
  step("1. Strangle the first capability", "build /orders in the new service, then flip one route; clients see the same contract");
  await setRoutes([{ prefix: "/orders", port: MODERN }]);
  await traffic(hits, baseline, ["orders"]);
  step("2. Roll back in one call", "if the new service misbehaves, point the route back; no deploy, no client change");
  await setRoutes([]);
  await traffic(hits, baseline, []);
  step("3. Move more capabilities", "orders again, then invoices: the new system grows around the old one");
  await setRoutes([
    { prefix: "/orders", port: MODERN },
    { prefix: "/invoices", port: MODERN },
  ]);
  await traffic(hits, baseline, ["orders", "invoices"]);
  step("4. Last route moved, legacy receives nothing", "zero traffic to legacy is the signal it can be switched off");
  await setRoutes([
    { prefix: "/orders", port: MODERN },
    { prefix: "/invoices", port: MODERN },
    { prefix: "/users", port: MODERN },
  ]);
  await traffic(hits, baseline, ["orders", "invoices", "users"]);
  for (const s of servers) {
    s.closeAllConnections();
    s.close();
  }
}

main();
