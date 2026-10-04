// Screenshots of the member page in English, French, the en-XA pseudo-locale and the naive page in French.
// Run by ../run.sh while the server answers on :53035.
import { withPage } from "../../tools/render.mjs";

const BASE = "http://localhost:53035";
const out = (name) => new URL(`./${name}.png`, import.meta.url).pathname;
const pages = [
  ["en", "/?lang=en&member=bob"],
  ["fr", "/?lang=fr&member=bob"],
  ["pseudo-en-XA", "/?lang=en-XA&member=bob"],
  ["naive-fr", "/naive?lang=fr&member=bob"],
];

await withPage(
  async (page) => {
    for (const [name, path] of pages) {
      await page.goto(BASE + path);
      await page.screenshot({ path: out(name), fullPage: true });
    }
  },
  { width: 820, height: 480 },
);
