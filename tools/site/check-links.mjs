// Checks every href and src in the pages build.mjs generated: each must be an https URL, a mailto,
// an in-page anchor that exists, or a relative path to a file in site/ (and its anchor, when it has one).
// The copied outputs (dashboards, coverage, API reference) are checked too, but only reported:
// they are committed as the samples produced them.
//   node check-links.mjs [site-dir]       exit 1 on any broken link in a generated page
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "../../site"));
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const html = walk(SITE).filter((f) => f.endsWith(".html"));
const idsCache = new Map();
const ids = (file) => {
  if (!idsCache.has(file)) idsCache.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

let generated = 0, links = 0, external = 0;
const broken = [], outputIssues = [];
for (const file of html) {
  const text = readFileSync(file, "utf8");
  const isGenerated = text.includes('<meta name="generator" content="tools/site/build.mjs">');
  if (isGenerated) generated++;
  const problems = isGenerated ? broken : outputIssues;
  if (isGenerated) {
    const seen = new Set();
    for (const [, id] of text.matchAll(/\sid="([^"]+)"/g)) {
      if (seen.has(id)) broken.push(`${relative(SITE, file)}: duplicate id="${id}"`);
      seen.add(id);
    }
    for (const [img] of text.matchAll(/<img\b[^>]*>/g)) if (!/\salt="[^"]+"/.test(img)) broken.push(`${relative(SITE, file)}: image without alt text: ${img.slice(0, 80)}`);
  }
  for (const [, attr, raw] of text.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const url = decode(raw);
    links++;
    const where = `${relative(SITE, file)}: ${attr}="${url}"`;
    if (/^https:\/\//.test(url)) { external++; continue; }
    if (/^(mailto:|data:)/.test(url)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) { problems.push(`${where} (not https)`); continue; }
    const [path, hash] = url.split("#");
    let target = path ? resolve(dirname(file), decodeURIComponent(path.split("?")[0])) : file;
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
    if (!target.startsWith(SITE)) { problems.push(`${where} (outside the site)`); continue; }
    if (!existsSync(target)) { problems.push(`${where} (no such file)`); continue; }
    if (hash && target.endsWith(".html") && !ids(target).has(decodeURIComponent(hash))) problems.push(`${where} (no #${hash} in ${relative(SITE, target)})`);
  }
}
for (const p of outputIssues) console.log(`note (copied output, not checked strictly): ${p}`);
for (const p of broken) console.error(`broken: ${p}`);
console.log(`checked ${links} links in ${html.length} HTML files (${generated} generated pages): ${external} https, ${broken.length} broken, ${outputIssues.length} notes in copied outputs`);
process.exit(broken.length ? 1 : 0);
