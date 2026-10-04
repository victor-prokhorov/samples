// The help centre search page (node:http, :53057): articles in both languages, and employers by name.
import http from "node:http";
import { PORT, db } from "./db.js";
import { highlight, searchArticles, searchEmployers } from "./search.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function page(q: string) {
  const [articles, employers] = q ? await Promise.all([searchArticles(q, 6), searchEmployers(q)]) : [[], []];
  const results = articles
    .map(
      (h) => `<li lang="${h.lang}">
        <span class="lang">${h.lang === "en" ? "English" : "Français"}</span>
        <a href="/help/${h.lang}/${esc(h.slug)}">${highlight(h.title)}</a>
        <p>${highlight(h.snippet)}</p>
        <span class="rank">rank ${h.rank}</span>
      </li>`,
    )
    .join("");
  const emp = employers.map((e) => `<li>${esc(e.name)} <span class="rank">similarity ${e.score}</span></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${q ? `${esc(q)} - ` : ""}Help centre search - Acme member portal</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; color: #1b1b1b; max-width: 900px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 26px; margin: 0 0 12px; }
  h2 { font-size: 19px; margin: 24px 0 8px; }
  form { display: flex; gap: 8px; }
  input { font: inherit; flex: 1; padding: 6px 10px; border: 2px solid #1b1b1b; border-radius: 4px; }
  button { font: inherit; padding: 6px 16px; border: 2px solid #1b1b1b; background: #fff; border-radius: 4px; }
  ol { padding-left: 20px; margin: 0; }
  li { margin: 0 0 12px; }
  li p { margin: 2px 0; color: #333; }
  a { color: #1a4fa0; font-weight: 600; }
  mark { background: #ffe066; color: inherit; padding: 0 1px; }
  .lang { display: inline-block; font-size: 12px; border: 1px solid #555; border-radius: 3px; padding: 0 5px; margin-right: 6px; }
  .rank { font-size: 13px; color: #555; }
  .count { color: #555; font-size: 14px; }
</style>
</head>
<body>
<h1>Help centre</h1>
<form action="/search" role="search">
  <input id="q" name="q" value="${esc(q)}" aria-label="Search help articles and employers">
  <button>Search</button>
</form>
${q ? `<p class="count">Searched help articles in English and French, accents and word endings ignored.</p>` : ""}
<h2>Help articles</h2>
${results ? `<ol>${results}</ol>` : `<p>No article matches.</p>`}
<h2>Employers</h2>
${emp ? `<ol>${emp}</ol>` : `<p>No employer matches.</p>`}
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/" || url.pathname === "/search") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(await page((url.searchParams.get("q") ?? "").slice(0, 200)));
    }
    res.writeHead(404).end("not found");
  } catch (e) {
    console.error(e);
    res.writeHead(500).end("error");
  }
});
server.listen(PORT, () => console.log(`[search] help centre on :${PORT}`));
process.on("SIGTERM", () => server.close(() => db.end().then(() => process.exit(0))));
