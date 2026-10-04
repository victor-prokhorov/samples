import "@fontsource-variable/inter";
import "../src/components/components.css";
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  // A toolbar switch; the URL form is iframe.html?id=...&globals=theme:dark, which the tests use.
  globalTypes: {
    theme: {
      description: "Colour theme",
      toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.theme = context.globals.theme as string;
      document.documentElement.lang = "en";
      return <Story />;
    },
  ],
  parameters: {
    layout: "padded",
    // The page background comes from the tokens (--color-bg-canvas), not from Storybook's backgrounds tool.
    backgrounds: { disable: true },
    a11y: { test: "error", options: { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } },
  },
};

export default preview;
