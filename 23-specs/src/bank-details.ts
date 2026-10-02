import { pool, tx } from "./db.js";
import { BankDetailsService, ChangeRequest, RuleViolation, SECOND_APPROVAL_ABOVE, Status } from "./service.js";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const domain: BankDetailsService = {
  async requestChange(req: ChangeRequest, now: Date) {
    if (req.effectiveFrom < isoDay(now)) throw new RuleViolation("effective date is in the past");
    const { rows } = await pool.query<{ id: number }>(
      "INSERT INTO change_requests (member_id, requested_by, iban, effective_from, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id",
      [req.memberId, req.requestedBy, req.iban, req.effectiveFrom],
    );
    return rows[0].id;
  },

  approve(requestId: number, approver: string, now: Date) {
    return tx(async (c) => {
      const { rows } = await c.query(
        `SELECT r.*, m.monthly_amount FROM change_requests r JOIN members m ON m.id = r.member_id WHERE r.id = $1 FOR UPDATE OF r`,
        [requestId],
      );
      const r = rows[0];
      if (r.status === "approved") throw new RuleViolation("request is already approved");
      // Own request: whoever entered it, and the member whose account it changes, even when staff entered it for them.
      if (r.requested_by === approver || r.member_id === approver) throw new RuleViolation("cannot approve your own request");
      if (r.effective_from < isoDay(now)) throw new RuleViolation("effective date is in the past");
      const done = await c.query("INSERT INTO approvals (request_id, approver) VALUES ($1, $2) ON CONFLICT DO NOTHING", [requestId, approver]);
      if (done.rowCount === 0) throw new RuleViolation(`already approved by ${approver}`);
      const { rows: n } = await c.query<{ count: number }>("SELECT count(*)::int AS count FROM approvals WHERE request_id = $1", [requestId]);
      const needed = Number(r.monthly_amount) > SECOND_APPROVAL_ABOVE ? 2 : 1;
      const status: Status = n[0].count >= needed ? "approved" : "awaiting second approval";
      await c.query("UPDATE change_requests SET status = $2 WHERE id = $1", [requestId, status]);
      if (status === "approved") {
        await c.query(
          "INSERT INTO bank_accounts (member_id, iban, effective_from) VALUES ($1, $2, $3) ON CONFLICT (member_id, effective_from) DO UPDATE SET iban = excluded.iban",
          [r.member_id, r.iban, r.effective_from],
        );
      }
      return status;
    });
  },

  async status(requestId: number) {
    const { rows } = await pool.query("SELECT status FROM change_requests WHERE id = $1", [requestId]);
    return rows[0].status;
  },

  async accountOn(memberId: string, day: string) {
    const { rows } = await pool.query(
      "SELECT iban FROM bank_accounts WHERE member_id = $1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1",
      [memberId, day],
    );
    return rows[0]?.iban ?? null;
  },
};
