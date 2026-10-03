// Builds a member's export from the inventory: data.json with everything, one CSV per table, a README that explains
// each file (art. 15(1) information: purposes, categories, recipients, retention, source), an HTML index of the same,
// and a manifest of SHA-256 checksums. Then zips it.
import { createHash } from "node:crypto";
import type pg from "pg";
import { checkInventory } from "./inventory-check.js";
import { type Table, inventory, portable } from "./inventory.js";
import { zip } from "./zip.js";

export class InventoryIncomplete extends Error {
  constructor(public problems: string[]) {
    super(`the data inventory is incomplete: ${problems.join("; ")}`);
  }
}

type Value = string | number | null;
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const value = (v: unknown): Value => (v instanceof Date ? v.toISOString().replace(".000Z", "Z") : v === null || v === undefined ? null : typeof v === "number" ? v : String(v));
const csvCell = (v: Value) => (v === null ? "" : /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const exported = (t: Table) => (t.withheld ? [] : Object.entries(t.columns).filter(([, c]) => c.category !== "technical" && !c.withheld).map(([name]) => name));

export async function collect(db: pg.Pool, memberId: number) {
  const problems = await checkInventory(db);
  if (problems.length) throw new InventoryIncomplete(problems);
  const retention = new Map((await db.query("SELECT table_name, keep::text AS keep, anchor_label FROM retention_policies")).rows.map((r) => [r.table_name, `${r.keep} ${r.anchor_label}`]));
  const sections = [];
  for (const t of inventory) {
    const cols = exported(t);
    const rows = cols.length ? (await db.query(`SELECT ${cols.map((c) => `t.${c}`).join(", ")} FROM ${t.table} t WHERE ${t.subject} ORDER BY ${t.orderBy}`, [memberId])).rows.map((r) => Object.fromEntries(cols.map((c) => [c, value(r[c])]))) : [];
    sections.push({ t, cols, rows, retention: retention.get(t.table) ?? "no policy" });
  }
  return sections;
}

export async function buildExport(db: pg.Pool, memberId: number, request: { id: number; receivedAt: Date; dueOn: string }, now: Date) {
  const sections = await collect(db, memberId);
  const memberNo = sections[0].rows[0]?.member_no as string;
  const generatedAt = value(now) as string;
  const files: { name: string; data: Buffer }[] = [];
  type Withheld = { table: string; column: string | null; reason: string };
  const withheld = sections.flatMap(({ t }): Withheld[] => (t.withheld ? [{ table: t.table, column: null, reason: t.withheld }] : Object.entries(t.columns).filter(([, c]) => c.withheld).map(([c, col]) => ({ table: t.table, column: c, reason: col.withheld! }))));

  const json = {
    export: {
      member_no: memberNo,
      request_id: request.id,
      rights: ["access (GDPR art. 15)", "portability (GDPR art. 20)"],
      received_at: value(request.receivedAt),
      generated_at: generatedAt,
      controller: "The scheme (fictional). Data protection officer: dpo@example.org",
      format: "UTF-8 JSON; dates YYYY-MM-DD; instants ISO 8601 in UTC; amounts in euros as decimal strings",
    },
    data: Object.fromEntries(
      sections
        .filter((s) => !s.t.withheld)
        .map((s) => [s.t.table, { title: s.t.title, purpose: s.t.purpose, lawful_basis: s.t.basisText, source: s.t.source, recipients: s.t.recipients, retention: s.retention, portable: portable(s.t), rows: s.rows }]),
    ),
    withheld,
  };
  files.push({ name: "data.json", data: Buffer.from(JSON.stringify(json, null, 2) + "\n") });
  for (const s of sections.filter((s) => !s.t.withheld)) files.push({ name: `csv/${s.t.table}.csv`, data: Buffer.from([s.cols.join(","), ...s.rows.map((r) => s.cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n") });

  const fileRows = [
    { file: "data.json", what: "Everything below in one machine-readable file.", rows: "", portable: "" },
    ...sections.filter((s) => !s.t.withheld).map((s) => ({ file: `csv/${s.t.table}.csv`, what: s.t.title, rows: String(s.rows.length), portable: portable(s.t) ? "yes" : "no" })),
    { file: "manifest.json", what: "SHA-256 checksum of every file, to check nothing was altered.", rows: "", portable: "" },
  ];
  const md: string[] = [
    `# Your personal data: export for member ${memberNo}`,
    "",
    `Request #${request.id}, received ${value(request.receivedAt)}, answered ${generatedAt} (due by ${request.dueOn}).`,
    "This export answers your right of access (GDPR article 15) and your right to data portability (article 20).",
    "Controller: the scheme (fictional). Data protection officer: dpo@example.org.",
    "",
    "## How to read it",
    "",
    "- `data.json` holds everything; each `csv/` file holds one kind of data, one row per record.",
    "- CSV files are UTF-8, comma-separated, with a header row (RFC 4180). Dates are `YYYY-MM-DD`; instants are ISO 8601 in UTC; amounts are in euros.",
    "- \"Portable\" marks the data you gave us or that your use of the portal produced, which we process under your contract or your consent: article 20 lets you take it to another provider.",
    "",
    "## Files",
    "",
    "| File | What it holds | Rows | Portable (art. 20) |",
    "| --- | --- | --- | --- |",
    ...fileRows.map((f) => `| \`${f.file}\` | ${f.what} | ${f.rows} | ${f.portable} |`),
    "",
  ];
  for (const s of sections.filter((s) => !s.t.withheld)) {
    md.push(`## ${s.t.title} (\`csv/${s.t.table}.csv\`)`, "", `- Why we hold it: ${s.t.purpose}`, `- Lawful basis: ${s.t.basisText}`, `- Where it comes from: ${s.t.source}`, `- Who receives it: ${s.t.recipients}`, `- How long we keep it: ${s.retention}.`, "", "| Column | Meaning | Category |", "| --- | --- | --- |");
    for (const c of s.cols) md.push(`| \`${c}\` | ${s.t.columns[c].about} | ${s.t.columns[c].category} |`);
    md.push("");
  }
  md.push("## What is not included, and why", "", ...withheld.map((w) => `- ${w.column ? `\`${w.table}.${w.column}\`` : `${inventory.find((t) => t.table === w.table)!.title} (\`${w.table}\`)`}: ${w.reason}`), "- Internal keys that only link our tables together are left out.", "");
  md.push(
    "## Your other rights",
    "",
    "You can ask us to correct (art. 16) or erase (art. 17) your data, to restrict its use (art. 18), and you can object to processing based on our legitimate interests (art. 21).",
    "Data we must keep by law (contributions) is kept until its retention period ends, then deleted or anonymised.",
    "You can complain to a supervisory authority (art. 77).",
    "",
  );
  const readme = md.join("\n");
  files.unshift({ name: "README.md", data: Buffer.from(readme) });
  files.splice(1, 0, { name: "index.html", data: Buffer.from(html(readme)) });
  const manifest = files.map((f) => ({ file: f.name, bytes: f.data.length, sha256: sha256(f.data) }));
  files.push({ name: "manifest.json", data: Buffer.from(JSON.stringify({ member_no: memberNo, request_id: request.id, generated_at: generatedAt, files: manifest }, null, 2) + "\n") });
  const archive = zip(files.map((f) => ({ name: `export-${memberNo}/${f.name}`, data: f.data })), now);
  return { memberNo, files, zip: archive, sha256: sha256(archive), rows: Object.fromEntries(sections.map((s) => [s.t.table, s.t.withheld ? null : s.rows.length])) };
}

// The README as a page: headings, lists, tables and code spans, the subset of Markdown the README uses.
function html(md: string): string {
  const out: string[] = [];
  const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("# ")) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith("## ")) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l.startsWith("- ")) {
      out.push("<ul>");
      for (; i < lines.length && lines[i].startsWith("- "); i++) out.push(`<li>${inline(lines[i].slice(2))}</li>`);
      out.push("</ul>");
      i--;
    } else if (l.startsWith("| ")) {
      const cells = (r: string) => r.slice(2, -2).split(" | ");
      out.push(`<table><thead><tr>${cells(l).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`);
      for (i += 2; i < lines.length && lines[i].startsWith("| "); i++) out.push(`<tr>${cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
      out.push("</tbody></table>");
      i--;
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your personal data</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#111;margin:24px auto;max-width:960px;padding:0 16px}h1{font-size:24px}h2{font-size:18px;margin-top:28px;border-bottom:1px solid #ccc;padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #aaa;padding:4px 8px;text-align:left;vertical-align:top}th{background:#eee}code{font-size:13px;background:#f3f3f3;padding:0 3px}</style>
</head><body>
${out.join("\n")}
</body></html>
`;
}
