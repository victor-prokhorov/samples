// The story: the same Charge call from orders to payments, four ways. Steps 2-4 run both services in this process
// with a tap on the wire between them; steps 5-7 use the Compose stack (src/*-main.ts, two Envoy sidecars, the tap).
import { readFileSync, writeFileSync } from "node:fs";
import * as grpc from "@grpc/grpc-js";
import { CERTS, describeAll, spiffe } from "./certs.js";
import { CARD, type Outcome, Payments, charge } from "./grpc.js";
import { startPayments } from "./payments.js";
import { resultsTable, type Cell } from "./table.js";
import { Tap } from "./tap.js";

const ORDERS_URL = "http://localhost:53061";
const TAP_URL = "http://localhost:53261";
const PAYMENTS_SIDECAR = "localhost:53161";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}
let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean) {
  console.log(`   ${cond ? "check ok" : "CHECK FAILED"}: ${label}`);
  if (cond) passed++;
  else failed.push(label);
}

const pem = (name: string) => readFileSync(`${CERTS}${name}`);
const NAME_OVERRIDE = { "grpc.ssl_target_name_override": "payments", "grpc.default_authority": "payments" };

// The callers: the real orders, a workload with no certificate, one with a certificate from another CA that claims
// to be orders, orders with an expired certificate, and reports, which the mesh CA did sign but which may not charge.
const CALLERS = [
  { id: "orders", label: "orders", cert: "orders" },
  { id: "none", label: "no client certificate", cert: "" },
  { id: "rogue", label: "rogue CA, claims orders", cert: "rogue-orders" },
  { id: "expired", label: "orders, expired certificate", cert: "expired-orders" },
  { id: "reports", label: "reports (trusted, not allowed)", cert: "reports" },
] as const;

const tlsCreds = (cert: string, ca = "ca.crt") =>
  cert ? grpc.credentials.createSsl(pem(ca), pem(`${cert}.key`), pem(`${cert}.crt`)) : grpc.credentials.createSsl(pem(ca));

// grpc-js wraps handshake errors in connection-state text with a timestamp; keep the part a reader needs
const reason = (d: string) =>
  d.replace(/\s+/g, " ").replace(/^No connection established\. Last error: (Error: )?/, "").replace(/\. Resolution note:.*$/, "")
    .replace(/ \(\d{4}-[^)]*\)/, "").replace(/^[0-9A-F]+:error:[0-9A-F]+:SSL routines:[a-z0-9_]+:/, "").replace(/:\.\.\/deps\/.*$/, "")
    .replace(/:SSL alert number \d+.*$/, "").slice(0, 100);
const describe = (o: Outcome) => (o.ok ? `OK, payments saw caller=${o.reply.caller}` : `${o.code}: ${reason(o.details)}`);
const cell = (o: Outcome): Cell =>
  o.ok
    ? { ok: true, text: o.reply.caller === "unknown" ? "allowed, caller unknown" : `allowed as ${o.reply.caller.split("/").pop()}` }
    : { ok: false, text: o.code === "PERMISSION_DENIED" ? "denied: not allowed" : "refused at handshake" };

const req = (orderId: string) => ({ orderId, cardNumber: CARD, amountCents: 4200 });
const matrix: Record<string, Record<string, Cell>> = {};
const wire: Record<string, Cell> = {};
const set = (mode: string, caller: string, c: Cell) => ((matrix[mode] ??= {})[caller] = c);

async function callAll(mode: string, target: string, creds: (cert: string) => grpc.ChannelCredentials, options: grpc.ChannelOptions = {}) {
  const out: Record<string, Outcome> = {};
  for (const c of CALLERS) {
    const client = new Payments(target, creds(c.cert), options);
    out[c.id] = await charge(client, req(`order-${mode}-${c.id}`));
    client.close();
    console.log(`   ${c.label.padEnd(32)} ${describe(out[c.id])}`);
    set(mode, c.id, cell(out[c.id]));
  }
  return out;
}

function showWire(mode: string, tap: { bytes: number; sawCard: boolean; strings: string[] }, words = false) {
  const strings = words ? tap.strings.filter((s) => /[a-z]{6,}/.test(s)) : tap.strings;
  console.log(`   the tap saw ${tap.bytes} bytes; card number ${tap.sawCard ? "READABLE" : "not readable"}; readable strings: ${strings.slice(0, 8).join(" | ") || "-"}`);
  wire[mode] = tap.sawCard ? { ok: false, text: "card number readable" } : { ok: true, text: "encrypted" };
}

