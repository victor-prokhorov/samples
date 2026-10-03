// Nightly reconciliation: compare the source and the local copy by counts and checksums, then by record where they
// differ, and report the drift. It catches what sync cannot see: hard deletes, backdated changes, local edits.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { type Member, canonical } from "../domain/model.js";
import type { MemberDirectory } from "../domain/ports.js";
import type { Store } from "./store.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const FIELDS: (keyof Member)[] = ["givenName", "familyName", "email", "birthDate", "status", "employerRef"];

type Side = Map<string, { member: Member; sourceId: string }>;
// Checksum of a set: hash of the sorted canonical lines, so order and paging do not matter.
const checksum = (side: Side, keys = [...side.keys()]) => sha(keys.sort().map((k) => canonical(side.get(k)!.member)).join("\n"));

export type Report = Awaited<ReturnType<typeof reconcile>>;

export async function reconcile(dir: MemberDirectory, store: Store) {
  const sourceActive = await dir.count();
  const source: Side = new Map();
  const quarantined: string[] = [];
  for await (const inc of dir.activeMembers()) {
    if (inc.kind === "upsert") source.set(inc.value.memberNo, { member: inc.value, sourceId: inc.ref.id });
    else if (inc.kind === "rejected") quarantined.push(inc.ref.id);
  }
  const local: Side = new Map((await store.members()).map(({ sourceId, ...m }) => [m.memberNo, { member: m, sourceId }]));

  // first by employer: a count and a checksum per bucket say where to look without listing every record
  const refs = [...new Set([...source.values(), ...local.values()].map((x) => x.member.employerRef))].sort();
  const bucket = (side: Side, ref: string) => [...side.keys()].filter((k) => side.get(k)!.member.employerRef === ref);
  const buckets = refs.map((ref) => {
    const s = bucket(source, ref);
    const l = bucket(local, ref);
    return { employer: ref, source: s.length, local: l.length, sourceChecksum: checksum(source, s).slice(0, 12), localChecksum: checksum(local, l).slice(0, 12) };
  });

  // then record by record
  const missingLocally = [...source.keys()].filter((k) => !local.has(k)).sort().map((k) => ({ memberNo: k, sourceId: source.get(k)!.sourceId }));
  const extraLocally = [...local.keys()].filter((k) => !source.has(k)).sort().map((k) => ({ memberNo: k, sourceId: local.get(k)!.sourceId }));
  const differing = [...source.keys()]
    .filter((k) => local.has(k))
    .sort()
    .flatMap((k) => {
      const s = source.get(k)!.member;
      const l = local.get(k)!.member;
      const fields = FIELDS.filter((f) => s[f] !== l[f]).map((f) => ({ field: f, source: s[f], local: l[f] }));
      return fields.length ? [{ memberNo: k, sourceId: source.get(k)!.sourceId, fields }] : [];
    });

  const report = {
    at: new Date().toISOString(),
    counts: { sourceActive, sourceValid: source.size, quarantined: quarantined.length, local: local.size },
    checksums: { source: checksum(source), local: checksum(local) },
    buckets,
    drift: { missingLocally, extraLocally, differing },
  };
  await store.db.query(
    `INSERT INTO reconciliation_runs (source_active, source_valid, quarantined, local_count, source_checksum, local_checksum, missing_locally, extra_locally, differing, report)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [sourceActive, source.size, quarantined.length, local.size, report.checksums.source, report.checksums.local, missingLocally.length, extraLocally.length, differing.length, JSON.stringify(report)],
  );
  return report;
}

export const driftCount = (r: Report) => r.drift.missingLocally.length + r.drift.extraLocally.length + r.drift.differing.length;

// Repair: the source wins. Missing or differing records are re-read and applied over the version guard; extras go.
export async function repair(dir: MemberDirectory, store: Store, r: Report) {
  let fixed = 0;
  for (const x of [...r.drift.missingLocally, ...r.drift.differing]) {
    const inc = await dir.member(x.sourceId);
    if (inc) (await store.applyMember(inc, true), fixed++);
  }
  for (const x of r.drift.extraLocally) {
    await store.removeBySource(x.sourceId);
    fixed++;
  }
  return fixed;
}

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function writeHtml(file: string, r: Report) {
  const rows = [
    ...r.drift.missingLocally.map((x) => `<tr><td>${x.memberNo}</td><td>missing locally</td><td>in the CRM, not in the local copy</td></tr>`),
    ...r.drift.extraLocally.map((x) => `<tr><td>${x.memberNo}</td><td>extra locally</td><td>in the local copy, gone from the CRM</td></tr>`),
    ...r.drift.differing.map((x) => `<tr><td>${x.memberNo}</td><td>differs</td><td>${x.fields.map((f) => `${f.field}: CRM <code>${esc(f.source)}</code>, local <code>${esc(f.local)}</code>`).join("<br>")}</td></tr>`),
  ];
  const ok = r.checksums.source === r.checksums.local && r.counts.sourceValid === r.counts.local;
  writeFileSync(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CRM reconciliation</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#111;max-width:980px}h1{font-size:22px;margin:0 0 4px}table{border-collapse:collapse;margin:10px 0 18px;width:100%}
td,th{border:1px solid #999;padding:5px 8px;text-align:left;vertical-align:top}th{background:#eee}code{font-size:13px}.verdict{font-weight:700;font-size:17px}</style></head><body>
<h1>Nightly reconciliation: CRM contacts versus local members</h1><p>Run at ${esc(r.at)}</p>
<p class="verdict">${ok ? "No drift: counts and checksums match." : `Drift: ${rows.length} member(s) differ between the CRM and the local copy.`}</p>
<h2>Counts and checksums</h2><table><tr><th></th><th>CRM</th><th>Local</th></tr>
<tr><td>Active contacts</td><td>${r.counts.sourceActive}</td><td></td></tr>
<tr><td>Quarantined (failed translation, not expected locally)</td><td>${r.counts.quarantined}</td><td></td></tr>
<tr><td>Valid members</td><td>${r.counts.sourceValid}</td><td>${r.counts.local}</td></tr>
<tr><td>SHA-256 of sorted canonical lines</td><td><code>${r.checksums.source.slice(0, 16)}</code></td><td><code>${r.checksums.local.slice(0, 16)}</code></td></tr></table>
<h2>By employer</h2><table><tr><th>Employer</th><th>CRM count</th><th>Local count</th><th>CRM checksum</th><th>Local checksum</th><th>Match</th></tr>
${r.buckets.map((b) => `<tr><td>${b.employer}</td><td>${b.source}</td><td>${b.local}</td><td><code>${b.sourceChecksum}</code></td><td><code>${b.localChecksum}</code></td><td>${b.sourceChecksum === b.localChecksum ? "yes" : "<b>no</b>"}</td></tr>`).join("\n")}</table>
<h2>Drift by member</h2>${rows.length ? `<table><tr><th>Member</th><th>Kind</th><th>Detail</th></tr>${rows.join("\n")}</table>` : "<p>None.</p>"}
</body></html>\n`,
  );
}
