// Screenshots of the member pages in Chromium, signed in as alice. Run by ../../run-20-portal.sh while `next start` serves :53030,
// after the demo (so alice's request 1 exists). Nothing is written: the address form is submitted invalid on purpose.
import { withPage } from "../../tools/render.mjs";

const BASE = "http://localhost:53030";
const out = (name) => new URL(`./${name}.png`, import.meta.url).pathname;

await withPage(
  async (page) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Username").fill("alice");
    await page.screenshot({ path: out("login") });
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${BASE}/profile`);
    await page.screenshot({ path: out("profile") });
    await page.goto(`${BASE}/contributions`);
    await page.screenshot({ path: out("contributions"), fullPage: true });
    await page.goto(`${BASE}/address`);
    await page.getByLabel("Town or city").fill("Springfield");
    await page.getByLabel("Postcode").fill("nope");
    await page.getByLabel("Applies from").fill("2020-01-01");
    await page.getByRole("button", { name: "Request the change" }).click();
    await page.getByText("Error: Enter a real postcode").waitFor();
    await page.screenshot({ path: out("address-errors"), fullPage: true });
    await page.goto(`${BASE}/requests/1`);
    await page.screenshot({ path: out("request") });
  },
  { width: 900, height: 560 },
);
