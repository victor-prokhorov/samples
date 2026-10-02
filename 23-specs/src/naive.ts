import { pool } from "./db.js";
import { BankDetailsService, ChangeRequest, RuleViolation } from "./service.js";
import { domain } from "./bank-details.js";

// Written from the one-line ticket "staff approve bank detail changes", before the rules were spelled out.
export const naive: BankDetailsService = {
  ...domain,

  async requestChange(req: ChangeRequest, now: Date) {
    if (new Date(req.effectiveFrom) < now) throw new RuleViolation("effective date is in the past");
    const { rows } = await pool.query<{ id: number }>(
      "INSERT INTO change_requests (member_id, requested_by, iban, effective_from, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id",
      [req.memberId, req.requestedBy, req.iban, req.effectiveFrom],
    );
    return rows[0].id;
  },

  async approve(requestId: number, approver: string) {
    const { rows } = await pool.query("UPDATE change_requests SET status = 'approved' WHERE id = $1 RETURNING *", [requestId]);
    await pool.query("INSERT INTO approvals (request_id, approver) VALUES ($1, $2) ON CONFLICT DO NOTHING", [requestId, approver]);
    await pool.query("INSERT INTO bank_accounts (member_id, iban, effective_from) VALUES ($1, $2, $3) ON CONFLICT (member_id, effective_from) DO UPDATE SET iban = excluded.iban", [rows[0].member_id, rows[0].iban, rows[0].effective_from]);
    return "approved";
  },
};
