import { PORT, db } from "./db.js";
import { seeded } from "./random.js";

export const WINDOW = { from: new Date("2026-09-03T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") };
export const INCIDENT = "2026-09-17T09:00:00Z/2026-09-17T13:00:00Z";

const BASE = `http://localhost:${PORT}`;
const DAY = 86_400_000;

type Call = { status: number; json: any };

async function call(method: string, path: string, at: number, member?: number, session?: string, body?: unknown): Promise<Call> {
  const headers: Record<string, string> = { "x-sim-now": new Date(at).toISOString(), "content-type": "application/json" };
  if (member) headers["x-member-id"] = String(member);
  if (session) headers["x-session-id"] = session;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
}

// One member's visit. Every decision comes from the visit's own seed, so runs are reproducible however the visits interleave.
async function visit(member: number, start: number, seed: number) {
  const rnd = seeded(seed);
  const session = `s${seed}`;
  let t = start;
  const go = (method: string, path: string, body?: unknown) => call(method, path, (t += 5_000 + rnd() * 40_000), member, session, body);
  await go("POST", "/login");
  if (rnd() < 0.9) await go("GET", "/profile");
  if (rnd() < 0.55) await go("GET", "/contributions");
  if (rnd() > 0.24) return;
  await go("GET", "/changes/new");
  t += 30_000 + rnd() * rnd() * 600_000;
  if (rnd() < 0.1) return;
  const field = rnd() < 0.6 ? "address" : "email";
  let value = field === "address" ? (rnd() < 0.3 ? "12 Main Street, Springfield" : "12 Main Street, 75011 Springfield") : `m${member}@example.org`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await go("POST", "/changes", { field, value });
    if (r.status === 201) return;
    if (r.status === 422) {
      if (rnd() < 0.3) return;
      t += 20_000 + rnd() * 120_000;
      value = "12 Main Street, 75011 Springfield";
    } else {
      if (rnd() < 0.5) return;
      t += 60_000;
    }
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

export async function simulate() {
  const rnd = seeded(2029);
  const { rows: members } = await db.query<{ id: number }>("SELECT id FROM members ORDER BY id");
  // 55% of members never come; the others visit on 20-60% of days
  const propensity = new Map(members.map((m) => [m.id, rnd() < 0.55 ? 0 : 0.2 + rnd() * 0.4]));
  const visits: { member: number; start: number; seed: number }[] = [];
  for (let day = WINDOW.from.getTime(); day < WINDOW.to.getTime(); day += DAY) {
    for (const m of members) {
      if (rnd() < propensity.get(m.id)!) visits.push({ member: m.id, start: day + (7 + rnd() * 15) * 3_600_000, seed: visits.length + 1 });
    }
  }
  const probes: number[] = [];
  for (let at = WINDOW.from.getTime(); at < WINDOW.to.getTime(); at += 3_600_000) probes.push(at);
  await pool(probes, 16, async (at) => void (await call("GET", "/health", at)));
  await pool(visits, 16, (v) => visit(v.member, v.start, v.seed));

  // staff work the queue: most requests within a day or two, a tail that waits for the weekly batch
  const { rows: requests } = await db.query<{ id: number; submitted_at: Date }>("SELECT id, submitted_at FROM change_requests ORDER BY submitted_at, member_id");
  let resolved = 0;
  for (const r of requests) {
    const delay = rnd() < 0.82 ? 2 * 3_600_000 + rnd() * 2.5 * DAY : 3.2 * DAY + rnd() * 4 * DAY;
    const at = r.submitted_at.getTime() + delay;
    if (at >= WINDOW.to.getTime()) continue;
    await call("POST", `/staff/changes/${r.id}/resolve`, at);
    resolved++;
  }
  return { visits: visits.length, probes: probes.length, requests: requests.length, resolved };
}
