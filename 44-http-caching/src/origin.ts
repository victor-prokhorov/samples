// The origin: member pages and API (node:http, :53054). Each resource type says how it may be cached.
//   hashed assets       public, max-age=31536000, immutable      the URL changes when the content does
//   personal data       private, no-cache + ETag                 browsers may keep it but must revalidate; shared caches must not store it
//   shared reference    public, max-age=0, s-maxage=300, stale-while-revalidate=60 + ETag + Cache-Tag
//   bilingual content   public, max-age=60, s-maxage=600 + Vary: Accept-Language
// BUGGY=1 starts the version with two bugs: personal pages sent as public, and the help page without Vary.
import http from "node:http";
import { createHash } from "node:crypto";
import { ORIGIN_PORT, db } from "./db.js";
import { ASSETS, CSS_URL, JS_URL, negotiate } from "./shared.js";

const BUGGY = process.env.BUGGY === "1";

const etagOf = (body: string) => `"${createHash("sha1").update(body).digest("base64url").slice(0, 16)}"`;

const stats: Record<string, number> = {};
const count = (key: string) => (stats[key] = (stats[key] ?? 0) + 1);

const page = (lang: string, title: string, main: string) => `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="${CSS_URL}"><script src="${JS_URL}" defer></script></head>
<body><main>${main}</main></body></html>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function cookie(req: http.IncomingMessage, name: string) {
  return (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

// Sends a body with its ETag, or 304 Not Modified when the client already has that version.
function send(req: http.IncomingMessage, res: http.ServerResponse, route: string, type: string, body: string, headers: Record<string, string>, etag = etagOf(body)) {
  if (req.headers["if-none-match"] === etag) {
    count(`${route} 304`);
    res.writeHead(304, { etag, ...headers });
    return res.end();
  }
  count(`${route} 200`);
  res.writeHead(200, { "content-type": type, etag, ...headers });
  res.end(req.method === "HEAD" ? undefined : body);
}

async function member(req: http.IncomingMessage) {
  const token = cookie(req, "session");
  if (!token) return null;
  const r = await db.query("SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token = $1", [token]);
  return r.rows[0] ?? null;
}

const PERSONAL = BUGGY ? "public, max-age=300" : "private, no-cache";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${ORIGIN_PORT}`);
  const path = url.pathname;
  try {
    if (path === "/__origin/stats") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(stats));
      if (url.searchParams.has("reset")) for (const k of Object.keys(stats)) delete stats[k];
      return;
    }
    // Hashed assets: the name changes with the content, so the content behind a name never changes.
    const asset = ASSETS[path];
    if (asset) return send(req, res, "asset", asset.type, asset.body, { "cache-control": "public, max-age=31536000, immutable" });
    if (path.startsWith("/assets/")) {
      count("asset 404");
      res.writeHead(404, { "cache-control": "no-store" });
      return res.end();
    }

    // Personal data: only for the signed-in member.
    if (path === "/members/me" || path === "/api/me") {
      const m = await member(req);
      if (!m) {
        count(`${path} 401`);
        res.writeHead(401, { "cache-control": "no-store" });
        return res.end();
      }
      const headers = { "cache-control": PERSONAL };
      if (path === "/api/me") return send(req, res, path, "application/json", JSON.stringify({ id: m.id, name: m.name, employer: m.employer, iban: m.iban, balance: m.balance }), headers);
      const html = page("en", `${esc(m.name)} - your account`, `<h1>${esc(m.name)}</h1><dl><dt>Employer</dt><dd>${esc(m.employer)}</dd><dt>IBAN</dt><dd>${esc(m.iban)}</dd><dt>Balance</dt><dd>EUR ${m.balance}</dd></dl>`);
      return send(req, res, path, "text/html; charset=utf-8", html, headers);
    }

    // Shared reference data, the same for every member: one expensive query, cached by the shared cache for 5 minutes.
    // The ETag is the data version, so revalidation does not need the query; Cache-Tag lets the cache purge it by name.
    if (path === "/api/funds") {
      const version = (await db.query("SELECT version FROM data_versions WHERE name = 'funds'")).rows[0].version;
      const etag = `"funds-v${version}"`;
      const headers = { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60", "cache-tag": "funds" };
      if (req.headers["if-none-match"] === etag) return send(req, res, path, "application/json", "", headers, etag);
      const r = await db.query(`
        WITH r AS (SELECT fund_id, ln(price::float8 / lag(price::float8) OVER (PARTITION BY fund_id ORDER BY day)) AS ret FROM fund_prices WHERE day > (SELECT max(day) FROM fund_prices) - 365)
        SELECT f.id, f.name,
          (SELECT price FROM fund_prices WHERE fund_id = f.id ORDER BY day DESC LIMIT 1)::float AS price,
          round((stddev(ret) * sqrt(252) * 100)::numeric, 2)::float AS volatility
        FROM r JOIN funds f ON f.id = r.fund_id GROUP BY f.id ORDER BY f.id`);
      return send(req, res, path, "application/json", JSON.stringify({ version: Number(version), funds: r.rows }), headers, etag);
    }

    // Bilingual content: the same URL in English or French, so the response says which request header chose it.
    if (path === "/help/contributions") {
      const lang = negotiate(req.headers["accept-language"]);
      const p = (await db.query("SELECT title, body FROM help_pages WHERE slug = 'contributions' AND lang = $1", [lang])).rows[0];
      const headers: Record<string, string> = { "cache-control": "public, max-age=60, s-maxage=600", "content-language": lang };
      if (!BUGGY) headers.vary = "Accept-Language";
      return send(req, res, path, "text/html; charset=utf-8", page(lang, p.title, `<h1>${p.title}</h1><p>${p.body}</p>`), headers);
    }

    count("other 404");
    res.writeHead(404, { "cache-control": "no-store" });
    res.end();
  } catch (e) {
    console.error("[origin]", e);
    res.writeHead(500, { "cache-control": "no-store" });
    res.end();
  }
});
server.keepAliveTimeout = 30_000;
server.listen(ORIGIN_PORT, () => console.log(`[origin] member pages and API on :${ORIGIN_PORT}${BUGGY ? " (BUGGY build: personal pages public, help page without Vary)" : ""}`));
process.on("SIGTERM", () => {
  setTimeout(() => process.exit(0), 1000).unref();
  server.close();
  server.closeAllConnections();
  db.end().then(() => process.exit(0));
});
