// Not part of the suite: the demo runs each test here on its own, repeated, with LATENCY_MS=0,1000 so the
// server answers at once, then after 1000 ms, then at once... as on a quiet machine and on a busy CI runner.
import { expect, test } from "@playwright/test";
import { resetChanges } from "./db.js";

test.beforeEach(resetChanges);

async function submit(page: import("@playwright/test").Page) {
  await page.goto("/?member=M0002");
  await page.getByRole("textbox", { name: "New rate (% of salary)" }).fill("6");
  await page.getByRole("combobox", { name: "Starts on" }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Request the change" }).click();
}

test("flaky: sleeps 500 ms, then reads the status once", async ({ page }) => {
  await submit(page);
  await page.waitForTimeout(500); // "long enough" on the machine it was written on
  expect(await page.getByRole("status").textContent()).toContain("is pending"); // one read, no retry
});

test("robust: a web-first assertion waits for the status", async ({ page }) => {
  await submit(page);
  await expect(page.getByRole("status")).toContainText("is pending"); // retries until it passes or 5 s go by
});
