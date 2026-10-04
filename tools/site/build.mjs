// Builds the GitHub Pages site into site/ (gitignored) from what is committed in the repo:
// the folder READMEs, the overview diagrams, the screenshots, the proof logs and each sample's out/ and reports/.
// Nothing is run: the pages show the outputs of the last green run, exactly as committed.
//   cd tools/site && npm ci && node build.mjs [--out ../../site]
//   node check-links.mjs                      -> fails if any link in a generated page goes nowhere
import { Marked } from "marked";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(ROOT, "site"));
const REPO = "https://github.com/victor-prokhorov/samples";
const BLOB = `${REPO}/blob/main/`;
const TREE = `${REPO}/tree/main/`;
const SITE_URL = "https://victor-prokhorov.github.io/samples/";
const GENERATOR = "tools/site/build.mjs";

// ---------- what is committed ----------
const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
const FILES = new Set(git("ls-files", "-z").split("\0").filter((f) => f && existsSync(join(ROOT, f))));
const DIRS = new Set([""]);
for (const f of FILES) for (let d = posix.dirname(f); d !== "." && !DIRS.has(d); d = posix.dirname(d)) DIRS.add(d);
const SHA = process.env.GITHUB_SHA || git("rev-parse", "HEAD").trim();
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const warnings = [];
const warn = (msg) => warnings.push(msg);

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const rel = (fromPage, toFile) => {
  const r = posix.relative(posix.dirname(fromPage), toFile);
  return encodePath(r || posix.basename(toFile));
};
const humanize = (file) => posix.basename(file).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
const stripMd = (s) => s.replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\*([^*]*)\*/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
function slugger() {
  const seen = new Map();
  return (text) => {
    let slug = text.toLowerCase().trim().replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    const n = seen.get(slug);
    seen.set(slug, (n ?? -1) + 1);
    if (n !== undefined) slug = `${slug}-${n + 1}`;
    return slug;
  };
}

// ---------- the model: samples, documents, assets ----------
const SAMPLE_DIR = /^(\d{2})-[a-z0-9-]+$/;
const samples = [...DIRS]
  .filter((d) => SAMPLE_DIR.test(d) && FILES.has(`${d}/README.md`))
  .sort()
  .map((dir) => {
    const md = read(`${dir}/README.md`);
    const h1 = md.match(/^# (.+)$/m)?.[1] ?? dir;
    const num = dir.slice(0, 2);
    const title = stripMd(h1.replace(/^\d{2}\.\s*/, ""));
    const pain = stripMd(md.match(/^\*\*Pain:\s*(.+?)\*\*/m)?.[1] ?? "");
    const inDir = (sub, re) => [...FILES].filter((f) => f.startsWith(`${dir}/${sub}/`) && re.test(f)).sort();
    const screenshots = inDir("screenshots", IMAGE);
    // the first screenshot the README shows, else the first by name
    const shown = [...md.matchAll(/\]\((screenshots\/[^)\s]+)\)/g)].map((m) => `${dir}/${m[1]}`).find((f) => FILES.has(f));
    const outputs = [...inDir("out", /./), ...inDir("reports", /./)];
    const log = `logs/${dir}.log`;
    return {
      dir, num, title, pain, screenshots, outputs,
      firstShot: shown ?? screenshots[0],
      overview: FILES.has(`${dir}/diagrams/overview.svg`) ? `${dir}/diagrams/overview.svg` : undefined,
      log: FILES.has(log) ? log : undefined,
    };
  });
const sampleByNum = new Map(samples.map((s) => [s.num, s]));

