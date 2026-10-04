// Shared by the origin, the cache and the demo.
import { createHash } from "node:crypto";

// The language a member asked for in Accept-Language: fr if French ranks above English, otherwise en.
// The origin uses it to choose the page; the cache uses it to normalise the Vary key, so "fr-FR,fr;q=0.9" and "fr" share one entry.
export function negotiate(header: string | undefined): "en" | "fr" {
  const ranked = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { lang: tag.split("-")[0], q };
    })
    .filter((x) => x.lang === "en" || x.lang === "fr")
    .sort((a, b) => b.q - a.q);
  return ranked[0]?.lang === "fr" ? "fr" : "en";
}

// Content-hashed asset names: the URL changes when the content does, so the content behind a URL never changes.
const hashed = (body: string) => createHash("sha256").update(body).digest("hex").slice(0, 10);
const css = "body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1b1b1b}dt{font-weight:600}dd{margin:0 0 8px}";
const js = "document.documentElement.dataset.ready='yes';";
export const CSS_URL = `/assets/app.${hashed(css)}.css`;
export const JS_URL = `/assets/app.${hashed(js)}.js`;
export const ASSETS: Record<string, { body: string; type: string }> = {
  [CSS_URL]: { body: css, type: "text/css" },
  [JS_URL]: { body: js, type: "text/javascript" },
};

export type CacheControl = Record<string, string | true>;
export function parseCacheControl(header: string | string[] | undefined): CacheControl {
  const cc: CacheControl = {};
  for (const part of String(header ?? "").split(",")) {
    const [k, v] = part.trim().split("=");
    if (k) cc[k.toLowerCase()] = v === undefined ? true : v.replace(/^"|"$/g, "");
  }
  return cc;
}
