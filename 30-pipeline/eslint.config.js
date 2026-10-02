import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", ".gitlab-ci-local/", ".npm/", "reports/", ".deploy/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { eqeqeq: "error", "no-console": ["error", { allow: ["log", "error"] }] } },
);
