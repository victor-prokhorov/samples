import { defineConfig } from "vitest/config";

// One project per level of the pyramid, so each can run (and be timed) on its own. The coverage gate covers
// every Vitest level together; the thresholds fail the run when coverage drops.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/domain/**/*.test.ts"], environment: "node" } },
      { extends: true, test: { name: "component", include: ["src/web/**/*.test.tsx"], environment: "jsdom", setupFiles: ["src/web/setup.ts"] } },
      { extends: true, test: { name: "api", include: ["src/api/**/*.int.test.ts"], environment: "node", testTimeout: 15_000, hookTimeout: 30_000 } },
    ],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/web/**", "src/api/app.ts"],
      exclude: ["**/*.test.*", "src/web/setup.ts", "src/web/mocks.ts", "src/web/main.tsx"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "out/coverage",
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 87 },
    },
  },
});
