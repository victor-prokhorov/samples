import { randomUUID } from "node:crypto";
import { hmac, newKey, open, seal } from "./crypto.js";
import { db, tx } from "./db.js";

type KmsKey = { id: number; key: Buffer };

async function kmsKey(purpose: "kek" | "blind-index", id?: number) {
  const { rows } = await db("kms").query<KmsKey>(
    "SELECT version AS id, key FROM kms_keys WHERE purpose = $1 AND ($2::int IS NULL OR version = $2) ORDER BY version DESC LIMIT 1",
    [purpose, id ?? null],
  );
  return rows[0];
}

const dekAad = (subjectId: string) => `dek:${subjectId}`;

export async function blindIndex(email: string) {
  return hmac((await kmsKey("blind-index")).key, email.trim().toLowerCase());
}

export async function createSubject(email: string) {
  const subjectId = randomUUID();
  const dek = newKey();
  const kek = await kmsKey("kek");
  const emailHash = await blindIndex(email);
  await tx(db("keys"), async (c) => {
    await c.query("INSERT INTO subject_keys (subject_id, wrapped_dek, kek_id) VALUES ($1, $2, $3)", [subjectId, seal(kek.key, dek, dekAad(subjectId)), kek.id]);
    await c.query("INSERT INTO subject_lookup (email_hash, subject_id) VALUES ($1, $2)", [emailHash, subjectId]);
  });
  return { subjectId, dek, kekId: kek.id };
}

export async function findSubject(email: string, keysDb = "keys") {
  const { rows } = await db(keysDb).query<{ subject_id: string }>("SELECT subject_id FROM subject_lookup WHERE email_hash = $1", [await blindIndex(email)]);
  return rows[0]?.subject_id ?? null;
}

export async function loadDek(subjectId: string, keysDb = "keys") {
  const { rows } = await db(keysDb).query<{ wrapped_dek: string; kek_id: number }>("SELECT wrapped_dek, kek_id FROM subject_keys WHERE subject_id = $1", [subjectId]);
  if (!rows[0]) return null;
  return open((await kmsKey("kek", rows[0].kek_id)).key, rows[0].wrapped_dek, dekAad(subjectId));
}

export async function erase(email: string) {
  const subjectId = await findSubject(email);
  if (!subjectId) return null;
  await db("keys").query("DELETE FROM subject_keys WHERE subject_id = $1", [subjectId]);
  return subjectId;
}

export async function rotateKek() {
  const { rows } = await db("kms").query<{ id: number }>("INSERT INTO kms_keys (purpose, version, key) SELECT 'kek', max(version) + 1, $1 FROM kms_keys WHERE purpose = 'kek' RETURNING version AS id", [newKey()]);
  const next = await kmsKey("kek", rows[0].id);
  return tx(db("keys"), async (c) => {
    const { rows: keys } = await c.query<{ subject_id: string; wrapped_dek: string; kek_id: number }>("SELECT subject_id, wrapped_dek, kek_id FROM subject_keys FOR UPDATE");
    for (const k of keys) {
      const dek = open((await kmsKey("kek", k.kek_id)).key, k.wrapped_dek, dekAad(k.subject_id));
      await c.query("UPDATE subject_keys SET wrapped_dek = $2, kek_id = $3 WHERE subject_id = $1", [k.subject_id, seal(next.key, dek, dekAad(k.subject_id)), next.id]);
    }
    return { to: next.id, rewrapped: keys.length };
  });
}
