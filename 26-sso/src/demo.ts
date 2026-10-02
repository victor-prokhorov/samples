import { ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { Browser } from "./browser.js";
import { APP, CLIENT_ID, CLIENT_SECRET, IDP, db } from "./config.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

async function start(file: string, ready: string) {
  const child = spawn(process.execPath, ["--import", "tsx", `src/${file}.ts`], { stdio: "inherit" });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(ready);
      return child;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`${file} did not start`);
}

const short = (v: string) => `${v.slice(0, 10)}...`;
const isCallback = (u: URL) => u.origin === APP && u.pathname === "/callback";

// Starts a login in this browser; submits the IdP's login form only if the IdP asks for it (no IdP session yet).
async function signIn(b: Browser, user: string, opts: { returnTo?: string; stopAtCallback?: boolean; rewrite?: (u: URL) => URL } = {}) {
  const stop = opts.stopAtCallback ? isCallback : undefined;
  let r = await b.go("GET", `${APP}/login?returnTo=${encodeURIComponent(opts.returnTo ?? "/me")}`, { stop, rewrite: opts.rewrite });
  let askedForPassword = false;
  if (r.page?.url.pathname.startsWith("/interaction/")) {
    askedForPassword = true;
    const action = /action="([^"]+)"/.exec(r.page.text)![1];
    r = await b.go("POST", new URL(action, IDP), { form: { login: user, password: `${user}-pw` }, stop });
  }
  return { ...r, askedForPassword };
}

const body = (p: { text: string }) => p.text.replace(/\s+/g, " ").slice(0, 150);
const procs: ChildProcess[] = [];

