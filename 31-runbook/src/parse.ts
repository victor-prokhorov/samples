import { readFile } from "node:fs/promises";

export type Block = { lang: string; code: string };
export type Step = { title: string; text: string[]; blocks: Block[] };
export type Section = { name: string; steps: Step[] };
export type Doc = { file: string; title: string; meta: Record<string, string>; sections: Section[] };

export const REQUIRED = ["Preconditions", "Steps", "Verification", "Rollback"];

// Markdown is the source of truth: "# Title", "Key: value" lines, "## Section", "### Step", and fenced blocks (sh runs, manual asks the operator).
export async function parse(file: string): Promise<Doc> {
  const doc: Doc = { file, title: "", meta: {}, sections: [] };
  let section: Section | null = null;
  let step: Step | null = null;
  let fence: Block | null = null;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    if (fence) {
      if (line.startsWith("```")) {
        (step ?? { blocks: [] as Block[] }).blocks.push(fence);
        fence = null;
      } else fence.code += `${line}\n`;
    } else if (line.startsWith("```")) fence = { lang: line.slice(3).trim(), code: "" };
    else if (line.startsWith("# ")) doc.title = line.slice(2).trim();
    else if (line.startsWith("## ")) {
      section = { name: line.slice(3).trim(), steps: [] };
      step = null;
      doc.sections.push(section);
    } else if (line.startsWith("### ") && section) {
      step = { title: line.slice(4).trim(), text: [], blocks: [] };
      section.steps.push(step);
    } else if (!section && /^[A-Z][\w ]+: /.test(line)) {
      const [key, ...rest] = line.split(": ");
      doc.meta[key] = rest.join(": ");
    } else if (step && line.trim()) step.text.push(line.trim());
  }
  return doc;
}

export const params = (doc: Doc) => [...(doc.meta.Parameters ?? "").replace(/\([^)]*\)/g, "").matchAll(/\b([A-Z][A-Z0-9_]+)\b/g)].map((m) => m[1]);
