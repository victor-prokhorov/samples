// A consumer (an employer's payroll system, say) using the client generated from the spec. Paths, parameters,
// bodies and responses are all typed from openapi/v2.yaml: a typo or a field the spec does not have fails `tsc`.
import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./generated/api.js";

export type Member = components["schemas"]["Member"];

export interface DeprecationNotice {
  operation: string;
  deprecatedOn: string;
  sunset: string;
  successor: string;
}

// Reads RFC 9745 / RFC 8594 headers on every response and reports each deprecated operation once.
export function deprecationWatch(report: (n: DeprecationNotice) => void): Middleware {
  const seen = new Set<string>();
  return {
    onResponse({ request, response, schemaPath }) {
      const dep = response.headers.get("deprecation");
      if (!dep) return;
      const key = `${request.method} ${schemaPath}`;
      if (seen.has(key)) return;
      seen.add(key);
      const successor = /<([^>]+)>;\s*rel="successor-version"/.exec(response.headers.get("link") ?? "")?.[1] ?? "(none given)";
      report({ operation: key, deprecatedOn: new Date(Number(dep.slice(1)) * 1000).toISOString().slice(0, 10), sunset: response.headers.get("sunset") ?? "(none given)", successor });
    },
  };
}

export function portalClient(baseUrl: string, token: string, onDeprecation: (n: DeprecationNotice) => void) {
  const client = createClient<paths>({ baseUrl, headers: { authorization: `Bearer ${token}` } });
  client.use(deprecationWatch(onDeprecation));
  return client;
}

type Client = ReturnType<typeof portalClient>;

export async function activeMembers(client: Client, employerId: "acme" | "globex" | "initech"): Promise<Member[]> {
  const { data, error } = await client.GET("/employers/{employerId}/members", { params: { path: { employerId }, query: { status: "active" } } });
  if (error) throw new Error(`${error.status} ${error.title}`);
  return data.items;
}

export async function yearsOfService(client: Client, memberId: string, today: string): Promise<number> {
  const { data, error } = await client.GET("/members/{memberId}", { params: { path: { memberId } } });
  if (error) throw new Error(`${error.status} ${error.title}`);
  return Number(today.slice(0, 4)) - Number(data.joinedOn.slice(0, 4));
}

// Written against revision 1: the old, unpaged endpoint.
export async function totalPaidLegacy(client: Client, memberId: string): Promise<number> {
  const { data, error } = await client.GET("/members/{memberId}/contributions", { params: { path: { memberId } } });
  if (error) throw new Error(`${error.status} ${error.title}`);
  return data.items.reduce((sum, c) => sum + c.memberAmount + c.employerAmount, 0);
}

// The same total through the successor, following nextCursor page by page.
export async function totalPaid(client: Client, memberId: string, limit = 5): Promise<{ total: number; pages: number }> {
  let cursor: string | undefined;
  let total = 0;
  let pages = 0;
  do {
    const { data, error } = await client.GET("/contributions", { params: { query: { memberId, limit, cursor } } });
    if (error) throw new Error(`${error.status} ${error.title}`);
    pages++;
    total += data.items.reduce((sum, c) => sum + c.memberAmount + c.employerAmount, 0);
    cursor = data.nextCursor ?? undefined;
  } while (cursor);
  return { total, pages };
}

export async function requestEmailChange(client: Client, memberId: string, email: string, effectiveDate: string) {
  const { data, error, response } = await client.POST("/members/{memberId}/change-requests", {
    params: { path: { memberId } },
    body: { kind: "email", value: email, effectiveDate },
  });
  if (error) return { ok: false as const, status: response.status, problem: error };
  return { ok: true as const, request: data, location: response.headers.get("location") };
}
