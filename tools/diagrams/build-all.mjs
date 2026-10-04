// Rebuilds every diagram in the repo: each */diagrams/build.mjs writes its .excalidraw and .svg files.
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const dir of readdirSync(root).sort()) {
  const build = join(root, dir, "diagrams", "build.mjs");
  if (existsSync(build)) {
    await import(pathToFileURL(build).href);
    console.log(`built ${dir}/diagrams`);
  }
}
