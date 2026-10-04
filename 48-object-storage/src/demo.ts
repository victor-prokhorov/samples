// The story in four steps, each with checks. Starts the storage, the app and the scanner as separate processes.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { chromium } from "@playwright/test";
import { db } from "./db.js";
import { EICAR } from "./eicar.js";
import { APP_ORIGIN, BUCKET, STORAGE_PORT, STORAGE_URL, presignPut, s3 } from "./s3.js";

let failed = 0;
let passed = 0;
function check(label: string, cond: boolean) {
  if (cond) passed++;
  else failed++;
  console.log(`   ${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
}
function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

const children: ChildProcess[] = [];
function start(file: string, ready: RegExp, nodeArgs: string[] = []): Promise<{ child: ChildProcess; first: string }> {
  const child = spawn(process.execPath, [...nodeArgs, "--import", "tsx", file], { stdio: ["ignore", "pipe", "inherit"] });
  children.push(child);
  return new Promise((resolve, reject) => {
    let resolved = false;
    createInterface({ input: child.stdout! }).on("line", (line) => {
      console.log(`   ${line}`);
      if (!resolved && ready.test(line)) {
        resolved = true;
        resolve({ child, first: line });
      }
    });
    child.on("exit", (code) => !resolved && reject(new Error(`${file} exited with ${code}`)));
  });
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
}

const json = async (path: string, init?: RequestInit) => {
  const r = await fetch(APP_ORIGIN + path, init);
  return { status: r.status, body: (await r.json()) as any };
};
const meter = async () => (await json("/metrics?reset=1")).body as { bytesIn: number; cpuMs: number; peakMemMB: number };
const keys = async () => ((await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }))).Contents ?? []).map((o) => `${o.Key} (${o.Size} B)`);

// A one-page PDF, so the downloaded file opens.
function pdf(text: string) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length + 35} >>\nstream\nBT /F1 18 Tf 72 760 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// What a browser does with the grant the app returns.
async function directUpload(filename: string, contentType: string, data: Buffer) {
  const grant = (await json("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename, contentType, size: data.length }) })).body;
  const put = await fetch(grant.url, { method: "PUT", headers: grant.headers, body: new Uint8Array(data) });
  const done = await json(`/api/uploads/${grant.id}/complete`, { method: "POST" });
  return { id: grant.id as string, url: grant.url as string, put: put.status, done };
}

async function main() {
  mkdirSync("screenshots", { recursive: true });
  const storage = await start("src/storage.ts", /SigV4 gate on/);
  const innerPort = Number(/127\.0\.0\.1:(\d+)/.exec(storage.first)![1]);
  await start("src/app.ts", /member app on/, ["--expose-gc"]);
  let scanner = (await start("src/scanner.ts", /watching/)).child;

  step(
    "1. The browser uploads straight to storage",
    "the page asks the app for a presigned PUT (one key, one content type, one length, 60 s), sends the file to the storage endpoint itself, then tells the app it is done; the app only signs, records and HEADs",
  );
  await meter();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") requests.push(`${r.method()} ${r.url().replace(/\?.*/, (q) => (q.includes("X-Amz-Signature") ? "?X-Amz-...(presigned)" : q))}`);
  });
  await page.goto(APP_ORIGIN);
  const statement = pdf("Annual statement 2025 - Alice Martin, Acme");
  await page.setInputFiles("#file", [
    { name: "Relevé annuel 2025.pdf", mimeType: "application/pdf", buffer: statement },
    { name: "letter-from-employer.txt", mimeType: "text/plain", buffer: Buffer.from(`Dear member,\n${EICAR}\n`) },
  ]);
  await page.click("button");
  await page.waitForSelector("body[data-settled=yes]", { timeout: 15000 });
  await page.screenshot({ path: "screenshots/upload-page.png" });
  for (const r of requests) console.log(`   browser request: ${r}`);
  const browserMeter = await meter();
  console.log(`   app process during the browser uploads: ${browserMeter.bytesIn} request-body bytes read (JSON only), ${browserMeter.cpuMs} ms CPU`);
  const rows = (await json("/api/uploads")).body as any[];
  console.log(`   page shows: ${rows.map((r) => `${r.filename} = ${r.status}${r.verdict ? ` (${r.verdict})` : ""}`).join("; ")}`);
  const puts = requests.filter((r) => r.startsWith("PUT "));
  check("the browser sent both files with PUT straight to the storage endpoint, not to the app", puts.length === 2 && puts.every((r) => r.startsWith(`PUT ${STORAGE_URL}/${BUCKET}/quarantine/`)));
  check(`the app read fewer request-body bytes than the PDF alone (${browserMeter.bytesIn} < ${statement.length})`, browserMeter.bytesIn < statement.length);
  check("the scanner promoted the statement and rejected the EICAR letter", rows.find((r) => r.filename.startsWith("Relev"))?.status === "clean" && rows.find((r) => r.filename.startsWith("letter"))?.status === "rejected");
  const link = await page.getAttribute("a[href$=download]", "href");
  const redirect = await fetch(APP_ORIGIN + link, { redirect: "manual" });
  const location = redirect.headers.get("location") ?? "";
  const download = await fetch(location);
  const bytes = Buffer.from(await download.arrayBuffer());
  console.log(`   download link: ${redirect.status} -> ${location.replace(/\?.*/, "?X-Amz-...(presigned GET, 300 s)")}`);
  console.log(`   storage answered ${download.status}, Content-Type: ${download.headers.get("content-type")}, Content-Disposition: ${download.headers.get("content-disposition")}`);
  check("the download is a redirect to a presigned GET on storage, which returns the same bytes as an attachment with the UTF-8 file name", redirect.status === 302 && location.startsWith(`${STORAGE_URL}/${BUCKET}/clean/`) && bytes.equals(statement) && (download.headers.get("content-disposition") ?? "").includes("filename*=UTF-8''Relev%C3%A9%20annuel%202025.pdf"));
  await browser.close();
  await stop(scanner);

  step(
    "2. 50 MB through the app server versus presigned",
    "a proxied upload costs the app a socket, CPU for every byte and, if it buffers, the whole file in memory; a presigned upload costs it one signature",
  );
  const big = Buffer.alloc(50 * 1024 * 1024, "contribution history export ");
  const results: Record<string, { ms: number; bytesIn: number; cpuMs: number; peakMemMB: number }> = {};
  for (const mode of ["buffer", "stream", "presigned"] as const) {
    await meter();
    const t = Date.now();
    if (mode === "presigned") {
      const r = await directUpload("history-export.pdf", "application/pdf", big);
      check(`presigned 50 MB upload stored (${r.put}) and confirmed (${r.done.body.status})`, r.put === 200 && r.done.body.status === "uploaded");
    } else {
      const r = await fetch(`${APP_ORIGIN}/api/proxy-upload?mode=${mode}`, { method: "POST", headers: { "content-type": "application/pdf" }, body: big });
      check(`proxied (${mode}) 50 MB upload stored (${r.status})`, r.status === 201);
    }
    const ms = Date.now() - t;
    results[mode] = { ms, ...(await meter()) };
  }
  console.log("   mode        wall ms   app bytes read   app CPU ms   app peak memory +MB");
  for (const [mode, r] of Object.entries(results)) console.log(`   ${mode.padEnd(10)} ${String(r.ms).padStart(8)} ${String(r.bytesIn).padStart(16)} ${String(r.cpuMs).padStart(12)} ${String(r.peakMemMB).padStart(18)}`);
  check("buffering holds the whole file: the app's peak live memory grows by more than 40 MB", results.buffer.peakMemMB > 40);
  check("streaming keeps memory flat (under 25 MB) but the app still reads all 52,428,800 bytes", results.stream.peakMemMB < 25 && results.stream.bytesIn === big.length);
  check("presigned: the app reads under 1 KB, and uses under a fifth of the CPU of the cheaper proxied upload", results.presigned.bytesIn < 1024 && results.presigned.cpuMs * 5 < Math.min(results.buffer.cpuMs, results.stream.cpuMs));

  step(
    "3. What a presigned URL allows, and what it does not",
    "the signature covers method, bucket, key, expiry and the signed headers (content-type, content-length, host); change one and storage computes a different signature",
  );
  const refused = await json("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: "page.html", contentType: "text/html", size: 10 }) });
  const tooBig = await json("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: "huge.pdf", contentType: "application/pdf", size: 200 * 1024 * 1024 }) });
  console.log(`   app, text/html: ${refused.status} ${refused.body.error}`);
  console.log(`   app, 200 MB: ${tooBig.status} ${tooBig.body.error}`);
  check("the app refuses to sign a type outside the allow-list or a size over 100 MB", refused.status === 400 && tooBig.status === 400);
  const doc = Buffer.from("%PDF-1.4 a small letter");
  const grant = (await json("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: "letter.pdf", contentType: "application/pdf", size: doc.length }) })).body;
  const early = await json(`/api/uploads/${grant.id}/complete`, { method: "POST" });
  console.log(`   complete before any PUT: ${early.status} ${early.body.error}`);
  check("the app does not take the browser's word: completing before uploading is refused after a HEAD", early.status === 409);
  const tries: [string, string, RequestInit][] = [
    ["wrong content type (text/html)", grant.url, { method: "PUT", headers: { "content-type": "text/html" }, body: doc }],
    ["wrong length (one byte more)", grant.url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: Buffer.concat([doc, Buffer.from("!")]) }],
    ["another key with the same signature", grant.url.replace(/quarantine\/[^?]+/, "clean/stolen"), { method: "PUT", headers: { "content-type": "application/pdf" }, body: doc }],
    ["longer expiry written into the URL", grant.url.replace("X-Amz-Expires=60", "X-Amz-Expires=86400"), { method: "PUT", headers: { "content-type": "application/pdf" }, body: doc }],
    ["GET with a PUT signature", grant.url, { method: "GET" }],
  ];
  for (const [what, url, init] of tries) {
    const r = await fetch(url, init);
    const code = /<Code>(\w+)<\/Code>/.exec(await r.text())?.[1];
    console.log(`   ${what}: ${r.status} ${code}`);
    check(`storage rejects ${what}`, r.status === 403 && code === "SignatureDoesNotMatch");
  }
  const shortUrl = await presignPut("quarantine/expiry-test", "application/pdf", doc.length, 1);
  await sleep(2100);
  const expired = await fetch(shortUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: doc });
  const expiredText = await expired.text();
  console.log(`   URL signed for 1 s, used after 2.1 s: ${expired.status} ${/<Message>([^<]+)/.exec(expiredText)?.[1]}`);
  check("storage rejects an expired URL", expired.status === 403 && expiredText.includes("Request has expired"));
  const anon = await fetch(`${STORAGE_URL}/${BUCKET}/${(await keys())[0]?.split(" ")[0]}`);
  console.log(`   unsigned GET of an existing object: ${anon.status}`);
  check("storage refuses an unsigned request: the bucket is private", anon.status === 403);
  const ok = await fetch(grant.url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: doc });
  const done = await json(`/api/uploads/${grant.id}/complete`, { method: "POST" });
  console.log(`   the same URL used as signed: ${ok.status}; complete: ${done.status} ${done.body.status}`);
  check("the URL as signed still works, once the guards are respected", ok.status === 200 && done.body.status === "uploaded");
  // Why the gate exists: s3rver alone checks expiry but not V4 signatures.
  const raw = await fetch(grant.url.replace(`:${STORAGE_PORT}`, `:${innerPort}`).replace(/quarantine\/[^?]+/, "tampered/raw-s3rver"), { method: "PUT", headers: { "content-type": "text/html" }, body: "<script>alert(1)</script>" });
  console.log(`   the same wrong-type PUT sent to s3rver directly (port ${innerPort}, no gate): ${raw.status}`);
  check("s3rver on its own accepts the wrong content type: the SigV4 gate is what enforces the signed headers", raw.status === 200);

  step(
    "4. Quarantine until scanned",
    "an upload lands in quarantine/; only a scanner that reads it from storage can move it to clean/ (downloadable) or rejected/ (never served)",
  );
  const good = await directUpload("Attestation employeur.pdf", "application/pdf", pdf("Employer certificate - Globex"));
  const bad = await directUpload("scan.txt", "text/plain", Buffer.from(`${EICAR}\n`));
  console.log("   objects with the scanner stopped:");
  for (const k of await keys()) console.log(`     ${k}`);
  const blocked = await json(`/api/uploads/${good.id}/download`);
  console.log(`   download before the scan: ${blocked.status} ${blocked.body.error}`);
  check("a file in quarantine cannot be downloaded", blocked.status === 409);
  check("every member upload waiting for the scan is under quarantine/", (await db.query("SELECT count(*)::int AS n FROM uploads WHERE status = 'uploaded' AND key NOT LIKE 'quarantine/%'")).rows[0].n === 0);
  scanner = (await start("src/scanner.ts", /watching/)).child;
  for (let i = 0; i < 100; i++) {
    if ((await db.query("SELECT count(*)::int AS n FROM uploads WHERE status = 'uploaded'")).rows[0].n === 0) break;
    await sleep(200);
  }
  await stop(scanner);
  console.log("   objects after the scan:");
  const after = await keys();
  for (const k of after) console.log(`     ${k}`);
  check("nothing is left in quarantine/", !after.some((k) => k.startsWith("quarantine/")));
  const goodDl = await fetch(APP_ORIGIN + `/api/uploads/${good.id}/download`);
  const badDl = await json(`/api/uploads/${bad.id}/download`);
  console.log(`   clean file: ${goodDl.status}, Content-Disposition: ${goodDl.headers.get("content-disposition")}`);
  console.log(`   rejected file: ${badDl.status} ${badDl.body.error}`);
  check("the clean file downloads with its name; the EICAR one is refused", goodDl.status === 200 && (goodDl.headers.get("content-disposition") ?? "").startsWith('attachment; filename="Attestation employeur.pdf"') && badDl.status === 409);

  console.log(`\n== ${passed} checks passed, ${failed} failed ==`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const c of children) await stop(c);
  await db.end();
}