async function inProcess(mode: string, serverCreds: grpc.ServerCredentials, clientCreds: (cert: string) => grpc.ChannelCredentials, allow?: string[]) {
  const payments = await startPayments({ host: "127.0.0.1", port: 0, credentials: serverCreds, allow });
  const tap = new Tap({ host: "127.0.0.1", port: payments.port }, CARD);
  const tapPort = await tap.listen();
  // only the orders call goes through the tap, so what it saw is exactly one Charge
  const ordersClient = new Payments(`127.0.0.1:${tapPort}`, clientCreds("orders"), NAME_OVERRIDE);
  const first = await charge(ordersClient, req(`order-${mode}-tapped`));
  ordersClient.close();
  const seen = tap.stats();
  const all = await callAll(mode, `127.0.0.1:${payments.port}`, clientCreds, NAME_OVERRIDE);
  await tap.close();
  await payments.stop();
  return { first, seen, all, payments };
}

async function waitForMesh() {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${ORDERS_URL}/checkout`).then((x) => x.json() as Promise<Outcome>, () => undefined);
    if (r?.ok) return i;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error("the mesh did not come up");
}

async function main() {
  step("1. A private CA and one identity per workload", "the platform's CA signs a short-lived certificate per service; the identity is a SPIFFE URI in the SAN, not an IP or a hostname");
  // issued by `npm run certs` before the Compose stack started, so the sidecars mount the same files
  const certs = describeAll(["ca", "payments", "orders", "reports", "rogue-orders", "rogue-payments", "expired-orders"]);
  const lines = certs.map((c) => `${c.name.padEnd(15)} issuer=${c.issuer.padEnd(13)} until=${c.validTo} signed-by-mesh-CA=${c.signedByMesh ? "yes" : "no "} ${c.san || "(no SAN)"}`);
  for (const l of lines) console.log(`   ${l}`);
  writeFileSync("out/certs.txt", lines.join("\n") + "\n");
  const by = (n: string) => certs.find((c) => c.name === n)!;
  check("orders, payments and reports carry their SPIFFE id and verify against the mesh CA", ["orders", "payments", "reports"].every((n) => by(n).signedByMesh && by(n).san.includes(spiffe(n))));
  check("the rogue certificates claim orders and payments but the mesh CA did not sign them", by("rogue-orders").san.includes(spiffe("orders")) && !by("rogue-orders").signedByMesh && !by("rogue-payments").signedByMesh);
  check("the expired orders certificate is signed by the mesh CA but out of date", by("expired-orders").signedByMesh && !by("expired-orders").inDate);

  step("2. Plaintext gRPC inside the platform", "\"it is our network\": no TLS; anyone on the path reads the call, and payments cannot tell who called");
  const plain = await inProcess("plaintext", grpc.ServerCredentials.createInsecure(), () => grpc.credentials.createInsecure());
  showWire("plaintext", plain.seen);
  check("the call works and the card number crosses the wire in clear", plain.first.ok && plain.seen.sawCard);
  check("every caller is accepted and payments sees caller=unknown", Object.values(plain.all).every((o) => o.ok && o.reply.caller === "unknown"));

  step("3. TLS, server side only (like HTTPS)", "the wire is encrypted and orders knows it reached payments, but payments still accepts any caller");
  const serverTls = await inProcess("server TLS", grpc.ServerCredentials.createSsl(null, [{ private_key: pem("payments.key"), cert_chain: pem("payments.crt") }], false), (c) => tlsCreds(c));
  showWire("server TLS", serverTls.seen, true);
  check("the card number is no longer readable on the wire", serverTls.first.ok && !serverTls.seen.sawCard);
  check("every caller, even one without a certificate, is still accepted as unknown", Object.values(serverTls.all).every((o) => o.ok && o.reply.caller === "unknown"));

  step("4. Mutual TLS in the app", "payments asks for a client certificate from the mesh CA and reads the caller's SPIFFE id from it; an allowlist decides who may charge");
  const mtls = await inProcess(
    "mTLS in app",
    grpc.ServerCredentials.createSsl(pem("ca.crt"), [{ private_key: pem("payments.key"), cert_chain: pem("payments.crt") }], true),
    (c) => tlsCreds(c),
    [spiffe("orders")],
  );
  showWire("mTLS in app", mtls.seen, true);
  const m = mtls.all;
  check("orders is accepted and payments knows it is orders, from the certificate", m.orders.ok && m.orders.reply.caller === spiffe("orders"));
  check("no certificate, a rogue CA and an expired certificate are all refused during the handshake", ["none", "rogue", "expired"].every((k) => !m[k].ok && m[k].code === "UNAVAILABLE"));
  check("reports gets through the handshake but the allowlist answers PERMISSION_DENIED", !m.reports.ok && m.reports.code === "PERMISSION_DENIED");
  // mutual: orders checks payments too. An impostor with the right name but the wrong CA never receives the card.
  const fake = await startPayments({ host: "127.0.0.1", port: 0, credentials: grpc.ServerCredentials.createSsl(null, [{ private_key: pem("rogue-payments.key"), cert_chain: pem("rogue-payments.crt") }], false) });
  const fakeTap = new Tap({ host: "127.0.0.1", port: fake.port }, CARD);
  const toFake = new Payments(`127.0.0.1:${await fakeTap.listen()}`, tlsCreds("orders"), NAME_OVERRIDE);
  const impostor = await charge(toFake, req("order-impostor"));
  toFake.close();
  console.log(`   orders -> a fake payments with a rogue-CA certificate for "payments": ${describe(impostor)}; the fake received ${fake.seen.length} charges`);
  check("orders refuses a payments impostor before sending anything", !impostor.ok && fake.seen.length === 0 && !fakeTap.stats().sawCard);
  await fakeTap.close();
  await fake.stop();
  console.log("   the cost: every service loads its key, certificate and CA, asks for and checks the peer's certificate, maps it to an identity and reloads certificates before they expire, in every language the platform uses")

  step("5. Sidecars: the same plaintext apps, mTLS on the wire", "each app talks plaintext to an Envoy in its own network namespace; the sidecars do mTLS between them, check identities and pass the caller's id in x-forwarded-client-cert");
  const tries = await waitForMesh();
  console.log(`   mesh ready (${tries} retries while Envoy started)`);
  const meshCall = (await (await fetch(`${ORDERS_URL}/checkout`)).json()) as Outcome;
  const meshTap = (await (await fetch(`${TAP_URL}/stats`)).json()) as ReturnType<Tap["stats"]>;
  console.log(`   orders app -> 127.0.0.1:15001 (its sidecar) -> tap -> payments' sidecar :15443 -> 127.0.0.1:50051: ${describe(meshCall)}`);
  console.log(`   (the tap has relayed every byte between the two sidecars since the stack started: ${meshTap.connections} connection(s), handshake included)`);
  showWire("Envoy sidecars", meshTap, true);
  set("Envoy sidecars", "orders", cell(meshCall));
  const appCode = ["src/orders-main.ts", "src/payments-main.ts"].map((f) => readFileSync(f, "utf8"));
  const tlsInApps = appCode.map((s) => (s.match(/createSsl|ServerCredentials\.createSsl|\.key|\.crt/g) ?? []).length);
  console.log(`   TLS calls or key/certificate files in orders-main.ts and payments-main.ts: ${tlsInApps.join(" and ")}`);
  check("the call works and payments learns its caller from the sidecar's header", meshCall.ok && meshCall.reply.caller === spiffe("orders"));
  check("on the wire between the sidecars the card number is not readable", meshTap.bytes > 0 && !meshTap.sawCard);
  check("neither app has any TLS code or certificate", tlsInApps.every((n) => n === 0));
  const stats1 = (await (await fetch(`${ORDERS_URL}/stats`)).json()) as { orders: Record<string, number>; payments: Record<string, number> };
  console.log(`   orders' sidecar: ssl.handshake=${stats1.orders["cluster.payments.ssl.handshake"]} TLSv1.3=${stats1.orders["cluster.payments.ssl.versions.TLSv1.3"]} fail_verify_san=${stats1.orders["cluster.payments.ssl.fail_verify_san"]}`);
  check("orders' sidecar did a TLS 1.3 handshake with payments' sidecar", stats1.orders["cluster.payments.ssl.handshake"] >= 1 && stats1.orders["cluster.payments.ssl.versions.TLSv1.3"] >= 1);

  step("6. The sidecar decides who may call", "other workloads dial payments' sidecar directly with their own credentials; Envoy refuses unknown certificates at the handshake and RBAC allows Charge only for orders' SPIFFE id");
  const direct = await callAll("Envoy sidecars", PAYMENTS_SIDECAR, (c) => tlsCreds(c), NAME_OVERRIDE);
  set("Envoy sidecars", "orders", cell(meshCall)); // the orders row is the call through orders' own sidecar (step 5)
  check("another orders replica with a valid certificate is allowed and identified", direct.orders.ok && direct.orders.reply.caller === spiffe("orders"));
  check("no certificate, the rogue CA and the expired certificate are refused at the handshake", ["none", "rogue", "expired"].every((k) => !direct[k].ok && direct[k].code === "UNAVAILABLE"));
  check("reports is authenticated but RBAC answers PERMISSION_DENIED", !direct.reports.ok && direct.reports.code === "PERMISSION_DENIED");
  // A caller cannot claim someone else's identity with a header: the sidecar replaces x-forwarded-client-cert.
  const spoof = new Payments(PAYMENTS_SIDECAR, tlsCreds("orders"), NAME_OVERRIDE);
  const md = new grpc.Metadata();
  md.set("x-forwarded-client-cert", `URI=${spiffe("admin")}`);
  const spoofed = await new Promise<Outcome>((resolve) =>
    (spoof as unknown as { charge: Function }).charge(req("order-spoof"), md, { deadline: Date.now() + 3000 }, (err: grpc.ServiceError | null, reply: { paymentId: string; caller: string }) =>
      resolve(err ? { ok: false, code: grpc.status[err.code], details: err.details } : { ok: true, reply }),
    ),
  );
  spoof.close();
  console.log(`   orders sends its own x-forwarded-client-cert claiming admin: ${describe(spoofed)}`);
  check("the forged header is replaced: payments still sees orders", spoofed.ok && spoofed.reply.caller === spiffe("orders"));
  const stats2 = (await (await fetch(`${ORDERS_URL}/stats`)).json()) as { orders: Record<string, number>; payments: Record<string, number> };
  const p = (k: string) => stats2.payments[`listener.0.0.0.0_15443.ssl.${k}`] ?? 0;
  console.log(`   payments' sidecar: handshake=${p("handshake")} fail_verify_no_cert=${p("fail_verify_no_cert")} fail_verify_error=${p("fail_verify_error")} connection_error=${p("connection_error")} rbac.allowed=${stats2.payments["http.inbound.rbac.allowed"]} rbac.denied=${stats2.payments["http.inbound.rbac.denied"]}`);
  check("payments' sidecar counted the refusals: a missing certificate, untrusted ones, and one RBAC denial", p("fail_verify_no_cert") >= 1 && p("fail_verify_error") >= 2 && stats2.payments["http.inbound.rbac.denied"] >= 1);

  step("7. No way around the sidecar", "payments listens on 127.0.0.1 only, so a workload that dials its plaintext port directly finds nothing");
  const bypass = (await (await fetch(`${ORDERS_URL}/bypass`)).json()) as Outcome;
  console.log(`   orders app -> payments-app:50051 directly, plaintext: ${describe(bypass)}`);
  check("the plaintext port is not reachable from the network", !bypass.ok && bypass.code === "UNAVAILABLE" && /ECONNREFUSED/.test(bypass.details));

  step("8. Summary table", "out/results.svg: who gets through, and what the wire shows, in each mode");
  const svg = resultsTable(
    ["plaintext", "server TLS", "mTLS in app", "Envoy sidecars"],
    CALLERS.map((c) => ({ id: c.id, label: c.label })),
    matrix,
    wire,
    "out/results.svg",
  );
  console.log(`   wrote out/results.svg (${svg.length} bytes)`);
  for (const mode of Object.keys(matrix)) console.log(`   ${mode.padEnd(15)} ${CALLERS.map((c) => `${c.id}: ${matrix[mode][c.id]?.text}`).join("; ")}; wire: ${wire[mode]?.text}`);
  check("the table was written", svg.includes("Envoy sidecars"));

  console.log(failed.length ? `\nFAILED: ${failed.length} of ${passed + failed.length} checks: ${failed.join("; ")}` : `\n${passed} checks passed`);
  if (failed.length) process.exitCode = 1;
}

await main();
