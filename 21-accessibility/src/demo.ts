import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { AxeBuilder } from "@axe-core/playwright";
import { Browser, Page, chromium } from "playwright";

const BASE = "http://localhost:53031";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Closest RGAA 4.1 criterion for each axe rule and manual finding in this sample.
const RGAA: Record<string, string> = {
  "html-has-lang": "8.3",
  "color-contrast": "3.2",
  label: "11.1",
  "document-title": "8.5",
  "autocomplete-valid": "11.13",
  "colour-only error": "3.1",
  "error not announced": "11.10",
  "div as button": "7.3",
  "no error summary or focus": "11.10",
  "radios not grouped": "11.5, 11.6",
  "no autocomplete tokens": "11.13",
};

type Violation = { id: string; impact?: string | null; tags: string[]; help: string; nodes: unknown[] };

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

const criteria = (tags: string[]) =>
  tags
    .filter((t) => /^wcag\d{3,}$/.test(t))
    .map((t) => t.slice(4))
    .map((d) => `${d[0]}.${d[1]}.${d.slice(2)}`)
    .join(", ");

async function scan(page: Page, file: string): Promise<Violation[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  await writeFile(`out/${file}`, JSON.stringify({ url: results.url, violations: results.violations, incomplete: results.incomplete.map((r) => r.id), passes: results.passes.map((r) => r.id) }, null, 2));
  console.log(`   axe ${page.url().replace(BASE, "")} -> ${results.violations.length} violations, ${results.passes.length} rules passed, ${results.incomplete.length} need review (out/${file})`);
  for (const v of results.violations) {
    console.log(`     ${v.id.padEnd(16)} ${String(v.impact).padEnd(9)} WCAG ${criteria(v.tags).padEnd(12)} RGAA ${(RGAA[v.id] ?? "-").padEnd(5)} ${String(v.nodes.length).padStart(2)} nodes  ${v.help}`);
  }
  return results.violations;
}

// What Chromium hands a screen reader for one element: its computed role, name, description and invalid state.
async function spoken(page: Page, selector: string) {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
  await cdp.detach();
  const n = nodes[0];
  const invalid = n.properties?.find((p) => p.name === "invalid")?.value.value ?? "false";
  return { role: String(n.role?.value), name: String(n.name?.value ?? ""), description: String(n.description?.value ?? ""), invalid: String(invalid) };
}

async function showSpoken(page: Page, selector: string) {
  const s = await spoken(page, selector);
  console.log(`   ${selector.padEnd(20)} role=${s.role.padEnd(10)} name=${JSON.stringify(s.name).padEnd(26)} description=${JSON.stringify(s.description).padEnd(58)} invalid=${s.invalid}`);
  return s;
}

const focused = (page: Page) => page.locator("*:focus").ariaSnapshot().then((s) => s.split("\n")[0].replace(/^- /, "").replace(/:$/, ""));
const activeId = (page: Page) => page.evaluate(() => (document.activeElement === document.body ? "body" : document.activeElement?.id || document.activeElement?.tagName.toLowerCase()));

async function markup(page: Page) {
  const m = await page.evaluate(() => ({
    lang: document.documentElement.lang || "(none)",
    title: document.title,
    labels: document.querySelectorAll("label").length,
    fieldsets: document.querySelectorAll("fieldset > legend").length,
    autocomplete: document.querySelectorAll("input[autocomplete]").length,
    buttons: document.querySelectorAll("button, [role=button]").length,
  }));
  console.log(`   markup: lang=${m.lang} title=${JSON.stringify(m.title)} <label>=${m.labels} fieldset+legend=${m.fieldsets} autocomplete=${m.autocomplete} buttons=${m.buttons}`);
  return m;
}

async function tabOrder(page: Page) {
  const stops: string[] = [];
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    if ((await activeId(page)) === "body") break;
    stops.push(await focused(page));
  }
  stops.forEach((s, i) => console.log(`   Tab ${String(i + 1).padStart(2)} -> ${s}`));
  return stops;
}

async function submitAndWait(page: Page, action: () => Promise<void>) {
  const response = page.waitForResponse((r) => r.request().method() === "POST");
  const navigated = page.waitForEvent("framenavigated", (f) => f === page.mainFrame());
  await action();
  const r = await response;
  await navigated;
  await page.waitForLoadState();
  return r.status();
}

