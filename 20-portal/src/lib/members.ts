import { pool } from "./db";

// Data access for the signed-in member only: every query takes the member id from the session and filters on it.

export async function findMemberByUsername(username: string) {
  const { rows } = await pool.query<{ id: number }>("SELECT id FROM members WHERE username = $1", [username]);
  return rows[0]?.id ?? null;
}

export async function getProfile(memberId: number) {
  const { rows } = await pool.query<{ full_name: string; email: string; employer: string; line1: string; city: string; postcode: string }>(
    `SELECT m.full_name, m.email, e.name AS employer, a.line1, a.city, a.postcode
       FROM members m JOIN employers e ON e.id = m.employer_id JOIN addresses a ON a.member_id = m.id
      WHERE m.id = $1`,
    [memberId],
  );
  return rows[0];
}

export async function getContributions(memberId: number) {
  const { rows } = await pool.query<{ month: string; employee: string; employer: string }>(
    "SELECT to_char(month, 'Mon YYYY') AS month, employee::text, employer::text FROM contributions WHERE member_id = $1 ORDER BY contributions.month",
    [memberId],
  );
  return rows;
}

export type ChangeRequest = { id: number; status: string; line1: string; city: string; postcode: string; effective_from: string; created_at: string };

const REQUEST = "id, status, payload->>'line1' AS line1, payload->>'city' AS city, payload->>'postcode' AS postcode, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at";

export async function getPendingRequest(memberId: number) {
  const { rows } = await pool.query<ChangeRequest>(`SELECT ${REQUEST} FROM change_requests WHERE member_id = $1 AND status = 'pending'`, [memberId]);
  return rows[0] ?? null;
}

export async function getRequest(memberId: number, id: number) {
  const { rows } = await pool.query<ChangeRequest>(`SELECT ${REQUEST} FROM change_requests WHERE id = $1 AND member_id = $2`, [id, memberId]);
  return rows[0] ?? null;
}

export async function createAddressRequest(memberId: number, a: { line1: string; city: string; postcode: string; effectiveFrom: string }) {
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO change_requests (member_id, kind, payload, effective_from) VALUES ($1, 'address', $2, $3) RETURNING id",
    [memberId, JSON.stringify({ line1: a.line1, city: a.city, postcode: a.postcode }), a.effectiveFrom],
  );
  return rows[0].id;
}
