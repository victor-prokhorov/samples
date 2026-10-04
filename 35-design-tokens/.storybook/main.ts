import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/stories/*.stories.tsx"],
  // The a11y addon runs axe-core on the open story and lists violations in a panel (interactive use, npm run storybook).
  // The demo runs the same axe rules on every story headless, in e2e/a11y.spec.ts.
  addons: ["@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  // out/tokens.css is served as a plain file, not bundled: swapping it changes every story without a rebuild.
  staticDirs: [{ from: "../out", to: "/tokens" }],
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
};

export default config;
