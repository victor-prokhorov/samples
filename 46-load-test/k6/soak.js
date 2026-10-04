// Soak: a steady, realistic mix well below saturation, held for a while. Looking for drift: latency creeping up,
// memory growing, connections leaking. A real soak runs for hours; this one is 30 s in three 10 s windows.
import http from "k6/http";
import { check } from "k6";
import { BASE, SLO, randomEmail, randomId, summary } from "./common.js";

const WINDOWS = 3;
const scenarios = {};
const thresholds = { ...SLO };
for (let w = 1; w <= WINDOWS; w++) {
  scenarios[`w${w}`] = {
    executor: "constant-arrival-rate",
    rate: 100,
    timeUnit: "1s",
    duration: "10s",
    startTime: `${(w - 1) * 10}s`,
    preAllocatedVUs: 20,
    maxVUs: 100,
    gracefulStop: "1s",
  };
  thresholds[`http_req_duration{scenario:w${w}}`] = ["max>=0"];
  thresholds[`http_reqs{scenario:w${w}}`] = ["count>=0"];
}

export const options = { scenarios, thresholds, summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max", "count"] };

// the mix members produce: mostly profile views, some statements, a few searches
export default function () {
  const roll = Math.random();
  const id = randomId();
  let r;
  if (roll < 0.6) r = http.get(`${BASE}/members/${id}`, { tags: { name: "GET /members/:id" } });
  else if (roll < 0.9) r = http.get(`${BASE}/members/${id}/statement`, { tags: { name: "GET /members/:id/statement" } });
  else r = http.get(`${BASE}/members?email=${encodeURIComponent(randomEmail())}`, { tags: { name: "GET /members?email" } });
  check(r, { "200": (res) => res.status === 200 });
}

export const handleSummary = summary;
