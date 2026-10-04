// End-to-end level: ONE smoke test of the whole journey in a real browser, through the real API, into Postgres.
// The rules and the error cases are tested lower down, where they are cheaper and do not flake.
import { expect, test } from "@playwright/test";
import { resetChanges } from "./db.js";

test.beforeEach(resetChanges);

test("a member requests a new contribution rate and sees it pending after a reload", async ({ page }) => {
  await page.goto("/?member=M0001");
  await expect(page.getByRole("heading", { name: "Change my contribution" })).toBeVisible();
  await page.getByRole("textbox", { name: "New rate (% of salary)" }).fill("7");
  await expect(page.getByRole("region", { name: "Each month" })).toContainText("€245.00");
  await page.getByRole("combobox", { name: "Starts on" }).selectOption({ index: 2 });
  await page.getByRole("button", { name: "Request the change" }).click();
  await expect(page.getByRole("status")).toContainText(/Your change to 7% from 1 \w+ \d{4} is pending/);
  if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT }); // the run script keeps one picture of the journey
  await page.reload();
  await expect(page.getByText(/A change to 7% from 1 \w+ \d{4} is pending\./)).toBeVisible();
});
