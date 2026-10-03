// The whole matrix against expectations written by hand, independently of the policy code.
// A change to src/policy.ts that moves any cell fails here and has to be reviewed as a change to this table.
import { describe, expect, it } from "vitest";
import { matrix, rowLabel } from "../src/matrix.js";
import { USERS } from "../src/fixtures.js";
import { can } from "../src/policy.js";

// own = the user's own member record, same = another record of the user's organisation,
// other = a record of another organisation; "-" = cannot occur for this role.
const EXPECTED = `
role            action                                               own     same    other
member          member:read                                          allow   deny    deny
member          member:update                                        allow   deny    deny
member          contribution:read                                    allow   deny    deny
member          contribution:create                                  deny    deny    deny
member          change_request:create                                allow   deny    deny
member          change_request:read                                  allow   deny    deny
member          change_request:approve (requested by someone else)   deny    deny    deny
member          change_request:approve (requested by me)             deny    deny    deny
member          audit_log:read                                       deny    deny    deny
employer_admin  member:read                                          -       allow   deny
employer_admin  member:update                                        -       deny    deny
employer_admin  contribution:read                                    -       allow   deny
employer_admin  contribution:create                                  -       allow   deny
employer_admin  change_request:create                                -       allow   deny
employer_admin  change_request:read                                  -       allow   deny
employer_admin  change_request:approve (requested by someone else)   -       deny    deny
employer_admin  change_request:approve (requested by me)             -       deny    deny
employer_admin  audit_log:read                                       -       deny    deny
staff           member:read                                          -       -       allow
staff           member:update                                        -       -       deny
staff           contribution:read                                    -       -       allow
staff           contribution:create                                  -       -       deny
staff           change_request:create                                -       -       allow
staff           change_request:read                                  -       -       allow
staff           change_request:approve (requested by someone else)   -       -       allow
staff           change_request:approve (requested by me)             -       -       deny
staff           audit_log:read                                       -       -       deny
auditor         member:read                                          -       -       allow
auditor         member:update                                        -       -       deny
auditor         contribution:read                                    -       -       allow
auditor         contribution:create                                  -       -       deny
auditor         change_request:create                                -       -       deny
auditor         change_request:read                                  -       -       allow
auditor         change_request:approve (requested by someone else)   -       -       deny
auditor         change_request:approve (requested by me)             -       -       deny
auditor         audit_log:read                                       -       -       allow
`;

const COLUMNS = { own: "own record", same: "same organisation", other: "other organisation" } as const;
const expected = new Map<string, string>();
for (const line of EXPECTED.trim().split("\n").slice(1)) {
  const [role, action, own, same, other] = line.split(/\s{2,}/);
  for (const [col, v] of Object.entries({ own, same, other })) expected.set(`${role} | ${action} | ${COLUMNS[col as keyof typeof COLUMNS]}`, v === "-" ? "n/a" : v);
}

const cells = matrix();

describe("permission matrix", () => {
  it("has one expectation per generated cell, and no more", () => {
    expect(expected.size).toBe(cells.length);
    expect(new Set(cells.map((c) => `${c.role} | ${rowLabel(c.row)} | ${c.rel}`))).toEqual(new Set(expected.keys()));
  });

  it.each(cells.map((c) => [`${c.role} | ${rowLabel(c.row)} | ${c.rel}`, c.verdict] as const))("%s -> %s", (key, verdict) => {
    expect(verdict).toBe(expected.get(key));
  });
});

describe("deny by default", () => {
  const resource = { type: "member" as const, memberId: "m-gil", orgId: "globex" };
  it("denies a role the policy does not know", () => {
    expect(cells.filter((c) => c.resource && can({ ...c.subject, role: "contractor" }, c.row.action, c.resource))).toEqual([]);
  });
  it("denies an action nobody was granted", () => {
    expect(can(USERS.sam, "member:delete", resource)).toBe(false);
  });
  it("denies without a user", () => {
    expect(can(null, "member:read", resource)).toBe(false);
  });
  it("denies an action aimed at another kind of resource", () => {
    expect(can(USERS.sam, "contribution:read", resource)).toBe(false);
  });
  it("does not treat inherited object keys as rules", () => {
    expect(can(USERS.sam, "member:constructor", resource)).toBe(false);
    expect(can({ ...USERS.sam, role: "__proto__" }, "member:read", resource)).toBe(false);
  });
});
