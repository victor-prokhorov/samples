import pg from "pg";

const URL = "postgres://postgres:postgres@localhost:55443/postgres";

export type Level = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

export const db = new pg.Pool({ connectionString: URL });

export function isSerializationFailure(err: unknown) {
  return err instanceof pg.DatabaseError && (err.code === "40001" || err.code === "40P01");
}

export function isUniqueViolation(err: unknown) {
  return err instanceof pg.DatabaseError && err.code === "23505";
}

export async function tx<T>(c: pg.Client, level: Level, fn: () => Promise<T>): Promise<T> {
  await c.query(`BEGIN ISOLATION LEVEL ${level}`);
  try {
    const result = await fn();
    await c.query("COMMIT");
    return result;
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  }
}

export async function withRetry<T>(fn: () => Promise<T>, onRetry: (err: unknown) => void): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isSerializationFailure(err) || attempt >= 50) throw err;
      onRetry(err);
      await new Promise((r) => setTimeout(r, Math.random() * 50));
    }
  }
}

export async function race<T>(n: number, fn: (c: pg.Client, i: number) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  const clients = await Promise.all(
    Array.from({ length: n }, async () => {
      const c = new pg.Client({ connectionString: URL });
      await c.connect();
      return c;
    }),
  );
  const results = await Promise.allSettled(clients.map((c, i) => fn(c, i)));
  await Promise.all(clients.map((c) => c.end()));
  return results;
}
