import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pool } from "./lib/db";

const BASE = "http://localhost:53030";

type Reply = { status: number; location: string; setCookie: string[]; html: string };

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

// A browser with JavaScript turned off: plain GETs and form POSTs, a cookie jar, no redirects followed automatically.
class Browser {
  cookies = new Map<string, string>();

  async request(method: string, path: string, body?: FormData, headers: Record<string, string> = {}): Promise<Reply> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + path, { method, body, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...headers } });
    const setCookie = res.headers.getSetCookie();
    for (const c of setCookie) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      this.cookies.set(k, v);
    }
    return { status: res.status, location: res.headers.get("location") ?? "", setCookie, html: await res.text() };
  }

  get = (path: string) => this.request("GET", path);

  // Submits the page's form the way a browser does without JS: every input it contains, hidden ones included, plus the fields typed in.
  async submit(path: string, page: Reply, fields: Record<string, string>, origin = BASE) {
    const form = /<form[^>]*>([\s\S]*?)<\/form>/.exec(page.html);
    if (!form) throw new Error(`no form on ${path}`);
    const data = new FormData();
    for (const tag of form[1].match(/<input[^>]*>/g) ?? []) {
      const name = attr(tag, "name");
      if (name && !(name in fields)) data.append(name, attr(tag, "value") ?? "");
    }
    for (const [k, v] of Object.entries(fields)) data.append(k, v);
    const hidden = [...data.keys()].filter((k) => k.startsWith("$ACTION"));
    return { reply: await this.request("POST", path, data, { origin }), hidden };
  }
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name.replace("$", "\\$")}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : undefined;
};
// The visible text of <main>, as a reader with JS off sees it.
const text = (html: string) =>
  decode(/<main>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? "")
    .replace(/<!-- -->/g, "")
    .replace(/<\/(p|h1|dd|tr|caption|div|label)>/g, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/( \| )+/g, " | ")
    .trim();
const show = (label: string, r: Reply) => console.log(`   ${label.padEnd(44)} -> ${r.status}${r.location ? ` Location: ${r.location}` : ""}${r.setCookie.length ? ` Set-Cookie: ${r.setCookie.map((c) => c.replace(/=([^;]{6})[^;]*/, "=$1...")).join(", ")}` : ""}`);
const count = async () => Number((await pool.query("SELECT count(*) FROM change_requests")).rows[0].count);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function signIn(b: Browser, username: string) {
  const { reply, hidden } = await b.submit("/login", await b.get("/login"), { username });
  show(`POST /login username=${username} (no JS)`, reply);
  return { reply, hidden };
}

