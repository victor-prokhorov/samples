// The SLO gate: a fixed, realistic load on the member search, judged by the SLO thresholds.
// Run it in CI before a release: exit 0 means the SLO holds at this load, exit 99 means it does not.
import http from "k6/http";
import { check } from "k6";
import { BASE, SLO, randomEmail, summary } from "./common.js";

export const options = {
  scenarios: {
    search: {
      executor: "constant-arrival-rate", // open model: requests keep arriving whether or not earlier ones answered
      rate: 60,
      timeUnit: "1s",
      duration: "8s",
      preAllocatedVUs: 20,
      maxVUs: 30, // at most 30 in flight: past that k6 drops iterations (and reports them) rather than pile up a backlog
      gracefulStop: "2s",
    },
  },
  thresholds: SLO,
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max", "count"],
};

export default function () {
  const r = http.get(`${BASE}/members?email=${encodeURIComponent(randomEmail())}`, { tags: { name: "GET /members?email" } });
  check(r, { "200": (res) => res.status === 200 });
}

export const handleSummary = summary;
