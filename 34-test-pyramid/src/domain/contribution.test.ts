// Unit level: pure functions, no DOM, no network, no database. Every boundary is cheap to test here.
import { describe, expect, it } from "vitest";
import { effectiveFromError, isRealDate, monthlyPreview, parseRate, rateError, startOptions, validateChange } from "./contribution.js";

const TODAY = "2026-10-03";

describe("parseRate", () => {
  it.each([
    ["6", 6],
    ["6.5", 6.5],
    ["6,5", 6.5],
    [" 7 ", 7],
  ])("reads %j as %d", (text, rate) => expect(parseRate(text)).toBe(rate));

  it.each(["", "six", "6%", "-3", "1e1", "6.5.1"])("refuses %j", (text) => expect(parseRate(text)).toBeNull());
});

describe("rateError", () => {
  it.each(["2", "2.5", "10", "15"])("accepts %j", (text) => expect(rateError(text)).toBeUndefined());
  it("asks for a rate when empty", () => expect(rateError("  ")).toBe("Enter the new rate"));
  it("explains the format", () => expect(rateError("six")).toBe("Enter the rate as a number, like 6 or 6.5"));
  it.each(["1.5", "15.5", "0"])("refuses %j, outside 2 to 15", (text) => expect(rateError(text)).toBe("Enter a rate between 2% and 15%"));
  it.each(["6.25", "6.7"])("refuses %j, not a step of 0.5", (text) => expect(rateError(text)).toBe("Enter the rate in steps of 0.5, like 6 or 6.5"));
});

describe("effectiveFromError", () => {
  it("accepts next month and the sixth month ahead", () => {
    expect(effectiveFromError("2026-11-01", TODAY)).toBeUndefined();
    expect(effectiveFromError("2027-04-01", TODAY)).toBeUndefined();
  });
  it("refuses this month and the seventh month ahead", () => {
    expect(effectiveFromError("2026-10-01", TODAY)).toBe("A change starts next month at the earliest");
    expect(effectiveFromError("2027-05-01", TODAY)).toBe("A change starts within 6 months");
  });
  it("refuses a day other than the first", () => expect(effectiveFromError("2026-11-15", TODAY)).toBe("A change starts on the first day of a month"));
  it("refuses dates that do not exist", () => {
    expect(effectiveFromError("2026-02-30", TODAY)).toBe("Enter a real date");
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2027-02-29")).toBe(false);
  });
  it("asks for a date when empty", () => expect(effectiveFromError("", TODAY)).toBe("Choose when the change starts"));
  it("counts months across a year end", () => expect(effectiveFromError("2027-01-01", "2026-12-31")).toBeUndefined());
});

describe("validateChange", () => {
  it("returns the parsed change when valid", () => {
    expect(validateChange({ rate: "6,5", effectiveFrom: "2026-12-01" }, TODAY)).toEqual({ ok: true, value: { rate: 6.5, effectiveFrom: "2026-12-01" } });
  });
  it("reports every field at once", () => {
    expect(validateChange({ rate: "20", effectiveFrom: "2026-10-01" }, TODAY)).toEqual({
      ok: false,
      errors: { rate: "Enter a rate between 2% and 15%", effectiveFrom: "A change starts next month at the earliest" },
    });
  });
});

describe("monthlyPreview", () => {
  it("matches the member's rate up to the cap", () => expect(monthlyPreview(42000, 4)).toEqual({ member: 140, employer: 140, total: 280 }));
  it("caps the employer at 5% of salary", () => expect(monthlyPreview(42000, 8)).toEqual({ member: 280, employer: 175, total: 455 }));
  it("rounds to cents", () => expect(monthlyPreview(36500, 6.5)).toEqual({ member: 197.71, employer: 152.08, total: 349.79 }));
});

describe("startOptions", () => {
  it("lists the first of each of the next six months, across a year end", () => {
    expect(startOptions(TODAY)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01"]);
  });
});
