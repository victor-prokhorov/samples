import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { YEAR, db } from "./db.js";
import { messageId } from "./mailer.js";
import { pdfText, renderStatement, statementData } from "./statement.js";

// One job per (year, member): running this again adds only members that joined since.
export async function enqueue(year: number) {
  const r = await db.query(
    `INSERT INTO statement_jobs (year, member_id, message_id)
     SELECT $1::int, id, '<statement-' || $1::int || '-' || member_no || '@portal.example>' FROM members
     ON CONFLICT (year, member_id) DO NOTHING`,
    [year],
  );
  return r.rowCount ?? 0;
}

// Renders a stable pseudo-random sample to files and prints what would be sent; touches neither SMTP nor the job table.
export async function dryRun(year: number, sample: number, dir: string, quiet = false) {
  await mkdir(dir, { recursive: true });
  const { rows } = await db.query<{ id: number }>("SELECT id FROM members ORDER BY md5(member_no || $1::int) LIMIT $2", [year, sample]);
  const out = [];
  for (const { id } of rows) {
    const data = await statementData(id, year);
    const { pdf, sha256 } = await renderStatement(data, year);
    const file = join(dir, `statement-${year}-${data.member.member_no}.pdf`);
    await writeFile(file, pdf);
    if (!quiet) console.log(`   would send to ${data.member.email}: "Your ${year} annual statement", Message-ID ${messageId(year, data.member.member_no)}, ${file} (${pdf.length} bytes, sha256 ${sha256.slice(0, 12)})`);
    out.push({ file, text: pdfText(pdf), total: data.total, sha256 });
  }
  return out;
}

export async function report(year: number) {
  const q = async (sql: string) => (await db.query(sql, [year])).rows;
  console.log(`   campaign ${year} report`);
  for (const r of await q("SELECT status, count(*)::int AS n FROM statement_jobs WHERE year = $1 GROUP BY status ORDER BY status")) {
    console.log(`     ${r.status.padEnd(8)} ${r.n}`);
  }
  for (const r of await q(
    `SELECT m.employer, count(*) FILTER (WHERE j.status = 'sent')::int AS sent, count(*)::int AS total
     FROM statement_jobs j JOIN members m ON m.id = j.member_id WHERE j.year = $1 GROUP BY m.employer ORDER BY m.employer`,
  )) {
    console.log(`     ${r.employer.padEnd(8)} ${r.sent}/${r.total} sent`);
  }
  const a = (
    await q(`SELECT count(*) FILTER (WHERE status = 'sent' AND attempts = 1)::int AS first, count(*) FILTER (WHERE status = 'sent' AND attempts > 1)::int AS retried,
       (SELECT count(*)::int FROM statement_attempts WHERE year = $1 AND outcome = 'in_doubt') AS in_doubt,
       (SELECT count(*)::int FROM statement_attempts WHERE year = $1 AND outcome <> 'in_doubt') AS smtp_attempts
     FROM statement_jobs WHERE year = $1`)
  )[0];
  console.log(`     sent on the first attempt ${a.first}, after retries ${a.retried}; SMTP attempts ${a.smtp_attempts}; in-doubt resends ${a.in_doubt}`);
  const dead = await q(
    `SELECT m.member_no, m.email, j.attempts, j.last_error FROM statement_jobs j JOIN members m ON m.id = j.member_id
     WHERE j.year = $1 AND j.status = 'dead' ORDER BY m.member_no`,
  );
  console.log(`     dead letters ${dead.length}${dead.length ? ":" : ""}`);
  for (const d of dead) console.log(`       ${d.member_no} ${d.email} after ${d.attempts} attempt(s): ${d.last_error}`);
  return { dead: dead.length, ...a };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, n] = process.argv.slice(2);
  if (cmd === "enqueue") console.log(`   enqueued ${await enqueue(YEAR)} new jobs for ${YEAR}`);
  else if (cmd === "dry-run") await dryRun(YEAR, Number(n ?? 3), "out");
  else if (cmd === "report") await report(YEAR);
  else console.log("usage: campaign enqueue | dry-run [sample] | report");
  await db.end();
}
