import { createHash, randomBytes } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import * as oidc from "openid-client";
import { APP, APP_PORT, CLIENT_ID, CLIENT_SECRET, IDP, db } from "./config.js";

type Role = "member" | "employer-admin" | "staff";
type User = { id: number; sub: string; name: string; member_no: string | null; groups: string[]; roles: { role: Role; employer: string | null }[]; id_token: string };

// Plain HTTP for the demo, so the ID token signature is checked too (over TLS from the token endpoint it is optional).
const config = await oidc.discovery(new URL(IDP), CLIENT_ID, CLIENT_SECRET, undefined, {
  execute: [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks],
});
const REDIRECT_URI = `${APP}/callback`;
const SESSION_HOURS = 8;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function cookies(req: Request) {
  return Object.fromEntries((req.headers.cookie ?? "").split(/;\s*/).filter(Boolean).map((c) => [c.slice(0, c.indexOf("=")), decodeURIComponent(c.slice(c.indexOf("=") + 1))]));
}

async function currentUser(req: Request): Promise<User | undefined> {
  const sid = cookies(req).sid;
  if (!sid) return undefined;
  const { rows } = await db.query<User>(
    `SELECT u.id, u.sub, u.name, u.member_no, u.groups, s.id_token,
       coalesce((SELECT json_agg(json_build_object('role', m.role, 'employer', m.employer) ORDER BY m.role) FROM role_mappings m WHERE m.idp_group = ANY (u.groups)), '[]') AS roles
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = $1 AND s.expires_at > now()`,
    [sha256(sid)],
  );
  return rows[0];
}

// Authentication says who you are; these checks say what you may do. No session -> log in; a session without the role -> 403.
function requireRole(...allowed: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await currentUser(req);
    if (!user) return res.redirect(302, `/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    if (!user.roles.some((r) => allowed.includes(r.role))) {
      return res.status(403).json({ error: "forbidden", need: allowed, have: user.roles.map((r) => r.role), groups: user.groups });
    }
    res.locals.user = user;
    next();
  };
}

const app = express();
app.set("etag", false);

app.get("/", async (req, res) => {
  const user = await currentUser(req);
  res.json(user ? { signedIn: true, sub: user.sub, roles: user.roles } : { signedIn: false });
});

// returnTo must stay on this app. It is resolved as the browser will resolve the Location header ("/\evil.example" and "//evil.example" name
// another host there), then only its path and query are kept; a path that would itself read as "//host" ("/.//evil.example") is refused too.
function localPath(want: string) {
  try {
    const u = new URL(want, APP);
    return u.origin === new URL(APP).origin && !u.pathname.startsWith("//") ? u.pathname + u.search : "/";
  } catch {
    return "/";
  }
}

app.get("/login", async (req, res) => {
  const returnTo = localPath(String(req.query.returnTo ?? "/"));
  // Housekeeping: a login abandoned at the IdP never reaches /callback, so its row is only removed here, once expired.
  await db.query("DELETE FROM login_transactions WHERE expires_at < now()");
  const tx = { id: randomBytes(16).toString("base64url"), state: oidc.randomState(), nonce: oidc.randomNonce(), verifier: oidc.randomPKCECodeVerifier() };
  await db.query("INSERT INTO login_transactions VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes')", [tx.id, tx.state, tx.nonce, tx.verifier, returnTo]);
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    scope: "openid email profile portal",
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(tx.verifier),
    code_challenge_method: "S256",
  });
  res.cookie("login_tx", tx.id, { httpOnly: true, sameSite: "lax", path: "/callback", maxAge: 10 * 60 * 1000 });
  res.redirect(302, url.href);
});

app.get("/callback", async (req, res) => {
  const txId = cookies(req).login_tx;
  res.clearCookie("login_tx", { path: "/callback" });
  // One-time: the row is deleted as it is read, so a replayed callback finds nothing.
  const tx = txId ? (await db.query("DELETE FROM login_transactions WHERE id = $1 AND expires_at > now() RETURNING *", [txId])).rows[0] : undefined;
  if (!tx) return res.status(400).json({ error: "no login in progress in this browser (expired, already used, or started elsewhere)" });
  let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
  try {
    tokens = await oidc.authorizationCodeGrant(config, new URL(req.originalUrl, APP), {
      pkceCodeVerifier: tx.code_verifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
      idTokenExpected: true,
    });
  } catch (err) {
    const e = err as Error & { error?: string; error_description?: string };
    const cause = e.cause instanceof Error && e.cause.message !== e.message ? `: ${e.cause.message}` : "";
    return res.status(400).json({ error: "login rejected", detail: e.error ? `${e.error}: ${e.error_description}` : `${e.message}${cause}` });
  }
  const c = tokens.claims()!;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO users (issuer, sub, email, name, member_no, groups) VALUES ($1, $2, $3, $4, (SELECT member_no FROM members WHERE member_no = $5), $6)
     ON CONFLICT (issuer, sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, member_no = EXCLUDED.member_no, groups = EXCLUDED.groups, last_login_at = now()
     RETURNING id`,
    [c.iss, c.sub, c.email, c.name, c.member_no ?? null, c.groups ?? []],
  );
  const old = cookies(req).sid;
  if (old) await db.query("DELETE FROM sessions WHERE id_hash = $1", [sha256(old)]);
  const sid = randomBytes(32).toString("base64url");
  await db.query(`INSERT INTO sessions VALUES ($1, $2, $3, now(), now() + interval '${SESSION_HOURS} hours')`, [sha256(sid), rows[0].id, tokens.id_token]);
  res.cookie("sid", sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600 * 1000 });
  res.redirect(302, tx.return_to);
});

