import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { blocks, docs } from "./extract.js";

const run = promisify(execFile);

export type Rendered = { svg: string; source: string; kind: string; bytes: number; error?: string };

// mermaid-cli drives a headless Chromium through puppeteer; puppeteer.json points it at the preinstalled one
export async function render(files: string[], outDir = "diagrams"): Promise<Rendered[]> {
  await mkdir("build", { recursive: true });
  await mkdir(outDir, { recursive: true });
  const out: Rendered[] = [];
  for (const b of (await blocks(files)).filter((b) => b.lang === "mermaid")) {
    const name = `${basename(b.file).slice(0, 2)}-${b.marker.replace(/^diagram: /, "")}`;
    const [mmd, svg] = [`build/${name}.mmd`, `${outDir}/${name}.svg`];
    await writeFile(mmd, b.code);
    const source = `${b.file}:${b.line}`;
    try {
      await run("npx", ["mmdc", "-q", "-p", "puppeteer.json", "--no-font-embed", "-b", "white", "-i", mmd, "-o", svg]);
      const text = await readFile(svg, "utf8");
      out.push({ svg, source, kind: /aria-roledescription="([^"]+)"/.exec(text)?.[1] ?? "?", bytes: (await stat(svg)).size });
    } catch (err) {
      const msg = (err as { stderr?: string }).stderr ?? String(err);
      out.push({ svg, source, kind: "-", bytes: 0, error: [/Parse error on line \d+/.exec(msg)?.[0], /got '[^']+'/.exec(msg)?.[0]].filter(Boolean).join(", ") || msg.split("\n")[0] });
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const r of await render(await docs())) console.log(`   ${r.source.padEnd(42)} -> ${r.svg} ${r.error ? `FAILED ${r.error}` : `(${r.kind}, ${r.bytes} bytes)`}`);
}
