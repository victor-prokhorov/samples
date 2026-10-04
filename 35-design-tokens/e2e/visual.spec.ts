// Visual regression: every story in both themes against a committed baseline image. A token change shows up here as
// pixels, in every component that uses it, before anyone opens the app.
import { expect, test } from "@playwright/test";
import { openStory, stories, themes } from "./stories.js";

for (const story of stories)
  for (const theme of themes)
    test(`visual ${story.id} ${theme}`, async ({ page }) => {
      await openStory(page, story.id, theme);
      // The Gallery is a full page; the components are screenshotted as the element itself.
      const target = story.title === "Gallery" ? page : page.locator("#storybook-root");
      await expect(target).toHaveScreenshot(`${story.id}--${theme}.png`, story.title === "Gallery" ? { fullPage: true } : {});
    });
