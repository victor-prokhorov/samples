import { describe, expect, it } from "vitest";
import { annualTotalCents, formatEuros } from "./statement.js";

const contributions = [
  { month: "2025-12", employer: "Acme", amountCents: 40000 },
  { month: "2026-01", employer: "Acme", amountCents: 41250 },
  { month: "2026-02", employer: "Globex", amountCents: 38900 },
];

describe("annualTotalCents", () => {
  it("sums only the requested year", () => expect(annualTotalCents(contributions, 2026)).toBe(80150));
  it("is zero for a year without contributions", () => expect(annualTotalCents(contributions, 2024)).toBe(0));
});

describe("formatEuros", () => {
  it("formats in English", () => expect(formatEuros(80150)).toBe("€801.50"));
  it("formats in French", () => expect(formatEuros(80150, "fr-FR")).toBe("801,50 €"));
});
