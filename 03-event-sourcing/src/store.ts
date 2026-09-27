import pg from "pg";

/**
 * Event store (CQRS/ES, Young): an append-only log of domain events, partitioned into streams (one per aggregate
 * instance). A stored event is the domain event wrapped in an envelope: stream id, stream revision (`version`),
 * timestamp. `global_position` is the all-streams order used by subscriptions and projections.
 */
export type StoredEvent<E> = { streamId: string; version: number; event: E; at: Date };

/**
 * Optimistic concurrency violation, a.k.a. "wrong expected version": another writer appended to the stream after
 * we read it, so our decision was made on stale state. The caller reloads, re-decides, and retries.
 */
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

/** Read a stream forward from revision 1: the input to rehydration. */
export async function readStream<E extends { type: string }>(streamId: string): Promise<StoredEvent<E>[]> {
  const { rows } = await pool.query(
    "SELECT stream_id, version, type, data, at FROM events WHERE stream_id = $1 ORDER BY version",
    [streamId],
  );
  return rows.map((r) => ({ streamId: r.stream_id, version: r.version, event: { type: r.type, ...r.data }, at: r.at }));
}

/**
 * Append with expected version (optimistic concurrency control): the new events are written at
 * expectedVersion + 1..n in one transaction, and UNIQUE (stream_id, version) rejects the write if the stream moved.
 * The events of one command commit atomically or not at all.
 */
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
