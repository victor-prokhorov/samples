// Per-request helpers for server components, server actions and route handlers: who is signed in, which language,
// and the usage events. Every page and action takes the user from the session cookie, never from the URL or a form.
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, pool } from "./db";
import { DEFAULT, type Locale, SUPPORTED, isLocale, translator } from "./i18n";
import { negotiate } from "./negotiate";
import { type Role, type User, home } from "./policy";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = User & { name: string; session: string };

// A language chosen with the switch (cookie) wins; otherwise the browser's Accept-Language (25-bilingual).
export async function locale(): Promise<Locale> {
  const chosen = (await cookies()).get("lang")?.value;
  if (isLocale(chosen)) return chosen;
  const negotiated = negotiate((await headers()).get("accept-language") ?? undefined, [...SUPPORTED], DEFAULT);
  return isLocale(negotiated) ? negotiated : DEFAULT;
}

export const getT = async () => translator(await locale());

export async function currentUser(): Promise<SessionUser | null> {
  const sid = (await cookies()).get("sid")?.value;
  if (!sid) return null;
  const hash = sha256(sid);
  const { rows } = await pool.query(
    `SELECT u.sub, u.name, u.role, u.org_id, u.member_id FROM sessions s JOIN users u ON u.sub = s.user_sub
     WHERE s.id_hash = $1 AND s.expires_at > now()`,
    [hash],
  );
  const r = rows[0];
  return r ? { id: r.sub, name: r.name, role: r.role, orgId: r.org_id, memberId: r.member_id, session: hash.slice(0, 16) } : null;
}

// Page-level gate by role (26-sso's requireRole): no session, back to the landing page; another role, back to the
// user's own home page. Which rows a page shows is then decided per record, by can() and by RLS.
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/");
  if (!(roles as string[]).includes(user.role)) redirect(home(user));
  return user;
}

// One usage event (29-kpis), recorded as the user: RLS only lets a user write their own events.
export async function track(user: SessionUser, name: string, props: Record<string, unknown> = {}) {
  await db(user, (c) =>
    c.query("INSERT INTO events (user_sub, member_id, session, name, props) VALUES ($1, $2, $3, $4, $5)", [user.id, user.memberId, user.session, name, JSON.stringify(props)]),
  );
}
