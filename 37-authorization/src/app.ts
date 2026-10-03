// AFTER: every route declares the action it performs and how to load the facts about its resource.
// One wrapper asks can(user, action, resource) before the handler runs, and the handler's queries run as
// the `app` role with the user's identity set, so Postgres RLS applies the same rules a second time.
// A route without an action does not start: deny by default, at the routing level too.
import pg from "pg";
import { APP_URL, asUser, isRlsRefusal } from "./db.js";
import { forbidden, json, serve, type Ctx, type Reply, type Route } from "./http.js";
import { type Action, type Resource, can, rule } from "./policy.js";

type Db = pg.ClientBase;
export type Guarded = {
  method: string;
  path: string;
  action: Action;
  // The policy information point: the attributes can() needs, read with the owner's rights, because the
  // user may not be allowed to read the row itself (that is what is being decided).
  resource: (ctx: Ctx) => Promise<Resource | null>;
  run: (db: Db, ctx: Ctx) => Promise<Reply>;
};

// Raised when the database refused what the code allowed: RLS hid the row or refused the new one.
class Refused extends Error {}
const affected = (r: pg.QueryResult) => {
  if (r.rowCount === 0) throw new Refused("no row visible to this user");
  return r;
};

export type Options = {
  rls?: boolean; // false: run handlers as the table owner, the way the sprinkled app does (to show what RLS adds)
  requesterBug?: boolean; // the bug only RLS catches: the requester is taken from the member the request is about
  onDisagreement?: (what: string) => void;
};

export function guard(owner: pg.Pool, routes: Guarded[], opts: Options = {}) {
  for (const r of routes)
    if (!r.action || !r.resource) throw new Error(`route ${r.method} ${r.path} declares no action: refusing to start (deny by default)`);
  const appPool = new pg.Pool({ connectionString: APP_URL, max: 4 });
  const asOwner = async <T>(fn: (c: Db) => Promise<T>) => {
    const c = await owner.connect();
    try {
      return await fn(c);
    } finally {
      c.release();
    }
  };

  const handlers: Route[] = routes.map((r) => ({
    method: r.method,
    path: r.path,
    handler: async (ctx) => {
      if (!ctx.user) return json(401, { error: "who are you?" });
      const resource = await r.resource(ctx);
      if (!resource) return json(404, { error: "not found" });
      if (!can(ctx.user, r.action, resource)) {
        const c = rule(ctx.user.role, r.action);
        return forbidden(c ? `${r.action}: "${c.name}" does not hold` : `${r.action}: no rule for role ${ctx.user.role} (deny by default)`);
      }
      try {
        return opts.rls === false ? await asOwner((c) => r.run(c, ctx)) : await asUser(appPool, ctx.user, (c) => r.run(c, ctx));
      } catch (e) {
        if (!(e instanceof Refused) && !isRlsRefusal(e)) throw e;
        // The code said yes and the database said no: a bug in the code (or in the policy SQL). Refuse, and say so loudly.
        const what = `${ctx.user.id} ${r.method} ${r.path} (${r.action}): code allowed, RLS refused: ${(e as Error).message}`;
        opts.onDisagreement?.(what);
        return forbidden("refused by the database policy");
      }
    },
  }));
  return { server: serve(owner, handlers), close: () => appPool.end() };
}

// Loaders: the attributes of a resource, as the policy sees them.
export async function loadMember(owner: pg.Pool, type: Resource["type"], id: string): Promise<Resource | null> {
  const { rows } = await owner.query("SELECT id, org_id FROM members WHERE id = $1", [id]);
  return rows[0] ? { type, memberId: rows[0].id, orgId: rows[0].org_id } : null;
}

