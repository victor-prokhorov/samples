import { expect, test } from "./fixtures.js";

// The total arrives from /api/contributions/total, which the app delays by API_DELAY_MS.
test("total after a fixed 500 ms sleep", async ({ page }) => {
  await page.goto("/contributions");
  await page.waitForTimeout(500);
  expect(await page.getByRole("status").textContent()).toBe("Total: 1,350.00");
});

test("total with a web-first assertion", async ({ page }) => {
  await page.goto("/contributions");
  await expect(page.getByRole("status")).toHaveText("Total: 1,350.00");
});
