// The IdP sends the browser back with a code. The portal swaps it for tokens (with the PKCE verifier), checks the
// ID token (signature, issuer, audience, nonce), maps the IdP groups to a portal role, provisions the user and
// starts a session whose cookie is only stored as a hash (26-sso).
import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { APP } from "@/config";
import { asUser, pool } from "@/lib/db";
import { REDIRECT_URI, config, oidc } from "@/lib/oidc";
import { type User, home } from "@/lib/policy";
import { sha256 } from "@/lib/request";

export const dynamic = "force-dynamic";
const SESSION_HOURS = 8;

const refuse = (status: number, message: string) => new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(req: NextRequest) {
  const txId = req.cookies.get("login_tx")?.value;
  // One-time: the row is deleted as it is read, so a replayed callback finds nothing.
  const tx = txId ? (await pool.query("DELETE FROM login_transactions WHERE id = $1 AND expires_at > now() RETURNING *", [txId])).rows[0] : undefined;
  if (!tx) return refuse(400, "No sign-in in progress in this browser (expired, already used, or started elsewhere).");
  let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
  try {
    tokens = await oidc.authorizationCodeGrant(await config(), new URL(req.nextUrl.pathname + req.nextUrl.search, REDIRECT_URI), {
      pkceCodeVerifier: tx.code_verifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
      idTokenExpected: true,
    });
  } catch (e) {
    return refuse(400, `Sign-in rejected: ${(e as Error).message}`);
  }
  const c = tokens.claims()!;
  const groups = Array.isArray(c.groups) ? (c.groups as string[]) : [];
  const mapping = (await pool.query("SELECT role, org_id FROM role_mappings WHERE idp_group = ANY ($1) ORDER BY role LIMIT 1", [groups])).rows[0];
  if (!mapping) return refuse(403, "Your account has no role in the member portal.");

  let user: User = { id: c.sub, role: mapping.role, orgId: mapping.org_id, memberId: null };
  if (mapping.role === "member") {
    // The member record named by the member_no claim, read under RLS as that member: its organisation comes from it.
    const probe: User = { id: c.sub, role: "member", orgId: null, memberId: String(c.member_no ?? "") };
    const rec = await asUser(pool, probe, async (db) => (await db.query("SELECT id, org_id FROM members WHERE id = $1", [probe.memberId])).rows[0]);
    if (!rec) return refuse(403, "No member record is linked to this account.");
    user = { ...user, orgId: rec.org_id, memberId: rec.id };
  }
  await pool.query(
    `INSERT INTO users (sub, name, email, role, org_id, member_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sub) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, org_id = EXCLUDED.org_id,
       member_id = EXCLUDED.member_id, last_login_at = now()`,
    [user.id, c.name, c.email, user.role, user.orgId, user.memberId],
  );

  const old = req.cookies.get("sid")?.value;
  if (old) await pool.query("DELETE FROM sessions WHERE id_hash = $1", [sha256(old)]);
  const sid = randomBytes(32).toString("base64url");
  const hash = sha256(sid);
  await pool.query(`INSERT INTO sessions VALUES ($1, $2, now(), now() + interval '${SESSION_HOURS} hours')`, [hash, user.id]);
  await asUser(pool, user, (db) =>
    db.query("INSERT INTO events (user_sub, member_id, session, name, props) VALUES ($1, $2, $3, 'login', $4)", [user.id, user.memberId, hash.slice(0, 16), JSON.stringify({ role: user.role })]),
  );

  const res = NextResponse.redirect(new URL(home(user), APP), 303);
  res.cookies.set("sid", sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600 });
  res.cookies.set("login_tx", "", { path: "/callback", maxAge: 0 });
  return res;
}
