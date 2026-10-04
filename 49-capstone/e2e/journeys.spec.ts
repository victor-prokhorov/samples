// The three journeys as end-to-end tests (22-playwright, the top of 34-test-pyramid): user-facing locators, web-first
// assertions, axe on every page. They run in order on a freshly seeded database: journey 3 approves journey 1's change.
import { expect, test } from "@playwright/test";
import { axe, signIn } from "./helpers";

test("1. a member signs in, sees contributions, fixes a bank form error, sends the change, switches to French", async ({ page }) => {
  await signIn(page, "ana");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello Ana");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(7);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bank details" }).click();
  await page.getByLabel("IBAN").fill("FR76 3000 6000 0112 3456 7890 188");
  await page.getByRole("button", { name: "Request the change" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "There is a problem" });
  await expect(summary.getByRole("link")).toHaveText(["Enter the account holder’s name", "Check the IBAN: its check digits do not match"]);
  await expect(page.getByLabel("Account holder")).toHaveAttribute("aria-invalid", "true");
  expect(await axe(page)).toEqual([]);

  await page.getByLabel("Account holder").fill("Ana Martin");
  await page.getByLabel("IBAN").fill("FR76 3000 6000 0112 3456 7890 189");
  await page.getByRole("button", { name: "Request the change" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Request sent" })).toBeVisible();

  await page.getByRole("link", { name: "Français" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Ana");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("status").filter({ hasText: "Demande envoyée" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("2. an employer admin sees her organisation's members, and only those", async ({ page }) => {
  await signIn(page, "erin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acme members");
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(12);
  await expect(page.getByRole("table")).not.toContainText("Gil Novak");
  expect(await axe(page)).toEqual([]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/employer$/);
});

test("3. staff approve the member's change, not their own, and read the KPI tiles", async ({ page }) => {
  await signIn(page, "sam");
  const anaRow = page.getByRole("row").filter({ hasText: "Ana Martin" });
  const ownRow = page.getByRole("row").filter({ hasText: "Gil Novak" });
  await expect(ownRow).toContainText("another member of staff approves it");
  await expect(ownRow.getByRole("button")).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
  await anaRow.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByRole("status")).toContainText("Ana Martin’s new bank details now apply.");
  await expect(page.getByRole("row").filter({ hasText: "Ana Martin" })).toHaveCount(0);

  await page.getByRole("link", { name: "KPIs" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Adoption", "Bank change task success", "Form error rate", "Approved within 3 days"]);
  await expect(page.locator(".tile__status")).toHaveCount(4);
  expect(await axe(page)).toEqual([]);
});
