// The story: three journeys through one portal built from the other samples' pieces, driven in a real browser.
// Each step says which sample the piece comes from, checks what the README claims, scans the page with axe and
// takes the screenshots the README shows.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { type Browser, type BrowserContext, type Page, chromium } from "@playwright/test";
import pg from "pg";
import { APP, axe, signIn } from "../e2e/helpers";
import { IDP, OWNER_URL } from "./config";
import { asUser, isRlsRefusal, pool as appPool } from "./lib/db";
import type { User } from "./lib/policy";

const failures: string[] = [];
function check(label: string, condition: boolean) {
  console.log(`   ${condition ? "ok" : "CHECK FAILED"}: ${label}`);
  if (!condition) {
    failures.push(label);
    process.exitCode = 1;
  }
}

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

const owner = new pg.Pool({ connectionString: OWNER_URL, max: 3 });
const one = async (sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows[0];
const at = (p: string) => new URL(`../${p}`, import.meta.url).pathname;
const DESKTOP = { width: 1280, height: 800 };
const shots: string[] = [];
const scans: { page: string; violations: number }[] = [];

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: at(`screenshots/${name}.png`) });
  shots.push(name);
}

async function scan(page: Page, label: string) {
  const v = await axe(page);
  scans.push({ page: label, violations: v.length });
  console.log(`   axe ${label.padEnd(38)} ${v.length} violations${v.length ? `: ${v.map((x) => `${x.id} on ${x.targets.join(", ")}`).join("; ")}` : ""}`);
  return v.length;
}

async function waitFor(url: string) {
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`${url} did not come up`);
}

async function context(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ viewport: DESKTOP, locale: "en-GB", ...opts });
}

