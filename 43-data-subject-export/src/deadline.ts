// GDPR art. 12(3): answer "without undue delay and in any event within one month of receipt", extendable by
// two further months for complex or numerous requests (the member must be told within the first month).
// Months are counted as in Regulation (EEC, Euratom) No 1182/71 on periods, dates and time limits: the same day number
// one month later; if that month has no such day, its last day; a period ending on a Saturday or Sunday ends on the
// next working day. Public holidays are left out here: add the calendar of the country concerned.

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addMonths(received: string, months: number): string {
  const [y, m, d] = received.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))));
}

export function nextWorkingDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

export const dueOn = (received: string) => nextWorkingDay(addMonths(received, 1));
export const extendedDueOn = (received: string) => nextWorkingDay(addMonths(received, 3));
