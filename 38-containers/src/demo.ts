// The story, step by step: build the image two ways, look inside, scan it, then deploy blue -> green twice
// (naively and safely) under steady load, and count the failed requests.
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { BLUE_PORT, type Color, GREEN_PORT, IMAGE, NAIVE_IMAGE, PROXY_PORT, upstreamPort } from "./config.js";
import { build, contextProbe, docker, dockerAsync, logs, mb, removeApp, runApp, state } from "./docker.js";
import { type Run, startLoad, summarize } from "./load.js";
import { writeTimeline } from "./timeline.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
  console.log(`   ok: ${what}`);
}

const V1 = `${IMAGE}:1.0.0`;
const V2 = `${IMAGE}:1.1.0`;
const BASE = process.env.BASE ?? ""; // empty: the Dockerfile's pinned node:22-slim digest
const mask = (s: string) => s.replace(/npm_[A-Za-z0-9]{36}/g, "npm_***(masked)***");

// A fake registry token in the shape of a real npm one, new on every run and never committed.
const token = "npm_" + randomBytes(64).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 36);
// What a developer has lying around in the project folder (gitignored, but the naive build context still sends it).
writeFileSync(".env", `DATABASE_URL=postgres://portal:local-dev-password@localhost:5432/portal\nNPM_TOKEN=${token}\n`);
const npmrc = join(tmpdir(), `38-npmrc-${process.pid}`);
writeFileSync(npmrc, `@initech:registry=https://npm.initech.example/\n//npm.initech.example/:_authToken=${token}\n`);
const ca = process.env.NPM_CA && existsSync(process.env.NPM_CA) ? process.env.NPM_CA : "";
if (ca) writeFileSync(".npm-ca.crt", readFileSync(ca)); // the naive build copies it with everything else

function layers(image: string) {
  return docker(["history", "--no-trunc", "--format", "{{.Size}}\t{{.CreatedBy}}", image])
    .split("\n")
    .map((l) => {
      const [size, ...rest] = l.split("\t");
      return { size, createdBy: rest.join("\t") };
    });
}

function bytes(s: string) {
  const m = /([\d.]+)\s*([kMG]?B)/.exec(s);
  return m ? Number(m[1]) * ({ B: 1, kB: 1e3, MB: 1e6, GB: 1e9 }[m[2]] ?? 1) : 0;
}

// Uncompressed: the sum of the layer sizes. Compressed: what a registry stores and a node pulls.
function sizes(image: string, baseLayers: number) {
  const all = layers(image);
  const total = all.reduce((n, l) => n + bytes(l.size), 0);
  const app = all.slice(0, all.length - baseLayers).reduce((n, l) => n + bytes(l.size), 0);
  const compressed = Number(docker(["image", "inspect", "--format", "{{.Size}}", image]));
  return { total, app, compressed };
}

function inside(image: string) {
  const script = "id -u; ls -A /app | tr '\\n' ' '; echo; ls /app/node_modules | wc -l; [ -d /app/node_modules/typescript ] && echo typescript || echo none; command -v npm || echo none";
  const [uid, files, packages, ts, npm] = docker(["run", "--rm", "--entrypoint", "sh", image, "-c", script]).split("\n");
  return { uid: Number(uid), files: files.trim(), packages: Number(packages), typescript: ts === "typescript", npm: npm !== "none" };
}

// CVEs: trivy matches every OS package and every package.json it finds against its vulnerability database.
function trivy(image: string) {
  const r = spawnSync(
    "docker",
    ["run", "--rm", "-v", "/var/run/docker.sock:/var/run/docker.sock", "-v", "trivy-cache-38:/root/.cache",
      ...(ca ? ["-v", `${ca}:/etc/ssl/certs/ca-certificates.crt:ro`] : []),
      process.env.TRIVY_IMAGE!, "image", "--quiet", "--scanners", "vuln", "--format", "json", image],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`trivy failed: ${r.stderr}`);
  type Result = { Target: string; Class: string; Vulnerabilities?: { Severity: string }[] };
  const results = (JSON.parse(r.stdout).Results ?? []) as Result[];
  const count = (cls: string, sev: string) => results.filter((x) => x.Class === cls).flatMap((x) => x.Vulnerabilities ?? []).filter((v) => v.Severity === sev).length;
  return {
    os: { critical: count("os-pkgs", "CRITICAL"), high: count("os-pkgs", "HIGH") },
    node: { critical: count("lang-pkgs", "CRITICAL"), high: count("lang-pkgs", "HIGH") },
  };
}

