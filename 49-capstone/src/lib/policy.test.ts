// Unit level: the policy the approvals page asks before it shows a button (the database asks the same in RLS).
import { describe, expect, it } from "vitest";
import { type User, can } from "./policy";

const ana: User = { id: "ana", role: "member", orgId: "acme", memberId: "M0001" };
const erin: User = { id: "erin", role: "employer_admin", orgId: "acme", memberId: null };
const sam: User = { id: "sam", role: "staff", orgId: null, memberId: null };
const change = (requestedBy: string, status: "pending" | "approved" = "pending") => ({ type: "change_request" as const, memberId: "M0013", orgId: "globex", requestedBy, status });

describe("can()", () => {
  it("a member reads their own contributions only", () => {
    expect(can(ana, "contribution:read", { type: "contribution", memberId: "M0001", orgId: "acme" })).toBe(true);
    expect(can(ana, "contribution:read", { type: "contribution", memberId: "M0002", orgId: "acme" })).toBe(false);
  });
  it("an employer admin reads their organisation's members, not another's", () => {
    expect(can(erin, "member:read", { type: "member", memberId: "M0002", orgId: "acme" })).toBe(true);
    expect(can(erin, "member:read", { type: "member", memberId: "M0013", orgId: "globex" })).toBe(false);
  });
  it("staff approve a pending change someone else asked for", () => expect(can(sam, "change_request:approve", change("gil"))).toBe(true));
  it("four eyes: staff never approve their own request", () => expect(can(sam, "change_request:approve", change("sam"))).toBe(false));
  it("an approved change is not approved again", () => expect(can(sam, "change_request:approve", change("gil", "approved"))).toBe(false));
  it("deny by default: unknown role, missing user, inherited property names", () => {
    expect(can({ ...sam, role: "contractor" }, "change_request:approve", change("gil"))).toBe(false);
    expect(can(null, "kpi:read", { type: "kpi" })).toBe(false);
    expect(can(sam, "kpi:constructor", { type: "kpi" })).toBe(false);
  });
  it("only staff read the KPIs", () => expect([ana, erin, sam].map((u) => can(u, "kpi:read", { type: "kpi" }))).toEqual([false, false, true]));
});
