import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import { db } from "./db.js";

export type Member = { id: number; member_no: string; name: string; email: string; employer: string };

export async function statementData(memberId: number, year: number) {
  const m = await db.query<Member>("SELECT id, member_no, name, email, employer FROM members WHERE id = $1", [memberId]);
  const c = await db.query<{ month: string; amount: string }>(
    "SELECT to_char(period, 'YYYY-MM') AS month, amount::text FROM contributions WHERE member_id = $1 AND extract(year FROM period) = $2 ORDER BY period",
    [memberId, year],
  );
  const total = (await db.query("SELECT coalesce(sum(amount), 0)::text AS t FROM contributions WHERE member_id = $1 AND extract(year FROM period) = $2", [memberId, year])).rows[0].t;
  return { member: m.rows[0], lines: c.rows, total: total as string };
}

// Same input, same bytes: a fixed CreationDate and uncompressed streams, so the hash identifies the content and tests can read the text.
export function renderStatement(data: Awaited<ReturnType<typeof statementData>>, year: number): Promise<{ pdf: Buffer; sha256: string }> {
  const doc = new PDFDocument({ size: "A4", margin: 56, compress: false, info: { Title: `Annual statement ${year}`, CreationDate: new Date(Date.UTC(year + 1, 0, 15)) } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<{ pdf: Buffer; sha256: string }>((resolve) =>
    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      resolve({ pdf, sha256: createHash("sha256").update(pdf).digest("hex") });
    }),
  );
  const { member, lines, total } = data;
  doc.fontSize(18).text(`Annual statement ${year}`);
  doc.moveDown(0.5).fontSize(11).text(`${member.name}, member ${member.member_no}, employer ${member.employer}`);
  doc.moveDown();
  for (const l of lines) doc.text(`${l.month}    ${l.amount.padStart(10)}`);
  doc.moveDown().fontSize(12).text(`Total contributions ${year}: ${total}`);
  doc.end();
  return done;
}

// Reads the text back from an uncompressed pdfkit file (hex strings inside TJ arrays).
export function pdfText(pdf: Buffer) {
  const out: string[] = [];
  for (const m of pdf.toString("latin1").matchAll(/\[(.*?)\] TJ/g)) {
    out.push([...m[1].matchAll(/<([0-9a-f]+)>/g)].map((h) => Buffer.from(h[1], "hex").toString("latin1")).join(""));
  }
  return out;
}