// Markdown documents rendered as pages: repo path -> site path
const PAGES = new Map();
PAGES.set("README.md", "index.html");
for (const s of samples) PAGES.set(`${s.dir}/README.md`, `${s.dir}/index.html`);
for (const f of FILES) {
  if (f === "design-exercise/README.md") PAGES.set(f, "design-exercise/index.html");
  else if (f === "MIGRATION-PATTERNS.md") PAGES.set(f, "MIGRATION-PATTERNS.html");
  else if (/^docs\/(case-studies|adr)\/[^/]+\.md$/.test(f)) PAGES.set(f, f.endsWith("/README.md") ? f.replace(/README\.md$/, "index.html") : f.replace(/\.md$/, ".html"));
}
// directories that get a generated index page without a README
const DIR_INDEX = new Map([["docs/adr", "docs/adr/index.html"]]);

// Files copied as they are: diagrams, screenshots and every committed output
const ASSETS = new Set();
for (const f of FILES) {
  if (/^\d{2}-[^/]+\/(out|reports)\//.test(f)) ASSETS.add(f);
  else if (/^\d{2}-[^/]+\/(screenshots|diagrams)\//.test(f) && IMAGE.test(f)) ASSETS.add(f);
  else if (/^(design-exercise|docs)\/.*/.test(f) && IMAGE.test(f)) ASSETS.add(f);
}

// Where a repo path lands in the site; null when it stays on GitHub
function siteTarget(target, isDir) {
  if (isDir) {
    if (target === "") return "index.html";
    if (PAGES.has(`${target}/README.md`)) return PAGES.get(`${target}/README.md`);
    if (DIR_INDEX.has(target)) return DIR_INDEX.get(target);
    if (ASSETS.has(`${target}/index.html`)) return `${target}/index.html`;
    return null;
  }
  if (PAGES.has(target)) return PAGES.get(target);
  if (/^logs\/[^/]+\.log$/.test(target) && FILES.has(target)) return target.replace(/\.log$/, ".html");
  if (ASSETS.has(target) && !target.endsWith(".md")) return target;
  if (IMAGE.test(target) && FILES.has(target)) {
    ASSETS.add(target);
    return target;
  }
  return null;
}

// Rewrites one link found in repo file `from`, rendered at site page `page`
function resolveLink(href, from, page) {
  if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return href;
  const [pathPart, ...rest] = href.split("#");
  const hash = rest.length ? `#${rest.join("#")}` : "";
  let target = posix.normalize(posix.join(posix.dirname(from), decodeURI(pathPart)));
  if (target === "." || target === "./") target = "";
  target = target.replace(/\/$/, "");
  if (target.startsWith("..")) {
    warn(`${from}: link outside the repo: ${href}`);
    return `${TREE}`;
  }
  const isDir = pathPart.endsWith("/") || target === "" || (DIRS.has(target) && !FILES.has(target));
  const site = siteTarget(target, isDir);
  if (site) return rel(page, site) + hash;
  if (!FILES.has(target) && !DIRS.has(target)) warn(`${from}: link to a path that is not committed: ${href}`);
  return (isDir ? TREE : BLOB) + encodePath(target) + hash;
}

// ---------- Markdown ----------
function renderMarkdown(md, from, page) {
  const slug = slugger();
  const marked = new Marked({ gfm: true });
  marked.use({
    walkTokens(token) {
      if (token.type === "link" || token.type === "image") token.href = resolveLink(token.href, from, page);
    },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slug(html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
        return `<h${depth} id="${esc(id)}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        // addresses of processes the run scripts start on the reader's machine are not links on a public site
        if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(href)) return text;
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ""}>${text}</a>`;
      },
      image({ href, title, text }) {
        const alt = text?.trim() || `Image: ${humanize(href)}`;
        const cls = /\.svg$/i.test(href) ? ' class="diagram"' : ' class="shot"';
        return `<img src="${esc(href)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ""}${cls} loading="lazy">`;
      },
    },
  });
  return marked.parse(md);
}
const inline = (md, from, page) => renderMarkdown(md, from, page).replace(/^<p>|<\/p>\n?$/g, "");

// ---------- layout ----------
const NAV = [
  ["index.html", "Samples"],
  ["design-exercise/index.html", "Design exercise"],
  ["docs/case-studies/index.html", "Case studies"],
  ["docs/adr/index.html", "Decisions"],
  ["MIGRATION-PATTERNS.html", "Migration patterns"],
];
function layout(page, { title, description, body, wide = false }) {
  const nav = NAV.map(([href, label]) => {
    const current = href === page || (href !== "index.html" && page.startsWith(href.replace(/index\.html$/, "")) && href.endsWith("index.html"));
    return `<li><a href="${rel(page, href)}"${current ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`;
  }).join("");
  const full = page === "index.html" ? "Samples: small, real TypeScript samples" : `${title} | Samples`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="${GENERATOR}">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description ?? title)}">