async function inaccessible(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  step("1. Inaccessible form: automated scan with axe-core (WCAG 2.0/2.1/2.2 A and AA rules)", "axe runs in the real page in Chromium and reports each failed rule with the WCAG success criteria it maps to; the form is scanned empty and again after a failed submit, because errors are a different page state");
  await page.goto(`${BASE}/bad`);
  const empty = await scan(page, "axe-bad-empty.json");
  await submitAndWait(page, () => page.locator("#save").click());
  const failed = await scan(page, "axe-bad-errors.json");
  await writeFile("out/bad-errors.html", await page.content());
  const ids = new Set([...empty, ...failed].map((v) => v.id));
  check(["html-has-lang", "color-contrast", "label"].every((id) => ids.has(id)), "axe finds the missing lang, the low contrast and the unlabelled radios");

  step("2. Inaccessible form: what a screen reader gets after the failed submit", "the fields have red borders and nothing else: no error text, no aria-invalid, no description. axe's label rule accepts a non-empty placeholder as a label (and Chromium uses it as the name), so these inputs pass, yet the error is colour only (WCAG 1.4.1) and never identified in text (3.3.1). Automated tools catch a minority of failures");
  const fields = [];
  for (const sel of ["input[name=line1]", "input[name=city]", "input[name=postcode]", "input[name=country]"]) fields.push(await showSpoken(page, sel));
  const red = await page.locator("input.err").count();
  console.log(`   ${red} inputs have the red .err border; focus after the reload is on: ${await activeId(page)}`);
  check(red === 4 && fields.every((f) => f.invalid === "false" && f.description === ""), "the errors exist only as colour");
  check((await activeId(page)) === "body", "nothing moves focus to the errors");
  const m = await markup(page);
  check(m.fieldsets === 0 && m.autocomplete === 0 && m.buttons === 0, "no grouping, no autocomplete tokens, no button");

  step("3. Inaccessible form: keyboard only", "a div with a click handler is not focusable and has no role, so Tab never reaches Save (WCAG 2.1.1, 4.1.2); with several text inputs and no submit button, Enter does not submit either (HTML implicit submission)");
  await page.goto(`${BASE}/bad`);
  const stops = await tabOrder(page);
  check(!stops.some((s) => s.includes("Save")), "Save is not in the tab order");
  let posted = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") posted++;
  });
  await page.locator("input[name=postcode]").focus();
  await page.keyboard.type("AB1 2CD");
  await page.keyboard.press("Enter");
  await sleep(500);
  console.log(`   Enter in the postcode field: ${posted} POST requests, still on ${page.url().replace(BASE, "")}`);
  check(posted === 0, "a keyboard user cannot submit the inaccessible form");
  await page.close();
}

