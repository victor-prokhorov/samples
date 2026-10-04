import { describe, expect, it } from "vitest";
import { statementPage } from "./page.js";

const contributions = [
  { month: "2025-12", employer: "Acme", amountCents: 40000 },
  { month: "2026-01", employer: "Acme & Sons", amountCents: 41250 },
];

describe("statementPage", () => {
  const html = statementPage('<b>"alice"</b>', 2026, contributions);
  it("declares its language", () => expect(html).toContain('<html lang="en">'));
  it("lists only the requested year", () => {
    expect(html).toContain("<td>2026-01</td>");
    expect(html).not.toContain("2025-12");
  });
  it("escapes member and employer names", () => {
    expect(html).toContain("&lt;b&gt;&quot;alice&quot;&lt;/b&gt;");
    expect(html).toContain("Acme &amp; Sons");
  });
  it("shows the year's total", () => expect(html).toContain("<td>€412.50</td></tr></tfoot>"));
});
