// Replaces the absolute repo path with <repo> in a sample's generated text outputs, so committed
// reports and logs read the same on every machine. Every run.sh calls it on exit:
//   node tools/scrub-paths.mjs <repo-root> <sample-dir>
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const [root, dir] = process.argv.slice(2);
const TEXT = new Set([".json", ".ndjson", ".jsonl", ".xml", ".html", ".md", ".txt", ".csv", ".log", ".svg"]);
const SKIP = new Set(["node_modules", ".git", ".next", ".npm", ".gitlab-ci-local", ".cache", ".bin"]);

function walk(d) {
  for (const name of readdirSync(d)) {
    if (SKIP.has(name)) continue;
    const p = join(d, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (TEXT.has(extname(name)) && s.size < 20_000_000) {
      const text = readFileSync(p, "utf8");
      if (text.includes(root)) writeFileSync(p, text.split(root).join("<repo>"));
    }
  }
}

if (root && dir && root.length > 1) walk(dir);
