// Provider contract test: calls every operation of the running provider over HTTP and checks each response
// against the spec (status documented, media type, body schema with closed objects, required headers).
//   PROVIDER_URL=http://localhost:53043 npx vitest run
// (Not BASE_URL: Vite sets that one to "/".)
import { expect, it } from "vitest";
import { contract, summarise } from "../src/contract.js";
import { SPEC } from "../src/server.js";
import { loadSpec } from "../src/spec.js";
import { cases } from "./cases.js";

const PROVIDER_URL = process.env.PROVIDER_URL ?? "http://localhost:53043";
const TOKEN = "acme-demo-token";
const c = contract(loadSpec(SPEC));

it("every operation in the spec has a success case", () => {
  const covered = new Set(cases.filter((k) => k.expect < 300).map((k) => k.operationId));
  expect(c.ops.map((o) => o.operationId).filter((id) => !covered.has(id))).toEqual([]);
});

for (const k of cases) {
  const op = c.ops.find((o) => o.operationId === k.operationId)!;
  it(`${op.operationId}: ${k.name} -> ${k.expect}`, async () => {
    const path = op.path.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(k.path[name]));
    const url = `${PROVIDER_URL}${path}${k.query ? `?${new URLSearchParams(k.query)}` : ""}`;
    const headers: Record<string, string> = k.token === null ? {} : { authorization: `Bearer ${k.token ?? TOKEN}` };
    if (k.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(url, { method: op.method, headers, body: k.body === undefined ? undefined : JSON.stringify(k.body) });
    const text = await res.text();
    const issues = c.checkResponse(op, {
      status: res.status,
      headers: Object.fromEntries(res.headers),
      contentType: res.headers.get("content-type") ?? undefined,
      body: text ? JSON.parse(text) : undefined,
    });
    expect.soft(res.status, "status").toBe(k.expect);
    expect(summarise(issues), `${op.method} ${url.slice(PROVIDER_URL.length)} differs from the spec`).toEqual([]);
  });
}
