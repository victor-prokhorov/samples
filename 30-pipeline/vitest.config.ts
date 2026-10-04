import { defineConfig } from "vitest/config";

// The coverage gate: `vitest run --coverage` (the unit job in all three pipelines) fails below these numbers.
// server.ts is the process entry point, exercised by the deploy smoke test rather than by unit tests.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server.ts"],
      // text-summary gives the "Lines : NN%" line GitLab reads; skipFull keeps the table short
      reporter: [["text", { skipFull: true }], "text-summary", "cobertura", "html"],
      reportsDirectory: "reports/coverage",
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
