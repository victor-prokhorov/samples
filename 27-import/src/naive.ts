import { readFile } from "node:fs/promises";
import { db } from "./db.js";

// What a first version usually looks like: split lines, one autocommitted INSERT per row, no key, no batch.
export async function naiveImport(path: string) {
  const lines = (await readFile(path, "utf8")).trim().split("\n").slice(1);
  let inserted = 0;
  for (const [i, line] of lines.entries()) {
    const [employer, member_no, period, amount] = line.split(",");
    try {
      await db.query("INSERT INTO naive_contributions (employer, member_no, period, amount) VALUES ($1, $2, $3, $4)", [employer, member_no, period, amount]);
    } catch (err) {
      return { inserted, error: `line ${i + 2}: ${(err as Error).message}` };
    }
    inserted++;
  }
  return { inserted, error: null };
}
