import { YEAR, db } from "./db.js";
import { sendStatement } from "./mailer.js";
import { renderStatement, statementData } from "./statement.js";

// What a first version usually looks like: loop over members, send, log failures, no record of what was sent.
const { rows } = await db.query<{ id: number }>("SELECT id FROM members ORDER BY id");
for (const { id } of rows) {
  const data = await statementData(id, YEAR);
  const { pdf } = await renderStatement(data, YEAR);
  try {
    await sendStatement(data.member.email, data.member.name, YEAR, data.member.member_no, pdf);
    console.log(`   [naive] ${data.member.member_no} ${data.member.email}: sent`);
    if (process.env.CRASH_ON === data.member.member_no) {
      console.log("   [naive] crash (SIGKILL)");
      process.kill(process.pid, "SIGKILL");
    }
  } catch (err) {
    console.log(`   [naive] ${data.member.member_no} ${data.member.email}: ${(err as Error).message} (logged, skipped)`);
  }
}
await db.end();
