// axe-core on every story in both themes: the rendered check, after the token check. It sees what the token check
// cannot (a missing label, a wrong role) and confirms the colours the browser actually painted.
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openStory, stories, themes } from "./stories.js";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const story of stories)
  for (const theme of themes)
    test(`a11y ${story.id} ${theme}`, async ({ page }, info) => {
      await openStory(page, story.id, theme);
      const { violations, passes } = await new AxeBuilder({ page }).include("#storybook-root").withTags(TAGS).analyze();
      const found = violations.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.map((n) => n.any[0]?.message ?? n.failureSummary).join(" | ")}`);
      info.annotations.push({ type: "axe", description: JSON.stringify({ passes: passes.length, violations: violations.map((v) => ({ id: v.id, nodes: v.nodes.length, messages: v.nodes.map((n) => n.any[0]?.message ?? "") })) }) });
      expect(found, `axe violations in ${story.id} (${theme})`).toEqual([]);
    });
