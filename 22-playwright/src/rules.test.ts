import { describe, expect, it } from "vitest";
import { checkRequest } from "./rules.js";

const today = "2026-03-10";
const ok = { kind: "email", value: "alice@example.com", effectiveFrom: today };

describe("checkRequest", () => {
  it("accepts a valid request effective today", () => {
    expect(checkRequest(ok, { today, pending: [] })).toEqual([]);
  });
  it("refuses a date in the past", () => {
    expect(checkRequest({ ...ok, effectiveFrom: "2026-03-09" }, { today, pending: [] })).toEqual(["The date cannot be in the past"]);
  });
  it("refuses dates that do not exist", () => {
    for (const effectiveFrom of ["2026-13-01", "2026-02-30", "2026-04-31", "2026-00-10"])
      expect(checkRequest({ ...ok, effectiveFrom }, { today, pending: [] })).toEqual(["Enter a real date, like 2026-04-01"]);
    expect(checkRequest({ ...ok, effectiveFrom: "2028-02-29" }, { today: "2028-02-28", pending: [] })).toEqual([]);
  });
  it("accepts the 90th day and refuses the 91st", () => {
    expect(checkRequest({ ...ok, effectiveFrom: "2026-06-08" }, { today, pending: [] })).toEqual([]);
    expect(checkRequest({ ...ok, effectiveFrom: "2026-06-09" }, { today, pending: [] })).toEqual(["The date must be within 90 days"]);
  });
  it("refuses a second pending request of the same kind, not of another kind", () => {
    expect(checkRequest(ok, { today, pending: ["email"] })).toEqual(["You already have a pending email change"]);
    expect(checkRequest(ok, { today, pending: ["address"] })).toEqual([]);
  });
  it("checks the email format only for email changes", () => {
    expect(checkRequest({ ...ok, value: "not-an-email" }, { today, pending: [] })).toEqual(["Enter an email address like name@example.com"]);
    expect(checkRequest({ ...ok, kind: "address", value: "1 High Street" }, { today, pending: [] })).toEqual([]);
  });
  it("reports every problem at once", () => {
    expect(checkRequest({ kind: "bank", value: " ", effectiveFrom: "" }, { today, pending: [] })).toHaveLength(3);
  });
});
