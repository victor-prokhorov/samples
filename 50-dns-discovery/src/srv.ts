// SRV records (RFC 2782): DNS gives the port and a share of the traffic for each instance, not just an address.
import { Resolver, promises as dns } from "node:dns";
import { promisify } from "node:util";
import { get } from "./clients.js";

export type Srv = { priority: number; weight: number; port: number; name: string };

let resolver: { resolveSrv(name: string): Promise<Srv[]> } | undefined;

// CoreDNS is a container too: find its address through Docker's DNS, then ask it directly.
export async function srvResolver() {
  if (!resolver) {
    const [ip] = await dns.resolve4("coredns");
    const r = new Resolver({ timeout: 1000, tries: 2 });
    r.setServers([ip]);
    resolver = { resolveSrv: promisify(r.resolveSrv.bind(r)) };
  }
  return resolver;
}

// RFC 2782 selection: the lowest priority first; within a priority, weighted random. Returns the order to try.
export function order(records: Srv[]): Srv[] {
  const out: Srv[] = [];
  for (const p of [...new Set(records.map((r) => r.priority))].sort((a, b) => a - b)) {
    const left = records.filter((r) => r.priority === p);
    while (left.length) {
      const total = left.reduce((s, r) => s + r.weight, 0);
      let n = Math.random() * total;
      const i = Math.max(0, left.findIndex((r) => (n -= r.weight) < 0));
      out.push(...left.splice(i, 1));
    }
  }
  return out;
}

export async function srvGet(name: string) {
  const records = await (await srvResolver()).resolveSrv(name);
  const tried: string[] = [];
  for (const r of order(records)) {
    tried.push(`${r.name}:${r.port}`);
    try {
      // The target is a hostname: resolve it like any other name. A stopped container's name no longer resolves.
      const [ip] = await dns.resolve4(r.name);
      const res = await get(ip, r.port, { timeoutMs: 500 });
      return { ok: true as const, target: `${r.name}:${r.port}`, replica: res.replica, tried };
    } catch {
      // try the next target in RFC 2782 order
    }
  }
  return { ok: false as const, target: "", replica: "", tried };
}
