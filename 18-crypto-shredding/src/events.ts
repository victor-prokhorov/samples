import { open, seal } from "./crypto.js";
import { db } from "./db.js";
import { loadDek } from "./keys.js";

export type Fields = Record<string, string>;

export type StoredEvent = { id: string; subject_id: string; type: string; data: Fields; pii: Fields };

export const ERASED = "<erased>";

export const fieldAad = (subjectId: string, field: string) => `${subjectId}:${field}`;

export async function append(subjectId: string, dek: Buffer, type: string, data: Fields, pii: Fields) {
  const sealed = Object.fromEntries(Object.entries(pii).map(([field, value]) => [field, seal(dek, Buffer.from(value), fieldAad(subjectId, field))]));
  const { rows } = await db("events").query<{ id: string }>("INSERT INTO events (subject_id, type, data, pii) VALUES ($1, $2, $3, $4) RETURNING id", [subjectId, type, data, sealed]);
  return rows[0].id;
}

export async function readEvents(eventsDb = "events", keysDb = "keys", subjectId?: string) {
  const { rows } = await db(eventsDb).query<StoredEvent>(
    "SELECT id, subject_id, type, data, pii FROM events WHERE $1::uuid IS NULL OR subject_id = $1 ORDER BY id",
    [subjectId ?? null],
  );
  const deks = new Map<string, Buffer | null>();
  const result: StoredEvent[] = [];
  for (const e of rows) {
    if (!deks.has(e.subject_id)) deks.set(e.subject_id, await loadDek(e.subject_id, keysDb));
    const dek = deks.get(e.subject_id);
    const pii = Object.fromEntries(Object.entries(e.pii).map(([field, sealed]) => [field, dek ? open(dek, sealed, fieldAad(e.subject_id, field)).toString() : ERASED]));
    result.push({ ...e, pii });
  }
  return result;
}

export function format(e: StoredEvent) {
  const fields = (f: Fields) => Object.entries(f).map(([k, v]) => `${k}=${v}`).join(" ");
  return `#${e.id} ${e.subject_id.slice(0, 8)} ${e.type.padEnd(18)} ${fields(e.data).padEnd(24)} | ${fields(e.pii)}`;
}
