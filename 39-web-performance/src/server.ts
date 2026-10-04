// The member portal on :53049. /slow/ and /fast/ serve the same page two ways.
//   slow: no compression, no caching headers, the third-party tag held for a second
//   fast: gzip for text, long-lived immutable caching for hashed-by-name assets, the tag held too (it is async there)
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";
import { CSS, fastPage, slowPage } from "./pages.js";
import { DIST, PORT } from "./paths.js";

const TYPES: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".html": "text/html; charset=utf-8" };
const TAG_DELAY_MS = 1000;

export function startServer(port = PORT) {
  const pages = { slow: slowPage(), fast: fastPage() };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const fast = url.pathname.startsWith("/fast/") || url.searchParams.get("v") === "fast";
    const send = (status: number, body: Buffer | string, type: string, compress: boolean, cache: string) => {
      const headers: Record<string, string> = { "content-type": type, "cache-control": cache };
      let data = typeof body === "string" ? Buffer.from(body) : body;
      if (compress && /text|javascript|css|json/.test(type) && /gzip/.test(String(req.headers["accept-encoding"]))) {
        data = gzipSync(data);
        headers["content-encoding"] = "gzip";
      }
      res.writeHead(status, { ...headers, "content-length": String(data.length) }).end(data);
    };
    if (url.pathname === "/slow/" || url.pathname === "/fast/") {
      send(200, fast ? pages.fast : pages.slow, TYPES[".html"], fast, "no-cache");
      return;
    }
    if (url.pathname === "/slow/styles.css") return send(200, CSS, TYPES[".css"], false, "no-cache");
    if (url.pathname.endsWith("/tag.js")) await new Promise((r) => setTimeout(r, TAG_DELAY_MS));
    const file = join(DIST, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    try {
      const body = readFileSync(file);
      const imgOfFast = url.pathname.startsWith("/img/hero-");
      send(200, body, TYPES[extname(file)] ?? "application/octet-stream", fast || imgOfFast, fast || imgOfFast ? "public, max-age=31536000, immutable" : "no-cache");
    } catch {
      send(404, "not found", "text/plain", false, "no-store");
    }
  });
  return new Promise<typeof server>((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1]?.endsWith("server.ts")) {
  await startServer();
  console.log(`member page: http://localhost:${PORT}/slow/ and http://localhost:${PORT}/fast/`);
}
