// In-memory data for the provider: nine members of Acme, Globex and Initech, twelve months of contributions each.
export interface Member {
  id: string;
  employerId: "acme" | "globex" | "initech";
  firstName: string;
  lastName: string;
  email: string;
  status: "active" | "deferred" | "retired";
  joinedOn: string;
  phone?: string;
  taxId: string; // stored, never part of the contract
}

export interface Contribution {
  memberId: string;
  period: string;
  memberAmount: number;
  employerAmount: number;
}

export interface ChangeRequest {
  id: string;
  memberId: string;
  kind: "email" | "address";
  value: string;
  effectiveDate: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
}

const people: [string, Member["employerId"], string, string, Member["status"], string, string?][] = [
  ["M0001", "acme", "Alice", "Martin", "active", "2014-03-01", "+33 6 12 34 56 78"],
  ["M0002", "acme", "Bruno", "Petit", "active", "2019-09-16"],
  ["M0003", "acme", "Chloe", "Durand", "deferred", "2008-01-07"],
  ["M0004", "globex", "David", "Leroy", "active", "2021-05-03", "+44 7700 900123"],
  ["M0005", "globex", "Emma", "Moreau", "retired", "1991-11-12"],
  ["M0006", "globex", "Farid", "Simon", "active", "2023-02-20"],
  ["M0007", "initech", "Grace", "Laurent", "active", "2017-06-01"],
  ["M0008", "initech", "Hugo", "Michel", "active", "2012-10-15"],
  ["M0009", "initech", "Ines", "Garcia", "deferred", "2005-04-04"],
];

export function seed() {
  const members = new Map<string, Member>();
  const contributions: Contribution[] = [];
  people.forEach(([id, employerId, firstName, lastName, status, joinedOn, phone], i) => {
    members.set(id, { id, employerId, firstName, lastName, status, joinedOn, email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.org`, ...(phone ? { phone } : {}), taxId: `TX-${(1000 + i * 37).toString()}` });
    if (status !== "active") return;
    const salary = 30000 + i * 4250;
    for (let m = 0; m < 12; m++) {
      const d = new Date(Date.UTC(2025, 9 + m, 1));
      const period = d.toISOString().slice(0, 7);
      contributions.push({ memberId: id, period, memberAmount: Math.round((salary * 0.05) / 12) + 0.5, employerAmount: Math.round((salary * 0.08) / 12) + 0.25 });
    }
  });
  contributions.sort((a, b) => b.period.localeCompare(a.period));
  return { members, contributions, changeRequests: new Map<string, ChangeRequest>() };
}

export type Store = ReturnType<typeof seed>;