// Secrets: gitleaks over the image's /app folder and its full history (every RUN line and ARG value).
// (trivy has a secret scanner too, but its built-in rules have no npm token rule.)
function secretScan(image: string) {
  const dir = mkdtempSync(join(tmpdir(), "38-scan-"));
  try {
    const id = docker(["create", image]);
    docker(["cp", `${id}:/app`, join(dir, "app")]);
    docker(["rm", "-v", id]);
    writeFileSync(join(dir, "history.txt"), docker(["history", "--no-trunc", "--format", "{{.CreatedBy}}", image]) + "\n");
    spawnSync("docker", ["run", "--rm", "-v", `${dir}:/scan`, process.env.SECRET_SCANNER_IMAGE!, "dir", "/scan", "--no-banner", "--redact", "--exit-code", "0", "--report-format", "json", "--report-path", "/scan/report.json"], { stdio: "ignore" });
    const findings = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as { RuleID: string; File: string }[];
    return findings.map((f) => ({ rule: f.RuleID, file: f.File.replace("/scan/", "") }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function waitFor(what: string, test: () => Promise<boolean> | boolean, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await Promise.resolve().then(test).catch(() => false)) return Date.now() - started;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function get(port: number, path: string) {
  const res = await fetch(`http://localhost:${port}${path}`, { signal: AbortSignal.timeout(2000) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function startProxy() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/proxy.ts"], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, ACTIVE: "blue" } });
  child.stdout.on("data", (d: Buffer) => process.stdout.write(d.toString().trimEnd().replace(/^/gm, "   ") + "\n"));
  await waitFor("the proxy", async () => (await fetch(`http://localhost:${PROXY_PORT}/__proxy/state`)).ok);
  return child;
}

async function proxySwitch(to: Color, mode: "safe" | "naive") {
  const res = await fetch(`http://localhost:${PROXY_PORT}/__proxy/switch?to=${to}&mode=${mode}`, { method: "POST" });
  return (await res.json()) as { waitedMs: number; polls: number };
}

async function startBlue() {
  await runApp("blue", V1);
  await waitFor("blue /readyz 200", async () => (await get(BLUE_PORT, "/readyz")).status === 200);
}

function printLogs(color: Color, filter: RegExp) {
  for (const line of logs(color).filter((l) => filter.test(l))) console.log(`   ${color} log: ${line}`);
}

async function main() {
  for (const c of ["blue", "green"] as Color[]) removeApp(c);
  console.log(`   base image: ${process.env.BASE_NOTE ?? "node:22-slim pinned by digest in the Dockerfile"}`);
  const baseArg = BASE ? ["--build-arg", `BASE=${BASE}`] : [];
  const secretArgs = [...(ca ? ["--secret", `id=npm_ca,src=${ca}`] : []), "--secret", `id=npmrc,src=${npmrc}`];

  step(
    "1. Build the same app two ways",
    "the naive Dockerfile is one stage with COPY . . and no ignore file; the real one builds in stages (deps, build, prod-deps, runtime) and copies only the compiled JS and production node_modules into the last one",
  );
  const naive = build(["-f", "Dockerfile.naive", ...baseArg, "--build-arg", `NPM_TOKEN=${token}`, "-t", NAIVE_IMAGE, "."]);
  if (!naive.ok) throw new Error(mask(naive.output));
  const good = build([...baseArg, ...secretArgs, "--build-arg", "APP_VERSION=1.0.0", "-t", V1, "."]);
  if (!good.ok) throw new Error(mask(good.output));
  const good2 = build([...baseArg, ...secretArgs, "--build-arg", "APP_VERSION=1.1.0", "-t", V2, "."]);
  if (!good2.ok) throw new Error(mask(good2.output));
  const baseImage = BASE || "node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c";
  const baseLayers = layers(baseImage).length;
  const sBase = sizes(baseImage, baseLayers);
  const sNaive = sizes(NAIVE_IMAGE, baseLayers);
  const sGood = sizes(V1, baseLayers);
  const ctxNaive = contextProbe(baseImage, true);
  const ctxGood = contextProbe(baseImage, false);
  console.log(`   build context, naive (ignores nothing): ${(ctxNaive.bytes / 1e6).toFixed(1)} MB in ${ctxNaive.files} files: ${ctxNaive.entries}`);
  console.log(`   build context, with .dockerignore:      ${(ctxGood.bytes / 1e3).toFixed(1)} kB in ${ctxGood.files} files: ${ctxGood.entries}`);
  const row = (name: string, s: { total: number; app: number; compressed: number }) =>
    console.log(`   ${name.padEnd(34)} ${mb(s.app).padStart(14)} ${mb(s.total).padStart(13)} ${mb(s.compressed).padStart(11)}`);
  console.log(`   ${"image".padEnd(34)} ${"added to base".padStart(14)} ${"uncompressed".padStart(13)} ${"compressed".padStart(11)}`);
  row(`base (${BASE || "node:22-slim"})`, sBase);
  row(`before: ${NAIVE_IMAGE}`, sNaive);
  row(`after:  ${V1}`, sGood);
  console.log(`   multi-stage: ${mb(sNaive.total)} -> ${mb(sGood.total)} uncompressed (${((100 * (sNaive.total - sGood.total)) / sNaive.total).toFixed(0)}% smaller); the app's own layers ${(sNaive.app / 1e6).toFixed(1)} MB -> ${(sGood.app / 1e6).toFixed(1)} MB; the rest is the base image`);
  check(ctxNaive.bytes > 10e6 && ctxGood.bytes < 1e6 && /\.env\b/.test(ctxNaive.entries) && !/\.env\b|node_modules/.test(ctxGood.entries), ".dockerignore keeps node_modules and .env out of a build context under 1 MB; the naive context sends both");
  check(sGood.app * 10 < sNaive.app && sGood.total < sNaive.total, "the multi-stage image adds a tenth or less of what the naive one adds to the base");

  step("2. Look inside: user, files, dev dependencies", "the runtime stage runs as uid 1000 and holds dist/, production node_modules and package.json; no source, no TypeScript, no .env, no npm");
  const iNaive = inside(NAIVE_IMAGE);
  const iGood = inside(V1);
  for (const [name, i] of [[NAIVE_IMAGE, iNaive], [V1, iGood]] as const)
    console.log(`   ${name}: uid=${i.uid} packages=${i.packages} typescript=${i.typescript ? "yes" : "no"} npm=${i.npm ? "yes" : "no"}\n      /app: ${i.files}`);
  const cfg = (image: string, f: string) => docker(["image", "inspect", "--format", f, image]);
  console.log(`   ${V1}: User=${cfg(V1, "{{.Config.User}}")} Healthcheck=${cfg(V1, "{{json .Config.Healthcheck.Test}}")}`);
  console.log(`   ${NAIVE_IMAGE}: User=${cfg(NAIVE_IMAGE, "{{.Config.User}}") || "(empty: root)"} Healthcheck=${cfg(NAIVE_IMAGE, "{{if .Config.Healthcheck}}set{{else}}none{{end}}")} Cmd=${cfg(NAIVE_IMAGE, "{{json .Config.Cmd}}")}`);
  check(iGood.uid === 1000 && iNaive.uid === 0, "the multi-stage image runs as uid 1000, the naive one as root");
  check(!iGood.typescript && iNaive.typescript, "no dev dependency (typescript) in the final image; the naive image ships it");
  check(!/\.env|src\b/.test(iGood.files) && /\.env/.test(iNaive.files), "no .env and no source in the final image; the naive image copied the developer's .env");
  check(!iGood.npm, "npm is removed from the runtime image");
  check(cfg(V1, "{{if .Config.Healthcheck}}set{{end}}") === "set", "the final image declares a HEALTHCHECK");

  step("3. Secrets in layers: docker history", "every RUN line and every ARG value used by it is stored in the image metadata; a secret mount (RUN --mount=type=secret) is not");
  const leaked = (image: string) => layers(image).filter((l) => l.createdBy.includes(token));
  for (const l of leaked(NAIVE_IMAGE)) console.log(`   ${NAIVE_IMAGE} history: ${mask(l.createdBy).slice(0, 150)}`);
  const goodRuns = layers(V1).filter((l) => /--mount=type=secret|npm ci/.test(l.createdBy));
  for (const l of goodRuns.slice(0, 1)) console.log(`   ${V1} history: ${l.createdBy.slice(0, 150)}`);
  console.log(`   ${V1} history lines holding the token: ${leaked(V1).length}`);
  check(leaked(NAIVE_IMAGE).length > 0, "the naive image's history holds the registry token passed as a build ARG");
  check(leaked(V1).length === 0 && leaked(V2).length === 0, "no layer or history line of the multi-stage images holds the token (it came in as a secret mount)");

  step("4. Scan the images", "a CVE scanner (trivy) matches OS packages from the base and Node packages from node_modules against known vulnerabilities; a secret scanner (gitleaks) reads the files and the history");
  if (process.env.TRIVY_IMAGE) {
    const tNaive = trivy(NAIVE_IMAGE);
    const tGood = trivy(V1);
    for (const [name, t] of [[NAIVE_IMAGE, tNaive], [V1, tGood]] as const)
      console.log(`   trivy ${name}: OS packages critical=${t.os.critical} high=${t.os.high}; Node packages critical=${t.node.critical} high=${t.node.high}`);
    check(tGood.node.critical + tGood.node.high < tNaive.node.critical + tNaive.node.high, "fewer high and critical Node package CVEs in the final image (no dev dependencies, no npm)");
    console.log(`   the OS package CVEs (${tGood.os.critical} critical, ${tGood.os.high} high) come with the Debian base: fixed by bumping the pinned digest when Debian ships fixes, or by a smaller base`);
  } else console.log(`   no CVE scanner: ${process.env.TRIVY_NOTE ?? "TRIVY_IMAGE not set"}; the size, user and history checks above still ran`);
  if (process.env.SECRET_SCANNER_IMAGE) {
    const gNaive = secretScan(NAIVE_IMAGE);
    const gGood = secretScan(V1);
    for (const [name, g] of [[NAIVE_IMAGE, gNaive], [V1, gGood]] as const)
      console.log(`   gitleaks ${name}: ${g.length} finding(s)${g.map((f) => `\n      ${f.rule} in ${f.file}`).join("")}`);
    check(gNaive.some((f) => f.file === "history.txt") && gNaive.some((f) => f.file === "app/.env"), "the secret scanner finds the token in the naive image's history and in its copied .env");
    check(gGood.length === 0, "the secret scanner finds nothing in the final image");
  } else console.log(`   no secret scanner: ${process.env.SECRET_SCANNER_NOTE ?? "SECRET_SCANNER_IMAGE not set"}; the docker history check above still ran`);

  step("5. Liveness and readiness", "/healthz says the process answers (Docker's HEALTHCHECK uses it); /readyz also needs warm caches and a database that answers, and is what a load balancer asks before sending traffic");
  await startBlue();
  await waitFor("Docker health 'healthy'", () => state("blue").health === "healthy");
  console.log(`   blue: docker health=${state("blue").health}, /healthz ${(await get(BLUE_PORT, "/healthz")).status}, /readyz ${(await get(BLUE_PORT, "/readyz")).status}`);
  console.log("   $ docker compose stop postgres");
  docker(["compose", "stop", "postgres"]);
  try {
    await sleep(5000); // more than two HEALTHCHECK intervals
    const ready = await get(BLUE_PORT, "/readyz");
    const live = await get(BLUE_PORT, "/healthz");
    const health = state("blue").health;
    console.log(`   database stopped: /readyz ${ready.status} ${JSON.stringify(ready.body)}, /healthz ${live.status}, docker health=${health}`);
    check(ready.status === 503 && live.status === 200 && health === "healthy", "with the database down the app is not ready (no traffic) but still alive (no restart loop)");
  } finally {
    docker(["compose", "start", "postgres"]);
    console.log("   $ docker compose start postgres");
  }
  const back = await waitFor("blue ready again", async () => (await get(BLUE_PORT, "/readyz")).status === 200);
  console.log(`   ready again ${back} ms after the database came back`);

  const proxy = await startProxy();
  let naiveRun: Run;
  let safeRun: Run;
  try {
    step("6. The naive cutover", "flip the proxy to green as soon as its container starts, then kill blue (SIGKILL, what a plain process kill or an impatient script does)");
    {
      const load = startLoad();
      await sleep(1000);
      load.exports(3);
      load.mark("3 exports sent, green started");
      await runApp("green", V2);
      await proxySwitch("green", "naive");
      load.mark("switched");
      console.log("   $ docker kill --signal KILL 38-containers-blue");
      await dockerAsync(["kill", "--signal", "KILL", "38-containers-blue"]);
      load.mark("blue killed");
      await sleep(3000);
      naiveRun = await load.stop();
      const s = summarize(naiveRun);
      console.log(`   ${s.total} requests through :${PROXY_PORT}; failed ${s.failed}; served by ${s.byUpstream}`);
      console.log(`   failures: ${s.failures}`);
      printLogs("blue", /SIGTERM|drain|listening/);
      console.log(`   blue: exit code ${state("blue").exitCode} (137 = killed, nothing drained)`);
      check(s.failed > 0, "the naive cutover failed requests: in-flight ones on blue and early ones on a green that was not ready");
    }
    for (const c of ["blue", "green"] as Color[]) removeApp(c);
    await startBlue();
    await proxySwitch("blue", "safe");

    step("7. The safe cutover", "start green, let the proxy poll green's /readyz and flip only on 200, then stop blue with SIGTERM: it fails readiness, closes its listener and finishes what it was serving");
    {
      const load = startLoad();
      await sleep(1000);
      load.exports(3);
      load.mark("3 exports sent, green started");
      await runApp("green", V2);
      const sw = await proxySwitch("green", "safe");
      load.mark("switched");
      const stopStarted = Date.now();
      console.log("   $ docker stop 38-containers-blue    (SIGTERM, then SIGKILL after --stop-timeout 15 s)");
      await dockerAsync(["stop", "38-containers-blue"]);
      load.mark("blue exited");
      const stopMs = Date.now() - stopStarted;
      const switchedAt = load.marksSoFar().find((m) => m.label === "switched")!.at;
      await sleep(1500);
      safeRun = await load.stop();
      const s = summarize(safeRun);
      console.log(`   the proxy waited ${sw.waitedMs} ms (${sw.polls} polls) for green to be ready; docker stop took ${stopMs} ms`);
      console.log(`   ${s.total} requests through :${PROXY_PORT}; failed ${s.failed}; served by ${s.byUpstream}`);
      console.log(`   failures: ${s.failures}`);
      printLogs("blue", /SIGTERM|drain/);
      const drainLine = logs("blue").find((l) => /SIGTERM: draining, \d+ request/.test(l)) ?? "";
      const inFlight = Number(/draining, (\d+) request/.exec(drainLine)?.[1] ?? 0);
      const finishedAfter = safeRun.samples.filter((x) => x.upstream === "blue" && x.ok && x.end > switchedAt).length;
      console.log(`   blue requests that finished after the switch: ${finishedAfter}; blue exit code ${state("blue").exitCode}`);
      check(s.failed === 0, "zero failed requests during the safe cutover");
      check(/blue=\d+/.test(s.byUpstream) && /green=\d+/.test(s.byUpstream), "both colours served traffic during the run");
      check(inFlight > 0 && finishedAfter > 0, "blue received SIGTERM with requests in flight and finished them");
      check(state("blue").exitCode === 0, "blue exited 0 after draining (not killed at the stop timeout)");
      check(sw.polls > 1, "the proxy saw green not ready at first and waited");
    }
  } finally {
    proxy.kill("SIGTERM");
    await once(proxy, "exit");
  }

  step("8. The timeline", "every request of both runs on one page, by worker and by the colour that served it");
  mkdirSync("out", { recursive: true });
  writeTimeline("out/switch.html", naiveRun, safeRun);
  console.log("   wrote out/switch.html");
  await waitFor("green healthy", () => state("green").health === "healthy");
  console.log(`\n   green (${V2}, docker health=${state("green").health}) now serves :${PROXY_PORT} via :${GREEN_PORT}; blue (:${upstreamPort.blue}) is stopped`);
}

main()
  .catch((err) => {
    console.error(mask(String(err?.stack ?? err)));
    process.exitCode = 1;
  })
  .finally(() => spawnSync("rm", ["-f", npmrc]));
