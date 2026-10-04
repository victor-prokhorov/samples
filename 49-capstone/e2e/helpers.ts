// Shared by the Playwright journeys (e2e/journeys.spec.ts) and the demo (src/demo.ts): sign in through the IdP's own
// page, the way a person does, and scan a page with axe.
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export const APP = "http://localhost:53059";
export const PASSWORDS: Record<string, string> = { ana: "ana-pw", ben: "ben-pw", erin: "erin-pw", sam: "sam-pw" };
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// From the portal's landing page, through the IdP, back to the user's home page.
export async function signIn(page: Page, user: string) {
  await page.goto(`${APP}/`);
  await page.locator("a.ds-button", { hasText: /Sign in|Se connecter/ }).click();
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(PASSWORDS[user]);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.origin === APP && u.pathname !== "/callback");
}

export async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.map((n) => n.target.join(" ")) }));
}
