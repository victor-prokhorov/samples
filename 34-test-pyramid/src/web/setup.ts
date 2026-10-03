// Component level setup: jest-dom matchers, MSW answering fetch, a clean DOM after each test.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" })); // a request nobody mocked fails the test
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
