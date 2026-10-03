// One handler per operationId. With drift on, two handlers make the mistakes that drift an API from its docs:
// returning the stored row as is (an undocumented, sensitive field leaks) and formatting amounts as text.
import type { Matched } from "./contract.js";
import type { Contribution, Member, Store } from "./data.js";

export interface Reply {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}
export type Handler = (m: Matched) => Reply;

export const problem = (status: number, title: string, detail?: string, errors?: { where: string; message: string }[]): Reply => ({
  status,
  body: { type: `https://contract.local/problems/${title.toLowerCase().replace(/[^a-z]+/g, "-")}`, title, status, ...(detail ? { detail } : {}), ...(errors ? { errors } : {}) },
});

// RFC 9745 Deprecation (a structured-field date) and RFC 8594 Sunset (an HTTP-date), plus where to go instead.
export const DEPRECATIONS: Record<string, { since: Date; sunset: Date; successor: (m: Matched) => string }> = {
  listMemberContributions: {
    since: new Date("2026-10-01T00:00:00Z"),
    sunset: new Date("2027-03-31T23:59:59Z"),
    successor: (m) => `/contributions?memberId=${m.params.memberId}`,
  },
};

export function deprecationHeaders(operationId: string, m: Matched): Record<string, string> {
  const d = DEPRECATIONS[operationId];
  return {
    deprecation: `@${d.since.getTime() / 1000}`,
    sunset: d.sunset.toUTCString(),
    link: `<${d.successor(m)}>; rel="successor-version", </docs#tag/contributions/operation/${operationId}>; rel="deprecation"; type="text/html"`,
  };
}

export function handlers(store: Store, drift: boolean): Record<string, Handler> {
  const toMember = ({ taxId: _taxId, ...documented }: Member) => documented;
  const member = drift ? (m: Member) => m : toMember; // drift: the stored row, taxId and all
  const toContribution = ({ period, memberAmount, employerAmount }: Contribution) =>
    drift ? { period, memberAmount: memberAmount.toFixed(2), employerAmount: employerAmount.toFixed(2) } : { period, memberAmount, employerAmount };
  const find = (id: string) => store.members.get(id);
  const notFound = (what: string) => problem(404, "Not found", `${what} does not exist`);

  return {
    listEmployerMembers: ({ params, query }) => ({
      status: 200,
      body: { items: [...store.members.values()].filter((m) => m.employerId === params.employerId && (!query.status || m.status === query.status)).map(member) },
    }),

    getMember: ({ params }) => {
      const m = find(params.memberId);
      return m ? { status: 200, body: member(m) } : notFound(`member ${params.memberId}`);
    },

    listMemberContributions: (req) => {
      if (!find(req.params.memberId)) return notFound(`member ${req.params.memberId}`);
      return {
        status: 200,
        headers: deprecationHeaders("listMemberContributions", req),
        body: { items: store.contributions.filter((c) => c.memberId === req.params.memberId).map(toContribution) },
      };
    },

    listContributions: ({ query }) => {
      const memberId = query.memberId as string;
      if (!find(memberId)) return notFound(`member ${memberId}`);
      let offset = 0;
      if (query.cursor) {
        try {
          offset = JSON.parse(Buffer.from(String(query.cursor), "base64url").toString()).o;
          if (!Number.isInteger(offset) || offset < 0) throw new Error();
        } catch {
          return problem(400, "Bad request", "the cursor is not one this API issued", [{ where: "query.cursor", message: "is not a valid cursor" }]);
        }
      }
      const all = store.contributions.filter((c) => c.memberId === memberId);
      const limit = query.limit as number;
      const next = offset + limit < all.length ? Buffer.from(JSON.stringify({ o: offset + limit })).toString("base64url") : null;
      return { status: 200, body: { items: all.slice(offset, offset + limit).map(toContribution), nextCursor: next } };
    },

    createChangeRequest: ({ params, body }) => {
      if (!find(params.memberId)) return notFound(`member ${params.memberId}`);
      const input = body as { kind: "email" | "address"; value: string; effectiveDate: string };
      const pending = [...store.changeRequests.values()].find((c) => c.memberId === params.memberId && c.kind === input.kind && c.status === "pending");
      if (pending) return problem(409, "Conflict", `${pending.id} is already pending for this member and kind`);
      const id = `CR${String(store.changeRequests.size + 1).padStart(4, "0")}`;
      const cr = { id, memberId: params.memberId, ...input, status: "pending" as const, submittedAt: new Date().toISOString() };
      store.changeRequests.set(id, cr);
      return { status: 201, headers: { location: `/change-requests/${id}` }, body: cr };
    },

    getChangeRequest: ({ params }) => {
      const cr = store.changeRequests.get(params.changeRequestId);
      return cr ? { status: 200, body: cr } : notFound(`change request ${params.changeRequestId}`);
    },
  };
}
