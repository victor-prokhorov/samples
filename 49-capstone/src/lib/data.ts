// Every query the pages run. Each one runs as the signed-in user (db(user, ...)), so the RLS policies filter it as
// well as its own WHERE clause: defence in depth, as in 37-authorization.
import { db } from "./db";
import type { User } from "./policy";

export async function memberRecord(u: User) {
  return db(u, async (c) => {
    const { rows } = await c.query<{ id: string; name: string; holder: string; iban: string; org: string }>(
      "SELECT m.id, m.name, m.holder, m.iban, o.name AS org FROM members m JOIN organisations o ON o.id = m.org_id WHERE m.id = $1",
      [u.memberId],
    );
    return rows[0];
  });
}

export async function contributions(u: User) {
  return db(u, async (c) => {
    const { rows } = await c.query<{ month: Date; employee: string; employer: string }>(
      "SELECT month, employee, employer FROM contributions WHERE member_id = $1 ORDER BY month DESC",
      [u.memberId],
    );
    return rows.map((r) => ({ month: r.month, employee: Number(r.employee), employer: Number(r.employer) }));
  });
}

export async function pendingChange(u: User) {
  return db(u, async (c) => {
    const { rows } = await c.query<{ id: number; created_at: Date }>(
      "SELECT id, created_at FROM change_requests WHERE member_id = $1 AND field = 'bank_account' AND status = 'pending'",
      [u.memberId],
    );
    return rows[0] ?? null;
  });
}

export async function createBankChange(u: User, value: { holder: string; iban: string }) {
  return db(u, async (c) => {
    const { rows } = await c.query<{ id: number }>(
      "INSERT INTO change_requests (member_id, requested_by, field, value) VALUES ($1, $2, 'bank_account', $3) RETURNING id",
      [u.memberId, u.id, JSON.stringify(value)],
    );
    return rows[0].id;
  });
}

export async function organisationMembers(u: User) {
  return db(u, async (c) => {
    const org = (await c.query<{ name: string }>("SELECT name FROM organisations WHERE id = $1", [u.orgId])).rows[0]?.name ?? "";
    const { rows } = await c.query<{ id: string; name: string; last: Date | null; total: string | null }>(
      `SELECT m.id, m.name, max(c.month) AS last, sum(c.employee + c.employer) AS total
       FROM members m LEFT JOIN contributions c ON c.member_id = m.id
       WHERE m.org_id = $1 GROUP BY m.id ORDER BY m.id`,
      [u.orgId],
    );
    return { org, members: rows.map((r) => ({ ...r, total: Number(r.total ?? 0) })) };
  });
}

export type PendingApproval = {
  id: number;
  member_id: string;
  member: string;
  org_id: string;
  org: string;
  requested_by: string;
  requester: string;
  iban: string;
  created_at: Date;
  status: "pending";
};

export async function pendingApprovals(u: User) {
  return db(u, async (c) => {
    const { rows } = await c.query<PendingApproval>(
      `SELECT cr.id, cr.member_id, m.name AS member, m.org_id, o.name AS org, cr.requested_by, coalesce(us.name, cr.requested_by) AS requester,
              cr.value->>'iban' AS iban, cr.created_at, cr.status
       FROM change_requests cr JOIN members m ON m.id = cr.member_id JOIN organisations o ON o.id = m.org_id
       LEFT JOIN users us ON us.sub = cr.requested_by
       WHERE cr.status = 'pending' ORDER BY cr.created_at`,
    );
    return rows;
  });
}

export async function approve(u: User, id: number) {
  return db(u, async (c) => {
    const { rows } = await c.query<{ member: string }>(
      `UPDATE change_requests cr SET status = 'approved', approved_by = $2, approved_at = now()
       FROM members m WHERE cr.id = $1 AND cr.status = 'pending' AND m.id = cr.member_id RETURNING m.name AS member`,
      [id, u.id],
    );
    return rows[0]?.member ?? null;
  });
}
