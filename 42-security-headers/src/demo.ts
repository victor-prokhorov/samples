// The story in a real browser (Playwright, Chromium): the same three attacks against the insecure and the
// hardened portal, a header scan before and after, and the secrets checks.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type Browser, chromium } from "playwright";
import { ATTACKER_IBAN, createAttacker } from "./attacker.js";
import { ATTACKER, ATTACKER_CROSS_SITE, HARDENED, HARDENED_PORT, INSECURE, INSECURE_PORT } from "./config.js";
import { type Mode, createPortal } from "./portal.js";
import { writeGrades, writeReports } from "./report.js";
import { fetchSignedIn, grade } from "./scan.js";
import { keyRing, signSession, verifySession } from "./security.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
  console.log(`   ok: ${what}`);
}

// The signing key comes from the environment, as it would from a secret store; never from the repo.
if (!process.env.SESSION_KEYS) {
  process.env.SESSION_KEYS = randomBytes(32).toString("base64url");
  console.log("   SESSION_KEYS not set: generated an ephemeral 256-bit key for this run (sessions end with the process)");
}

const portals = { insecure: createPortal("insecure", INSECURE_PORT), hardened: createPortal("hardened", HARDENED_PORT) };
const origin: Record<Mode, string> = { insecure: INSECURE, hardened: HARDENED };
const attacker = createAttacker();
const modes: Mode[] = ["insecure", "hardened"];

