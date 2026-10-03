// The permission matrix, generated from the policy: every role x action x relationship, asked of can().
// `npm run matrix` writes out/matrix.md and out/matrix.html; the tests compare the same cells with the
// expectations and with what Postgres RLS allows.
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MEMBERS, SUBJECT, member } from "./fixtures.js";
import { type Action, type Relationship, type Resource, type Role, type User, RELATIONSHIPS, ROLES, can, relationship, rule } from "./policy.js";

export type Requester = "me" | "someone else";
export type Row = { action: Action; requester?: Requester };
export const ROWS: Row[] = [
  { action: "member:read" },
  { action: "member:update" },
  { action: "contribution:read" },
  { action: "contribution:create" },
  { action: "change_request:create", requester: "me" }, // you can only file a request in your own name
  { action: "change_request:read", requester: "someone else" },
  { action: "change_request:approve", requester: "someone else" },
  { action: "change_request:approve", requester: "me" }, // the four-eyes row
  { action: "audit_log:read" },
];
export const rowLabel = (r: Row) => (r.action === "change_request:approve" ? `${r.action} (requested by ${r.requester})` : r.action);

export type Verdict = "allow" | "deny" | "n/a";
export type Cell = {
  role: Role;
  row: Row;
  rel: Relationship;
  subject: User;
  target: (typeof MEMBERS)[number] | null; // null: this relationship cannot exist for this role
  resource: Resource | null;
  verdict: Verdict;
};

// The member record that stands in the given relationship to the subject. Staff and auditors have no
// member record and no organisation, so for them only "other organisation" exists.
function targetFor(subject: User, rel: Relationship) {
  if (rel === "own record") return subject.memberId ? member(subject.memberId) : null;
  if (rel === "same organisation") return subject.orgId ? (MEMBERS.find((m) => m.orgId === subject.orgId && m.id !== subject.memberId) ?? null) : null;
  return MEMBERS.find((m) => m.orgId !== (subject.orgId ?? "acme"))!; // Globex's member, for everyone here
}

export function resourceFor(row: Row, subject: User, target: (typeof MEMBERS)[number]): Resource {
  const type = row.action.split(":")[0] as Resource["type"];
  const r: Resource = { type, memberId: target.id, orgId: target.orgId };
  if (type === "change_request") {
    r.requestedBy = row.requester === "me" ? subject.id : target.userId !== subject.id ? target.userId : "erin";
    r.status = "pending";
  }
  return r;
}

export function matrix(): Cell[] {
  const cells: Cell[] = [];
  for (const role of ROLES)
    for (const row of ROWS)
      for (const rel of RELATIONSHIPS) {
        const subject = SUBJECT[role];
        const target = targetFor(subject, rel);
        const resource = target ? resourceFor(row, subject, target) : null;
        if (resource && relationship(subject, resource) !== rel) throw new Error(`fixture for ${role} ${rel} is wrong`);
        const verdict: Verdict = resource ? (can(subject, row.action, resource) ? "allow" : "deny") : "n/a";
        cells.push({ role, row, rel, subject, target, resource, verdict });
      }
  return cells;
}

const SYMBOL: Record<Verdict, string> = { allow: "allow", deny: "deny", "n/a": "–" };
const ruleText = (role: Role, action: Action) => rule(role, action)?.name ?? "no rule: deny by default";

export function markdown(cells: Cell[]) {
  const lines = [
    "# Permission matrix",
    "",
    "Generated from `src/policy.ts` by `npm run matrix`; do not edit by hand. A cell is what `can(user, action, resource)` answers when the resource is the user's own record, a record of the user's organisation, or a record of another organisation. `–` means that relationship cannot exist for the role (staff and auditors have no member record and no organisation; an employer admin has no member record). `test/matrix.test.ts` checks every cell against the expectations; `test/rls.test.ts` checks that Postgres row-level security gives the same answer.",
    "",
    `| role | action | rule | ${RELATIONSHIPS.join(" | ")} |`,
    `| --- | --- | --- | ${RELATIONSHIPS.map(() => "---").join(" | ")} |`,
  ];
  for (const role of ROLES)
    for (const row of ROWS) {
      const cs = RELATIONSHIPS.map((rel) => cells.find((c) => c.role === role && c.row === row && c.rel === rel)!);
      lines.push(`| ${role} | \`${rowLabel(row)}\` | ${ruleText(role, row.action)} | ${cs.map((c) => SYMBOL[c.verdict]).join(" | ")} |`);
    }
  return lines.join("\n") + "\n";
}

export function html(cells: Cell[]) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = ROLES.map((role) =>
    ROWS.map((row, i) => {
      const cs = RELATIONSHIPS.map((rel) => cells.find((c) => c.role === role && c.row === row && c.rel === rel)!);
      const head = i === 0 ? `<th rowspan="${ROWS.length}" class="role">${role.replace("_", " ")}</th>` : "";
      return `<tr class="${i === 0 ? "first" : ""}">${head}<td><code>${esc(rowLabel(row))}</code></td>${cs.map((c) => `<td class="${c.verdict === "n/a" ? "na" : c.verdict}">${c.verdict === "allow" ? "&#10003; allow" : c.verdict === "deny" ? "&#10007; deny" : "&ndash;"}</td>`).join("")}<td class="rule">${esc(ruleText(role, row.action))}</td></tr>`;
    }).join("\n"),
  ).join("\n");
  const allowed = cells.filter((c) => c.verdict === "allow").length;
  const denied = cells.filter((c) => c.verdict === "deny").length;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Permission matrix</title>
<style>
  body { font: 13px/1.35 system-ui, sans-serif; margin: 18px 24px; color: #1b1f24; background: #fff; }
  h1 { font-size: 19px; margin: 0 0 4px; } p { margin: 0 0 10px; color: #444; max-width: 1100px; }
  table { border-collapse: collapse; } th, td { border: 1px solid #d0d7de; padding: 2px 8px; text-align: left; }
  thead th { background: #f6f8fa; } th.role { background: #f6f8fa; vertical-align: top; text-transform: capitalize; width: 110px; }
  tr.first td, tr.first th { border-top: 2px solid #57606a; }
  td.allow { background: #dafbe1; color: #116329; font-weight: 600; } td.deny { background: #ffebe9; color: #a40e26; }
  td.na { background: #f6f8fa; color: #8c959f; text-align: center; } td.allow, td.deny { width: 120px; }
  td.rule { color: #57606a; } code { font: 12px ui-monospace, monospace; white-space: nowrap; }
</style></head><body>
<h1>Permission matrix: can(user, action, resource)</h1>
<p>Generated from <code>src/policy.ts</code>. Roles (RBAC) grant actions; conditions on the user and the record (ABAC) narrow them; no rule means deny. ${allowed} cells allow, ${denied} deny; the same ${allowed + denied} cells are checked against the expectations and against Postgres row-level security.</p>
<table><thead><tr><th>role</th><th>action</th>${RELATIONSHIPS.map((r) => `<th>${r}</th>`).join("")}<th>rule</th></tr></thead>
${body}
</table></body></html>
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const cells = matrix();
  mkdirSync("out", { recursive: true });
  writeFileSync("out/matrix.md", markdown(cells));
  writeFileSync("out/matrix.html", html(cells));
  const n = (v: Verdict) => cells.filter((c) => c.verdict === v).length;
  console.log(`matrix: ${ROLES.length} roles x ${ROWS.length} actions x ${RELATIONSHIPS.length} relationships = ${cells.length} cells: ${n("allow")} allow, ${n("deny")} deny, ${n("n/a")} n/a; wrote out/matrix.md and out/matrix.html`);
}