try {
  procs.push(await start("idp", `${IDP}/.well-known/openid-configuration`));
  procs.push(await start("app", `${APP}/`));
  const discovery = await (await fetch(`${IDP}/.well-known/openid-configuration`)).json();

  step("1. Discovery", "the app configures itself from the IdP's metadata: endpoints, signing keys (jwks_uri), supported PKCE methods; nothing about the IdP is hard-coded but its issuer URL");
  for (const k of ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri", "end_session_endpoint", "code_challenge_methods_supported", "id_token_signing_alg_values_supported"]) {
    console.log(`   ${k}: ${JSON.stringify(discovery[k])}`);
  }

  step("2. Not signed in", "a protected page without a session sends the browser to /login, remembering where it was going");
  const alice = new Browser("alice");
  const anon = await alice.request("GET", new URL(`${APP}/me`));
  check(anon.res.status === 302 && anon.location?.pathname === "/login", "anonymous /me redirects to /login");

  step(
    "3. Alice signs in: authorization code flow with PKCE",
    "the app stores state, nonce and a PKCE code_verifier server-side and sends only the state, the nonce and the S256 code_challenge; the IdP authenticates alice and redirects back with a one-time code; the app redeems the code with its client secret and the verifier, validates the ID token, and opens its own session",
  );
  const a = await signIn(alice, "alice");
  check(a.page?.status === 200 && a.page.json.member_no === "M0001" && a.askedForPassword, "alice reaches /me after entering her password");
  console.log(`   alice /me -> ${a.page!.status} ${body(a.page!)}`);
  const sessionCookie = alice.cookies.find((c) => c.name === "sid")!;
  const txLeft = (await db.query("SELECT count(*)::int AS n FROM login_transactions")).rows[0].n;
  console.log(`   app cookie sid is opaque (${sessionCookie.value.length} chars), HttpOnly, SameSite=Lax; Postgres stores only its sha256. Login transactions left: ${txLeft}`);
  check(txLeft === 0, "the login transaction was consumed");

  step("4. The ID token and what validating it means", "a JWT signed by the IdP (RS256, key from jwks_uri); the app accepts it only if the signature verifies and iss, aud, exp and nonce match. Here the same checks are replayed on modified copies");
  const idToken = (await db.query("SELECT s.id_token FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.sub = 'alice'")).rows[0].id_token as string;
  const header = decodeProtectedHeader(idToken);
  const claims = decodeJwt(idToken);
  console.log(`   header: ${JSON.stringify(header)}`);
  const { iss, aud, sub, nonce, groups, member_no, iat, exp } = claims as Record<string, unknown>;
  console.log(`   claims: ${JSON.stringify({ iss, aud, sub, nonce: short(String(nonce)), groups, member_no, lifetime_s: Number(exp) - Number(iat) })}`);
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const verify = async (label: string, token: string, opts: { audience?: string; currentDate?: Date } = {}) => {
    try {
      await jwtVerify(token, jwks, { issuer: IDP, audience: opts.audience ?? CLIENT_ID, currentDate: opts.currentDate });
      console.log(`   ${label.padEnd(58)} -> valid`);
      return true;
    } catch (err) {
      console.log(`   ${label.padEnd(58)} -> rejected: ${(err as Error).message}`);
      return false;
    }
  };
  const [h, , sig] = idToken.split(".");
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, groups: ["it-staff"] })).toString("base64url")}.${sig}`;
  const results = [
    await verify("the token as issued", idToken),
    await verify("groups changed to it-staff, original signature", forged),
    await verify("presented to another app (audience other-app)", idToken, { audience: "other-app" }),
    await verify("presented 10 minutes later", idToken, { currentDate: new Date((Number(exp) + 600) * 1000) }),
  ];
  check(results.join() === "true,false,false,false", "only the untouched, in-time token for this app is valid");

  step("5. Single sign-on", "the app session is gone (cookie expired, or another app on the same IdP), but alice still has a session at the IdP: the IdP answers the authorization request with a code at once, no password asked");
  alice.forget(new URL(APP).host);
  const again = await signIn(alice, "alice");
  check(again.page?.status === 200 && !again.askedForPassword, "alice is back on /me without typing her password");
  console.log(`   password asked: ${again.askedForPassword}`);

  step("6. Roles from a claim, checked on every route", "the IdP says which groups a user is in; role_mappings in Postgres turns groups into app roles (member, employer-admin of one employer, staff). Signed in but no mapped role is 403, not a login loop");
  const users: Record<string, Browser> = { alice };
  for (const u of ["bob", "carol", "dave"]) {
    users[u] = new Browser(u, false);
    const r = await signIn(users[u], u, { returnTo: "/" });
    check(r.page?.status === 200 && r.askedForPassword, `${u} signed in`);
  }
  const routes = ["/me", "/employers/acme/members", "/employers/globex/members", "/admin/users"];
  const expected: Record<string, number[]> = { alice: [200, 403, 403, 403], bob: [403, 200, 403, 403], carol: [403, 200, 200, 200], dave: [403, 403, 403, 403] };
  for (const [u, b] of Object.entries(users)) {
    b.log = false;
    for (const [i, route] of routes.entries()) {
      const r = await b.request("GET", new URL(APP + route));
      console.log(`   ${u.padEnd(5)} GET ${route.padEnd(26)} -> ${r.res.status} ${body(r)}`);
      check(r.res.status === expected[u][i], `${u} ${route} is ${expected[u][i]}`);
    }
  }

  step("7. Rejected logins", "each check stops a specific attack: state binds the callback to the browser that started the login (login CSRF), the login transaction and the code are single-use (replay), PKCE makes an intercepted code useless without the verifier, the nonce binds the ID token to this login (token injection), returnTo must resolve to this app (open redirect)");
  const tokenRequest = async (code: string, verifier: string | undefined) => {
    const form: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: `${APP}/callback` };
    if (verifier) form.code_verifier = verifier;
    const res = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    });
    return `${res.status} ${await res.text()}`;
  };
  const verifierOf = async (b: Browser) =>
    (await db.query("SELECT code_verifier FROM login_transactions WHERE id = $1", [b.cookies.find((c) => c.name === "login_tx")!.value])).rows[0].code_verifier as string;

  const eve = new Browser("alice-2", false);
  const callbackOf = async () => {
    const r = await signIn(eve, "alice", { stopAtCallback: true });
    check(r.stoppedAt !== undefined, "stopped before delivering the callback");
    return r.stoppedAt!;
  };
  const deliver = async (label: string, url: URL) => {
    eve.log = true;
    const r = await eve.go("GET", url);
    eve.log = false;
    const page = r.page!;
    if (page.status !== 200) console.log(`     ${label} -> ${body(page)}`);
    return page;
  };

  console.log("   a) the callback carries a state the app did not issue (an attacker's callback link)");
  let cb = await callbackOf();
  cb.searchParams.set("state", "forged-state");
  let page = await deliver("state", cb);
  check(page.status === 400 && page.text.includes("state"), "a callback whose state does not match is rejected");

  console.log("   b) the genuine callback, then the same URL again (a replay from history or a log)");
  cb = await callbackOf();
  const verifier = await verifierOf(eve);
  page = await deliver("genuine", cb);
  check(page.status === 200, "the genuine callback signs in");
  page = await deliver("replay", cb);
  check(page.status === 400, "the same callback replayed is rejected by the app");
  const second = await tokenRequest(cb.searchParams.get("code")!, verifier);
  console.log(`     the same code redeemed again at the token endpoint, with the client secret and the right verifier -> ${second}`);
  check(second.startsWith("400") && second.includes("invalid_grant"), "the IdP accepts a code once");

  console.log("   c) an intercepted code, redeemed by someone who has the client secret but not the verifier");
  cb = await callbackOf();
  const noVerifier = await tokenRequest(cb.searchParams.get("code")!, undefined);
  const wrongVerifier = await tokenRequest(cb.searchParams.get("code")!, "an-attacker-guess-that-is-long-enough-to-be-a-valid-verifier-x");
  console.log(`     without code_verifier -> ${noVerifier}`);
  console.log(`     with a guessed code_verifier -> ${wrongVerifier}`);
  check(noVerifier.includes("invalid_grant") && wrongVerifier.includes("invalid_grant"), "PKCE: the code is useless without the verifier");
  page = await deliver("genuine", cb);
  check(page.status === 200, "the failed attempts did not burn the code: the real browser still signs in");

  console.log("   d) the authorization request is altered to carry another nonce (an ID token minted for another login)");
  eve.forget(new URL(APP).host);
  eve.log = true;
  const r = await signIn(eve, "alice", { rewrite: (u) => (u.pathname === "/auth" ? (u.searchParams.set("nonce", "attacker-nonce"), u) : u) });
  eve.log = false;
  page = r.page!;
  console.log(`     nonce -> ${body(page)}`);
  check(page.status === 400 && page.text.includes("nonce"), "an ID token minted for another nonce is rejected");

  console.log("   e) a login link whose returnTo points to another site (the login used as an open redirect); alice's browser, already signed in at the IdP");
  for (const want of ["/\\evil.example", "//evil.example", "/.//evil.example"]) {
    const r = await signIn(alice, "alice", { returnTo: want });
    console.log(`     returnTo=${want.padEnd(17)} -> signed in, lands on ${r.page!.url.href}`);
    check(r.page?.status === 200 && r.page.url.href === `${APP}/`, `returnTo ${want} is refused: back to / on this app`);
  }
  const txLeftAfter = (await db.query("SELECT count(*)::int AS n FROM login_transactions")).rows[0].n;
  check(txLeftAfter === 0, "every login transaction, accepted or rejected, was consumed");

  step("8. Logout", "the app deletes its session row and sends the browser to the IdP's end_session_endpoint with id_token_hint; the IdP ends its own session (after a confirmation form) and returns to post_logout_redirect_uri");
  alice.log = true;
  const sid = alice.cookies.find((c) => c.name === "sid")!.value;
  let out = await alice.go("POST", `${APP}/logout`);
  check(out.page?.url.pathname === "/session/end", "the IdP asks to confirm");
  const form = out.page!.text;
  const action = /<form[^>]*action="([^"]+)"/.exec(form)![1];
  const xsrf = /name="xsrf" value="([^"]+)"/.exec(form)![1];
  out = await alice.go("POST", new URL(action, IDP), { form: { xsrf, logout: "yes" } });
  check(out.page?.url.href === `${APP}/logged-out`, "back on the app's logged-out page");
  const stale = await fetch(`${APP}/me`, { headers: { cookie: `sid=${sid}` }, redirect: "manual" });
  console.log(`   the old sid cookie replayed: GET /me -> ${stale.status} ${stale.headers.get("location")}`);
  check(stale.status === 302, "the session is gone server-side, not just from the browser");
  alice.log = false;
  const relog = await signIn(alice, "alice");
  console.log(`   signing in again: password asked: ${relog.askedForPassword}`);
  check(relog.askedForPassword, "the IdP session ended too: no silent SSO after logout");
} finally {
  for (const c of procs) {
    c.kill();
    await once(c, "exit");
  }
  await db.end();
}