<link rel="stylesheet" href="${rel(page, "assets/tokens.css")}">
<link rel="stylesheet" href="${rel(page, "assets/site.css")}">
<link rel="icon" href="${rel(page, "assets/favicon.svg")}" type="image/svg+xml">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <nav aria-label="Site" class="wrap nav${wide ? " wide" : ""}">
    <a class="brand" href="${rel(page, "index.html")}">victor-prokhorov/samples</a>
    <ul>${nav}<li><a href="${REPO}">GitHub</a></li></ul>
  </nav>
</header>
<main id="main" class="wrap${wide ? " wide" : ""}" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <div class="wrap${wide ? " wide" : ""}">
    <p>Built by <code>${GENERATOR}</code> from commit <a href="${REPO}/commit/${SHA}"><code>${SHA.slice(0, 7)}</code></a>. Every log, screenshot and output here is the committed result of the sample's last green run.</p>
    <p>Code under the <a href="${BLOB}LICENSE">MIT License</a>; prose, diagrams and screenshots under <a href="${BLOB}LICENSE-docs">CC BY 4.0</a>.</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------- writing ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const written = [];
function writePage(page, html) {
  const file = join(OUT, page);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  written.push(page);
}

// ---------- sample pages ----------
const linkBar = (s, page) => {
  const items = [`<li><a href="${TREE}${encodePath(s.dir)}">Folder on GitHub</a></li>`];
  if (s.log) items.push(`<li><a href="${rel(page, s.log.replace(/\.log$/, ".html"))}">Proof log</a></li>`);
  if (s.screenshots.length) items.push(`<li><a href="${page === "index.html" ? rel(page, `${s.dir}/index.html`) : ""}#all-screenshots">${s.screenshots.length} screenshot${s.screenshots.length > 1 ? "s" : ""}</a></li>`);
  if (s.outputs.length) items.push(`<li><a href="${page === "index.html" ? rel(page, `${s.dir}/index.html`) : ""}#all-outputs">${s.outputs.length} output${s.outputs.length > 1 ? "s" : ""}</a></li>`);
  return `<ul class="links">${items.join("")}</ul>`;
};

function outputList(s, page) {
  const groups = new Map();
  for (const f of s.outputs) {
    const sub = posix.dirname(f.slice(s.dir.length + 1));
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub).push(f);
  }
  const kind = (f) => {
    const ext = f.split(".").pop().toLowerCase();
    return { html: "page", pdf: "PDF", png: "image", svg: "image", json: "JSON", jsonl: "JSON lines", ndjson: "JSON lines", csv: "CSV", xml: "XML", zip: "zip", md: "Markdown", css: "stylesheet", js: "script" }[ext] ?? ext;
  };
  return [...groups].map(([sub, list]) => `<h3><code>${esc(sub)}/</code></h3>
<ul class="outputs">${list.map((f) => {
    const name = posix.basename(f);
    const href = f.endsWith(".md") ? BLOB + encodePath(f) : rel(page, f);
    const bytes = readFileSync(join(ROOT, f)).length;
    return `<li><a href="${href}">${esc(name)}</a> <span class="meta">${kind(f)}, ${bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`}</span></li>`;
  }).join("\n")}</ul>`).join("\n");
}

samples.forEach((s, i) => {
  const page = `${s.dir}/index.html`;
  const readme = renderMarkdown(read(`${s.dir}/README.md`), `${s.dir}/README.md`, page);
  const prev = samples[i - 1];
  const next = samples[i + 1];
  const pager = `<nav class="pager" aria-label="Previous and next sample">
