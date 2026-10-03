import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { buildDocs } from "./docs.js";
import { type DeprecationNotice, activeMembers, portalClient, requestEmailChange, totalPaid, totalPaidLegacy, yearsOfService } from "./consumer.js";
import { DRIFT_PORT, PORT, SPEC, provider } from "./server.js";
import { loadSpec, operations } from "./spec.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

// Runs a command to the end (asynchronously: the providers in this process must keep answering); prints the
// lines worth reading (all of them unless a filter is given).
async function run(cmd: string, args: string[], opts: { env?: Record<string, string>; show?: (line: string) => boolean } = {}) {
  console.log(`   $ ${[...Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`), cmd, ...args].join(" ")}`);
  const child = spawn(cmd, args, { env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", REDOCLY_TELEMETRY: "off", ...opts.env } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const [code] = (await once(child, "close")) as [number | null];
  for (const l of out.split("\n").filter((l) => l.trim() && (opts.show ? opts.show(l) : true))) console.log(`   | ${l.length > 180 ? `${l.slice(0, 180)}...` : l}`);
  console.log(`   -> exit ${code}`);
  return { code: code ?? 1, out };
}

const TOKEN = "acme-demo-token";
const base = `http://localhost:${PORT}`;
const raw = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(base + path, { ...init, headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers as Record<string, string>) } });
  return { status: res.status, headers: res.headers, body: await res.json() };
};
const vitestShow = (l: string) => /^\s*(✓|×|→|Tests\s|FAIL\s)/.test(l) || /^\s*\+\s+"/.test(l);

step("1. The spec comes first", "openapi/v2.yaml (OpenAPI 3.1, JSON Schema 2020-12) is written before the handlers and linted in CI; the router, both validators, the client types, the contract test and the reference page all read it");
const lint = await run("npx", ["redocly", "lint", "openapi/v1.yaml", "openapi/v2.yaml", "openapi/v2-breaking.yaml", "--format=summary"]);
check(lint.code === 0, "the three revisions are valid OpenAPI 3.1 under Redocly's recommended rules");
const ops = operations(loadSpec(SPEC));
for (const o of ops) console.log(`   ${o.method.padEnd(5)} ${o.path.padEnd(36)} ${o.operationId.padEnd(24)} ${Object.keys(o.responses).join(" ")}${o.deprecated ? "  (deprecated)" : ""}`);
check(ops.length === 6 && ops.filter((o) => o.deprecated).length === 1, "six operations, one of them deprecated");

step("2. The client is generated, and generated code is checked in sync", "openapi-typescript turns the spec into path, parameter and schema types; openapi-fetch is a typed fetch over them. CI regenerates and compares, so the committed client cannot lag behind the spec");
mkdirSync(".tmp", { recursive: true });
await run("npx", ["openapi-typescript", "openapi/v2.yaml", "-o", ".tmp/api.d.ts"], { show: (l) => l.includes("→") });
const inSync = readFileSync(".tmp/api.d.ts", "utf8") === readFileSync("src/generated/api.d.ts", "utf8");
console.log(`   src/generated/api.d.ts: ${readFileSync("src/generated/api.d.ts", "utf8").split("\n").length} lines, ${inSync ? "identical to a fresh generation" : "STALE"}`);
check(inSync, "the committed client types match the spec");

