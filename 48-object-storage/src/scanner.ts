// The scan step, a separate worker: it claims objects that landed in quarantine/, reads them from storage (not from the app),
// and moves each one to clean/ or rejected/. A fake engine: it only knows the EICAR test string, the industry's harmless test file.
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { db } from "./db.js";
import { EICAR } from "./eicar.js";
import { BUCKET, s3 } from "./s3.js";

// Streams the object and looks for the signature, keeping a tail so a match split across two chunks is still found.
async function scan(key: string): Promise<{ verdict: string | null; bytes: number }> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  let tail = "";
  let bytes = 0;
  for await (const chunk of obj.Body as Readable) {
    bytes += chunk.length;
    const text = tail + chunk.toString("latin1");
    if (text.includes(EICAR)) {
      (obj.Body as Readable).destroy();
      return { verdict: "EICAR test signature", bytes };
    }
    tail = text.slice(-EICAR.length);
  }
  return { verdict: null, bytes };
}

async function scanOne(): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // SKIP LOCKED: several scanner workers can run side by side without scanning the same object twice.
    const { rows } = await client.query("SELECT id, key FROM uploads WHERE status = 'uploaded' ORDER BY uploaded_at LIMIT 1 FOR UPDATE SKIP LOCKED");
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    const { id, key } = rows[0];
    const started = Date.now();
    const { verdict, bytes } = await scan(key);
    const target = `${verdict ? "rejected" : "clean"}/${id}`;
    // Promote or reject: copy to the new prefix, then delete from quarantine. Only clean/ is ever presigned for download.
    await s3.send(new CopyObjectCommand({ Bucket: BUCKET, Key: target, CopySource: `${BUCKET}/${key}` }));
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    await client.query("UPDATE uploads SET status = $2, verdict = $3, key = $4, scanned_at = now() WHERE id = $1", [id, verdict ? "rejected" : "clean", verdict, target]);
    await client.query("COMMIT");
    console.log(`[scanner] ${key} -> ${target} (${verdict ?? "no signature found"}, ${bytes} bytes read in ${Date.now() - started} ms)`);
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

let running = true;
process.on("SIGTERM", () => (running = false));
console.log("[scanner] watching quarantine/");
while (running) if (!(await scanOne())) await sleep(150);
await db.end();
