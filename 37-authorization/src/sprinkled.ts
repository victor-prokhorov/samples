// BEFORE: each handler checks roles its own way, written by different people at different times.
// It connects as the table owner, so the database checks nothing. Look for what is missing:
//   - GET /members/:id/contributions was added later, by copying the query and not the check;
//   - POST /members/:id/contributions checks the role but not the organisation;
//   - POST /members/:id/change-requests lists who may NOT file a request, so a new role (auditor) may;
//   - POST /change-requests/:id/approve checks "is staff" and forgets four eyes;
//   - GET /members/:id/audit-log lets staff read the audit trail of their own work.
import type pg from "pg";
import { forbidden, json, serve, type Route } from "./http.js";

export function sprinkledApp(owner: pg.Pool) {
  const memberRow = async (id: string) => (await owner.query("SELECT * FROM members WHERE id = $1", [id])).rows[0];

  const routes: Route[] = [
    {
      method: "GET",
      path: "/members/:id",
      handler: async ({ user, params }) => {
        if (!user) return json(401, { error: "who are you?" });
        const m = await memberRow(params.id);
        if (!m) return json(404, { error: "no such member" });
        if (user.role === "member" && user.memberId !== m.id) return forbidden("not your record");
        if (user.role === "employer_admin" && user.orgId !== m.org_id) return forbidden("not your employer");
        return json(200, m);
      },
    },
    {
      method: "PATCH",
      path: "/members/:id",
      handler: async ({ user, params, body }) => {
        if (!user || user.role !== "member" || user.memberId !== params.id) return forbidden("members update their own address");
        await owner.query("UPDATE members SET address = $2 WHERE id = $1", [params.id, body.address]);
        return json(200, { updated: params.id });
      },
    },
    {
      method: "GET",
      path: "/members/:id/contributions",
      handler: async ({ params }) => {
        // copied from the statement page; the role check did not come along
        const { rows } = await owner.query("SELECT * FROM contributions WHERE member_id = $1 ORDER BY period", [params.id]);
        return json(200, rows);
      },
    },
    {
      method: "POST",
      path: "/members/:id/contributions",
      handler: async ({ user, params, body }) => {
        if (user?.role !== "employer_admin") return forbidden("employers submit contributions");
        await owner.query("INSERT INTO contributions (member_id, period, amount) VALUES ($1, $2, $3)", [params.id, body.period, body.amount]);
        return json(201, { created: true });
      },
    },
    {
      method: "POST",
      path: "/members/:id/change-requests",
      handler: async ({ user, params, body }) => {
        if (!user) return json(401, { error: "who are you?" });
        const m = await memberRow(params.id);
        if (user.role === "member" && user.memberId !== m.id) return forbidden("not your record");
        if (user.role === "employer_admin" && user.orgId !== m.org_id) return forbidden("not your employer");
        const { rows } = await owner.query(
          "INSERT INTO change_requests (member_id, requested_by, field, value) VALUES ($1, $2, $3, $4) RETURNING id",
          [params.id, user.id, body.field, body.value],
        );
        return json(201, rows[0]);
      },
    },
    {
      method: "GET",
      path: "/change-requests/:id",
      handler: async ({ user, params }) => {
        const { rows } = await owner.query("SELECT cr.*, m.org_id FROM change_requests cr JOIN members m ON m.id = cr.member_id WHERE cr.id = $1", [params.id]);
        if (!user) return json(401, { error: "who are you?" });
        if (user.role === "member" && rows[0].member_id !== user.memberId) return forbidden("not your request");
        if (user.role === "employer_admin" && rows[0].org_id !== user.orgId) return forbidden("not your employer");
        return json(200, rows[0]);
      },
    },
    {
      method: "POST",
      path: "/change-requests/:id/approve",
      handler: async ({ user, params }) => {
        if (user?.role !== "staff") return forbidden("staff approve changes");
        await owner.query("UPDATE change_requests SET status = 'approved', approved_by = $2 WHERE id = $1", [params.id, user.id]);
        return json(200, { approved: params.id });
      },
    },
    {
      method: "GET",
      path: "/members/:id/audit-log",
      handler: async ({ user, params }) => {
        if (user?.role !== "auditor" && user?.role !== "staff") return forbidden("auditors only");
        return json(200, (await owner.query("SELECT * FROM audit_log WHERE member_id = $1", [params.id])).rows);
      },
    },
  ];
  return serve(owner, routes);
}
