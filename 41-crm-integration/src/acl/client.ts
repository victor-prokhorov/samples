// HTTP to the CRM: OData URLs, server-driven paging, retries with backoff that honour Retry-After, ETags.
import type { CrmPage } from "./crm-types.js";

export class CrmHttpError extends Error {
  constructor(public status: number, public body: string, public headers: Headers) {
    super(`CRM answered ${status}: ${body.slice(0, 160)}`);
  }
}

export type RetryEvent = { method: string; attempt: number; status: number | string; waitMs: number; retryAfter: string | null; url: string };

export interface ClientOptions {
  base: string; // http://localhost:53151/api/data/v9.2
  pageSize?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (e: RetryEvent) => void;
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry-After is either delta-seconds ("1") or an HTTP-date (RFC 9110 section 10.2.3).
export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

export class CrmClient {
  readonly stats = { requests: 0, retries: 0, waitedMs: 0, pages: 0 };
  constructor(private o: ClientOptions) {}

  async send(method: string, url: string, init: { headers?: Record<string, string>; body?: unknown } = {}): Promise<Response> {
    const max = this.o.maxAttempts ?? 5;
    for (let attempt = 1; ; attempt++) {
      let res: Response | null = null;
      let failure: string | null = null;
      this.stats.requests++;
      try {
        res = await fetch(url, {
          method,
          headers: { accept: "application/json", "odata-version": "4.0", "odata-maxversion": "4.0", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        failure = (e as Error).name === "TimeoutError" ? "timeout" : "network error";
      }
      if (res && !RETRYABLE.has(res.status)) {
        if (res.ok) return res;
        throw new CrmHttpError(res.status, await res.text(), res.headers);
      }
      // a retryable answer: wait what the server asked for, or back off exponentially with full jitter
      const header = res?.headers.get("retry-after") ?? null;
      const asked = retryAfterMs(header);
      if (res) await res.arrayBuffer();
      if (attempt >= max) throw res ? new CrmHttpError(res.status, "gave up after retries", res.headers) : new Error(`CRM ${failure} after ${max} attempts`);
      const backoff = Math.random() * Math.min(this.o.maxDelayMs ?? 5000, (this.o.baseDelayMs ?? 200) * 2 ** (attempt - 1));
      const waitMs = Math.round(asked ?? backoff);
      if (waitMs > 60_000) throw new Error(`CRM asked to wait ${waitMs} ms: too long for a request, giving up`);
      this.o.onRetry?.({ method, attempt, status: res?.status ?? failure!, waitMs, retryAfter: header, url });
      this.stats.retries++;
      this.stats.waitedMs += waitMs;
      await sleep(waitMs);
    }
  }

  url(path: string, q: Record<string, string | undefined> = {}) {
    const u = new URL(`${this.o.base}/${path}`);
    for (const [k, v] of Object.entries(q)) if (v !== undefined) u.searchParams.set(k, v);
    return u.toString();
  }

  // Follows @odata.nextLink until the last page. The next link is opaque: use it as given, never build it.
  async *pages<T>(entitySet: string, q: { $select?: string; $filter?: string; $orderby?: string; $top?: string; $count?: string }): AsyncGenerator<CrmPage<T>> {
    let next: string | undefined = this.url(entitySet, q);
    while (next) {
      const res = await this.send("GET", next, { headers: { prefer: `odata.maxpagesize=${this.o.pageSize ?? 50}` } });
      const page = (await res.json()) as CrmPage<T>;
      this.stats.pages++;
      yield page;
      next = page["@odata.nextLink"];
    }
  }

  async get<T>(entitySet: string, id: string, select: readonly string[]): Promise<T | null> {
    try {
      const res = await this.send("GET", this.url(`${entitySet}(${id})`, { $select: select.join(",") }));
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof CrmHttpError && e.status === 404) return null;
      throw e;
    }
  }

  // Optimistic concurrency: the write only lands if the record is still at the version we read.
  async patch(entitySet: string, id: string, body: Record<string, unknown>, etag: string): Promise<string> {
    const res = await this.send("PATCH", this.url(`${entitySet}(${id})`), { headers: { "if-match": etag }, body });
    return res.headers.get("etag") ?? "";
  }
}
