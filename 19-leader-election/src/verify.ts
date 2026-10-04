import { check } from "./check.js";
import { db } from "./db.js";

type Tick = { id: number; holder: string; term: number; at: number };

const ticks = async (table: string) =>
  (await db.query<Tick>(`SELECT id::int, holder, term, extract(epoch FROM at)::float8 AS at FROM ${table} ORDER BY id`)).rows;

// State checks between the steps of the run script: `verify no-election`, `verify lease`, then `verify terms` after step 6.
async function main() {
  const mode = process.argv[2];
  if (mode === "no-election") {
    const { rows } = await db.query("SELECT date_trunc('second', at) AS s, count(*)::int AS runs, count(DISTINCT holder)::int AS holders FROM ticks GROUP BY 1");
    const replicas = await db.query("SELECT count(DISTINCT holder)::int AS n FROM ticks");
    check("without election all 3 replicas run the job, so it fires several times in the same second", replicas.rows[0].n === 3 && rows.some((r) => r.runs >= 2 && r.holders >= 2));
  } else if (mode === "lease") {
    const lease = await db.query("SELECT holder, term, extract(epoch FROM expires_at - renewed_at)::float8 AS ttl FROM leases");
    const writers = await db.query("SELECT DISTINCT holder, term FROM ticks");
    check("one lease row; its holder is the only replica that ran the job, in term 1", lease.rowCount === 1 && lease.rows[0].term === 1 && writers.rows.length === 1 && writers.rows[0].holder === lease.rows[0].holder && writers.rows[0].term === 1);
    check("expires_at is renewed_at + the 3s TTL, both from the database clock", lease.rows[0].ttl === 3);
  } else {
    const all = await ticks("ticks");
    const fenced = await ticks("fenced_ticks");
    const holders = (rows: Tick[]) => {
      const byTerm = new Map<number, Set<string>>();
      for (const t of rows) byTerm.set(t.term, (byTerm.get(t.term) ?? new Set()).add(t.holder));
      return byTerm;
    };
    const terms = holders(all);
    check("there is never more than one leader per term (terms 1 to 5, in ticks and in fenced_ticks)", [...terms.keys()].sort().join() === "1,2,3,4,5" && [...terms.values(), ...holders(fenced).values()].every((h) => h.size === 1));
    const first = (term: number) => all.find((t) => t.term === term)!;
    const last = (term: number, before = Infinity) => all.filter((t) => t.term === term && t.id < before).pop()!;
    const gap = (term: number) => first(term).at - last(term - 1, first(term).id).at;
    check(`after kill -9 nobody ran the job until the lease expired (${gap(2).toFixed(1)}s gap, TTL 3s)`, gap(2) >= 2);
    check("the leader paused after its renew wrote nothing once term 3 began (self-fenced)", !all.some((t) => t.term === 2 && t.id > first(3).id));
    check("ticks took the stale term-3 write after term 4 began: two leaders wrote", all.some((t) => t.term === 3 && t.id > first(4).id));
    check("fenced_ticks never went back to a lower term: the stale write was rejected", fenced.every((t, i) => i === 0 || t.term >= fenced[i - 1].term) && fenced.some((t) => t.term === 4));
    check(`after SIGTERM the follower took over before the TTL (${gap(5).toFixed(1)}s gap)`, gap(5) < 2);
    const lease = await db.query("SELECT term FROM leases");
    const fence = await db.query("SELECT max_term FROM fence");
    check("the lease ended at term 5, and the fence has seen term 5", lease.rows[0].term === 5 && fence.rows[0].max_term === 5);
  }
  await db.end();
}

main();
