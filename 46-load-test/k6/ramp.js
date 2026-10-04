// Ramp: offer more and more statements per second, one step after another, to find where the API saturates.
// Each step is its own constant-arrival-rate scenario, so k6 reports throughput and latency per step.
import http from "k6/http";
import { BASE, randomId, summary } from "./common.js";

export const STEPS = (__ENV.STEPS || "25,50,75,100,125,150,175").split(",").map(Number);
const STEP_S = Number(__ENV.STEP_S || 4);

const scenarios = {};
const thresholds = {};
STEPS.forEach((rate, i) => {
  scenarios[`r${rate}`] = {
    executor: "constant-arrival-rate",
    rate,
    timeUnit: "1s",
    duration: `${STEP_S}s`,
    startTime: `${i * STEP_S}s`,
    preAllocatedVUs: 10,
    maxVUs: 60, // at most 60 requests in flight; beyond that k6 drops iterations instead of queueing forever
    gracefulStop: "0s",
  };
  // always-true thresholds: they make k6 keep per-step submetrics in the summary
  thresholds[`http_req_duration{scenario:r${rate}}`] = ["max>=0"];
  thresholds[`http_reqs{scenario:r${rate}}`] = ["count>=0"];
  thresholds[`dropped_iterations{scenario:r${rate}}`] = ["count>=0"];
  thresholds[`http_req_failed{scenario:r${rate}}`] = ["rate>=0"];
});

export const options = { scenarios, thresholds, summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max", "count"] };

export default function () {
  http.get(`${BASE}/members/${randomId()}/statement`, { tags: { name: "GET /members/:id/statement" } });
}

export const handleSummary = summary;
