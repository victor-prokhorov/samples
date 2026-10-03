// Code and database agree: every live cell of the matrix, asked of can() and of Postgres RLS (as the `app`
// role, with the user's identity set for the transaction). Needs the database from `npm run setup`.
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { loadChangeRequest } from "../src/app.js";
import { dbAllows } from "../src/cells.js";
import { OWNER_URL } from "../src/db.js";
import { USERS, member } from "../src/fixtures.js";
import { type Cell, matrix, rowLabel } from "../src/matrix.js";
import { can } from "../src/policy.js";

const owner = new pg.Pool({ connectionString: OWNER_URL, max: 2 });
afterAll(() => owner.end());

const live = matrix().filter((c) => c.verdict !== "n/a");

describe("code and database agree on every cell", () => {
  it.each(live.map((c) => [`${c.subject.id} (${c.role}) | ${rowLabel(c.row)} | ${c.rel}`, c] as const))("%s", async (_, cell) => {
    expect(await dbAllows(owner, cell)).toBe(cell.verdict === "allow");
  });
});

describe("a bug only RLS catches", () => {
  it("the buggy loader makes the code allow a self-approval that the database refuses", async () => {
    // Staff member sam files a change on Gil's behalf (committed, so the loader's own connection sees it).
    const { rows } = await owner.query("INSERT INTO change_requests (member_id, requested_by, field, value) VALUES ('m-gil', 'sam', 'bank_account', 'x') RETURNING id");
    const id = String(rows[0].id);
    try {
      const buggy = (await loadChangeRequest(owner, id, { requesterBug: true }))!;
      const correct = (await loadChangeRequest(owner, id))!;
      expect(buggy.requestedBy).toBe("gil"); // the member the request is about, not who asked
      expect(can(USERS.sam, "change_request:approve", buggy)).toBe(true); // the code would let sam approve
      expect(can(USERS.sam, "change_request:approve", correct)).toBe(false); // the policy itself is right

      // What the database does when sam's approval reaches it: the row says requested_by = sam.
      const cell: Cell = {
        role: "staff",
        row: { action: "change_request:approve", requester: "me" },
        rel: "other organisation",
        subject: USERS.sam,
        target: member("m-gil"),
        resource: correct,
        verdict: "deny",
      };
      expect(await dbAllows(owner, cell)).toBe(false);
    } finally {
      await owner.query("DELETE FROM change_requests WHERE id = $1", [id]);
    }
  });
});