export async function loadChangeRequest(owner: pg.Pool, id: string, opts: Options = {}): Promise<Resource | null> {
  const { rows } = await owner.query(
    `SELECT cr.member_id, cr.requested_by, cr.status, m.org_id, m.user_id AS member_user
     FROM change_requests cr JOIN members m ON m.id = cr.member_id WHERE cr.id = $1`,
    [Number(id)],
  );
  if (!rows[0]) return null;
  const cr = rows[0];
  return {
    type: "change_request",
    memberId: cr.member_id,
    orgId: cr.org_id,
    status: cr.status,
    // The bug, behind a switch for the demo: "the requester is the member" holds for self-service
    // requests, and is wrong when staff file one on a member's behalf.
    requestedBy: opts.requesterBug ? cr.member_user : cr.requested_by,
  };
}

export function policyApp(owner: pg.Pool, opts: Options = {}) {
  const memberFacts = (type: Resource["type"], id: string) => loadMember(owner, type, id);
  const changeRequestFacts = (id: string) => loadChangeRequest(owner, id, opts);

  const routes: Guarded[] = [
    {
      method: "GET",
      path: "/members/:id",
      action: "member:read",
      resource: (ctx) => memberFacts("member", ctx.params.id),
      run: async (db, ctx) => json(200, affected(await db.query("SELECT * FROM members WHERE id = $1", [ctx.params.id])).rows[0]),
    },
    {
      method: "PATCH",
      path: "/members/:id",
      action: "member:update",
      resource: (ctx) => memberFacts("member", ctx.params.id),
      run: async (db, ctx) => {
        affected(await db.query("UPDATE members SET address = $2 WHERE id = $1", [ctx.params.id, ctx.body.address]));
        return json(200, { updated: ctx.params.id });
      },
    },
    {
      method: "GET",
      path: "/members/:id/contributions",
      action: "contribution:read",
      resource: (ctx) => memberFacts("contribution", ctx.params.id),
      run: async (db, ctx) => json(200, affected(await db.query("SELECT * FROM contributions WHERE member_id = $1 ORDER BY period", [ctx.params.id])).rows),
    },
    {
      method: "POST",
      path: "/members/:id/contributions",
      action: "contribution:create",
      resource: (ctx) => memberFacts("contribution", ctx.params.id),
      run: async (db, ctx) => {
        await db.query("INSERT INTO contributions (member_id, period, amount) VALUES ($1, $2, $3)", [ctx.params.id, ctx.body.period, ctx.body.amount]);
        return json(201, { created: true });
      },
    },
    {
      method: "POST",
      path: "/members/:id/change-requests",
      action: "change_request:create",
      resource: async (ctx) => {
        const m = await memberFacts("change_request", ctx.params.id);
        return m && { ...m, requestedBy: ctx.user!.id, status: "pending" };
      },
      run: async (db, ctx) => {
        const { rows } = await db.query(
          "INSERT INTO change_requests (member_id, requested_by, field, value) VALUES ($1, $2, $3, $4) RETURNING id",
          [ctx.params.id, ctx.user!.id, ctx.body.field, ctx.body.value],
        );
        return json(201, rows[0]);
      },
    },
    {
      method: "GET",
      path: "/change-requests/:id",
      action: "change_request:read",
      resource: (ctx) => changeRequestFacts(ctx.params.id),
      run: async (db, ctx) => json(200, affected(await db.query("SELECT * FROM change_requests WHERE id = $1", [Number(ctx.params.id)])).rows[0]),
    },
    {
      method: "POST",
      path: "/change-requests/:id/approve",
      action: "change_request:approve",
      resource: (ctx) => changeRequestFacts(ctx.params.id),
      run: async (db, ctx) => {
        affected(await db.query("UPDATE change_requests SET status = 'approved', approved_by = $2 WHERE id = $1", [Number(ctx.params.id), ctx.user!.id]));
        return json(200, { approved: ctx.params.id });
      },
    },
    {
      method: "GET",
      path: "/members/:id/audit-log",
      action: "audit_log:read",
      resource: (ctx) => memberFacts("audit_log", ctx.params.id),
      run: async (db, ctx) => json(200, affected(await db.query("SELECT * FROM audit_log WHERE member_id = $1", [ctx.params.id])).rows),
    },
  ];
  return guard(owner, routes, opts);
}
