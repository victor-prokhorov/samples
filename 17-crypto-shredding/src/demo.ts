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
  } catch (err) {
    console.log(`   ${label}: rejected, ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  step("1. One data key per subject, wrapped by the KEK", "each customer gets a random 256-bit DEK; the key store keeps it only wrapped (encrypted) by a KEK held in the KMS");
  const alice = await createSubject("alice@example.com");
  const bob = await createSubject("bob@example.com");
  console.log(`   alice -> subject ${alice.subjectId}, DEK wrapped by KEK ${alice.kekId}`);
  console.log(`   bob   -> subject ${bob.subjectId}, DEK wrapped by KEK ${bob.kekId}`);
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
  step("3. Lookup by email through a blind index", "ciphertext cannot be indexed, so the key store keeps HMAC(blind-index key, normalized email) -> subject");
  const hash = await blindIndex(" Alice@Example.COM ");
  const found = await findSubject(" Alice@Example.COM ");
  console.log(`   " Alice@Example.COM " -> hmac ${hash.toString("hex").slice(0, 16)}... -> subject ${found}`);
  for (const e of await readEvents("events", "keys", found ?? undefined)) console.log(`   ${format(e)}`);
  step("4. A fresh IV for every encryption", "same key, same plaintext, different ciphertext: equal values cannot be spotted, and GCM never reuses a nonce under one key");
  for (let i = 1; i <= 2; i++) console.log(`   seal("alice@example.com") #${i} = ${seal(alice.dek, Buffer.from("alice@example.com"), fieldAad(alice.subjectId, "email")).slice(0, 32)}...`);
  step("5. AAD binds each ciphertext to its subject and field", "the AAD (subject id + field name) is authenticated, not stored: a ciphertext moved elsewhere, or edited, fails to decrypt");
  const { rows } = await db("events").query<{ subject_id: string; pii: Record<string, string> }>("SELECT subject_id, pii FROM events WHERE type = 'CustomerRegistered' ORDER BY id");
  const [aliceEmail, bobEmail] = rows.map((r) => r.pii.email);
  const aliceDek = await loadDek(alice.subjectId);
  if (!aliceDek) throw new Error("alice has no key");
  const flipped = Buffer.from(aliceEmail, "base64");
  flipped[flipped.length - 1] ^= 1;
  attempt("alice's email, read as alice's email", () => open(aliceDek, aliceEmail, fieldAad(alice.subjectId, "email")));
  attempt("alice's email ciphertext, pasted into her name field", () => open(aliceDek, aliceEmail, fieldAad(alice.subjectId, "name")));
  attempt("bob's email ciphertext, pasted into alice's email (wrong DEK and wrong AAD)", () => open(aliceDek, bobEmail, fieldAad(alice.subjectId, "email")));
  attempt("alice's email with one bit flipped", () => open(aliceDek, flipped.toString("base64"), fieldAad(alice.subjectId, "email")));
  await closeAll();
}

main();
