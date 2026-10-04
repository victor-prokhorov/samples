// The object storage: s3rver (an S3 emulator on npm) behind a small gate that verifies AWS Signature V4.
// s3rver stores objects, answers the S3 API and applies the bucket's CORS rules, but it accepts any V4 signature,
// so on its own a presigned URL could be replayed with another content type. The gate is the S3 front door:
// it verifies every request (sigv4.ts), then forwards it unchanged to s3rver on a private port.
import http from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import S3rver from "s3rver";
import { ACCESS_KEY_ID, APP_ORIGIN, BUCKET, SECRET_ACCESS_KEY, STORAGE_PORT } from "./s3.js";
import { verify } from "./sigv4.js";

// Real S3 answers browser preflights from the bucket's CORS configuration, so the browser can PUT from the app's origin.
const cors = `<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>${APP_ORIGIN}</AllowedOrigin>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedHeader>content-type</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>60</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;

const dir = join(tmpdir(), "48-object-storage-data");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const s3rver = new S3rver({ port: 0, address: "127.0.0.1", silent: true, directory: dir, configureBuckets: [{ name: BUCKET, configs: [cors] }] });
const { port: innerPort } = await s3rver.run();
const secrets = new Map([[ACCESS_KEY_ID, SECRET_ACCESS_KEY]]);

const xmlError = (code: string, message: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${message}</Message></Error>`;
const short = (url: string) => url.replace(/\?.*$/, (q) => (q.includes("X-Amz-Signature") ? "?<presigned>" : q.length > 40 ? q.slice(0, 40) + "..." : q));

const gate = http.createServer((req, res) => {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  // A preflight carries no credentials: S3 answers it from the bucket CORS rules.
  const verdict = method === "OPTIONS" ? ({ ok: true, mode: "preflight" } as const) : verify(method, url, req.headers, secrets);
  const who = req.headers.origin ? `browser ${req.headers.origin}` : (req.headers["user-agent"] ?? "").startsWith("aws-sdk-js") ? "sdk" : "client";
  if (!verdict.ok) {
    console.log(`[storage] ${method} ${short(url)} (${who}) -> ${verdict.status} ${verdict.code}`);
    res.writeHead(verdict.status, { "content-type": "application/xml", ...(req.headers.origin === APP_ORIGIN ? { "access-control-allow-origin": APP_ORIGIN } : {}) });
    res.end(xmlError(verdict.code, verdict.message));
    req.resume();
    return;
  }
  const upstream = http.request({ host: "127.0.0.1", port: innerPort, method, path: url, headers: req.headers }, (r) => {
    const len = r.headers["content-length"];
    console.log(`[storage] ${method} ${short(url)} (${who}, ${verdict.mode}) -> ${r.statusCode}${method === "PUT" ? ` ${req.headers["content-length"]} bytes in` : len && method === "GET" ? ` ${len} bytes out` : ""}`);
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  upstream.on("error", (e) => {
    res.writeHead(502);
    res.end(String(e));
  });
  req.pipe(upstream);
});
gate.listen(STORAGE_PORT, () => console.log(`[storage] s3rver on 127.0.0.1:${innerPort} (private), SigV4 gate on :${STORAGE_PORT}, bucket ${BUCKET}`));

const stop = async () => {
  gate.close();
  await s3rver.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
