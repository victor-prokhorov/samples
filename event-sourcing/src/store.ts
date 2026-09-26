import pg from "pg";

export type StoredEvent<E> = { streamId: string; version: number; event: E; at: Date };

export class ConcurrencyError extends Error {}

export const pool = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55433/postgres" });

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      global_position BIGSERIAL PRIMARY KEY,
      stream_id TEXT NOT NULL,
      version INT NOT NULL,
      type TEXT NOT NULL,
      data JSONB NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (stream_id, version)
    )`);
}

export async function readStream<E extends { type: string }>(streamId: string): Promise<StoredEvent<E>[]> {
  const { rows } = await pool.query(
    "SELECT stream_id, version, type, data, at FROM events WHERE stream_id = $1 ORDER BY version",
    [streamId],
  );
  return rows.map((r) => ({ streamId: r.stream_id, version: r.version, event: { type: r.type, ...r.data }, at: r.at }));
}

export async function append<E extends { type: string }>(streamId: string, expectedVersion: number, events: E[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [i, { type, ...data }] of events.entries()) {
      await client.query("INSERT INTO events (stream_id, version, type, data) VALUES ($1, $2, $3, $4)", [
        streamId,
        expectedVersion + i + 1,
        type,
        data,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof pg.DatabaseError && err.code === "23505") throw new ConcurrencyError(`stream ${streamId} moved past v${expectedVersion}`);
    throw err;
  } finally {
    client.release();
  }
}
