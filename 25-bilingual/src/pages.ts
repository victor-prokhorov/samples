import { NAMES, SUPPORTED, Translator } from "./i18n.js";

export type Member = { name: string; role: "member" | "employer" | "staff"; pending: number; lastLogin: Date; rate: number; contributions: { date: Date; employer: string; amount: number }[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = "body{font-family:system-ui;margin:2rem;max-width:48rem}button{padding:.5rem 1rem}td,th{padding:.25rem 1rem;text-align:left}";

// Every visible string comes from the catalogue or from Intl; data that must not be translated says so with translate="no".
export function page(tr: Translator, m: Member, id: string) {
  const { t } = tr;
  const total = m.contributions.reduce((s, c) => s + c.amount, 0);
  const others = SUPPORTED.filter((l) => l !== tr.locale);
  return `<!doctype html>
<html lang="${tr.locale}">
<head><meta charset="utf-8"><title>${esc(t("page.title"))}</title><style>${CSS}</style></head>
<body>
<header>
  <p>${esc(t("greeting", { name: m.name }))}, ${esc(t("role", { role: m.role }))}</p>
  <nav aria-label="${esc(t("language.label"))}">${others.map((l) => `<a href="/?member=${id}&amp;lang=${l}" hreflang="${l}" lang="${l}">${NAMES[l]}</a>`).join(" ")}</nav>
</header>
<main>
  <h1>${esc(t("page.title"))}</h1>
  <p>${esc(t("lastLogin", { date: m.lastLogin }))}</p>
  <p id="pending">${esc(t("pending", { count: m.pending }))}</p>
  <h2>${esc(t("contributions.title"))}</h2>
  <table>
    <thead><tr><th>${esc(t("table.date"))}</th><th>${esc(t("table.employer"))}</th><th>${esc(t("table.amount"))}</th></tr></thead>
    <tbody>
${m.contributions.map((c) => `      <tr><td>${esc(tr.date(c.date))}</td><td translate="no">${esc(c.employer)}</td><td>${esc(tr.money(c.amount))}</td></tr>`).join("\n")}
    </tbody>
  </table>
  <p id="total">${esc(t("contributions.total", { amount: total }))}</p>
  <p id="rate">${esc(t("contributions.rate", { rate: m.rate }))}</p>
  <button type="button" style="max-width:40ch" data-maxch="40">${esc(t("action.request"))}</button>
</main>
<footer><a href="/logout">${esc(t("action.logout"))}</a></footer>
</body>
</html>
`;
}

// The same page as first written: English assumed in strings, formats and layout.
export function naivePage(tr: Translator, m: Member) {
  const { t } = tr;
  const total = m.contributions.reduce((s, c) => s + c.amount, 0);
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${esc(t("page.title"))}</title><style>${CSS}</style></head>
<body>
<header><p>${esc(t("greeting", { name: m.name }))}</p></header>
<main>
  <h1>${esc(t("page.title"))}</h1>
  <p id="pending">You have ${m.pending} pending request(s)</p>
  <table>
    <thead><tr><th>Date</th><th>Employer</th><th>Amount</th></tr></thead>
    <tbody>
${m.contributions.map((c) => `      <tr><td>${c.date.toDateString()}</td><td translate="no">${esc(c.employer)}</td><td>€${c.amount.toFixed(2)}</td></tr>`).join("\n")}
    </tbody>
  </table>
  <p id="total">Total: €${total.toFixed(2)}</p>
  <button type="button" style="width:18ch;overflow:hidden;white-space:nowrap" data-maxch="18">${esc(t("action.request"))}</button>
</main>
<footer><a href="/logout">Sign out</a></footer>
</body>
</html>
`;
}
