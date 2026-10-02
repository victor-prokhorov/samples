import { type Contribution, annualTotalCents, formatEuros } from "./statement.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function statementPage(member: string, year: number, contributions: Contribution[]) {
  const rows = contributions
    .filter((c) => c.month.startsWith(`${year}-`))
    .map((c) => `<tr><td>${esc(c.month)}</td><td>${esc(c.employer)}</td><td>${formatEuros(c.amountCents)}</td></tr>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Annual statement ${year} - Member portal</title></head>
<body>
<main>
<h1>Annual statement ${year}</h1>
<p>Member: ${esc(member)}</p>
<table>
<caption>Contributions received in ${year}</caption>
<thead><tr><th scope="col">Month</th><th scope="col">Employer</th><th scope="col">Amount</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><th scope="row" colspan="2">Total</th><td>${formatEuros(annualTotalCents(contributions, year))}</td></tr></tfoot>
</table>
</main>
</body>
</html>`;
}
