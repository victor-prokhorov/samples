import { Node, Shard } from "./topology.js";

export async function primaryLsn(shard: Shard): Promise<string> {
  const { rows } = await shard.primary.pool.query("SELECT pg_current_wal_lsn()::text AS lsn");
  return rows[0].lsn;
}

export async function waitForReplay(nodes: Node[], lsn: string) {
  for (const node of nodes) {
    for (let i = 0; ; i++) {
      const { rows } = await node.pool.query("SELECT pg_last_wal_replay_lsn() >= $1::pg_lsn AS done", [lsn]);
      if (rows[0].done) break;
      if (i > 200) throw new Error(`${node.name} did not replay ${lsn}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

export async function waitForReceive(node: Node, lsn: string) {
  for (let i = 0; ; i++) {
    const { rows } = await node.pool.query("SELECT pg_last_wal_receive_lsn() >= $1::pg_lsn AS done", [lsn]);
    if (rows[0].done) return;
    if (i > 200) throw new Error(`${node.name} did not receive ${lsn}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
