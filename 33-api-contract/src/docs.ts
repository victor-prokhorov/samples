// Renders openapi/v2.yaml as one HTML reference page that works offline: Redocly CLI prerenders the page,
// and the Redoc bundle it would load from a CDN is inlined from node_modules/redoc.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

export const OUT = "out/api-reference.html";

export function buildDocs(spec = "openapi/v2.yaml"): { bytes: number; external: string[] } {
  execFileSync("npx", ["redocly", "build-docs", spec, "-o", OUT, "--disableGoogleFont"], { stdio: "pipe", env: { ...process.env, REDOCLY_TELEMETRY: "off" } });
  const bundle = readFileSync(createRequire(import.meta.url).resolve("redoc/bundles/redoc.standalone.js"), "utf8");
  let html = readFileSync(OUT, "utf8");
  const tag = /<script src="https:\/\/cdn\.redocly\.com\/[^"]+redoc\.standalone\.js"[^>]*><\/script>/;
  if (!tag.test(html)) throw new Error("build-docs output changed: no CDN script tag to inline");
  html = html.replace(tag, () => `<script>${bundle}</script>`);
  writeFileSync(OUT, html);
  const external = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  return { bytes: Buffer.byteLength(html), external };
}

if (process.argv[1]?.endsWith("docs.ts")) {
  const r = buildDocs();
  console.log(`${OUT}: ${r.bytes} bytes, external scripts or stylesheets: ${r.external.length ? r.external.join(", ") : "none"}`);
}
