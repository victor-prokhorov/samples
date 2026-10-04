// The stories to test, read from the static build's index (storybook-static/index.json), so a new story is tested
// without touching the specs.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

interface Entry {
  type: string;
  id: string;
  title: string;
  name: string;
}

export const stories = Object.values(
  (JSON.parse(readFileSync(new URL("../storybook-static/index.json", import.meta.url), "utf8")) as { entries: Record<string, Entry> }).entries,
).filter((e) => e.type === "story");

export const themes = ["light", "dark"] as const;

export async function openStory(page: Page, id: string, theme: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
  await page.evaluate(() => document.fonts.ready);
}
