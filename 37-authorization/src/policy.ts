// The one authorization policy: can(user, action, resource).
// RBAC gives each role a list of actions; ABAC conditions on the user and the resource narrow each one
// (own record, same organisation, requested by me, pending). Anything not listed is denied.

export type Role = "member" | "employer_admin" | "staff" | "auditor";
export const ROLES: Role[] = ["member", "employer_admin", "staff", "auditor"];

export type User = {
  id: string;
  role: string; // a string, not Role: an unknown role from an identity provider must be denied, not crash
  orgId: string | null; // the employer the user belongs to; staff and auditors belong to none
  memberId: string | null; // the user's own member record, if they are a member
};

export const ACTIONS = [
  "member:read",
  "member:update",
  "contribution:read",
  "contribution:create",
  "change_request:create",
  "change_request:read",
  "change_request:approve",
  "audit_log:read",
] as const;
export type Action = (typeof ACTIONS)[number];

// Everything the policy may look at about a resource. Every resource here hangs off a member record.
export type Resource = {
  type: "member" | "contribution" | "change_request" | "audit_log";
  memberId: string;
  orgId: string;
  requestedBy?: string; // change requests: who asked for the change
  status?: "pending" | "approved";
};

type Condition = { name: string; test: (u: User, r: Resource) => boolean };
const cond = (name: string, test: Condition["test"]): Condition => ({ name, test });

const own = cond("own record", (u, r) => u.memberId !== null && r.memberId === u.memberId);
const sameOrg = cond("same organisation", (u, r) => u.orgId !== null && r.orgId === u.orgId);
const any = cond("any organisation", () => true);
const requestedByMe = cond("requested by me", (u, r) => r.requestedBy === u.id);
const pending = cond("pending", (_, r) => r.status === "pending");
const not = (c: Condition) => cond(`not ${c.name}`, (u, r) => !c.test(u, r));
const all = (...cs: Condition[]) => cond(cs.map((c) => c.name).join(" and "), (u, r) => cs.every((c) => c.test(u, r)));

// Four eyes: a change is approved by staff, and never by the person who asked for it.
const fourEyes = all(pending, not(requestedByMe));

export const RULES: Record<Role, Partial<Record<Action, Condition>>> = {
  member: {
    "member:read": own,
    "member:update": own,
    "contribution:read": own,
    "change_request:create": all(own, requestedByMe),
    "change_request:read": own,
  },
  employer_admin: {
    "member:read": sameOrg,
    "contribution:read": sameOrg,
    "contribution:create": sameOrg,
    "change_request:create": all(sameOrg, requestedByMe),
    "change_request:read": sameOrg,
  },
  staff: {
    "member:read": any,
    "contribution:read": any,
    "change_request:create": all(any, requestedByMe),
    "change_request:read": any,
    "change_request:approve": all(any, fourEyes),
  },
  auditor: {
    "member:read": any,
    "contribution:read": any,
    "change_request:read": any,
    "audit_log:read": any,
  },
};

const isRole = (r: string): r is Role => (ROLES as string[]).includes(r);

export function rule(role: string, action: string): Condition | undefined {
  if (!isRole(role) || !Object.hasOwn(RULES[role], action)) return undefined;
  return RULES[role][action as Action];
}

export function can(user: User | null | undefined, action: string, resource: Resource): boolean {
  if (!user) return false;
  if (!action.startsWith(`${resource.type}:`)) return false; // an action on the wrong kind of resource
  const c = rule(user.role, action);
  return c ? c.test(user, resource) : false; // deny by default: no rule, no access
}

// The matrix's columns: how the resource relates to the user.
export type Relationship = "own record" | "same organisation" | "other organisation";
export const RELATIONSHIPS: Relationship[] = ["own record", "same organisation", "other organisation"];
export function relationship(u: User, r: Resource): Relationship {
  if (u.memberId !== null && r.memberId === u.memberId) return "own record";
  if (u.orgId !== null && r.orgId === u.orgId) return "same organisation";
  return "other organisation";
}
