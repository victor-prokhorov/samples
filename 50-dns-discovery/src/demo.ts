// The story, run from the host. Docker's DNS only answers inside the Compose network, so every lookup and request
// goes through the probe container (src/probe.ts); the host side scales, stops and pauses replicas with the docker CLI.
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { type Row, requestsChart } from "./chart.js";
import { CACHE_MS, PROBE_PORT, type RunResult } from "./config.js";
import type { Srv } from "./srv.js";

const PROJECT = "50-dns-discovery";
const SRV_NAME = "_http._tcp.ledger.svc.internal";

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

const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const compose = (...args: string[]) => docker("compose", ...args);

async function probe<T>(path: string): Promise<T> {
  const res = await fetch(`http://localhost:${PROBE_PORT}${path}`, { method: path.startsWith("/run") ? "POST" : "GET" });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body as T;
}

// container name (catalog-1) for each IP, from the Docker engine rather than from DNS
function containers(): Map<string, string> {
  const ids = docker("ps", "-a", "-q", "--filter", `label=com.docker.compose.project=${PROJECT}`, "--filter", "label=com.docker.compose.service=catalog").split("\n").filter(Boolean);
  const map = new Map<string, string>();
  for (const line of docker("inspect", "-f", "{{.Name}} {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}} {{.State.Status}}", ...ids).split("\n")) {
    const [name, ip, state] = line.split(" ");
    if (ip) map.set(ip, name.replace(`/${PROJECT}-`, ""));
    else map.set(`(${state})`, name.replace(`/${PROJECT}-`, ""));
  }
  return map;
}

let names = new Map<string, string>();
const label = (ip: string) => names.get(ip) ?? ip;
const rows: Row[] = [];
const seen = new Set<string>();

function show(stepName: string, r: RunResult) {
  const by = Object.entries(r.byIp).sort(([a], [b]) => label(a).localeCompare(label(b), undefined, { numeric: true }));
  const errors = Object.entries(r.errors).map(([e, n]) => `${n} x ${e.replace(/\(([\d.]+)\)/, (_, ip) => `(${label(ip)})`)}`);
  console.log(`   ${r.client.padEnd(10)} ${String(r.sent).padStart(4)} sent  ${by.map(([ip, n]) => `${label(ip)}=${n}`).join(" ") || "-"}${errors.length ? `  FAILED: ${errors.join(", ")}` : ""}${r.retried ? `  (${r.retried} retried)` : ""}  p50 ${r.p50} ms, max ${r.max} ms, ${r.ms} ms in all`);
  const byReplica: Record<string, number> = {};
  for (const [ip, n] of by) {
    byReplica[label(ip)] = n;
    seen.add(label(ip));
  }
  rows.push({ step: stepName, client: r.client, byReplica, failed: Object.values(r.errors).reduce((a, b) => a + b, 0) });
  return { replicas: by.map(([ip]) => ip), failed: Object.values(r.errors).reduce((a, b) => a + b, 0) };
}

const run = (client: string, n: number) => probe<RunResult>(`/run?client=${client}&n=${n}`);
const resolve = () => probe<{ address: string; ttl: number }[]>("/resolve?name=catalog");

