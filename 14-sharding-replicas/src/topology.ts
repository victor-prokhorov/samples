import { execFileSync } from "node:child_process";
import pg from "pg";

export type Node = { name: string; pool: pg.Pool };
export type Shard = { id: number; primary: Node; replicas: Node[] };

type Publisher = { TargetPort: number; PublishedPort: number };
type Container = { Service: string; State: string; Labels: string; Publishers: Publisher[] | null };

const PRIMARY_PORTS = [55441, 55442];

function isContainer(v: unknown): v is Container {
  return typeof v === "object" && v !== null && "Service" in v && "State" in v && "Labels" in v && "Publishers" in v;
}

function pool(port: number) {
  return new pg.Pool({ connectionString: `postgres://postgres:postgres@localhost:${port}/postgres`, connectionTimeoutMillis: 2000, max: 2 });
}

export function runningContainers(): Container[] {
  const out = execFileSync("docker", ["compose", "ps", "--format", "json"], { encoding: "utf8" });
  const parsed: unknown[] = out.split("\n").filter((l) => l.trim()).flatMap((l) => {
    const v: unknown = JSON.parse(l);
    return Array.isArray(v) ? v : [v];
  });
  return parsed.filter(isContainer).filter((c) => c.State === "running");
}

function containerNumber(c: Container) {
  return /com\.docker\.compose\.container-number=(\d+)/.exec(c.Labels)?.[1] ?? "?";
}

export function discover(): Shard[] {
  const containers = runningContainers();
  const shards = PRIMARY_PORTS.map((port, id) => ({
    id,
    primary: { name: `shard${id}-primary`, pool: pool(port) },
    replicas: containers
      .filter((c) => c.Service === `shard${id}-replica`)
      .map((c) => ({ name: `${c.Service}-${containerNumber(c)}`, port: c.Publishers?.find((p) => p.TargetPort === 5432)?.PublishedPort }))
      .filter((r): r is { name: string; port: number } => r.port !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((r) => ({ name: r.name, pool: pool(r.port) })),
  }));
  const empty = shards.find((s) => s.replicas.length === 0);
  if (empty) throw new Error(`no running replica found for shard ${empty.id} (docker compose ps)`);
  return shards;
}

export function closeAll(shards: Shard[]) {
  return Promise.all(shards.flatMap((s) => [s.primary, ...s.replicas]).map((n) => n.pool.end()));
}
