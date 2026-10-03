import { defineConfig } from "vitest/config";

// Cases run in order: the 409 and the get-by-id depend on the change request the 201 case created.
export default defineConfig({ test: { include: ["contract/**/*.test.ts"], sequence: { concurrent: false } } });
