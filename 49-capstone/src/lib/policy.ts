// The authorization policy of 37-authorization, cut down to the actions this portal has: can(user, action, resource).
// RBAC gives each role a list of actions; ABAC conditions on the user and the resource narrow each one.
// Anything not listed is denied. src/schema.sql states the same rules again as row-level security.

export type Role = "member" | "employer_admin" | "staff";
export const ROLES: Role[] = ["member", "employer_admin", "staff"];

export type User = {
  id: string; // the IdP subject
  role: string; // a string, not Role: an unknown role from the identity provider must be denied, not crash
  orgId: string | null;
  memberId: string | null;
};

export const ACTIONS = ["member:read", "contribution:read", "change_request:create", "change_request:read", "change_request:approve", "kpi:read"] as const;
export type Action = (typeof ACTIONS)[number];

export type Resource = {
  type: "member" | "contribution" | "change_request" | "kpi";
  memberId?: string;
  orgId?: string;
  requestedBy?: string;
  status?: "pending" | "approved";
};

type Condition = { name: string; test: (u: User, r: Resource) => boolean };
const cond = (name: string, test: Condition["test"]): Condition => ({ name, test });

const own = cond("own record", (u, r) => u.memberId !== null && r.memberId === u.memberId);
const sameOrg = cond("same organisation", (u, r) => u.orgId !== null && r.orgId === u.orgId);
const any = cond("any", () => true);
const requestedByMe = cond("requested by me", (u, r) => r.requestedBy === u.id);
const pending = cond("pending", (_, r) => r.status === "pending");
const not = (c: Condition) => cond(`not ${c.name}`, (u, r) => !c.test(u, r));
const all = (...cs: Condition[]) => cond(cs.map((c) => c.name).join(" and "), (u, r) => cs.every((c) => c.test(u, r)));

export const RULES: Record<Role, Partial<Record<Action, Condition>>> = {
  member: {
    "member:read": own,
    "contribution:read": own,
    "change_request:create": all(own, requestedByMe),
    "change_request:read": own,
  },
  employer_admin: {
    "member:read": sameOrg,
    "contribution:read": sameOrg,
  },
  staff: {
    "member:read": any,
    "change_request:read": any,
    // Four eyes: a change is approved by staff, and never by the person who asked for it.
    "change_request:approve": all(pending, not(requestedByMe)),
    "kpi:read": any,
  },
};

const isRole = (r: string): r is Role => (ROLES as string[]).includes(r);

export function can(user: User | null | undefined, action: string, resource: Resource): boolean {
  if (!user || !isRole(user.role)) return false;
  if (!action.startsWith(`${resource.type}:`)) return false;
  if (!Object.hasOwn(RULES[user.role], action)) return false; // deny by default
  return RULES[user.role][action as Action]!.test(user, resource);
}

// Where each role lands after signing in.
export const HOME: Record<Role, string> = { member: "/dashboard", employer_admin: "/employer", staff: "/staff/approvals" };
export const home = (u: User) => (isRole(u.role) ? HOME[u.role] : "/");