${prev ? `<a rel="prev" href="${rel(page, `${prev.dir}/index.html`)}"><span>Previous</span> ${prev.num}. ${esc(prev.title)}</a>` : "<span></span>"}
${next ? `<a rel="next" href="${rel(page, `${next.dir}/index.html`)}"><span>Next</span> ${next.num}. ${esc(next.title)}</a>` : "<span></span>"}
</nav>`;
  const shots = s.screenshots.length ? `<section aria-labelledby="all-screenshots"><h2 id="all-screenshots">All screenshots</h2>
<p>Taken by <code>run.sh</code> on the last green run, committed in <a href="${TREE}${encodePath(`${s.dir}/screenshots`)}"><code>screenshots/</code></a>.</p>
<div class="gallery">${s.screenshots.map((f) => `<figure><a href="${rel(page, f)}"><img src="${rel(page, f)}" alt="Screenshot of ${esc(s.num)}. ${esc(s.title)}: ${esc(humanize(f))}" loading="lazy"></a><figcaption><code>${esc(posix.basename(f))}</code></figcaption></figure>`).join("\n")}</div></section>` : "";
  const outs = s.outputs.length ? `<section aria-labelledby="all-outputs"><h2 id="all-outputs">Outputs</h2>
<p>Generated by the run and committed; they open here directly.</p>
${outputList(s, page)}</section>` : "";
  const body = `<nav aria-label="Breadcrumb" class="crumbs"><ol><li><a href="${rel(page, "index.html")}">Samples</a></li><li aria-current="page">${s.num}. ${esc(s.title)}</li></ol></nav>
${linkBar(s, page)}
<article class="prose">
${readme}
</article>
${shots}
${outs}
${pager}`;
  writePage(page, layout(page, { title: `${s.num}. ${s.title}`, description: s.pain ? `Pain: ${s.pain}` : s.title, body }));
});

// ---------- documents ----------
for (const [md, page] of PAGES) {
  if (md === "README.md" || /^\d{2}-[^/]+\/README\.md$/.test(md)) continue;
  const src = read(md);
  const title = stripMd(src.match(/^# (.+)$/m)?.[1] ?? humanize(md));
  const crumbs = [`<li><a href="${rel(page, "index.html")}">Samples</a></li>`];
  if (md.startsWith("docs/adr/")) crumbs.push(`<li><a href="${rel(page, "docs/adr/index.html")}">Decisions</a></li>`);
  if (md.startsWith("docs/case-studies/") && !md.endsWith("README.md")) crumbs.push(`<li><a href="${rel(page, "docs/case-studies/index.html")}">Case studies</a></li>`);
  const body = `<nav aria-label="Breadcrumb" class="crumbs"><ol>${crumbs.join("")}<li aria-current="page">${esc(title)}</li></ol></nav>
<ul class="links"><li><a href="${BLOB}${encodePath(md)}">Source on GitHub</a></li></ul>
<article class="prose">
${renderMarkdown(src, md, page)}
</article>`;
  writePage(page, layout(page, { title, body }));
}

// ADR index (the folder has no README)
{
  const page = "docs/adr/index.html";
  const adrs = [...PAGES.keys()].filter((f) => f.startsWith("docs/adr/")).sort();
  const items = adrs.map((f) => {
    const src = read(f);
    const title = stripMd(src.match(/^# (.+)$/m)?.[1] ?? humanize(f));
    const status = src.match(/^## Status\s+([^\n]+)/m)?.[1]?.trim();
    return `<li><a href="${rel(page, PAGES.get(f))}">${esc(title)}</a>${status ? ` <span class="meta">${esc(stripMd(status))}</span>` : ""}</li>`;
  });
  const body = `<nav aria-label="Breadcrumb" class="crumbs"><ol><li><a href="${rel(page, "index.html")}">Samples</a></li><li aria-current="page">Decisions</li></ol></nav>