async function main() {
  const clients = await probe<{ name: string; how: string }[]>("/clients");
  console.log("   the four clients in the probe (all configured with the name catalog:8080 only):");
  for (const c of clients) console.log(`     ${c.name.padEnd(10)} ${c.how}`);

  step("1. A name, several addresses", "Compose registers every container of a service under the service name in its embedded DNS (127.0.0.11); one A record per replica");
  names = containers();
  const a1 = await resolve();
  console.log(`   resolve4("catalog") -> ${a1.map((r) => `${r.address} (${label(r.address)}, ttl ${r.ttl} s)`).join(", ")}`);
  const running = [...names.keys()].filter((ip) => !ip.startsWith("("));
  check("DNS returns one A record per running replica (3), the same addresses Docker assigned", a1.length === 3 && a1.every((r) => running.includes(r.address)));
  check(`Docker's DNS answers with a TTL of ${a1[0].ttl} s: a client that honours it may keep a gone address for minutes`, a1[0].ttl >= 60);

  step("2. Spreading the load", "a keep-alive connection is opened once and reused, so a client that resolves per connection sticks to one replica; resolving per request and picking at random spreads it");
  const s2 = Object.fromEntries(await Promise.all(["pinned", "fresh", "cached", "resilient"].map(async (c) => [c, await run(c, 150)] as const)));
  const p2 = show("2. three replicas", s2.pinned);
  const f2 = show("2. three replicas", s2.fresh);
  show("2. three replicas", s2.cached);
  show("2. three replicas", s2.resilient);
  check("the keep-alive client sends all 150 requests to one replica", p2.replicas.length === 1 && s2.pinned.byIp[p2.replicas[0]] === 150);
  check("resolving per request reaches all 3 replicas, none with less than 20% of the requests", f2.replicas.length === 3 && Object.values(s2.fresh.byIp).every((n) => n >= 30));

  step("3. Scale out, no config change", "docker compose up --scale catalog=5: the new replicas are in DNS as soon as they start; a client that cached the old answer does not see them until its cache expires");
  await run("cached", 1); // the cached client's cache now holds the 3 addresses, for CACHE_MS
  const warmed = Date.now();
  compose("up", "-d", "--wait", "--no-recreate", "--scale", "catalog=5");
  names = containers();
  const a3 = await resolve();
  console.log(`   after scaling, resolve4("catalog") -> ${a3.length} records: ${a3.map((r) => label(r.address)).join(", ")} (${((Date.now() - warmed) / 1000).toFixed(1)} s after the cached client last asked)`);
  check("DNS lists all 5 replicas right after they start", a3.length === 5);
  const f3 = show("3. scaled to five", await run("fresh", 200));
  const c3 = show("3. scaled to five", await run("cached", 200));
  check("the client that resolves per request reaches all 5 replicas at once", f3.replicas.length === 5);
  check(`the client with an ${CACHE_MS / 1000} s cache still uses only the 3 old replicas`, c3.replicas.length === 3);
  const wait = Math.max(0, warmed + CACHE_MS + 200 - Date.now());
  console.log(`   waiting ${(wait / 1000).toFixed(1)} s for the cached answer to expire`);
  await sleep(wait);
  const c3b = show("3. after the cache expired", await run("cached", 200));
  check("once its cache expires, the cached client spreads over all 5", c3b.replicas.length === 5);
  const pinnedIp = Object.keys((await run("pinned", 1)).byIp)[0];
  console.log(pinnedIp === p2.replicas[0]
    ? `   the keep-alive client is still on ${label(pinnedIp)}: its connection never closed, so it never looked up again`
    : `   the keep-alive client moved from ${label(p2.replicas[0])} to ${label(pinnedIp)} only because its idle connection was closed during the wait (Node's server closes idle keep-alive connections after 5 s) and the new connection looked the name up again`);

  step("4. A replica leaves (docker stop)", "a stopped container drops out of DNS at once, but a cached address still points at it; the keep-alive client loses its connection and looks up again");
  // both caches start this step holding all 5 addresses, the victim's included
  await probe("/forget");
  await run("cached", 1);
  await run("resilient", 1);
  const victim = label(pinnedIp);
  // compose stop takes a service, not one replica: stop the container by name
  docker("stop", "-t", "1", `${PROJECT}-${victim}`);
  const a4 = await resolve();
  console.log(`   stopped ${victim} (${pinnedIp}); resolve4("catalog") -> ${a4.length} records, ${a4.some((r) => r.address === pinnedIp) ? "still including" : "without"} ${victim}`);
  check("the stopped replica is gone from DNS immediately", a4.length === 4 && !a4.some((r) => r.address === pinnedIp));
  const s4r = await run("resilient", 100);
  const r4 = show("4. one replica stopped", s4r);
  const c4 = show("4. one replica stopped", await run("cached", 100));
  const p4 = show("4. one replica stopped", await run("pinned", 100));
  const f4 = show("4. one replica stopped", await run("fresh", 100));
  check("the cached client keeps sending to the stopped replica's address and times out (about 1 in 5)", c4.failed >= 5);
  check("the resilient client drops the dead address after one timeout and loses no request", r4.failed === 0 && s4r.retried >= 1);
  check("the keep-alive client loses its connection, looks up again and lands on a live replica (at most 1 failure)", p4.failed <= 1 && p4.replicas.length === 1 && p4.replicas[0] !== pinnedIp);
  check("the client that resolves per request never sees the stopped replica", f4.failed === 0 && !f4.replicas.includes(pinnedIp));

  step("5. A replica hangs (docker pause)", "DNS knows names, not health: a paused container is still registered, so every DNS-based client keeps choosing it until a timeout says otherwise");
  const live = [...names.entries()].filter(([ip, n]) => ip !== pinnedIp && !ip.startsWith("(") && n.startsWith("catalog-")).map(([ip, n]) => ({ ip, n }));
  const hung = live[0];
  docker("pause", `${PROJECT}-${hung.n}`);
  try {
    const a5 = await resolve();
    console.log(`   paused ${hung.n} (${hung.ip}); resolve4("catalog") -> ${a5.length} records, ${a5.some((r) => r.address === hung.ip) ? "still including" : "without"} ${hung.n}`);
    check("the paused replica is still in DNS", a5.some((r) => r.address === hung.ip));
    const f5 = show("5. one replica paused", await run("fresh", 60));
    await probe("/forget");
    const s5r = await run("resilient", 60);
    const r5 = show("5. one replica paused", s5r);
    check("the client that resolves per request times out on about a quarter of its requests", f5.failed >= 5);
    check("the resilient client times out once (300 ms), drops the address and loses no request", r5.failed === 0 && s5r.retried >= 1);
  } finally {
    docker("unpause", `${PROJECT}-${hung.n}`);
  }

  step("6. SRV records: port and weight from DNS", "RFC 2782: _http._tcp.ledger.svc.internal lists each instance with a priority, a weight and a port; the client tries the lowest priority first and splits by weight");
  const srv = await probe<Srv[]>(`/srv?name=${SRV_NAME}`);
  for (const r of srv.sort((a, b) => a.priority - b.priority || b.weight - a.weight)) console.log(`   SRV ${r.priority} ${r.weight} ${r.port} ${r.name}`);
  check("CoreDNS serves 3 SRV records, each with its own port", srv.length === 3 && new Set(srv.map((r) => r.port)).size === 3);
  const s6 = await probe<{ counts: Record<string, number>; paths: Record<string, number> }>(`/srv-run?name=${SRV_NAME}&n=400`);
  console.log(`   400 requests: ${Object.entries(s6.counts).map(([t, n]) => `${t}=${n}`).join(" ")}`);
  rows.push({ step: "6. SRV, weights 3:1", client: "srv", byReplica: Object.fromEntries(Object.entries(s6.counts).map(([t, n]) => [t.split(":")[0], n])), failed: s6.counts.failed ?? 0 });
  const share = (s6.counts["ledger-a:8081"] ?? 0) / 400;
  check(`weights 3 and 1 split the traffic about 75/25 (ledger-a got ${(share * 100).toFixed(0)}%), and nothing goes to the priority-20 backup`, share > 0.65 && share < 0.85 && !s6.counts["catalog:8080"]);
  compose("stop", "-t", "1", "ledger-a", "ledger-b");
  const s6b = await probe<{ counts: Record<string, number>; paths: Record<string, number> }>(`/srv-run?name=${SRV_NAME}&n=50`);
  console.log(`   ledger-a and ledger-b stopped, 50 requests: ${Object.entries(s6b.counts).map(([t, n]) => `${t}=${n}`).join(" ")}`);
  for (const [p, n] of Object.entries(s6b.paths)) console.log(`     ${n} x tried ${p}`);
  rows.push({ step: "6. SRV, priority-10 down", client: "srv", byReplica: Object.fromEntries(Object.entries(s6b.counts).map(([t, n]) => [t.split(":")[0], n])), failed: s6b.counts.failed ?? 0 });
  for (const t of Object.keys({ ...s6.counts, ...s6b.counts })) seen.add(t.split(":")[0]);
  check("with every priority-10 target gone, all 50 requests fall back to the priority-20 target", s6b.counts["catalog:8080"] === 50);

  step("7. Chart", "out/requests.svg: which replica answered each client, step by step");
  const order = [...seen].filter((s) => s !== "failed").sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const svg = requestsChart(rows, order, "out/requests.svg");
  console.log(`   wrote out/requests.svg (${svg.length} bytes, ${rows.length} bars)`);
  check("the chart was written", svg.includes("catalog-1"));

  console.log(failed.length ? `\nFAILED: ${failed.length} of ${passed + failed.length} checks: ${failed.join("; ")}` : `\n${passed} checks passed`);
  if (failed.length) process.exitCode = 1;
}

await main();
