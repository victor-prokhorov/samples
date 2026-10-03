// The web process, a backend-for-frontend (:53046). It renders pages from API calls made with fetch;
// the undici instrumentation adds a W3C `traceparent` header to each call, so the API's spans join this trace.
import { API_URL, WEB_PORT } from "./config.js";
import { log, server, type Reply } from "./serve.js";

async function api(path: string) {
  const res = await fetch(`${API_URL}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const page = (title: string, body: string): Reply => ({
  status: 200,
  type: "text/html; charset=utf-8",
  body: `<!doctype html><html lang="en"><title>${title}</title><h1>${title}</h1>${body}</html>`,
});

// An API 5xx becomes a 502 here: the web process did nothing wrong, its dependency did.
const upstream = (r: { status: number }): Reply => ({ status: r.status >= 500 ? 502 : r.status, body: { error: `api answered ${r.status}` } });

const app = server([
  [
    "GET",
    "/employers/:code/dashboard",
    async ({ code }) => {
      const r = await api(`/api/employers/${encodeURIComponent(code)}/members`);
      if (r.status !== 200) return upstream(r);
      const members = r.body.members as Array<{ total: string }>;
      const total = members.reduce((s, m) => s + Number(m.total), 0);
      return page(`${r.body.employer} dashboard`, `<p>${members.length} members, ${total.toFixed(2)} contributed</p>`);
    },
  ],
  [
    "GET",
    "/members/:id",
    async ({ id }) => {
      const r = await api(`/api/members/${encodeURIComponent(id)}`);
      return r.status === 200 ? page(String(r.body.name), `<p>${r.body.employer}, ${r.body.total} contributed</p>`) : upstream(r);
    },
  ],
  [
    "GET",
    "/members/:id/statement",
    async ({ id }) => {
      const r = await api(`/api/members/${encodeURIComponent(id)}/statement`);
      return r.status === 200 ? page(`Statement ${id}`, `<p>latest ${r.body.latest}</p>`) : upstream(r);
    },
  ],
]);

app.listen(WEB_PORT, () => log.info({ port: WEB_PORT, api: API_URL, pid: process.pid }, "web listening"));
