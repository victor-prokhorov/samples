// The domain's own language. Nothing here knows a CRM exists: no GUIDs, no option-set codes, no PascalCase.
export type MemberStatus = "active" | "deferred" | "retired";
export type Sector = "manufacturing" | "services" | "retail";

export interface Employer {
  ref: string; // ACME, GLOBEX, INITECH
  name: string;
  sector: Sector;
}

export interface Member {
  memberNo: string; // M0001
  givenName: string;
  familyName: string;
  email: string;
  birthDate: string; // YYYY-MM-DD
  status: MemberStatus;
  employerRef: string;
}

export type Valid<T> = { ok: true; value: T } | { ok: false; reasons: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The invariants a member must satisfy, whoever supplies it. The translator calls this; so would a form.
export function validMember(m: Member, today: string): Valid<Member> {
  const reasons: string[] = [];
  if (!/^M\d{4}$/.test(m.memberNo)) reasons.push(`member number '${m.memberNo}' is not M + 4 digits`);
  if (!m.givenName.trim() || !m.familyName.trim()) reasons.push("name is missing");
  if (!EMAIL.test(m.email)) reasons.push(`email '${m.email}' is not an address`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.birthDate) || m.birthDate >= today) reasons.push(`birth date '${m.birthDate}' is not a past date`);
  if (!m.employerRef) reasons.push("no employer");
  return reasons.length ? { ok: false, reasons } : { ok: true, value: { ...m, email: m.email.toLowerCase() } };
}

export function validEmployer(e: Employer): Valid<Employer> {
  const reasons: string[] = [];
  if (!/^[A-Z]+$/.test(e.ref)) reasons.push(`employer ref '${e.ref}' is not upper-case letters`);
  if (!e.name.trim()) reasons.push("employer name is missing");
  return reasons.length ? { ok: false, reasons } : { ok: true, value: e };
}

// One canonical line per member: what reconciliation hashes on both sides.
export const canonical = (m: Member) => [m.memberNo, m.givenName, m.familyName, m.email, m.birthDate, m.status, m.employerRef].join("|");
