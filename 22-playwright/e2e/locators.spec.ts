import { expect, test } from "./fixtures.js";

test.use({ storageState: { cookies: [], origins: [] } });

test("sign in with CSS selectors", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-form > div:nth-child(1) > input").fill("alice");
  await page.locator("#login-form > div:nth-child(2) > input").fill("alice-password");
  await page.locator("button.btn-primary").click();
  await expect(page.locator("main > h1")).toHaveText("Your contributions");
});

test("sign in with role and label locators", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password").fill("alice-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your contributions" })).toBeVisible();
});