const server = spawn("node_modules/.bin/next", ["start", "-p", "53030"], { stdio: ["ignore", "inherit", "inherit"], detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
try {
  for (let i = 0; ; i++) {
    try {
      await fetch(`${BASE}/login`);
      break;
    } catch {
      if (i > 150) throw new Error("next start did not come up");
      await sleep(100);
    }
  }
  console.log(`client pid ${process.pid} -> next start (pid ${server.pid}) on :53030; the client has no JavaScript engine for pages, only HTTP and a cookie jar`);

  step("1. A signed-out request to a server component", "the page is an async server component; requireMember() reads the cookie on the server and redirects before anything renders");
  const alice = new Browser();
  const out = await alice.get("/profile");
  show("GET /profile (no cookie)", out);
  check(out.status === 307 && out.location === "/login", "signed-out visitors are sent to /login");

  step("2. Sign in with JavaScript off: a server action behind a plain HTML form", "<form action={login}> renders as a normal POST form with a hidden $ACTION_ID_ field, so the browser posts it without JS; the action sets an HttpOnly cookie and redirect() answers 303 See Other");
  const login = await signIn(alice, "alice");
  console.log(`   hidden fields the server rendered into the form: ${login.hidden.map((h) => h.replace(/_[0-9a-f]{20,}$/, "_<id>")).join(", ")}`);
  check(login.reply.status === 303 && login.reply.location === "/profile" && login.reply.setCookie.some((c) => c.startsWith("sid=") && /HttpOnly/i.test(c)), "303 to /profile with an HttpOnly session cookie");

  step("3. Server components read Postgres directly; the HTML arrives complete", "no API layer and no client-side fetch: the component awaits the query and React renders the rows into the response, so the page reads the same with JS off. Every query takes the member id from the session");
  for (const path of ["/profile", "/contributions"]) {
    const r = await alice.get(path);
    console.log(`   GET ${path} -> ${r.status}: ${text(r.html)}`);
    check(r.status === 200 && r.html.includes("Alice Martin") === (path === "/profile") && !r.html.includes("Bob"), `${path} shows alice's data only`);
  }

  step("4. An invalid address change, submitted without JS", "the form is a client component using useActionState, yet without JS it still posts (hidden $ACTION_REF/$ACTION_KEY fields). The server action validates with zod and returns field errors as state; Next renders the page again with them, with the typed values kept. Nothing is written");
  const form = await alice.get("/address");
  const bad = await alice.submit("/address", form, { line1: " ", city: "Springfield", postcode: "nope", effectiveFrom: "2020-01-01" });
  console.log(`   hidden fields: ${bad.hidden.join(", ")}`);
  show("POST /address (blank line 1, bad postcode, past date)", bad.reply);
  const errors = [...bad.reply.html.matchAll(/<p id="(\w+)-error" class="error">([^<]*(?:<!-- -->)?[^<]*)<\/p>/g)].map((m) => `${m[1]}: ${decode(m[2].replace("<!-- -->", ""))}`);
  errors.forEach((e) => console.log(`     ${e}`));
  const invalid = [...bad.reply.html.matchAll(/<input[^>]*aria-invalid="true"[^>]*>/g)].map((m) => attr(m[0], "name"));
  console.log(`     aria-invalid on: ${invalid.join(", ")}; city kept as typed: ${/name="city"[^>]*value="Springfield"|value="Springfield"[^>]*name="city"/.test(bad.reply.html)}`);
  check(bad.reply.status === 200 && errors.length === 3 && invalid.length === 3, "three field errors rendered server-side");
  check((await count()) === 0, "nothing written for an invalid submission");

  step("5. A valid address change: POST, then redirect", "the action inserts the request and calls redirect(), which answers 303 to the new request's page (Post/Redirect/Get: a reload does not resubmit). A member_id field forged into the form is ignored: the action never reads one");
  const good = await alice.submit("/address", form, { line1: "1 High Street", city: "Springfield", postcode: "ab1 2cd", effectiveFrom: inDays(7), member_id: "2" });
  show("POST /address (valid, plus member_id=2)", good.reply);
  check(good.reply.status === 303 && /^\/requests\/\d+$/.test(good.reply.location), "303 to the request");
  const created = await alice.get(good.reply.location);
  console.log(`   GET ${good.reply.location} -> ${created.status}: ${text(created.html)}`);
  const row = (await pool.query("SELECT member_id, payload->>'postcode' AS postcode FROM change_requests")).rows[0];
  check(row.member_id === 1 && row.postcode === "AB1 2CD", "the request belongs to alice and the postcode was normalised");

  step("6. A second pending change is refused by the database", "a partial unique index (member_id, kind) WHERE status = 'pending' is the rule; the action turns the 23505 unique violation into a form-level error instead of a 500");
  const again = await alice.submit("/address", await alice.get("/address"), { line1: "2 Low Road", city: "Springfield", postcode: "AB1 3CD", effectiveFrom: inDays(14) });
  show("POST /address (second change while one is pending)", again.reply);
  const alert = /<p role="alert">([^<]*)<\/p>/.exec(again.reply.html)?.[1];
  console.log(`     role=alert: ${alert}`);
  check(again.reply.status === 200 && alert === "You already have a pending address change" && (await count()) === 1, "refused, still one request");

  step("7. Scoped data access: another member, a forged cookie, a cross-site post", "bob asking for alice's request gets 404 (the query filters on bob's id, so the row does not exist for him); a cookie whose signature does not match is no session at all; a server action posted from another origin is refused (Origin must match Host)");
  const bob = new Browser();
  await signIn(bob, "bob");
  const peek = await bob.get(good.reply.location);
  show(`GET ${good.reply.location} as bob`, peek);
  const bobProfile = await bob.get("/profile");
  console.log(`   GET /profile as bob -> ${bobProfile.status}: ${text(bobProfile.html)}`);
  check(peek.status === 404 && bobProfile.html.includes("Bob Smith") && !bobProfile.html.includes("Alice"), "bob sees only his own data");
  const forger = new Browser();
  forger.cookies.set("sid", `2.${alice.cookies.get("sid")!.split(".")[1]}`);
  const forged = await forger.get("/profile");
  show("GET /profile with sid=2.<alice's signature>", forged);
  check(forged.status === 307 && forged.location === "/login", "a forged cookie is not a session");
  const csrf = await alice.submit("/address", await alice.get("/address"), { line1: "6 Evil Way", city: "Elsewhere", postcode: "ZZ1 1ZZ", effectiveFrom: inDays(7) }, "http://attacker.example");
  show("POST /address with Origin: http://attacker.example", csrf.reply);
  console.log(`   Next aborted the action before it ran (its log line above); change_requests rows: ${await count()}`);
  check(csrf.reply.status >= 400 && (await count()) === 1, "a cross-origin action is rejected and writes nothing");
} finally {
  process.kill(-server.pid!, "SIGTERM");
  await pool.end();
}
