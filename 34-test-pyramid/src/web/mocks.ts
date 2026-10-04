// MSW: the network as the component sees it, without a server. Handlers return what the real API returns
// (the API tests pin that shape down); a test overrides one with server.use() for an error case.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const alice = { id: "M0001", name: "Alice Martin", employer: "Acme", salary: 42000, rate: 5, pending: null, today: "2026-10-03" };

export const posted: unknown[] = [];

export const handlers = [
  http.get("*/api/members/M0001", () => HttpResponse.json(alice)),
  http.post("*/api/members/M0001/contribution-changes", async ({ request }) => {
    const body = (await request.json()) as { rate: string; effectiveFrom: string };
    posted.push(body);
    const rate = Number(body.rate.replace(",", "."));
    return HttpResponse.json({ id: 1, rate, effectiveFrom: body.effectiveFrom, status: "pending", monthly: { member: (42000 * rate) / 1200, employer: 175, total: (42000 * rate) / 1200 + 175 } }, { status: 201 });
  }),
];

export const server = setupServer(...handlers);