<article class="prose">
<h1>Architecture decision records</h1>
<p>The repo-wide choices, one record each: the context, the decision and its consequences. Sample 31 keeps its own ADRs next to its runbooks.</p>
<ol class="adr-list">${items.join("\n")}</ol>
</article>`;
  writePage(page, layout(page, { title: "Architecture decision records", body }));
}

// ---------- logs ----------
for (const s of samples) {
  if (!s.log) continue;
  const page = s.log.replace(/\.log$/, ".html");
  const text = read(s.log);
  const lines = text.split("\n");
  const body = `<nav aria-label="Breadcrumb" class="crumbs"><ol><li><a href="${rel(page, "index.html")}">Samples</a></li><li><a href="${rel(page, `${s.dir}/index.html`)}">${s.num}. ${esc(s.title)}</a></li><li aria-current="page">Proof log</li></ol></nav>
<h1>Proof log: <code>${esc(s.log)}</code></h1>
<p>Written by <code>./${esc(s.dir)}/run.sh</code> on its last green run and committed unedited (${lines.length} lines; the repo path is replaced by <code>&lt;repo&gt;</code>). Lines starting with <code>==</code> mark the proof sections.</p>
<ul class="links"><li><a href="${BLOB}${encodePath(s.log)}">On GitHub</a></li><li><a href="${rel(page, `${s.dir}/index.html`)}">Back to the sample</a></li></ul>
<pre class="log" tabindex="0" aria-label="Log output">${lines.map((l) => (l.startsWith("==") ? `<strong>${esc(l)}</strong>` : esc(l))).join("\n")}</pre>`;
  writePage(page, layout(page, { title: `${s.num} proof log`, description: `The committed proof log of sample ${s.num}`, body, wide: true }));
}

// ---------- home ----------
{
  const page = "index.html";
  const root = read("README.md");
  const section = (name) => root.split(/^## /m).find((p) => p.startsWith(`${name}\n`))?.slice(name.length + 1).trim() ?? "";
  const what = section("What this shows").split(/\n\s*\n/)[0];

  // learning paths: "- **Name**: 20 server-rendered portal, 21 accessible forms, ..."
  const paths = [...section("Learning paths").matchAll(/^- \*\*(.+?)\*\*:\s*(.+)$/gm)].map(([, name, list]) => {
    const steps = list.replace(/\.$/, "").split(/,\s*/).map((item) => {
      const m = item.match(/^(\d{2})\s+(.*)$/);
      const s = m && sampleByNum.get(m[1]);
      if (!m) return `<li>${esc(item)}</li>`;
      return s
        ? `<li><a href="${rel(page, `${s.dir}/index.html`)}"><span class="num">${m[1]}</span> ${esc(m[2])}</a></li>`
        : `<li><span class="soon"><span class="num">${m[1]}</span> ${esc(m[2])} <span class="meta">(being built)</span></span></li>`;
    });
    return `<div class="path"><h3>${esc(name)}</h3><ol>${steps.join("")}</ol></div>`;
  });

  // groups, in the order of the root README's table
  const groups = [];
  for (const line of section("Samples").split("\n")) {
    const group = line.match(/^\|\s*\|\s*\*\*(.+?)\*\*/);
    const row = line.match(/^\|\s*(\d{2})\s*\|/);
    if (group) groups.push({ name: group[1].replace(/\s*\(planned\)$/, ""), nums: [] });
    else if (row && groups.length) groups.at(-1).nums.push(row[1]);
  }
  const placed = new Set(groups.flatMap((g) => g.nums));
  const others = samples.filter((s) => !placed.has(s.num)).map((s) => s.num);
  if (others.length) groups.push({ name: "More samples", nums: others });

  const card = (s) => `<article class="card" aria-labelledby="card-${s.num}">
  <h4 id="card-${s.num}"><a href="${rel(page, `${s.dir}/index.html`)}"><span class="num">${s.num}</span> ${esc(s.title)}</a></h4>
  ${s.pain ? `<p class="pain"><span class="label">Pain:</span> ${esc(s.pain)}</p>` : ""}
  <div class="thumbs">
    ${s.overview ? `<img class="diagram" src="${rel(page, s.overview)}" alt="Overview diagram of ${s.num}. ${esc(s.title)}" loading="lazy">` : ""}
    ${s.firstShot ? `<img class="shot" src="${rel(page, s.firstShot)}" alt="Screenshot of ${s.num}. ${esc(s.title)}: ${esc(humanize(s.firstShot))}" loading="lazy">` : ""}
  </div>
  ${linkBar(s, page).replace('class="links"', 'class="links card-links"')}
