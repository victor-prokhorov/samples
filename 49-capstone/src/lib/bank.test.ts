// Unit level (34-test-pyramid): the bank form's rules, no DOM, no database.
import { describe, expect, it } from "vitest";
import { formatIban, ibanMod97, maskIban, validateBank, withCheckDigits } from "./bank";

describe("IBAN check digits", () => {
  it.each(["FR76 3000 6000 0112 3456 7890 189", "DE89 3704 0044 0532 0130 00", "GB82 WEST 1234 5698 7654 32", "nl91abna0417164300"])("accepts %s", (iban) =>
    expect(ibanMod97(iban)).toBe(1),
  );
  it("refuses one changed digit", () => expect(ibanMod97("FR76 3000 6000 0112 3456 7890 188")).not.toBe(1));
  it("computes the check digits of seed data", () => expect(withCheckDigits("DE", "370400440532013000")).toBe("DE89370400440532013000"));
});

describe("validateBank", () => {
  const ok = { holder: "Ana Martin", iban: "FR76 3000 6000 0112 3456 7890 189" };
  it("accepts a valid request", () => expect(validateBank(ok)).toEqual({}));
  it("asks for both fields when empty", () => expect(validateBank({ holder: " ", iban: "" })).toEqual({ holder: "errors.holder.required", iban: "errors.iban.required" }));
  it("explains the format before the checksum", () => expect(validateBank({ ...ok, iban: "FR76 1234" }).iban).toBe("errors.iban.format"));
  it("catches a typo with the checksum", () => expect(validateBank({ ...ok, iban: "FR76 3000 6000 0112 3456 7890 188" }).iban).toBe("errors.iban.checksum"));
});

describe("display", () => {
  it("groups by four", () => expect(formatIban("fr7630006000011234567890189")).toBe("FR76 3000 6000 0112 3456 7890 189"));
  it("masks all but the country and the last four", () => expect(maskIban("FR7630006000011234567890189")).toBe("FR76 •••• 0189"));
});