step("3. Requests are validated against the spec at runtime", "before any handler runs, path, query and body are checked against the operation's schemas; the 400 is an RFC 9457 problem that lists every mismatch, and unknown query parameters are refused rather than ignored");
const good = provider({ name: "provider", responses: "enforce" });
await good.listen(PORT);
console.log(`   provider (handlers fixed, response validation: enforce) on ${base}`);
let r = await raw("/contributions?memberId=M0001&limit=99&year=2026");
console.log(`   GET /contributions?memberId=M0001&limit=99&year=2026 -> ${r.status} ${JSON.stringify(r.body.errors)}`);
check(r.status === 400 && r.body.errors.length === 2, "a limit over the maximum and an undeclared parameter are both reported");
r = await raw("/members/M0002/change-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "phone", value: "", effectiveDate: "2026-02-30", urgent: true }) });
console.log(`   POST /members/M0002/change-requests {kind: phone, value: "", effectiveDate: 2026-02-30, urgent: true} -> ${r.status}`);
for (const e of r.body.errors) console.log(`     ${e.where}: ${e.message}`);
check(r.status === 400 && r.body.errors.length === 4, "four problems in one body, all reported at once");
const anon = await fetch(`${base}/members/M0001`);
console.log(`   GET /members/M0001 without a token -> ${anon.status}, WWW-Authenticate: ${anon.headers.get("www-authenticate")}`);
check(anon.status === 401, "no token, no data");

step("4. A consumer uses the typed client", "an employer system calls the API through openapi-fetch; a middleware reads the Deprecation, Sunset and Link headers and reports each deprecated call once, so the consumer learns about the sunset from the API itself");
const notices: DeprecationNotice[] = [];
const client = portalClient(base, TOKEN, (n) => {
  notices.push(n);
  console.log(`   [consumer] DEPRECATED ${n.operation} since ${n.deprecatedOn}, sunset ${n.sunset}, use ${n.successor}`);
});
const members = await activeMembers(client, "acme");
console.log(`   active Acme members: ${members.map((m) => `${m.id} ${m.firstName} ${m.lastName}`).join(", ")}`);
console.log(`   M0001 years of service on 2026-10-03: ${await yearsOfService(client, "M0001", "2026-10-03")}`);
const legacy = await totalPaidLegacy(client, "M0001");
await totalPaidLegacy(client, "M0002");
const paged = await totalPaid(client, "M0001", 5);
console.log(`   M0001 total paid: ${legacy.toFixed(2)} through the deprecated endpoint, ${paged.total.toFixed(2)} through GET /contributions in ${paged.pages} pages of 5`);
check(legacy === paged.total && paged.pages === 3, "the successor returns the same contributions, paged");
check(notices.length === 1 && notices[0].sunset === "Wed, 31 Mar 2027 23:59:59 GMT" && notices[0].successor === "/contributions?memberId=M0001", "one deprecation notice, with the sunset date and the successor");
const legacyRes = await raw("/members/M0001/contributions");
for (const h of ["deprecation", "sunset", "link"]) console.log(`   ${h}: ${legacyRes.headers.get(h)}`);
const first = await requestEmailChange(client, "M0002", "bruno.petit@example.net", "2026-11-01");
const second = await requestEmailChange(client, "M0002", "b.petit@example.net", "2026-11-01");
console.log(`   change request: ${first.ok ? `201 ${first.request.id} at ${first.location}` : first.status}; again: ${second.ok ? "201" : `${second.status} ${second.problem.detail}`}`);
check(first.ok && !second.ok && second.status === 409, "the typed client gets the 201 body and the 409 problem, both typed");

step("5. Drift: a handler sends what the spec does not say", "two classic mistakes: returning the stored row as is (an undocumented, sensitive taxId leaks) and formatting amounts as text (\"250.50\" instead of 250.5). The provider runs them with response validation in warn mode, so they reach the wire, the runtime validator logs them, and the provider contract test fails");
const drift = provider({ name: "drift provider", drift: true, responses: "warn" });
await drift.listen(DRIFT_PORT);
const failing = await run("npx", ["vitest", "run", "--reporter=verbose"], { env: { PROVIDER_URL: `http://localhost:${DRIFT_PORT}` }, show: vitestShow });
check(failing.code !== 0, "the contract test fails against the drifting provider");
check(/taxId/.test(failing.out) && /memberAmount must be number/.test(failing.out), "it names the undocumented field and the wrong type");
check(drift.drifted.some((d) => d.operationId === "getMember") && drift.drifted.some((d) => d.operationId === "listContributions"), "the runtime response validator saw the same drift");
const enforced = provider({ name: "drift provider, enforce", drift: true, responses: "enforce" });
const srv = await enforced.listen(0);
const port = (srv.address() as { port: number }).port;
const leak = await fetch(`http://localhost:${port}/members/M0001`, { headers: { authorization: `Bearer ${TOKEN}` } });
const leakBody = await leak.text();
console.log(`   same drift with response validation in enforce mode: GET /members/M0001 -> ${leak.status} ${leakBody}`);
check(leak.status === 500 && !leakBody.includes("TX-"), "enforce mode fails closed: a 500, and the taxId never leaves");
await enforced.close();
await drift.close();

step("6. Fixed: the same contract test passes", "the fixed handlers map the row to the documented shape and send numbers; a fresh provider with them answers every case as the spec says");
await good.close();
const fixed = provider({ name: "fixed provider", responses: "enforce" });
await fixed.listen(PORT);
const passing = await run("npx", ["vitest", "run", "--reporter=verbose"], { env: { PROVIDER_URL: base }, show: vitestShow });
check(passing.code === 0 && /Tests\s+17 passed/.test(passing.out), "17 contract tests pass against the fixed provider");
check(good.drifted.length === 0 && fixed.drifted.length === 0, "the runtime validator saw no drift from the fixed handlers");
await fixed.close();

step("7. Breaking-change check between revisions", "a consumer written against v1 must keep working: removing or retyping a response field, or adding a required parameter, breaks it; adding an operation, an optional field or a deprecation does not. CI runs this on every change to the spec");
const ok = await run("npx", ["tsx", "src/breaking.ts", "openapi/v1.yaml", "openapi/v2.yaml"]);
check(ok.code === 0 && /0 breaking/.test(ok.out), "v1 -> v2 is compatible: it ships as 1.1.0");
const bad = await run("npx", ["tsx", "src/breaking.ts", "openapi/v1.yaml", "openapi/v2-breaking.yaml"]);
check(bad.code === 1 && /joinedOn: removed/.test(bad.out) && /query.year: new required parameter/.test(bad.out) && /type number -> string/.test(bad.out), "v1 -> v2-breaking fails on the removed field, the new required parameter and the retyped amounts");

step("8. The same break, seen by the consumer's compiler", "regenerating the client from the breaking draft makes the unchanged consumer fail tsc: the type checker finds the call sites a breaking change would hit at runtime");
rmSync(".tmp/breaking", { recursive: true, force: true });
mkdirSync(".tmp/breaking/generated", { recursive: true });
copyFileSync("src/consumer.ts", ".tmp/breaking/consumer.ts");
writeFileSync(".tmp/breaking/tsconfig.json", JSON.stringify({ extends: "../../tsconfig.json", include: ["."] }));
await run("npx", ["openapi-typescript", "openapi/v2-breaking.yaml", "-o", ".tmp/breaking/generated/api.d.ts"], { show: (l) => l.includes("→") });
const tsc = await run("npx", ["tsc", "-p", ".tmp/breaking", "--pretty", "false"], { show: (l) => l.includes("error TS") });
check(tsc.code !== 0 && /joinedOn/.test(tsc.out) && /year/.test(tsc.out), "the consumer no longer compiles: joinedOn is gone and year is required");

step("9. A reference page from the same spec", "Redocly renders the spec as one HTML page; the Redoc script is inlined so it works offline, attached to a ticket or opened from the repo");
const docs = buildDocs();
console.log(`   out/api-reference.html: ${(docs.bytes / 1024).toFixed(0)} KiB, external scripts or stylesheets: ${docs.external.length ? docs.external.join(", ") : "none"}`);
check(docs.external.length === 0, "the reference page loads no script or stylesheet from the network");

console.log("\nall checks passed");
