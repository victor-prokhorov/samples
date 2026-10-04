// CI check: fail the build when code still references a flag past its expiry date.
//   tsx src/lint-flags.ts <dir>...     (FLAGS_TODAY=YYYY-MM-DD to pin the date)
// A flag is debt with a due date: once it has done its job, the losing branch and the flag must go.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { registry } from "./registry.js";

const today = process.env.FLAGS_TODAY ?? new Date().toISOString().slice(0, 10);
const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: lint-flags.ts <dir>...");
  process.exit(2);
}

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !path.endsWith("registry.ts") && !path.endsWith("lint-flags.ts")) yield path;
  }
}

const daysLeft = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
let errors = 0;
let scanned = 0;
const refs = new Map<string, string[]>();
for (const dir of dirs) {
  for (const file of files(dir)) {
    scanned++;
    const lines = readFileSync(file, "utf8").split("\n");
    for (const f of registry) {
      const re = new RegExp(`(["'\`])${f.key.replace(/[-.]/g, "\\$&")}\\1`);
      lines.forEach((line, i) => {
        if (re.test(line)) refs.set(f.key, [...(refs.get(f.key) ?? []), `${relative(process.cwd(), file)}:${i + 1}`]);
      });
    }
  }
}

console.log(`lint-flags: today ${today}, ${scanned} files scanned in ${dirs.join(", ")}`);
for (const f of registry) {
  const where = refs.get(f.key) ?? [];
  const left = daysLeft(f.expires);
  const state = left < 0 ? `EXPIRED ${-left} days ago` : `expires in ${left} days`;
  if (left < 0 && where.length > 0) {
    errors++;
    for (const w of where) console.log(`  error  ${w}  "${f.key}" ${state} (${f.expires}, owner: ${f.owner}): delete the flag check and the losing branch`);
  } else if (left < 0) {
    console.log(`  warn   "${f.key}" ${state}, no longer referenced: delete it from the registry and the flags table`);
  } else {
    console.log(`  ok     "${f.key}" ${state}, referenced ${where.length}x`);
  }
}
if (errors) {
  console.log(`lint-flags: FAILED, ${errors} expired flag(s) still referenced`);
  process.exit(1);
}
console.log("lint-flags: passed");
