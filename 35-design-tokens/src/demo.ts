// The story, step by step: tokens -> CSS variables -> components -> checks (contrast, axe, visual regression).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildCss } from "./tokens/build.js";
import { checkContrast, contrastHtml, printResults } from "./tokens/contrast-check.js";
import { ROOT, cssVar, load } from "./tokens/dtcg.js";
import { format } from "./tokens/wcag.js";

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

const at = (...p: string[]) => join(ROOT, ...p);
const V1 = at("tokens/proposals/softer-ui.v1.light.tokens.json");
const V2 = at("tokens/proposals/softer-ui.v2.light.tokens.json");
const SERVED_TOKENS = at("storybook-static/tokens/tokens.css");
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers" };

function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, env: { ...env, ...extraEnv }, encoding: "utf8" });
  return { code: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

interface PwTest {
  title: string;
  status: string;
  annotations: { type: string; description: string }[];
  error?: string;
}

// Runs one spec through the Playwright test runner and reads its JSON report.
function playwright(spec: string, extraEnv: Record<string, string> = {}, extraArgs: string[] = []) {
  const report = at("test-results", `report-${Date.now()}.json`);
  const r = run("npx", ["playwright", "test", spec, "--reporter=json", ...extraArgs], { PLAYWRIGHT_JSON_OUTPUT_NAME: report, ...extraEnv });
  if (!existsSync(report)) throw new Error(`playwright wrote no report:\n${r.out.slice(-2000)}`);
  const json = JSON.parse(readFileSync(report, "utf8"));
  const tests: PwTest[] = [];
  const walk = (suite: { specs?: { title: string; tests: { results: { status: string; error?: { message?: string } }[]; annotations: PwTest["annotations"] }[] }[]; suites?: unknown[] }) => {
    for (const s of suite.specs ?? [])
      for (const t of s.tests) {
        const last = t.results.at(-1)!;
        tests.push({ title: s.title, status: last.status, annotations: t.annotations, error: last.error?.message });
      }
    for (const child of (suite.suites ?? []) as (typeof suite)[]) walk(child);
  };
  for (const s of json.suites) walk(s);
  rmSync(report);
  return { code: r.code, tests, passed: tests.filter((t) => t.status === "passed"), failed: tests.filter((t) => t.status !== "passed") };
}

const serve = (proposals: string[]) => writeFileSync(SERVED_TOKENS, buildCss(proposals).css);

async function main() {
  mkdirSync(at("screenshots"), { recursive: true });

  step(
    "1. Tokens in, CSS custom properties out",
    "tokens/*.tokens.json are DTCG files as a design tool exports them: primitives (raw ramps and scales) and a semantic layer (what a value is for), with one semantic colour file per theme. The build turns every token into a custom property and keeps aliases as var() references",
  );
  const tokensCss = buildCss();
  writeFileSync(at("out/tokens.css"), tokensCss.css);
  const css = tokensCss.css;
  const decls = css.match(/^\s*--[\w-]+:/gm)!.length;
  console.log(`   ${tokensCss.counts.primitives} primitives, ${tokensCss.counts.semantic} semantic, ${tokensCss.counts.themed} themed colours, ${decls} declarations in out/tokens.css`);
  let selector = "";
  for (const line of css.split("\n")) {
    if (/^:root,$/.test(line)) selector = ':root, [data-theme="light"]';
    else if (/^(\S.*|  :root.*) \{$/.test(line) && !line.startsWith("@media") && !line.startsWith('[data-theme="light"]')) selector = line.replace("{", "").trim() + (line.startsWith("  ") ? " (in the dark media query)" : "");
    if (/--color-(gray-600|text-muted|bg-accent):/.test(line)) console.log(`   ${line.trim().padEnd(46)} in ${selector}`);
  }
  check("an alias stays a reference: --color-text-muted is var(--color-gray-600), not a copied hex", /--color-text-muted: var\(--color-gray-600\);/.test(css));
  check("light and dark define the same semantic colours, and dark is applied both by data-theme and by prefers-color-scheme", css.includes('[data-theme="dark"] {') && css.includes("@media (prefers-color-scheme: dark)") && decls === tokensCss.counts.primitives + tokensCss.counts.semantic + 3 * tokensCss.counts.themed);

  step(
    "2. The contrast gate on the committed tokens",
    "tokens/contrast.pairs.json says which foreground is drawn on which background; the check resolves both through the alias chain and computes the WCAG ratio for every pair in every theme: 4.5:1 for text, 3:1 for UI boundaries and focus rings",
  );
  const base = checkContrast();
  const ratios = base.results.map((r) => r.ratio);
  console.log(`   ${base.results.length} pairs (${base.results.length / 2} per theme), lowest ratio ${format(Math.min(...ratios))}, ${base.results.filter((r) => !r.pass).length} failures`);
  printResults(base.results.filter((r) => r.fg === "color.text.muted" || r.fg === "color.border.input"));
  writeFileSync(at("out/contrast.html"), contrastHtml(base.results, "Contrast check: committed tokens"));
  check("every pair passes in both themes, and no text or border token is left out of the pairs", base.results.every((r) => r.pass) && base.unchecked.length === 0);

  step(
    "3. A bad token is caught",
    "the design file's next export (proposals/softer-ui.v1) softens muted text to gray-500 and deepens the brand blue. Checked on white only, gray-500 looks fine (4.73:1); the gate checks it on every background it is used on",
  );
  const v1 = run("npx", ["tsx", "src/tokens/contrast-check.ts", "--proposal", V1, "--failures-only", "--html", "out/contrast-softer-ui-v1.html"]);
  console.log(v1.out.trimEnd());
  console.log(`   exit code ${v1.code}`);
  const v1r = checkContrast([V1]);
  const v1fail = v1r.results.filter((r) => !r.pass);
  const onWhite = v1r.results.find((r) => r.theme === "light" && r.fg === "color.text.muted" && r.bg === "color.bg.surface")!;
  check(`the gate exits 1 and names the two pairs: muted on canvas (${format(v1fail[0]?.ratio ?? 0)}) and on subtle; on white it passes (${format(onWhite.ratio)})`, v1.code === 1 && v1fail.length === 2 && v1fail.every((r) => r.fg === "color.text.muted") && onWhite.pass);
  const near = v1fail.find((r) => r.ratio > 4.45 && r.ratio < 4.5);
  check(`${near?.ratio.toFixed(4)} is reported as 4.45:1 and fails: the ratio is truncated, never rounded up to 4.5`, near !== undefined);

  step("4. The fix passes", "the second export (proposals/softer-ui.v2) puts muted text back on gray-600 and keeps the deeper blue; the gate now passes");
  const v2 = run("npx", ["tsx", "src/tokens/contrast-check.ts", "--proposal", V2, "--failures-only"]);
  console.log(v2.out.trimEnd());
  const accent = checkContrast([V2]).results.filter((r) => r.theme === "light" && r.bg.startsWith("color.bg.accent"));
  printResults(accent);
  check("v2 passes the contrast gate (exit 0)", v2.code === 0);

  step(
    "5. Components use only semantic tokens",
    "src/components/components.css may reference var(--...) and nothing else for colour, size and type; every reference must exist in out/tokens.css and must be a semantic token, never a primitive (so a theme or a rebrand only touches the token files)",
  );
  const componentsCss = readFileSync(at("src/components/components.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const outsideUtility = componentsCss.replace(/\.ds-visually-hidden \{[^}]*\}/, "");
  const literals = outsideUtility.match(/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\(|\b\d*\.?\d+(px|rem|em|pt)\b/gi) ?? [];
  const used = [...new Set([...componentsCss.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]))];
  const defined = new Set([...css.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
  const primitives = new Set([...load([at("tokens/primitives.tokens.json")]).keys()].map(cssVar));
  const undefinedRefs = used.filter((v) => !defined.has(v));
  const primitiveRefs = used.filter((v) => primitives.has(v));
  console.log(`   ${used.length} distinct custom properties used; literals outside the visually-hidden utility: ${literals.length ? literals.join(", ") : "none"}; undefined: ${undefinedRefs.join(", ") || "none"}; primitives: ${primitiveRefs.join(", ") || "none"}`);
  check("no colour or length literal, every var() is defined, none is a primitive", literals.length === 0 && undefinedRefs.length === 0 && primitiveRefs.length === 0);

  step("6. A static Storybook", "storybook build writes storybook-static/; out/tokens.css is served next to it as tokens/tokens.css, not bundled, so the next steps swap token builds without rebuilding");
  rmSync(at("storybook-static"), { recursive: true, force: true });
  const sb = run("npx", ["storybook", "build", "-o", "storybook-static", "--quiet"], { STORYBOOK_DISABLE_TELEMETRY: "1" });
  const index = JSON.parse(readFileSync(at("storybook-static/index.json"), "utf8")) as { entries: Record<string, { type: string; id: string }> };
  const stories = Object.values(index.entries).filter((e) => e.type === "story");
  console.log(`   storybook build exit ${sb.code}: ${stories.length} stories (${[...new Set(stories.map((s) => s.id.split("--")[0]))].join(", ")})`);
  check("the static Storybook built and serves the token file", sb.code === 0 && stories.length >= 12 && existsSync(SERVED_TOKENS));

  step("7. axe on every story, in both themes", "e2e/a11y.spec.ts opens each story at iframe.html?id=...&globals=theme:<theme> and runs axe-core with the WCAG 2.0 to 2.2 A and AA rules; the a11y addon shows the same results in the Storybook panel");
  serve([]);
  const a11y = playwright("e2e/a11y.spec.ts");
  const axePasses = a11y.tests.map((t) => JSON.parse(t.annotations.find((a) => a.type === "axe")?.description ?? "{}").passes ?? 0);
  console.log(`   committed tokens: ${a11y.passed.length} of ${a11y.tests.length} story x theme runs with no violation (axe rules passed per run: ${Math.min(...axePasses)} to ${Math.max(...axePasses)})`);
  check("axe finds no violation in any story, light or dark", a11y.tests.length === stories.length * 2 && a11y.failed.length === 0);
  serve([V1]);
  const a11yBad = playwright("e2e/a11y.spec.ts");
  const axeOf = (t: PwTest) => {
    const note = t.annotations.find((a) => a.type === "axe")?.description;
    return note ? (JSON.parse(note) as { violations: { id: string; nodes: number; messages: string[] }[] }) : undefined;
  };
  for (const t of a11yBad.failed) {
    const axe = axeOf(t);
    // A run that failed before axe could report (a timeout opening the story) says why instead of hiding it.
    if (!axe) console.log(`   ${t.title.replace("a11y ", "").padEnd(42)} failed before axe ran: ${(t.error ?? "").replace(/\x1b\[[0-9;]*m/g, "").split("\n")[0]}`);
    for (const v of axe?.violations ?? []) console.log(`   ${t.title.replace("a11y ", "").padEnd(42)} ${v.id} x${v.nodes}: ${v.messages[0]}`);
  }
  const contrastOnly = a11yBad.failed.every((t) => axeOf(t)?.violations.every((v) => v.id === "color-contrast") ?? false);
  check(`with proposal v1 served, axe agrees: ${a11yBad.failed.length} light-theme runs fail on color-contrast only, dark runs all pass`, a11yBad.failed.length > 0 && contrastOnly && a11yBad.failed.every((t) => t.title.endsWith(" light")));

  step(
    "8. Visual regression catches a token change",
    "e2e/visual.spec.ts compares every story in both themes with the committed baselines in e2e/__screenshots__/ (toHaveScreenshot). Proposal v2 passes the contrast gate, but it still changes how the product looks, and that needs a human decision",
  );
  serve([]);
  const baselines = at("e2e/__screenshots__");
  if (!existsSync(baselines) || readdirSync(baselines).length < stories.length * 2) {
    const created = playwright("e2e/visual.spec.ts", {}, ["--update-snapshots"]);
    console.log(`   no baselines yet: created ${created.tests.length} in e2e/__screenshots__ from the committed tokens`);
  } else if (process.env.RECORD_BASELINES === "1") {
    // Baselines only hold for the machine that took them (fonts, Chromium build). On another one, such as a CI runner,
    // record them again from the committed tokens first, then run the same comparison.
    const created = playwright("e2e/visual.spec.ts", {}, ["--update-snapshots"]);
    console.log(`   RECORD_BASELINES=1: recorded ${created.tests.length} baselines on this machine from the committed tokens`);
  }
  const same = playwright("e2e/visual.spec.ts");
  console.log(`   committed tokens: ${same.passed.length} of ${same.tests.length} screenshots match the baselines`);
  check("the committed tokens render exactly like the baselines", same.failed.length === 0 && same.tests.length === stories.length * 2);
  serve([V2]);
  rmSync(at("test-results"), { recursive: true, force: true });
  const changed = playwright("e2e/visual.spec.ts");
  for (const t of changed.failed) console.log(`   changed: ${t.title.replace("visual ", "")}: ${(t.error ?? "").split("\n").find((l) => /pixels/.test(l))?.replace(/\x1b\[[0-9;]*m/g, "").trim() ?? ""}`);
  check(`proposal v2 (contrast OK) is caught: ${changed.failed.length} screenshots differ, all in the light theme, all with a primary button`, changed.failed.length > 0 && changed.failed.every((t) => t.title.endsWith(" light") && /primary|gallery/.test(t.title)));
  await diffImage();
  const loose = playwright("e2e/visual.spec.ts", { VISUAL_THRESHOLD: "0.2" });
  console.log(`   the same comparison at Playwright's default per-pixel threshold (0.2): ${loose.failed.length} of ${loose.tests.length} fail`);
  check("at the default threshold the darker brand blue slips through; the config uses 0", loose.failed.length === 0);

  step("9. Back to the committed tokens", "the proposal is not merged in this run; the served tokens are restored and every screenshot matches again. Accepting it would mean merging the token file and committing new baselines (--update-snapshots) in the same change");
  serve([]);
  const restored = playwright("e2e/visual.spec.ts");
  check("restored: every screenshot matches the baselines", restored.failed.length === 0);
  await screenshots();

  console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
}

// expected / actual / diff of the Gallery in the light theme, cropped to the form card, side by side.
async function diffImage() {
  const dir = readdirSync(at("test-results")).find((d) => d.includes("gallery--member-account-light"));
  if (!dir) throw new Error("no gallery diff in test-results");
  const files = readdirSync(at("test-results", dir));
  const pick = (kind: string) => at("test-results", dir, files.find((f) => f.endsWith(`-${kind}.png`))!);
  const uri = (f: string) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  const panel = (kind: string, label: string) =>
    `<figure><figcaption>${label}</figcaption><div class="crop"><img src="${uri(pick(kind))}"></div></figure>`;
  const html = `<!doctype html><html><head><style>
body{margin:0;padding:16px;background:#fff;font:600 15px system-ui,sans-serif;color:#181c22;display:flex;gap:16px}
figure{margin:0}figcaption{margin:0 0 8px}.crop{width:500px;height:450px;overflow:hidden;position:relative;outline:1px solid #c4cad3}
.crop img{position:absolute;left:-550px;top:-170px}
</style></head><body>${panel("expected", "Expected (baseline, blue-600)")}${panel("actual", "Actual (proposal v2, blue-700)")}${panel("diff", "Diff (changed pixels in red)")}</body></html>`;
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1580, height: 520 } });
  await page.setContent(html);
  await page.screenshot({ path: at("screenshots/visual-diff.png") });
  await browser.close();
  copyFileSync(pick("diff"), at("screenshots/visual-diff-gallery-full.png"));
  console.log("   wrote screenshots/visual-diff.png (expected / actual / diff) and screenshots/visual-diff-gallery-full.png");
}

async function screenshots() {
  const { spawn } = await import("node:child_process");
  const server = spawn(process.execPath, ["--import", "tsx", "src/serve.ts"], { cwd: ROOT, stdio: "ignore" });
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    for (let i = 0; i < 100; i++) {
      try {
        await fetch("http://localhost:53045/index.json");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
    for (const theme of ["light", "dark"]) {
      await page.goto(`http://localhost:53045/iframe.html?id=gallery--member-account&viewMode=story&globals=theme:${theme}`);
      await page.locator("#storybook-root main").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: at(`screenshots/gallery-${theme}.png`) });
    }
    for (const [file, out] of [
      ["out/contrast.html", "contrast-report.png"],
      ["out/contrast-softer-ui-v1.html", "contrast-caught.png"],
    ]) {
      await page.setViewportSize({ width: 1100, height: 420 });
      await page.goto(`file://${at(file)}`);
      await page.screenshot({ path: at("screenshots", out) });
    }
    console.log("   wrote screenshots/gallery-light.png, gallery-dark.png, contrast-report.png, contrast-caught.png");
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
