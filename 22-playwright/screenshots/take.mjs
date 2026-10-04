// Screenshots of the Playwright HTML reports (reports/html/<run>/index.html, opened from disk): the green run's summary, and the
// slow-API run's summary and failed test. Run by ../../run-22-playwright.sh after the demo. The reports themselves stay out of git:
// the failing runs' reports embed their traces, which record the session cookie.
import { pathToFileURL } from "node:url";
import { withPage } from "../../tools/render.mjs";

const out = (name) => new URL(`./${name}.png`, import.meta.url).pathname;
// The repository root, cut from the paths in the failure's stack so the screenshot does not show where the run happened.
const root = new URL("../../", import.meta.url).pathname;
const report = (run) => pathToFileURL(new URL(`../reports/html/${run}/index.html`, import.meta.url).pathname).href;

await withPage(
  async (page) => {
    await page.goto(report("journeys"));
    await page.getByText("journeys.spec.ts").first().waitFor();
    await page.screenshot({ path: out("report-journeys") });
    await page.goto(report("waiting-slow"));
    await page.getByText("waiting.spec.ts").first().waitFor();
    await page.screenshot({ path: out("report-waiting-slow") });
    await page.getByRole("link", { name: "total after a fixed 500 ms sleep" }).click();
    await page.getByText("Received").first().waitFor();
    await page.evaluate((root) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes(root)) n.nodeValue = n.nodeValue.replaceAll(root, "");
    }, root);
    await page.screenshot({ path: out("report-waiting-slow-failure") });
  },
  { width: 1100, height: 640 },
);
