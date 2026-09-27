import { createHash } from "node:crypto";
import { Node, Shard } from "./topology.js";

export type Result = { node: string; rows: Record<string, unknown>[] };

export class Router {
  private cursors = new Map<number, number>();

  constructor(readonly shards: Shard[]) {}

  shardFor(key: string): Shard {
    return this.shards[createHash("md5").update(key).digest().readUInt32BE(0) % this.shards.length];
  }

  async write(key: string, sql: string, params: unknown[] = []): Promise<Result> {
    const { primary } = this.shardFor(key);
    const { rows } = await primary.pool.query(sql, params);
    return { node: primary.name, rows };
  }

  async read(key: string, sql: string, params: unknown[] = []): Promise<Result> {
    const shard = this.shardFor(key);
    const errors: string[] = [];
    for (const node of this.rotation(shard)) {
      try {
        const { rows } = await node.pool.query(sql, params);
        return { node: node.name, rows };
      } catch (err) {
        errors.push(`${node.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`no replica of shard ${shard.id} answered (${errors.join("; ")})`);
  }

  private rotation(shard: Shard): Node[] {
    const start = this.cursors.get(shard.id) ?? 0;
    this.cursors.set(shard.id, start + 1);
    return shard.replicas.map((_, i) => shard.replicas[(start + i) % shard.replicas.length]);
  }
}
