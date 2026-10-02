import { expect, test } from "./fixtures.js";

test("sign in once as alice and save the session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password").fill("alice-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your contributions" })).toBeVisible();
  await page.context().storageState({ path: ".auth/alice.json" });
});
