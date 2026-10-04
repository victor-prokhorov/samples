// Serves the static Storybook (storybook-static/) on :53045, for the Playwright tests and for a reader to browse.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { ROOT } from "./tokens/dtcg.js";

export const PORT = Number(process.env.PORT ?? 53045);
const DIR = join(ROOT, "storybook-static");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIR, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!file.startsWith(DIR) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  // no-store: the demo swaps tokens/tokens.css between runs and every page load must see the current file.
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`static Storybook on http://localhost:${PORT}`));
