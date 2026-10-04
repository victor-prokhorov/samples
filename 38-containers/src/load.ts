// Steady traffic through the proxy while a deploy happens: N workers, each sending one request after another.
// Every fourth request is the slow statement (600 ms). On top, `exports(n)` sends n long ones (8 s, like a
// yearly statement export) at a chosen moment, so there are certainly requests in flight when the old colour stops.
import { PROXY_PORT } from "./config.js";

export type Sample = { worker: number; start: number; end: number; path: string; status: number; upstream: string; ok: boolean; error?: string };

export function startLoad(workers = 6) {
  const t0 = Date.now();
  const samples: Sample[] = [];
  const marks: { at: number; label: string }[] = [];
  const extra: Promise<void>[] = [];
  let running = true;

  async function send(worker: number, path: string) {
    const start = Date.now() - t0;
    let status = 0;
    let upstream = "";
    let error: string | undefined;
    try {
      const res = await fetch(`http://localhost:${PROXY_PORT}${path}`, { signal: AbortSignal.timeout(10_000) });
      status = res.status;
      upstream = res.headers.get("x-upstream") ?? "";
      const body = (await res.json()) as { error?: string };
      if (!res.ok) error = body.error;
    } catch (err) {
      error = (err as Error).message;
    }
    samples.push({ worker, start, end: Date.now() - t0, path, status, upstream, ok: status === 200, error });
  }

  const loops = Array.from({ length: workers }, async (_, worker) => {
    for (let i = 0; running; i++) {
      await send(worker, (i + worker) % 4 === 0 ? "/api/statement?ms=600" : "/api/members");
      await new Promise((r) => setTimeout(r, 25));
    }
  });
  return {
    mark(label: string) {
      marks.push({ at: Date.now() - t0, label });
    },
    marksSoFar: () => [...marks],
    exports(n: number) {
      for (let i = 0; i < n; i++) extra.push(send(workers + i, "/api/statement?ms=8000"));
    },
    async stop() {
      running = false;
      await Promise.all([...loops, ...extra]);
      return { workers, samples, marks, durationMs: Date.now() - t0 };
    },
  };
}

export type Run = Awaited<ReturnType<ReturnType<typeof startLoad>["stop"]>>;

export function summarize(run: Run) {
  const failed = run.samples.filter((s) => !s.ok);
  const by = (key: (s: Sample) => string, list = run.samples) =>
    Object.entries(list.reduce<Record<string, number>>((acc, s) => ((acc[key(s)] = (acc[key(s)] ?? 0) + 1), acc), {}))
      .sort()
      .map(([k, n]) => `${k}=${n}`)
      .join(", ");
  return {
    total: run.samples.length,
    failed: failed.length,
    byUpstream: by((s) => s.upstream || "none"),
    failures: failed.length ? by((s) => `${s.status} ${s.upstream} ${s.error ?? ""}`.trim(), failed) : "none",
  };
}
