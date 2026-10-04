// Screenshots of a real sign-in in Chromium: the IdP's sign-in page, then the app's pages once signed in as alice.
// Run by ../../run-26-sso.sh while the IdP (:53036) and the app (:53037) run; it adds one session for alice, after the proofs.
import { withPage } from "../../tools/render.mjs";

const APP = "http://localhost:53037";
const out = (name) => new URL(`./${name}.png`, import.meta.url).pathname;

await withPage(
  async (page) => {
    await page.goto(`${APP}/me`);
    await page.waitForURL(/127\.0\.0\.1:53036\/interaction\//);
    await page.getByLabel("Username").fill("alice");
    await page.screenshot({ path: out("idp-sign-in") });
    await page.getByLabel("Password").fill("alice-pw");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${APP}/me`);
    await page.screenshot({ path: out("signed-in-me") });
    await page.goto(`${APP}/`);
    await page.screenshot({ path: out("signed-in-roles") });
  },
  { width: 720, height: 200 },
);
