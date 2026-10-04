import { check } from "./check.js";
import { open, seal } from "./crypto.js";
import { closeAll, db } from "./db.js";
import { append, fieldAad, format, readEvents } from "./events.js";
import { blindIndex, createSubject, findSubject, loadDek } from "./keys.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function attempt(label: string, fn: () => Buffer) {
  try {
    console.log(`   ${label}: ok, "${fn().toString()}"`);
    return true;
  } catch (err) {
    console.log(`   ${label}: rejected, ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main() {
  step("1. One data key per subject, wrapped by the KEK", "each customer gets a random 256-bit DEK; the key store keeps it only wrapped (encrypted) by a KEK held in the KMS");
  const alice = await createSubject("alice@example.com");
  const bob = await createSubject("bob@example.com");
  console.log(`   alice -> subject ${alice.subjectId}, DEK wrapped by KEK ${alice.kekId}`);
  console.log(`   bob   -> subject ${bob.subjectId}, DEK wrapped by KEK ${bob.kekId}`);
  const stored = await db("keys").query<{ wrapped_dek: string }>("SELECT wrapped_dek FROM subject_keys");
  const raw = [alice.dek, bob.dek].map((k) => k.toString("base64"));
  check("the key store holds one wrapped DEK per subject, never the plaintext key", stored.rowCount === 2 && stored.rows.every((r) => !raw.some((k) => r.wrapped_dek.includes(k))));
  step("2. PII encrypted, the rest in clear", "name, email and address are AES-256-GCM ciphertext under the subject's DEK; event type, order and amount stay queryable");
  const writes: [typeof alice, string, Record<string, string>, Record<string, string>][] = [
    [alice, "CustomerRegistered", {}, { name: "Alice Martin", email: "alice@example.com" }],
    [bob, "CustomerRegistered", {}, { name: "Bob Keller", email: "bob@example.com" }],
    [alice, "OrderPlaced", { order: "A-1", amount: "42.50" }, { ship_to: "12 rue des Lilas, Lyon" }],
    [bob, "OrderPlaced", { order: "B-1", amount: "19.90" }, { ship_to: "3 Hauptstrasse, Bern" }],
    [alice, "OrderPlaced", { order: "A-2", amount: "7.00" }, { ship_to: "12 rue des Lilas, Lyon" }],
  ];
  for (const [s, type, data, pii] of writes) {
    const id = await append(s.subjectId, s.dek, type, data, pii);
    console.log(`   events <- #${id} ${s.subjectId.slice(0, 8)} ${type} ${JSON.stringify(data)} encrypted: ${Object.keys(pii).join(", ")}`);
  }
  const table = await db("events").query<{ data: string; pii: string }>("SELECT data::text, pii::text FROM events");
  check("the events table holds no plaintext PII, but the amounts are in clear", table.rows.every((r) => !/Alice|Bob|example\.com|Lilas|Hauptstrasse/.test(r.pii)) && table.rows.some((r) => r.data.includes("42.50")));
  step("3. Lookup by email through a blind index", "ciphertext cannot be indexed, so the key store keeps HMAC(blind-index key, normalized email) -> subject");
  const hash = await blindIndex(" Alice@Example.COM ");
  const found = await findSubject(" Alice@Example.COM ");
  console.log(`   " Alice@Example.COM " -> hmac ${hash.toString("hex").slice(0, 16)}... -> subject ${found}`);
  const hers = await readEvents("events", "keys", found ?? undefined);
  for (const e of hers) console.log(`   ${format(e)}`);
  check("a messy spelling of alice's email finds her subject through the blind index; her 3 events decrypt", found === alice.subjectId && hers.length === 3 && hers[0].pii.name === "Alice Martin");
  step("4. A fresh IV for every encryption", "same key, same plaintext, different ciphertext: equal values cannot be spotted, and GCM never reuses a nonce under one key");
  const sealed = [1, 2].map(() => seal(alice.dek, Buffer.from("alice@example.com"), fieldAad(alice.subjectId, "email")));
  sealed.forEach((c, i) => console.log(`   seal("alice@example.com") #${i + 1} = ${c.slice(0, 32)}...`));
  check("sealing the same value twice gives two different ciphertexts", sealed[0] !== sealed[1]);
  step("5. AAD binds each ciphertext to its subject and field", "the AAD (subject id + field name) is authenticated, not stored: a ciphertext moved elsewhere, or edited, fails to decrypt");
  const { rows } = await db("events").query<{ subject_id: string; pii: Record<string, string> }>("SELECT subject_id, pii FROM events WHERE type = 'CustomerRegistered' ORDER BY id");
  const [aliceEmail, bobEmail] = rows.map((r) => r.pii.email);
  const aliceDek = await loadDek(alice.subjectId);
  if (!aliceDek) throw new Error("alice has no key");
  const flipped = Buffer.from(aliceEmail, "base64");
  flipped[flipped.length - 1] ^= 1;
  const right = attempt("alice's email, read as alice's email", () => open(aliceDek, aliceEmail, fieldAad(alice.subjectId, "email")));
  const wrong = [
    attempt("alice's email ciphertext, pasted into her name field", () => open(aliceDek, aliceEmail, fieldAad(alice.subjectId, "name"))),
    attempt("bob's email ciphertext, pasted into alice's email (wrong DEK and wrong AAD)", () => open(aliceDek, bobEmail, fieldAad(alice.subjectId, "email"))),
    attempt("alice's email with one bit flipped", () => open(aliceDek, flipped.toString("base64"), fieldAad(alice.subjectId, "email"))),
  ];
  check("the right ciphertext in the right place decrypts; moved, swapped or edited ciphertext is rejected", right && wrong.every((ok) => !ok));
  await closeAll();
}

main();