</article>`;
  const grid = groups
    .map((g) => ({ ...g, list: g.nums.map((n) => sampleByNum.get(n)).filter(Boolean) }))
    .filter((g) => g.list.length)
    .map((g) => `<section class="group" aria-labelledby="g-${slugger()(g.name)}"><h3 id="g-${slugger()(g.name)}">${esc(g.name)}</h3>
<div class="grid">${g.list.map(card).join("\n")}</div></section>`)
    .join("\n");

  const docs = [
    ["design-exercise/index.html", "Design exercise", "A worked design case that ties the samples together: discovery, journeys, requirements, architecture, migration and measures, with a diagram per step."],
    ["docs/case-studies/index.html", "Case studies", "Several samples read as one piece of work: the problem with numbers from the logs, the decisions and what each cost."],
    ["docs/adr/index.html", "Decisions", "The repo-wide architecture decision records."],
    ["MIGRATION-PATTERNS.html", "Migration patterns", "The wider landscape of migration patterns, and where each sample sits in it."],
  ].map(([href, title, text]) => `<li><a href="${rel(page, href)}">${esc(title)}</a><p>${esc(text)}</p></li>`);

  const body = `<section class="hero" aria-labelledby="title">
<h1 id="title">Samples</h1>
<p class="lede">${inline(what, "README.md", page)}</p>
<p>${samples.length} samples. Each card shows the pain it removes, its overview diagram and its first screenshot; the sample page has the full README, every screenshot and the committed outputs (dashboards, PDFs, HTML reports, the API reference).</p>
</section>
<section aria-labelledby="paths"><h2 id="paths">Learning paths</h2>
<p>Each path is ordered: read it left to right.</p>
<div class="paths">${paths.join("\n")}</div>
</section>
<section aria-labelledby="all"><h2 id="all">All samples</h2>
${grid}
</section>
<section aria-labelledby="more"><h2 id="more">Also in the repo</h2>
<ul class="docs">${docs.join("\n")}</ul>
</section>`;
  writePage(page, layout(page, { title: "Samples", description: "Small, real TypeScript samples, one idea each, each with a committed proof log, diagrams and screenshots.", body, wide: true }));
}

// ---------- static files ----------
for (const f of ASSETS) {
  mkdirSync(dirname(join(OUT, f)), { recursive: true });
  cpSync(join(ROOT, f), join(OUT, f));
}
mkdirSync(join(OUT, "assets"), { recursive: true });
const tokens = "35-design-tokens/out/tokens.css";
if (FILES.has(tokens)) cpSync(join(ROOT, tokens), join(OUT, "assets/tokens.css"));
else warn(`${tokens} is missing: the site falls back to the defaults in site.css`), writeFileSync(join(OUT, "assets/tokens.css"), "");
cpSync(join(HERE, "site.css"), join(OUT, "assets/site.css"));
cpSync(join(HERE, "favicon.svg"), join(OUT, "assets/favicon.svg"));
writeFileSync(join(OUT, ".nojekyll"), "");

for (const w of warnings) console.warn(`warning: ${w}`);
console.log(`site: ${written.length} pages (${samples.length} samples, ${samples.filter((s) => s.log).length} logs), ${ASSETS.size} files copied -> ${posix.relative(ROOT, OUT) || OUT}`);
console.log(`url: ${SITE_URL}`);
