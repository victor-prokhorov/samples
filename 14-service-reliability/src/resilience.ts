import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

export const PAYMENTS_PORT = 53010;
export const CATALOG_PORT = 53011;

export type Failure = "timeout" | "network" | "status" | "breaker-open" | "bulkhead-full";

export class CallError extends Error {
  constructor(
    readonly kind: Failure,
    readonly status = 0,
    detail = "",
    readonly retryAfterMs = 0,
  ) {
    super(kind === "status" ? `HTTP ${status}${detail ? ` ${detail}` : ""}` : detail ? `${kind} (${detail})` : kind);
  }
}

export type Reply = { status: number; body: unknown; headers: http.IncomingHttpHeaders };

export type CallOptions = { port: number; path: string; method?: string; body?: object; headers?: Record<string, string>; timeoutMs?: number; propagateDeadline?: boolean; agent?: http.Agent };

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorText(body: unknown) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "";
}

function networkDetail(err: Error) {
  return err.message || ("code" in err && typeof err.code === "string" ? err.code : err.name);
}

export function call(o: CallOptions): Promise<Reply> {
  const payload = o.body ? JSON.stringify(o.body) : undefined;
  const headers: Record<string, string> = { ...o.headers };
  if (payload) headers["content-type"] = "application/json";
  if (o.timeoutMs && o.propagateDeadline) headers["x-deadline-ms"] = String(Math.floor(o.timeoutMs));
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "localhost", port: o.port, path: o.path, method: o.method ?? "GET", headers, agent: o.agent, signal: o.timeoutMs ? AbortSignal.timeout(o.timeoutMs) : undefined }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (text += chunk));
      res.on("error", (err) => reject(new CallError("network", 0, err.message)));
      res.on("end", () => {
        const reply = { status: res.statusCode ?? 0, body: parse(text), headers: res.headers };
        if (reply.status >= 400) reject(new CallError("status", reply.status, errorText(reply.body), Number(res.headers["retry-after"] ?? 0) * 1000));
        else resolve(reply);
      });
    });
    req.on("error", (err) => reject(err.name === "AbortError" || err.name === "TimeoutError" ? new CallError("timeout", 0, `no reply within ${o.timeoutMs}ms`) : new CallError("network", 0, networkDetail(err))));
    req.end(payload);
  });
}

export function isRetryable(err: unknown) {
  return err instanceof CallError && (err.kind === "timeout" || err.kind === "network" || [409, 429, 502, 503, 504].includes(err.status));
}

export function isDependencyFailure(err: unknown) {
  return err instanceof CallError && (err.kind === "timeout" || err.kind === "network" || err.status >= 500);
}

export class RetryBudget {
  private tokens: number;

  constructor(
    private readonly ratio: number,
    private readonly reserve: number,
  ) {
    this.tokens = reserve;
  }

  onRequest() {
    this.tokens = Math.min(this.reserve, this.tokens + this.ratio);
  }

  tryRetry() {
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}

export type Backoff = "none" | "exponential" | "full-jitter";

export type RetryPolicy = { maxAttempts: number; backoff: Backoff; baseMs: number; capMs: number; attemptTimeoutMs: number; deadlineMs: number; budget?: RetryBudget };

export function backoffMs(p: RetryPolicy, attempt: number) {
  const ceiling = Math.min(p.capMs, p.baseMs * 2 ** (attempt - 1));
  return p.backoff === "none" ? 0 : p.backoff === "exponential" ? ceiling : Math.random() * ceiling;
}

export type OnFailure = (attempt: number, err: unknown, next: string) => void;

export async function withRetries<T>(p: RetryPolicy, attempt: (timeoutMs: number) => Promise<T>, onFailure: OnFailure = () => {}): Promise<T> {
  const deadline = performance.now() + p.deadlineMs;
  p.budget?.onRequest();
  for (let n = 1; ; n++) {
    try {
      return await attempt(Math.max(1, Math.floor(Math.min(p.attemptTimeoutMs, deadline - performance.now()))));
    } catch (err) {
      const delay = Math.max(backoffMs(p, n), err instanceof CallError ? err.retryAfterMs : 0);
      const stop = !isRetryable(err) ? "not retryable, give up" : n >= p.maxAttempts ? "max attempts reached, give up" : performance.now() + delay >= deadline ? "deadline would pass, give up" : p.budget && !p.budget.tryRetry() ? "retry budget empty, give up" : undefined;
      onFailure(n, err, stop ?? `retry in ${Math.round(delay)}ms`);
      if (stop) throw err;
      await sleep(delay);
    }
  }
}

export type BreakerState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly onChange: (from: BreakerState, to: BreakerState, why: string) => void,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open" && performance.now() - this.openedAt >= this.cooldownMs) this.move("half-open", `${this.cooldownMs}ms cooldown over, let one probe through`);
    if (this.state === "open" || (this.state === "half-open" && this.probing)) throw new CallError("breaker-open");
    const probe = this.state === "half-open";
    if (probe) this.probing = true;
    try {
      const value = await fn();
      if (probe) this.move("closed", "probe succeeded");
      if (this.state === "closed") this.failures = 0;
      return value;
    } catch (err) {
      if (probe) this.move("open", `probe failed: ${err instanceof Error ? err.message : String(err)}`);
      else if (isDependencyFailure(err) && this.state === "closed" && ++this.failures >= this.threshold) this.move("open", `${this.failures} consecutive failures`);
      throw err;
    } finally {
      if (probe) this.probing = false;
    }
  }

  private move(to: BreakerState, why: string) {
    const from = this.state;
    this.state = to;
    if (to === "open") this.openedAt = performance.now();
    if (to !== "open") this.failures = 0;
    this.onChange(from, to, why);
  }
}

export class Bulkhead {
  private active = 0;

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) throw new CallError("bulkhead-full", 0, `${this.limit} calls already in flight`);
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
    }
  }
}
