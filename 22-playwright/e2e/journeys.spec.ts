import { expect, test } from "./fixtures.js";

test("view contributions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your contributions" })).toBeVisible();
  await expect(page.getByText("Alice Martin, employed by Acme")).toBeVisible();
  const table = page.getByRole("table", { name: "Monthly contributions" });
  await expect(table.getByRole("row")).toHaveCount(7);
  await expect(table.getByRole("row", { name: "Jan 2026 225.00" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Total: 1,350.00");
});

test("request an email change and see it pending", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Request a change" }).click();
  await page.getByLabel("What do you want to change?").selectOption({ label: "Email address" });
  await page.getByLabel("New value").fill("alice@example.com");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("heading", { name: "Your requests" })).toBeVisible();
  const rows = page.getByRole("table", { name: "Change requests" }).getByRole("row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("alice@example.com");
  await expect(rows.nth(1).getByRole("cell").last()).toHaveText("Pending");
});

test("request an address change and see it pending", async ({ page }) => {
  await page.goto("/requests/new");
  await page.getByLabel("What do you want to change?").selectOption({ label: "Postal address" });
  await page.getByLabel("New value").fill("1 High Street, Springfield");
  await page.getByRole("button", { name: "Submit request" }).click();
  const rows = page.getByRole("table", { name: "Change requests" }).getByRole("row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).getByRole("cell").last()).toHaveText("Pending");
});

test("a second pending change of the same kind is refused", async ({ page }) => {
  for (const attempt of [1, 2]) {
    await page.goto("/requests/new");
    await page.getByLabel("What do you want to change?").selectOption({ label: "Email address" });
    await page.getByLabel("New value").fill(`alice+${attempt}@example.com`);
    await page.getByRole("button", { name: "Submit request" }).click();
  }
  await expect(page.getByRole("alert")).toContainText("You already have a pending email change");
  await page.getByRole("link", { name: "Your requests" }).click();
  await expect(page.getByRole("table", { name: "Change requests" }).getByRole("row")).toHaveCount(2);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a signed-out visitor is sent to the sign-in page", async ({ page }) => {
    await page.goto("/contributions");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
