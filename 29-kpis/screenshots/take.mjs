// Screenshots of out/dashboard.html, the static dashboard the demo wrote: the KPI tiles first, then the whole page.
// Run by ../../run-29-kpis.sh after the demo.
import { pathToFileURL } from "node:url";
import { withPage } from "../../tools/render.mjs";

const out = (name) => new URL(`./${name}.png`, import.meta.url).pathname;
const dashboard = pathToFileURL(new URL("../out/dashboard.html", import.meta.url).pathname).href;

await withPage(
  async (page) => {
    await page.goto(dashboard);
    await page.screenshot({ path: out("dashboard-top") });
    await page.screenshot({ path: out("dashboard"), fullPage: true });
  },
  { width: 1200, height: 900 },
);
