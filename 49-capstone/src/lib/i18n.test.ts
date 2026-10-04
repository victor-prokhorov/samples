// Unit level: the catalogues agree (25-bilingual's check), and the same values read correctly in both languages.
import { describe, expect, it } from "vitest";
import { compareCatalogues } from "./catalogues";
import { CATALOGUES, translator } from "./i18n";
import { negotiate } from "./negotiate";

describe("catalogues", () => {
  it("French has every English key, with the same ICU arguments", () => expect(compareCatalogues(CATALOGUES.en, CATALOGUES.fr, "fr")).toEqual([]));
});

describe("formatting", () => {
  const en = translator("en");
  const fr = translator("fr");
  // Intl puts a narrow no-break space (U+202F) before the euro sign and between thousands in French.
  const plain = (s: string) => s.replace(/[  ]/g, " ");
  it("money", () => {
    expect(en.money(1234.5)).toBe("€1,234.50");
    expect(plain(fr.money(1234.5))).toBe("1 234,50 €");
  });
  it("months", () => {
    expect(en.month(new Date("2026-09-01"))).toBe("September 2026");
    expect(fr.month(new Date("2026-09-01"))).toBe("septembre 2026");
  });
  it("plurals, including French singular zero", () => {
    expect(en.t("approvals.meta", { count: 0 })).toBe("Nothing is waiting");
    expect(en.t("approvals.meta", { count: 2 })).toBe("2 changes are waiting");
    expect(fr.t("kpi.form_errors.detail", { n: 0, d: 18 })).toBe("0 envoi refusé sur 18");
    expect(fr.t("kpi.form_errors.detail", { n: 5, d: 18 })).toBe("5 envois refusés sur 18");
  });
  it("select on the role", () => expect(fr.t("role", { role: "employer_admin" })).toBe("Administration employeur"));
});

describe("Accept-Language", () => {
  it.each([
    ["fr-FR,fr;q=0.9,en;q=0.8", "fr"],
    ["de-DE,de;q=0.9", "en"],
    ["en-GB;q=0.5, fr-CA", "fr"],
    ["fr;q=0, *", "en"],
  ])("%s -> %s", (header, want) => expect(negotiate(header, ["en", "fr"], "en")).toBe(want));
});