async function signedInPage(browser: Browser, mode: Mode) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(`${origin[mode]}/login`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${origin[mode]}/`);
  return { ctx, page };
}

async function main() {
  await portals.insecure.listen();
  await portals.hardened.listen();
  await attacker.listen();
  mkdirSync("out", { recursive: true });
  mkdirSync("screenshots", { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    step("1. Scan the headers", "sign in, fetch the account page, score each security header and the session cookie (Mozilla Observatory style, out of 100)");
    const scans = { insecure: await fetchSignedIn(INSECURE), hardened: await fetchSignedIn(HARDENED) };
    const g = { insecure: grade(scans.insecure.headers, scans.insecure.setCookie), hardened: grade(scans.hardened.headers, scans.hardened.setCookie) };
    console.log(`   ${"check".padEnd(50)} ${"insecure".padEnd(10)} hardened`);
    g.insecure.findings.forEach((f, i) => {
      const h = g.hardened.findings[i];
      const cell = (x: typeof f) => `${x.points ? "pass" : "FAIL"} ${x.points}/${x.max}`.padEnd(10);
      console.log(`   ${f.check.padEnd(50)} ${cell(f)} ${cell(h)}`);
    });
    console.log(`   ${"score".padEnd(50)} ${`${g.insecure.score} ${g.insecure.letter}`.padEnd(10)} ${g.hardened.score} ${g.hardened.letter}`);
    console.log(`   X-Powered-By: insecure "${scans.insecure.headers.get("x-powered-by")}", hardened "${scans.hardened.headers.get("x-powered-by") ?? "(none)"}"`);
    console.log(`   hardened Set-Cookie: ${scans.hardened.setCookie.replace(/=[^;]+/, "=<signed id>")}`);
    console.log(`   hardened CSP: ${scans.hardened.headers.get("content-security-policy")?.replace(/nonce-[^']+/g, "nonce-<random>")}`);
    const csp2 = (await fetch(`${HARDENED}/login`)).headers.get("content-security-policy") ?? "";
    const nonceOf = (s: string) => /nonce-([^']+)/.exec(s)?.[1];
    check(g.insecure.letter === "F" && g.hardened.letter === "A+", "the insecure build grades F, the hardened build A+");
    check(nonceOf(csp2) !== nonceOf(scans.hardened.headers.get("content-security-policy") ?? "") && (nonceOf(csp2)?.length ?? 0) >= 22, "the nonce is new on every response (128 random bits)");
    writeGrades("out/header-grades.html", g.insecure, g.hardened);
    {
      const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
      await page.goto(`file://${process.cwd()}/out/header-grades.html`);
      await page.screenshot({ path: "screenshots/header-grades.png", fullPage: true });
      await page.close();
    }

    step("2. An injected inline script (stored XSS in the employer notice)", "both builds render the notice unescaped; on the hardened one CSP refuses any inline script without this response's nonce and reports the violation");
    const xss: Record<string, { pwned: number; legit: string; widget: string; cookie: string; console: string[] }> = {};
    for (const mode of modes) {
      const { ctx, page } = await signedInPage(browser, mode);
      const consoleLines: string[] = [];
      page.on("console", (m) => m.type() === "error" && consoleLines.push(m.text()));
      await page.reload();
      await page.waitForFunction(() => document.getElementById("widget")?.textContent?.includes("loaded"), null, { timeout: 5000 }).catch(() => {});
      await sleep(800); // let the stolen-cookie request and the CSP report arrive
      xss[mode] = {
        pwned: await page.locator("#pwned").count(),
        legit: (await page.locator("#legit").textContent()) ?? "",
        widget: (await page.locator("#widget").textContent()) ?? "",
        cookie: await page.evaluate(() => document.cookie),
        console: consoleLines,
      };
      await page.screenshot({ path: `screenshots/xss-${mode}.png` });
      console.log(`   ${mode}: injected script ran: ${xss[mode].pwned ? "YES" : "no"}; page scripts: "${xss[mode].legit}", "${xss[mode].widget}"; document.cookie visible to scripts: "${xss[mode].cookie.replace(/=.+/, "=...")}"`);
      for (const line of consoleLines.filter((l) => /Content Security Policy/.test(l))) console.log(`   ${mode} console: ${line.replace(/nonce-[^']+/g, "nonce-<random>").slice(0, 230)}`);
      await ctx.close();
    }
    const stolen = attacker.stolen.filter((s) => s.from.startsWith(INSECURE));
    const stolenHardened = attacker.stolen.filter((s) => s.from.startsWith(HARDENED));
    const scriptReports = portals.hardened.state.reports.filter((r) => r.directive.startsWith("script-src"));
    check(xss.insecure.pwned === 1 && stolen.some((s) => s.cookie.startsWith("session=")), "insecure: the injected script ran and sent the session cookie to the attacker");
    check(xss.hardened.pwned === 0 && stolenHardened.length === 0, "hardened: the injected script did not run and the attacker received nothing");
    check(xss.hardened.legit.includes("nonce") && xss.hardened.widget.includes("strict-dynamic"), "hardened: the page's own nonce'd script ran and the script it loaded ran too (strict-dynamic)");
    check(scriptReports.some((r) => r.blocked === "inline" && r.sample.includes("getElementById('notice')")), "hardened: the browser sent a CSP report naming the blocked inline script");
    check(xss.hardened.cookie === "" && xss.insecure.cookie.startsWith("session="), "the hardened session cookie is HttpOnly: invisible to scripts even if one ran");

    step("3. A cross-origin form post (CSRF)", "the attacker's page auto-submits a form to /bank; the browser attaches the portal's cookie; the hardened portal checks Origin and a CSRF token bound to the session");
    const csrf: Record<string, { status: number; iban: string }> = {};
    for (const mode of modes) {
      const { ctx, page } = await signedInPage(browser, mode);
      const before = portals[mode].state.iban;
      const response = page.waitForResponse((r) => r.url() === `${origin[mode]}/bank`);
      await page.goto(`${ATTACKER}/csrf?target=${origin[mode]}`);
      const res = await response;
      await page.waitForLoadState();
      await page.screenshot({ path: `screenshots/csrf-${mode}.png` });
      csrf[mode] = { status: res.status(), iban: portals[mode].state.iban };
      console.log(`   ${mode}: POST /bank from ${ATTACKER} -> ${res.status()}; IBAN before "${before}", after "${csrf[mode].iban}"`);
      await ctx.close();
    }
    check(csrf.insecure.status === 200 && csrf.insecure.iban === ATTACKER_IBAN, "insecure: the forged post changed the bank details to the attacker's IBAN");
    check(csrf.hardened.status === 403 && csrf.hardened.iban !== ATTACKER_IBAN, "hardened: the forged post was rejected (403) and the IBAN is unchanged");
    check(portals.hardened.state.events.some((e) => /cross-origin request \(Origin http:\/\/localhost:53252\), session cookie present/.test(e)), "same site, other origin: SameSite=Lax still sent the cookie; the Origin check stopped it");
    {
      // The same attack from a different site (127.0.0.1 is not localhost): SameSite=Lax keeps the cookie off the POST.
      const { ctx, page } = await signedInPage(browser, "hardened");
      const response = page.waitForResponse((r) => r.url() === `${HARDENED}/bank`);
      await page.goto(`${ATTACKER_CROSS_SITE}/csrf?target=${HARDENED}`);
      console.log(`   hardened: POST /bank from ${ATTACKER_CROSS_SITE} (another site) -> ${(await response).status()}`);
      await ctx.close();
      check(portals.hardened.state.events.some((e) => /Origin http:\/\/127\.0\.0\.1:53252\), session cookie absent/.test(e)), "cross-site: SameSite=Lax kept the session cookie off the forged POST");
      // Defence in depth: a request that gets past the Origin check (here it simply claims the portal's origin,
      // as a client outside a browser can) still needs the token, which only the portal's own pages carry.
      const { setCookie } = await fetchSignedIn(HARDENED);
      const noToken = await fetch(`${HARDENED}/bank`, {
        method: "POST",
        headers: { origin: HARDENED, cookie: setCookie.split(";")[0], "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ iban: ATTACKER_IBAN }).toString(),
      });
      console.log(`   hardened: POST /bank with a valid session and a matching Origin but no CSRF token -> ${noToken.status}`);
      check(noToken.status === 403 && portals.hardened.state.iban !== ATTACKER_IBAN, "hardened: without the CSRF token the post is refused even when the Origin matches");
      // And the portal's own form still works: same origin, token present.
      const own = await signedInPage(browser, "hardened");
      await own.page.fill("input[name=iban]", "FR76 1027 8060 4100 0202 0870 165");
      await own.page.getByRole("button", { name: "Save" }).click();
      await own.page.waitForURL(`${HARDENED}/bank`);
      const ok = (await own.page.locator("h1").textContent()) === "Bank details changed";
      console.log(`   hardened: the member's own form (same origin, with the token) -> ${ok ? "changed" : "rejected"}, IBAN now "${portals.hardened.state.iban}"`);
      await own.ctx.close();
      check(ok, "hardened: the legitimate form post with its CSRF token still works");
    }

    step("4. Framing (clickjacking)", "the attacker page loads the portal in a transparent iframe over a fake button; frame-ancestors 'none' (and X-Frame-Options: DENY) make the browser refuse to render it");
    const framed: Record<string, string> = {};
    for (const mode of modes) {
      const { ctx, page } = await signedInPage(browser, mode);
      await page.goto(`${ATTACKER}/frame?target=${origin[mode]}`);
      await sleep(1200);
      const frame = page.frames().find((f) => f !== page.mainFrame());
      framed[mode] = await frame!.evaluate(() => document.querySelector("h1")?.textContent ?? "").catch(() => "");
      await page.screenshot({ path: `screenshots/frame-${mode}.png` });
      console.log(`   ${mode}: iframe ${framed[mode] ? `rendered the portal ("${framed[mode]}")` : `blocked (frame url ${frame!.url()})`}`);
      await ctx.close();
    }
    await sleep(500);
    const frameReports = portals.hardened.state.reports.filter((r) => r.directive === "frame-ancestors");
    check(framed.insecure.startsWith("Welcome") && framed.hardened === "", "the insecure portal renders inside the attacker's page; the hardened one does not");
    check(frameReports.length > 0, "hardened: the browser reported the frame-ancestors violation");

    step("5. CSP reports collected", "every violation the browsers sent to POST /csp-report; in production they go to a log pipeline, and a new kind of report after a deploy is a bug or an attack");
    for (const r of portals.hardened.state.reports) console.log(`   ${r.directive} blocked ${r.blocked} on ${r.document}${r.sample ? ` sample "${r.sample}"` : ""}`);
    writeFileSync("out/csp-reports.json", JSON.stringify(portals.hardened.state.reports.map(({ at: _at, ...r }) => r), null, 2) + "\n");
    writeReports("out/csp-reports.html", portals.hardened.state.reports);
    {
      const page = await browser.newPage({ viewport: { width: 1100, height: 400 } });
      await page.goto(`file://${process.cwd()}/out/csp-reports.html`);
      await page.screenshot({ path: "screenshots/csp-reports.png", fullPage: true });
      await page.close();
    }
    console.log("   wrote out/csp-reports.json and out/csp-reports.html");
  } finally {
    await browser.close();
  }

  step("6. Secrets: from the environment, rotated with a key ring", "SESSION_KEYS='new,old': the first key signs, all keys verify; rotation is add-new, wait out the sessions, drop-old");
  {
    const k1 = randomBytes(32).toString("base64url");
    const k2 = randomBytes(32).toString("base64url");
    const old = signSession(keyRing(k1), "session-123");
    const during = verifySession(keyRing(`${k2},${k1}`), old);
    const after = verifySession(keyRing(k2), old);
    const fresh = verifySession(keyRing(k2), signSession(keyRing(`${k2},${k1}`), "session-456"));
    console.log(`   cookie signed with k1: verifies under "k2,k1": ${during ? "yes" : "no"}; under "k2" alone: ${after ? "yes" : "no"}; a new cookie signed under "k2,k1" verifies under "k2": ${fresh ? "yes" : "no"}`);
    check(during === "session-123" && after === null && fresh === "session-456", "rotation: old cookies stay valid while both keys are loaded and stop working once the old key is dropped");
  }
  if (process.env.SECRET_SCANNER_IMAGE) {
    const scan = (dir: string) => {
      spawnSync("docker", ["run", "--rm", "-v", `${dir}:/scan`, process.env.SECRET_SCANNER_IMAGE!, "dir", "/scan", "--no-banner", "--redact", "--exit-code", "0", "--report-format", "json", "--report-path", "/scan/.report.json"], { stdio: "ignore" });
      return (JSON.parse(readFileSync(join(dir, ".report.json"), "utf8")) as { RuleID: string; File: string }[]).map((f) => `${f.RuleID} in ${f.File.replace("/scan/", "")}`);
    };
    const copy = (files: string[]) => {
      const dir = mkdtempSync(join(tmpdir(), "42-scan-"));
      for (const f of files) cpSync(f, join(dir, f), { recursive: true });
      return dir;
    };
    const git = (args: string[]) => spawnSync("git", args, { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);
    // The working tree as a developer has it (without node_modules), and what git would commit from it.
    const working = copy(spawnSync("ls", ["-A"], { encoding: "utf8" }).stdout.trim().split("\n").filter((f) => f !== "node_modules"));
    const committable = copy([...git(["ls-files", "."]), ...git(["ls-files", "--others", "--exclude-standard", "."])].filter((f) => !f.startsWith("node_modules/")));
    const inWorking = scan(working);
    const inCommit = scan(committable);
    rmSync(working, { recursive: true, force: true });
    rmSync(committable, { recursive: true, force: true });
    const ignored = git(["check-ignore", ".env.local"]);
    console.log(`   gitleaks, working tree: ${inWorking.length} finding(s)${inWorking.map((f) => `\n      ${f}`).join("")}`);
    console.log(`   gitleaks, files git would commit: ${inCommit.length} finding(s); .env.local ignored by git: ${ignored.length ? "yes" : "no"}`);
    check(inWorking.some((f) => f.endsWith(".env.local")) && inCommit.length === 0 && ignored.length === 1, "the secret scanner finds the local .env.local, which git ignores; nothing secret is committable");
  } else console.log(`   no secret scanner: ${process.env.SECRET_SCANNER_NOTE ?? "SECRET_SCANNER_IMAGE not set"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const s of [portals.insecure.server, portals.hardened.server, attacker.server]) s.close();
  });
