import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type Block = { file: string; line: number; lang: string; marker: string; code: string };

export const docs = async (dir = "casebook") => (await readdir(dir)).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f));

// Fenced blocks, each with the <!-- marker --> comment right above it (diagram: name, sql: ddl, sql: J1.2 expect 1).
export async function blocks(files: string[]): Promise<Block[]> {
  const out: Block[] = [];
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split("\n");
    let marker = "";
    for (let i = 0; i < lines.length; i++) {
      const m = /^<!-- (.+) -->$/.exec(lines[i]);
      if (m) marker = m[1];
      else if (lines[i].startsWith("```")) {
        const start = i;
        const code: string[] = [];
        for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
        out.push({ file, line: start + 1, lang: lines[start].slice(3).trim(), marker, code: code.join("\n") });
        marker = "";
      } else if (lines[i].trim()) marker = "";
    }
  }
  return out;
}
