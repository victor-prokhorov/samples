// Three kinds of client, all timed from the client side (what the tenant experiences, queueing included).
import { setTimeout as sleep } from "node:timers/promises";
import { PORT } from "./db.js";

export type Hit = { at: number; tenant: string; client: string; status: number; ms: number };

const TENANT_INDEX: Record<string, number> = { acme: 0, globex: 1, initech: 2 };
const memberOf = (tenant: string) => 3 * (1 + Math.floor(Math.random() * 990)) + TENANT_INDEX[tenant];

export class Run {
  readonly hits: Hit[] = [];
  readonly retryDelays: number[] = [];
  private t0: number;
  private stop: number;

  // startAt is a wall-clock time shared by the processes that drive one run, so their timelines line up
  constructor(readonly durationMs: number, readonly startAt: number) {
    this.t0 = performance.now() + (startAt - Date.now());
    this.stop = this.t0 + durationMs;
  }

  async begin() {
    await sleep(Math.max(0, this.t0 - performance.now()));
    return this;
  }

  get running() {
    return performance.now() < this.stop;
  }

  async request(tenant: string, client: string): Promise<{ status: number; retryAfter: number }> {
    const start = performance.now();
    const r = await fetch(`http://localhost:${PORT}/members/${memberOf(tenant)}`, { headers: { "x-api-key": client } });
    await r.arrayBuffer();
    this.hits.push({ at: start - this.t0, tenant, client, status: r.status, ms: performance.now() - start });
    return { status: r.status, retryAfter: Number(r.headers.get("retry-after") ?? 0) };
  }

  // members using a portal: requests arrive at a steady rate whether or not earlier ones have answered
  async steady(tenant: string, client: string, perSecond: number, fromMs = 0) {
    const inflight: Promise<unknown>[] = [];
    await sleep(Math.max(0, this.t0 + fromMs - performance.now()));
    for (let i = 0; this.running; i++) {
      inflight.push(this.request(tenant, client));
      const next = this.t0 + fromMs + ((i + 1) * 1000) / perSecond;
      await sleep(Math.max(0, next - performance.now()));
    }
    await Promise.all(inflight);
  }

  // a batch job that ignores 429: every worker sends again 200 ms after any answer, whatever the answer (Retry-After says 1 s)
  async hammer(tenant: string, client: string, workers: number) {
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (this.running) {
          await this.request(tenant, client);
          await sleep(200);
        }
      }),
    );
  }

  // a sync job that honours Retry-After, with jitter: wait Retry-After x (1 + up to 50%), so the workers that were
  // refused together do not all come back in the same millisecond
  async polite(tenant: string, client: string, workers: number) {
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (this.running) {
          const r = await this.request(tenant, client);
          if (r.status === 429) {
            const delay = r.retryAfter * 1000 * (1 + Math.random() * 0.5);
            this.retryDelays.push(delay);
            await sleep(Math.min(delay, Math.max(0, this.stop - performance.now())));
          } else {
            await sleep(10);
          }
        }
      }),
    );
  }
}
