// The people and member records every part of the sample shares: setup seeds them, the matrix, the
// HTTP probes and the database test all use the same ones, so code and database judge the same facts.
import type { Role, User } from "./policy.js";

export const MEMBERS = [
  { id: "m-ana", orgId: "acme", userId: "ana", name: "Ana Acme" },
  { id: "m-ben", orgId: "acme", userId: "ben", name: "Ben Acme" },
  { id: "m-gil", orgId: "globex", userId: "gil", name: "Gil Globex" },
  { id: "m-ivo", orgId: "initech", userId: "ivo", name: "Ivo Initech" },
];

export const USERS: Record<string, User> = {
  ana: { id: "ana", role: "member", orgId: "acme", memberId: "m-ana" },
  ben: { id: "ben", role: "member", orgId: "acme", memberId: "m-ben" },
  gil: { id: "gil", role: "member", orgId: "globex", memberId: "m-gil" },
  ivo: { id: "ivo", role: "member", orgId: "initech", memberId: "m-ivo" },
  erin: { id: "erin", role: "employer_admin", orgId: "acme", memberId: null },
  sam: { id: "sam", role: "staff", orgId: null, memberId: null },
  sky: { id: "sky", role: "staff", orgId: null, memberId: null },
  aud: { id: "aud", role: "auditor", orgId: null, memberId: null },
};

// The user who stands for each role in the matrix.
export const SUBJECT: Record<Role, User> = { member: USERS.ana, employer_admin: USERS.erin, staff: USERS.sam, auditor: USERS.aud };

export const member = (id: string) => MEMBERS.find((m) => m.id === id)!;