async function accessible(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  step("4. Accessible form: the same scan, empty and after a failed submit", "lang on <html>, a <label> for every input, fieldset and legend around the address and the radios, autocomplete tokens, contrast at least 4.5:1, errors in text tied to their field with aria-describedby and aria-invalid, an error summary, and a page title that starts with Error:");
  await page.goto(`${BASE}/good`);
  const empty = await scan(page, "axe-good-empty.json");
  const status = await submitAndWait(page, () => page.getByRole("button", { name: "Save new address" }).click());
  const failed = await scan(page, "axe-good-errors.json");
  await writeFile("out/good-errors.html", await page.content());
  console.log(`   POST /good with nothing filled -> ${status}`);
  const m = await markup(page);
  check(m.fieldsets === 2 && m.autocomplete === 4 && m.title.startsWith("Error:"), "grouped, autocomplete tokens, title flags the error");
  check(empty.length === 0 && failed.length === 0, "the accessible form has no axe violations in either state");

  step("5. Accessible form: keyboard-only journey", "Tab visits every control in reading order and the radio group is one tab stop; Enter on the button submits; after a failed submit focus lands on the error summary (role=alert, so it is also announced), each summary link moves focus to its field, and the corrected form submits with the keyboard alone");
  await page.goto(`${BASE}/good`);
  const stops = await tabOrder(page);
  check(stops.at(-1) === 'button "Save new address"' && stops.filter((s) => s.startsWith("radio")).length === 1, "every control is reachable, the radio group is one stop, the button is last");
  await page.goto(`${BASE}/good`);
  for (let i = 0; i < stops.length; i++) {
    await page.keyboard.press("Tab");
    if (i === 2) await page.keyboard.type("not a postcode");
  }
  console.log(`   focus on ${await focused(page)}, press Enter`);
  console.log(`   -> ${await submitAndWait(page, () => page.keyboard.press("Enter"))}, focus is now on #${await activeId(page)}: ${await focused(page)}`);
  check((await activeId(page)) === "error-summary", "focus moves to the error summary");
  await page.keyboard.press("Tab");
  console.log(`   Tab -> ${await focused(page)}`);
  await page.keyboard.press("Enter");
  console.log(`   Enter -> focus on #${await activeId(page)}: ${await focused(page)}`);
  check((await activeId(page)) === "line1", "the summary link moves focus to the field");

  step("6. Accessible form: what a screen reader gets", "the name comes from the <label>, the description joins the hint and the error message (aria-describedby), invalid comes from aria-invalid; the summary is an alert named by its heading");
  await showSpoken(page, "#error-summary");
  const line1 = await showSpoken(page, "#line1");
  const postcode = await showSpoken(page, "#postcode");
  await showSpoken(page, "#when-today");
  check(line1.name === "Address line 1" && line1.invalid === "true" && line1.description.startsWith("Error:"), "the error is announced with the field");
  check(postcode.description === "For example, AB1 2CD Error: Enter a real postcode, like AB1 2CD", "hint and error are both in the description");

  for (const [i, value] of ["1 High Street", "Springfield", "AB1 2CD", "United Kingdom"].entries()) {
    if (i > 0) await page.keyboard.press("Tab");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(value);
  }
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  console.log(`   typed the address, Space on ${JSON.stringify("From today")}, Tab -> ${await focused(page)}, Enter`);
  await page.keyboard.press("Enter");
  await page.waitForURL(`${BASE}/good/done`);
  const h1 = await page.getByRole("heading", { level: 1 }).textContent();
  console.log(`   -> ${page.url().replace(BASE, "")}: ${JSON.stringify(h1)}`);
  check(h1 === "Address saved", "the keyboard-only journey completes");
  await page.close();
}

await mkdir("out", { recursive: true });
const server = spawn(process.execPath, ["--import", "tsx", "src/server.tsx"], { stdio: "inherit" });
let browser: Browser | undefined;
try {
  for (let i = 0; ; i++) {
    try {
      await fetch(`${BASE}/good`);
      break;
    } catch {
      if (i > 100) throw new Error("form server did not start");
      await sleep(100);
    }
  }
  browser = await chromium.launch();
  console.log(`demo pid ${process.pid} -> Chromium ${browser.version()} (Playwright) against the form server on :53031`);
  await inaccessible(browser);
  await accessible(browser);
  step("7. Findings by WCAG 2.2 success criterion, with the closest RGAA 4.1 criterion", "automated rules found some failures; the rest needed a scripted keyboard journey and a look at the accessibility tree. An audit (RGAA or WCAG-EM) still needs a person with a screen reader");
  const rows = [
    ["html-has-lang", "3.1.1", "axe"],
    ["color-contrast", "1.4.3", "axe"],
    ["label", "4.1.2", "axe (radios only; placeholders pass)"],
    ["colour-only error", "1.4.1", "accessibility tree"],
    ["error not announced", "3.3.1, 4.1.2", "accessibility tree"],
    ["no error summary or focus", "3.3.1, 2.4.3", "keyboard journey"],
    ["div as button", "2.1.1, 4.1.2", "keyboard journey"],
    ["radios not grouped", "1.3.1", "markup query"],
    ["no autocomplete tokens", "1.3.5", "markup query"],
  ];
  for (const [what, sc, how] of rows) console.log(`   ${what.padEnd(26)} WCAG ${sc.padEnd(13)} RGAA ${RGAA[what].padEnd(10)} found by ${how}`);
} finally {
  await browser?.close();
  server.kill();
  await once(server, "exit");
}
