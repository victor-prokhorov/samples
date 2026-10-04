// Smoke: one virtual user for a few seconds. Does every endpoint answer, correctly, before we load it?
// It judges correctness only (checks, errors); latency at one user says little, the gate judges that.
import http from "k6/http";
import { check } from "k6";
import { BASE, randomId, summary } from "./common.js";

export const options = {
  vus: 1,
  duration: "3s",
  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate<0.01"],
    // always-true: they keep a per-endpoint latency line in the summary
    "http_req_duration{name:GET /members/:id}": ["max>=0"],
    "http_req_duration{name:GET /members/:id/statement}": ["max>=0"],
    "http_req_duration{name:GET /members?email}": ["max>=0"],
  },
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max", "count"],
};

export default function () {
  const id = randomId();
  const member = http.get(`${BASE}/members/${id}`, { tags: { name: "GET /members/:id" } });
  check(member, { "member 200": (r) => r.status === 200, "member has an email": (r) => r.json("email") !== undefined });
  const statement = http.get(`${BASE}/members/${id}/statement`, { tags: { name: "GET /members/:id/statement" } });
  check(statement, { "statement 200": (r) => r.status === 200 });
  const search = http.get(`${BASE}/members?email=member.${id}@${["acme", "globex", "initech"][id % 3]}.example`, { tags: { name: "GET /members?email" } });
  check(search, { "search finds the member": (r) => r.status === 200 && r.json("id") === id });
}

export const handleSummary = summary;