app.get("/me", requireRole("member"), async (_req, res) => {
  const user: User = res.locals.user;
  const { rows } = await db.query("SELECT member_no, employer, name, address FROM members WHERE member_no = $1", [user.member_no]);
  if (!rows[0]) return res.status(403).json({ error: "forbidden", detail: "no member record is linked to this account" });
  res.json(rows[0]);
});

app.get("/employers/:code/members", requireRole("employer-admin", "staff"), async (req, res) => {
  const user: User = res.locals.user;
  const code = String(req.params.code);
  const ok = user.roles.some((r) => r.role === "staff" || (r.role === "employer-admin" && r.employer === code));
  if (!ok) return res.status(403).json({ error: "forbidden", detail: `employer-admin of ${user.roles.map((r) => r.employer).join(", ")} cannot read ${code}` });
  const { rows } = await db.query("SELECT member_no, name FROM members WHERE employer = $1 ORDER BY member_no", [code]);
  res.json(rows);
});

app.get("/admin/users", requireRole("staff"), async (_req, res) => {
  const { rows } = await db.query(
    `SELECT u.sub, u.groups, coalesce(array_agg(m.role || coalesce(':' || m.employer, '')) FILTER (WHERE m.role IS NOT NULL), '{}') AS roles
     FROM users u LEFT JOIN role_mappings m ON m.idp_group = ANY (u.groups) GROUP BY u.id ORDER BY u.id`,
  );
  res.json(rows);
});

app.post("/logout", async (req, res) => {
  const sid = cookies(req).sid;
  const s = sid ? (await db.query("DELETE FROM sessions WHERE id_hash = $1 RETURNING id_token", [sha256(sid)])).rows[0] : undefined;
  res.clearCookie("sid", { path: "/" });
  if (!s) return res.redirect(303, "/logged-out");
  res.redirect(303, oidc.buildEndSessionUrl(config, { id_token_hint: s.id_token, post_logout_redirect_uri: `${APP}/logged-out` }).href);
});

app.get("/logged-out", (_req, res) => {
  res.json({ signedOut: true });
});

app.listen(APP_PORT, () => console.log(`   [app pid ${process.pid}] member portal (openid-client relying party) at ${APP}`));
