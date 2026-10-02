export type Contribution = { month: string; employer: string; amountCents: number };

export function annualTotalCents(contributions: Contribution[], year: number) {
  return contributions.filter((c) => c.month.startsWith(`${year}-`)).reduce((sum, c) => sum + c.amountCents, 0);
}

export function formatEuros(cents: number, locale = "en-GB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}
