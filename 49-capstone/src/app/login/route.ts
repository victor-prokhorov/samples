// Start of the authorization code flow with PKCE (26-sso): state, nonce and the PKCE verifier are kept server-side,
// in a row the browser only holds the id of (login_tx cookie, scoped to /callback).
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { REDIRECT_URI, SCOPE, config, oidc } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = await config();
  await pool.query("DELETE FROM login_transactions WHERE expires_at < now()");
  const tx = { id: randomBytes(16).toString("base64url"), state: oidc.randomState(), nonce: oidc.randomNonce(), verifier: oidc.randomPKCECodeVerifier() };
  await pool.query("INSERT INTO login_transactions VALUES ($1, $2, $3, $4, now() + interval '10 minutes')", [tx.id, tx.state, tx.nonce, tx.verifier]);
  const url = oidc.buildAuthorizationUrl(cfg, {
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(tx.verifier),
    code_challenge_method: "S256",
  });
  const res = NextResponse.redirect(url.href, 302);
  res.cookies.set("login_tx", tx.id, { httpOnly: true, sameSite: "lax", path: "/callback", maxAge: 600 });
  return res;
}
