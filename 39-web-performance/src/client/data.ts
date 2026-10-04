// The member's contribution history, generated deterministically (no database needed): 25 years of monthly
// employer and member contributions, the management fee and the odd voluntary top-up, newest first. About 950 rows.
export interface Row {
  date: string; // YYYY-MM-DD
  label: string;
  employer: string;
  cents: number;
}

export function history(): Row[] {
  const rows: Row[] = [];
  let seed = 42;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let y = 2001; y <= 2026; y++)
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 9) break;
      const employer = y < 2008 ? "Initech" : y < 2014 ? "Globex" : "Acme";
      const salary = 2400 + (y - 2001) * 95;
      const day = `${y}-${String(m).padStart(2, "0")}-28`;
      rows.push({ date: day, label: "Employer contribution", employer, cents: Math.round(salary * 0.06 * 100) });
      rows.push({ date: day, label: "Member contribution", employer, cents: Math.round(salary * 0.04 * 100) });
      rows.push({ date: `${y}-${String(m).padStart(2, "0")}-01`, label: "Management fee", employer, cents: -Math.round(salary * 0.002 * 100) });
      if (rand() < 0.08) rows.push({ date: `${y}-${String(m).padStart(2, "0")}-15`, label: "Voluntary top-up", employer, cents: Math.round(50 + rand() * 450) * 100 });
    }
  return rows.reverse();
}

export const total = (rows: Row[]) => rows.reduce((s, r) => s + r.cents, 0);
