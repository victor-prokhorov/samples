// Field measurement (real user monitoring): the web-vitals library observes the page with PerformanceObserver and
// calls back with each Core Web Vital once its value is final (LCP and CLS when the page is hidden, INP on hide too).
// Each metric is sent with navigator.sendBeacon, which the browser delivers even while the page unloads.
import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";

export function reportVitals(page: "slow" | "fast") {
  const endpoint = document.documentElement.dataset.vitals;
  if (!endpoint) return;
  // The run script tags each simulated visit with its network profile; a real visit has none.
  const profile = new URLSearchParams(location.search).get("profile") ?? "real";
  const send = (m: Metric) => {
    // A string body is sent as text/plain, a CORS-safelisted type, so the beacon needs no preflight to another origin.
    const body = JSON.stringify({ page, profile, name: m.name, value: m.value, rating: m.rating, id: m.id, navigationType: m.navigationType });
    if (!navigator.sendBeacon(endpoint, body)) void fetch(endpoint, { method: "POST", body, keepalive: true });
  };
  onLCP(send);
  onCLS(send);
  onINP(send);
  onFCP(send);
  onTTFB(send);
}
