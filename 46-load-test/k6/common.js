// Shared by every k6 script: the target, the SLO as k6 thresholds, and a compact end-of-test summary.
export const BASE = __ENV.BASE_URL || "http://localhost:53056";

// The SLO the gate enforces: 95% of requests answered in under 300 ms, fewer than 1% failing.
// k6 exits with code 99 when a threshold is crossed, which is what fails the CI job.
export const SLO = {
  http_req_duration: ["p(95)<300"],
  http_req_failed: ["rate<0.01"],
};

export const randomId = () => 1 + Math.floor(Math.random() * 500000);
// emails are stored mixed case; members type them however they like
export const randomEmail = () => {
  const id = randomId();
  return `MEMBER.${id}@${["acme", "globex", "initech"][id % 3]}.example`;
};

const fmt = (v) => (v === undefined ? "-" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));

// Prints the thresholds (pass or fail) and the main numbers; writes the full summary as JSON for the demo to read.
export function summary(data) {
  const lines = [];
  const m = data.metrics;
  const d = m.http_req_duration ? m.http_req_duration.values : {};
  lines.push(`     requests ${fmt(m.http_reqs && m.http_reqs.values.count)} (${fmt(m.http_reqs && m.http_reqs.values.rate)}/s), failed ${fmt(m.http_req_failed && m.http_req_failed.values.rate * 100)}%, dropped iterations ${fmt(m.dropped_iterations ? m.dropped_iterations.values.count : 0)}`);
  lines.push(`     http_req_duration: med ${fmt(d.med)} ms, p(95) ${fmt(d["p(95)"])} ms, p(99) ${fmt(d["p(99)"])} ms, max ${fmt(d.max)} ms`);
  for (const [name, metric] of Object.entries(m)) {
    if (!name.startsWith("http_req_duration{") || name.includes("expected_response")) continue;
    const v = metric.values;
    lines.push(`       ${name.slice("http_req_duration".length)}: ${fmt(v.count)} requests, med ${fmt(v.med)} ms, p(95) ${fmt(v["p(95)"])} ms`);
  }
  for (const [name, metric] of Object.entries(m)) {
    for (const [expr, t] of Object.entries(metric.thresholds || {})) {
      if (expr.endsWith(">=0")) continue; // only there to make k6 keep a per-scenario submetric
      lines.push(`     threshold ${t.ok ? "PASS" : "FAIL"}  ${name} ${expr}`);
    }
  }
  const out = { stdout: lines.join("\n") + "\n" };
  if (__ENV.SUMMARY) out[__ENV.SUMMARY] = JSON.stringify(data, null, 1);
  return out;
}