const idp = spawn(process.execPath, ["--import", "tsx", "src/idp.ts"], { stdio: ["ignore", "inherit", "inherit"] });
const next = spawn("node_modules/.bin/next", ["start", "-p", "53059"], { stdio: ["ignore", "inherit", "inherit"], detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
let browser: Browser | undefined;
try {
  await waitFor(`${IDP}/.well-known/openid-configuration`);
  await waitFor(`${APP}/`);
  const runStart = (await one("SELECT now() AS t")).t as Date;
  console.log(`   [portal pid ${next.pid}] next start (server-rendered pages, server actions, route handlers) at ${APP}`);
  browser = await chromium.launch({ args: ["--no-sandbox"] });

  step(
    "1. The look comes from 35-design-tokens",
    "tokens.css (generated from the DTCG tokens) and components.css are copied unchanged; the portal adds a layout file that uses semantic tokens only, so light and dark both come from the tokens",
  );
  const same = (mine: string, theirs: string) => readFileSync(at(mine)).equals(readFileSync(at(`../35-design-tokens/${theirs}`)));
  check("src/styles/tokens.css is byte-identical to 35-design-tokens/out/tokens.css", same("src/styles/tokens.css", "out/tokens.css"));
  check("src/styles/components.css is byte-identical to 35-design-tokens/src/components/components.css", same("src/styles/components.css", "src/components/components.css"));
  const portalCss = readFileSync(at("src/styles/portal.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const colours = portalCss.match(/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\(/gi) ?? [];
  const vars = new Set(portalCss.match(/var\(--[\w-]+/g)?.map((v) => v.slice(4)));
  console.log(`   src/styles/portal.css: ${vars.size} distinct tokens used, colour literals: ${colours.length ? colours.join(", ") : "none"}`);
  check("portal.css has no colour literal: every colour is a token", colours.length === 0);

  step(
    "2. Journey 1: Ana, a member, signs in with OpenID Connect (26-sso)",
    "authorization code flow with PKCE: the portal keeps state, nonce and the code verifier server-side, sends only the S256 challenge, swaps the code for tokens on the back channel, and maps the IdP's groups to a portal role",
  );
  const anaCtx = await context(browser);
  const ana = await anaCtx.newPage();
  const authorize: URL[] = [];
  ana.on("request", (r) => r.url().startsWith(`${IDP}/auth`) && authorize.push(new URL(r.url())));
  await ana.goto(`${APP}/`);
  await shoot(ana, "signin-portal");
  await scan(ana, "/ (signed out)");
  await ana.locator("a.ds-button", { hasText: "Sign in" }).click();
  await ana.getByLabel("Username").waitFor();
  const q = authorize[0]?.searchParams;
  console.log(`   GET ${IDP}/auth ? ${[...(q?.keys() ?? [])].join(", ")}`);
  console.log(`     code_challenge_method=${q?.get("code_challenge_method")}, code_challenge=${q?.get("code_challenge")?.slice(0, 12)}..., scope=${q?.get("scope")}`);
  check("the browser is sent to the IdP with a PKCE S256 challenge, a state and a nonce, and no secret", q?.get("code_challenge_method") === "S256" && !!q?.get("state") && !!q?.get("nonce") && !q?.has("client_secret") && !q?.has("code_verifier"));
  await shoot(ana, "signin-idp");
  await scan(ana, "IdP sign-in page");
  await ana.getByLabel("Username").fill("ana");
  await ana.getByLabel("Password").fill("ana-pw");
  await ana.getByRole("button", { name: "Sign in" }).click();
  await ana.waitForURL(`${APP}/dashboard`);
  const sid = (await anaCtx.cookies(APP)).find((c) => c.name === "sid")!;
  const user = await one("SELECT sub, role, org_id, member_id FROM users WHERE sub = 'ana'");
  console.log(`   back at ${new URL(ana.url()).pathname}; cookie sid: HttpOnly=${sid.httpOnly}, SameSite=${sid.sameSite}; users row: ${JSON.stringify(user)}`);
  const stored = await one("SELECT count(*) FILTER (WHERE id_hash = $1)::int AS plain, count(*) FILTER (WHERE id_hash = $2)::int AS hashed FROM sessions", [sid.value, createHash("sha256").update(sid.value).digest("hex")]);
  check("signed in as a member of Acme (group portal-members, member_no M0001), in an HttpOnly session cookie", user.role === "member" && user.org_id === "acme" && user.member_id === "M0001" && sid.httpOnly);
  check("the session table holds the cookie's sha256, never the cookie", stored.plain === 0 && stored.hashed === 1);
  check("the login transaction was consumed by the callback", (await one("SELECT count(*)::int AS n FROM login_transactions")).n === 0);

  step(
    "3. The dashboard: a server-rendered page (20-portal) over RLS (37-authorization), formatted with Intl (25-bilingual)",
    "the page is an async server component; its query runs as the `app` role with Ana's identity set for the transaction, so RLS filters it too; amounts go through Intl.NumberFormat, months through Intl.DateTimeFormat",
  );
  const rows = ana.locator("table.data-table tbody tr");
  const total = await one("SELECT sum(employee + employer) AS t FROM contributions WHERE member_id = 'M0001'");
  const totalText = (await ana.locator(".ds-figures dd").first().textContent()) ?? "";
  console.log(`   ${await ana.locator("h1").textContent()} | ${await rows.count()} months | total ${totalText} (SQL: ${total.t}) | first row: ${(await rows.first().innerText()).replace(/\s+/g, " ")}`);
  check("six months of contributions, and the total is the database's sum, formatted en-GB", (await rows.count()) === 6 && totalText === `€${Number(total.t).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`);
  await shoot(ana, "member-dashboard");
  await scan(ana, "/dashboard (en)");
  const anaUser: User = { id: "ana", role: "member", orgId: "acme", memberId: "M0001" };
  const seen = await asUser(appPool, anaUser, async (c) => ({
    contributions: Number((await c.query("SELECT count(*) FROM contributions")).rows[0].count),
    members: Number((await c.query("SELECT count(*) FROM members")).rows[0].count),
    events: Number((await c.query("SELECT count(*) FROM events")).rows[0].count),
  }));
  const all = await one("SELECT (SELECT count(*) FROM contributions)::int AS contributions, (SELECT count(*) FROM members)::int AS members, (SELECT count(*) FROM events)::int AS events");
  console.log(`   as app role with Ana's identity, no WHERE clause: contributions ${seen.contributions} of ${all.contributions}, members ${seen.members} of ${all.members}, events ${seen.events} of ${all.events}`);
  check("RLS alone limits a member to her own rows, even for a query without a WHERE clause", seen.contributions === 6 && seen.members === 1 && seen.events === 0);

  step(
    "4. Changing bank details: validation errors, then success (21-accessibility, 35's components, 20's server action)",
    "the server action validates (IBAN mod 97), returns translated errors with the values kept; the form shows 21's error summary, which takes focus and links to each field, 35's TextField marks each input aria-invalid with its message; a valid request is written and redirected (Post/Redirect/Get)",
  );
  await ana.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bank details" }).click();
  await ana.getByLabel("IBAN").fill("FR76 3000 6000 0112 3456 7890 188");
  await ana.getByRole("button", { name: "Request the change" }).click();
  await ana.locator(".error-summary").waitFor();
  await ana.waitForFunction(() => document.activeElement?.classList.contains("error-summary"));
  const links = await ana.locator(".error-summary a").allTextContents();
  const invalid = await ana.locator("input[aria-invalid=true]").evaluateAll((els) => els.map((e) => e.id));
  const described = await ana.locator("#iban").getAttribute("aria-describedby");
  const title = await ana.title();
  links.forEach((l) => console.log(`     summary link: ${l}`));
  console.log(`   focus on the error summary; aria-invalid on: ${invalid.join(", ")}; #iban aria-describedby="${described}"; title "${title}"`);
  check("two errors, summarised and focused, each field aria-invalid with its message, 'Error: ' in the title", links.length === 2 && invalid.join() === "holder,iban" && described === "iban-hint iban-error" && title.startsWith("Error: "));
  check("the IBAN error is the checksum one, and the typed IBAN is kept", links[1] === "Check the IBAN: its check digits do not match" && (await ana.getByLabel("IBAN").inputValue()) === "FR76 3000 6000 0112 3456 7890 188");
  check("nothing is written for an invalid request", (await one("SELECT count(*)::int AS n FROM change_requests WHERE requested_by = 'ana'")).n === 0);
  await shoot(ana, "member-bank-errors");
  await scan(ana, "/bank with errors (en)");
  await ana.locator(".error-summary a").first().click();
  check("a summary link moves focus to its field", (await ana.evaluate(() => document.activeElement?.id)) === "holder");
  await ana.getByLabel("Account holder").fill("Ana Martin");
  await ana.getByLabel("IBAN").fill("fr76 3000 6000 0112 3456 7890 189");
  await ana.getByRole("button", { name: "Request the change" }).click();
  await ana.waitForURL(`${APP}/dashboard?sent=1`);
  const alert = await ana.getByRole("status").filter({ hasText: "Request sent" }).count();
  const req = await one("SELECT member_id, requested_by, status, value FROM change_requests WHERE requested_by = 'ana'");
  console.log(`   303 to ${new URL(ana.url()).pathname}${new URL(ana.url()).search}; change_requests: ${JSON.stringify(req)}`);
  check("a pending request, as Ana, with the IBAN normalised; the dashboard confirms it", alert === 1 && req.status === "pending" && req.member_id === "M0001" && req.value.iban === "FR7630006000011234567890189");
  await shoot(ana, "member-bank-sent");
  await scan(ana, "/dashboard?sent=1 (en)");

  step(
    "5. Ana switches the language (25-bilingual)",
    "the switch stores the choice in a cookie and returns to the same page; every string comes from the French ICU catalogue, numbers and dates from Intl with fr-FR, and <html lang> follows",
  );
  await ana.getByRole("link", { name: "Français" }).click();
  await ana.waitForURL(`${APP}/dashboard?sent=1`);
  await ana.getByRole("heading", { level: 1, name: "Bonjour Ana" }).waitFor();
  const lang = await ana.evaluate(() => document.documentElement.lang);
  const frTotal = (await ana.locator(".ds-figures dd").first().textContent()) ?? "";
  const frMonth = (await rows.first().locator("th").textContent()) ?? "";
  console.log(`   <html lang="${lang}"> | ${await ana.locator("h1").textContent()} | total ${frTotal.replace(/ /g, "⍽")} (⍽ = narrow no-break space) | first month "${frMonth}" | status: ${await ana.getByRole("status").first().locator(".ds-alert__title").textContent()}`);
  check("French page: lang=fr, French message, French number and month formats", lang === "fr" && frTotal.endsWith(" €") && /^\d{1,3}( \d{3})*,\d{2} €$/.test(frTotal) && frMonth === "septembre 2026");
  check("the choice is a cookie (lang=fr)", (await anaCtx.cookies(APP)).some((c) => c.name === "lang" && c.value === "fr"));
  await shoot(ana, "member-dashboard-fr");
  await scan(ana, "/dashboard?sent=1 (fr)");

  step(
    "6. Ben's browser asks for French (Accept-Language), and gets the bank form's errors in French",
    "with no cookie, the language comes from Accept-Language (RFC 9110 / 4647 lookup in negotiate.ts); the server action translates its errors with the same catalogue, and the hidden 'Error: ' prefix of 35's TextField is translated too",
  );
  const benCtx = await context(browser, { locale: "fr-FR" });
  const ben = await benCtx.newPage();
  await ben.goto(`${APP}/`);
  console.log(`   Accept-Language: fr-FR -> ${await ben.locator("h1").textContent()}`);
  check("a French browser gets the French landing page", (await ben.evaluate(() => document.documentElement.lang)) === "fr");
  await shoot(ben, "signin-portal-fr");
  await scan(ben, "/ (signed out, fr)");
  await signIn(ben, "ben");
  await ben.goto(`${APP}/bank`);
  await ben.getByRole("button", { name: "Demander la modification" }).click();
  await ben.locator(".error-summary").waitFor();
  const frLinks = await ben.locator(".error-summary a").allTextContents();
  const frPrefix = await ben.locator("#holder-error .ds-visually-hidden").textContent();
  console.log(`   ${frLinks.join(" | ")}; title "${await ben.title()}"; hidden prefix "${frPrefix}"`);
  check("French errors, French title prefix, French hidden prefix", frLinks[0] === "Saisissez le nom du titulaire du compte" && (await ben.title()).startsWith("Erreur : ") && frPrefix === "Erreur : ");
  await shoot(ben, "member-bank-errors-fr");
  await scan(ben, "/bank with errors (fr)");
  await benCtx.close();

  step(
    "7. Journey 2: Erin, an employer admin, sees her organisation's members (37-authorization)",
    "the IdP group acme-hr maps to employer_admin of Acme; the page asks for Acme's members and RLS would return no others anyway; member pages are not hers",
  );
  const erinCtx = await context(browser);
  const erin = await erinCtx.newPage();
  await signIn(erin, "erin");
  const ids = await erin.locator("table.data-table tbody tr td.mono").allTextContents();
  console.log(`   landed on ${new URL(erin.url()).pathname}: ${await erin.locator("h1").textContent()} | ${await erin.locator(".page-head .ds-muted").textContent()} | ${ids[0]} .. ${ids.at(-1)}`);
  const acme = (await owner.query("SELECT id FROM members WHERE org_id = 'acme' ORDER BY id")).rows.map((r) => r.id);
  check("Erin sees exactly Acme's 12 members", ids.join() === acme.join() && ids.length === 12);
  await shoot(erin, "employer-members");
  await scan(erin, "/employer (en)");
  for (const path of ["/dashboard", "/staff/kpis"]) {
    const r = await erin.goto(`${APP}${path}`);
    console.log(`   GET ${path} as Erin -> ${new URL(r!.url()).pathname}`);
    check(`${path} is not an employer admin's page: sent back to /employer`, new URL(erin.url()).pathname === "/employer");
  }
  const erinUser: User = { id: "erin", role: "employer_admin", orgId: "acme", memberId: null };
  const erinSees = await asUser(appPool, erinUser, async (c) => ({
    members: Number((await c.query("SELECT count(*) FROM members")).rows[0].count),
    orgs: (await c.query("SELECT DISTINCT org_id FROM members")).rows.map((r) => r.org_id).join(","),
    events: Number((await c.query("SELECT count(*) FROM events")).rows[0].count),
  }));
  console.log(`   as app role with Erin's identity, no WHERE clause: members ${erinSees.members} (organisations: ${erinSees.orgs}), events ${erinSees.events}`);
  check("RLS gives an employer admin her organisation's members only, and no usage events", erinSees.members === 12 && erinSees.orgs === "acme" && erinSees.events === 0);
  await erinCtx.close();

  step(
    "8. Journey 3: Sam, staff, approves Ana's change, not his own (37-authorization, four eyes)",
    "the page asks can() for each row: Ana's request gets a button, the one Sam filed for Gil does not; the approval runs under RLS, whose WITH CHECK says requested_by <> the approver; a trigger applies the approved details to the member record",
  );
  const samCtx = await context(browser);
  const sam = await samCtx.newPage();
  await signIn(sam, "sam");
  const rowText = await sam.locator("table.data-table tbody tr").evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, " ")));
  rowText.forEach((r) => console.log(`     ${r}`));
  const buttons = await sam.getByRole("button", { name: /^Approve/ }).count();
  check("two pending changes, one Approve button (Ana's); Sam's own request says another approver is needed", rowText.length === 2 && buttons === 1 && rowText.some((r) => r.includes("Gil Novak") && r.includes("another member of staff")));
  await shoot(sam, "staff-approvals");
  await scan(sam, "/staff/approvals (en)");
  await sam.getByRole("button", { name: "Approve the change for Ana Martin" }).click();
  await sam.waitForURL(/approved=/);
  const approved = await one("SELECT status, approved_by, approved_at IS NOT NULL AS stamped FROM change_requests WHERE requested_by = 'ana'");
  const anaRecord = await one("SELECT holder, iban FROM members WHERE id = 'M0001'");
  console.log(`   ${await sam.getByRole("status").locator(".ds-alert__title").textContent()}: ${JSON.stringify(approved)}; members M0001 now ${JSON.stringify(anaRecord)}`);
  check("approved by Sam, and the trigger applied the new IBAN to Ana's record", approved.status === "approved" && approved.approved_by === "sam" && anaRecord.iban === "FR7630006000011234567890189");
  await shoot(sam, "staff-approved");
  await scan(sam, "/staff/approvals?approved (en)");
  const gilReq = (await one("SELECT id FROM change_requests WHERE requested_by = 'sam'")).id;
  const samUser: User = { id: "sam", role: "staff", orgId: null, memberId: null };
  const sql = "UPDATE change_requests SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1";
  let refused = "";
  try {
    await asUser(appPool, samUser, (c) => c.query(sql, [gilReq, "sam"]));
  } catch (e) {
    refused = isRlsRefusal(e) ? `42501 ${(e as Error).message}` : `unexpected: ${(e as Error).message}`;
  }
  console.log(`   as Sam, approving his own request #${gilReq} straight in SQL: ${refused || "allowed"}`);
  check("four eyes in the database: Sam's own request is refused even without the page", refused.startsWith("42501"));
  const sky: User = { id: "sky", role: "staff", orgId: null, memberId: null };
  const skyCan = await appPool.connect();
  try {
    await skyCan.query("BEGIN");
    await skyCan.query("SELECT set_config('app.user_id', 'sky', true), set_config('app.role', 'staff', true)");
    const r = await skyCan.query(sql, [gilReq, sky.id]);
    console.log(`   as Sky (another member of staff), the same UPDATE: ${r.rowCount} row (rolled back, so the screenshot and the proof below still show it pending)`);
    check("another member of staff may approve it", r.rowCount === 1);
  } finally {
    await skyCan.query("ROLLBACK");
    skyCan.release();
  }

  step(
    "9. Sam opens the KPI page: usage events become KPI tiles (29-kpis)",
    "every page and action above recorded a usage event as the user (RLS: only your own events, only staff read them); each KPI is SQL over those events with a target and an owner, shown as a tile whose status is text and icon, not colour alone",
  );
  const runEvents = (await owner.query("SELECT name, count(*)::int AS n FROM events WHERE at >= $1 GROUP BY name ORDER BY name", [runStart])).rows;
  console.log(`   events recorded during this run: ${runEvents.map((r) => `${r.name}=${r.n}`).join(", ")}`);
  const n = (name: string) => runEvents.find((r) => r.name === name)?.n ?? 0;
  check("the journeys left their trace: 4 logins, 2 bank-form rejections, 1 submission, 1 language switch, 1 approval", n("login") === 4 && n("bank_change_rejected") === 2 && n("bank_change_submitted") === 1 && n("language_switched") === 1 && n("change_approved") === 1);
  await sam.getByRole("link", { name: "KPIs" }).click();
  await sam.waitForURL(`${APP}/staff/kpis`);
  const tiles = await sam.locator("[data-kpi]").evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute("data-kpi"), value: e.querySelector(".tile__value")?.textContent, status: e.querySelector(".tile__status")?.textContent, detail: e.querySelector(".ds-card__body .ds-muted")?.textContent })),
  );
  tiles.forEach((t) => console.log(`     ${String(t.id).padEnd(13)} ${String(t.value).padStart(6)}  ${String(t.status).padEnd(14)} ${t.detail}`));
  const adoption = await one("SELECT count(DISTINCT member_id)::int AS n, (SELECT count(*) FROM members)::int AS d FROM events WHERE name = 'login' AND member_id IS NOT NULL AND at >= now() - interval '28 days'");
  check(`adoption is the members who signed in over all members (${adoption.n}/${adoption.d}), Ana and Ben included`, tiles[0].value === `${((100 * adoption.n) / adoption.d).toFixed(1)}%` && adoption.n === 15);
  check("four tiles, each with a met or missed status in words", tiles.length === 4 && tiles.every((t) => t.status === "Target met" || t.status === "Target missed"));
  await shoot(sam, "staff-kpis");
  await scan(sam, "/staff/kpis (en)");
  await samCtx.close();

  step(
    "10. Ana's dashboard after the approval, in dark mode and on a phone",
    "Ana switches back to English; dark mode is the tokens' prefers-color-scheme block, nothing in the portal; at 390 px the layout stacks into one column without horizontal scrolling",
  );
  await ana.getByRole("link", { name: "English" }).click();
  await ana.getByRole("heading", { level: 1, name: "Hello Ana" }).waitFor();
  const dark = await anaCtx.browser()!.newContext({ viewport: DESKTOP, colorScheme: "dark", storageState: await anaCtx.storageState() });
  const anaDark = await dark.newPage();
  await anaDark.goto(`${APP}/dashboard`);
  const bg = await anaDark.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const iban = await anaDark.locator(".details dd.mono").textContent();
  console.log(`   body background in dark mode: ${bg}; IBAN on the dashboard: ${iban}`);
  check("dark canvas from the tokens (gray-950), and the approved IBAN shows", bg === "rgb(15, 18, 22)" && iban === "FR76 3000 6000 0112 3456 7890 189");
  await shoot(anaDark, "member-dashboard-dark");
  await scan(anaDark, "/dashboard (en, dark)");
  await dark.close();
  const phone = await anaCtx.browser()!.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: await anaCtx.storageState() });
  const anaPhone = await phone.newPage();
  await anaPhone.goto(`${APP}/dashboard`);
  const width = await anaPhone.evaluate(() => document.documentElement.scrollWidth);
  console.log(`   390 px wide: document scrollWidth ${width}`);
  check("no horizontal scrolling at 390 px", width <= 390);
  await shoot(anaPhone, "member-dashboard-mobile");
  await scan(anaPhone, "/dashboard (en, 390 px)");
  await phone.close();
  await anaCtx.close();

  step("11. What the run checked in the browser", "axe-core with the WCAG 2.0-2.2 A and AA rules on every page above; screenshots kept under 300 KB so the README loads fast");
  const violations = scans.reduce((s, x) => s + x.violations, 0);
  console.log(`   axe: ${scans.length} page states scanned, ${violations} violations`);
  check("axe finds no violation on any page, in English and French, light and dark, desktop and phone", scans.length >= 12 && violations === 0);
  for (const s of shots) console.log(`   screenshots/${s}.png ${String(Math.round(statSync(at(`screenshots/${s}.png`)).size / 1024)).padStart(4)} KB`);
  check(`${shots.length} screenshots, each under 300 KB`, shots.length >= 13 && shots.every((s) => statSync(at(`screenshots/${s}.png`)).size < 300 * 1024));
} finally {
  await browser?.close();
  idp.kill();
  if (next.pid) process.kill(-next.pid, "SIGTERM");
  await owner.end();
  await appPool.end();
  console.log(failures.length ? `\n${failures.length} CHECK(S) FAILED:\n${failures.map((f) => `   - ${f}`).join("\n")}` : "\nall checks passed");
}
