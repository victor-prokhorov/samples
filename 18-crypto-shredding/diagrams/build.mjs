// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "18. Crypto-shredding: erase a person by deleting one key")
  .box("app", 40, 140, 180, 100, "App\nseals each PII\nfield with AAD\nsubjectId:field")
  .box("events", 300, 130, 320, 120, "events (append-only)\ntype, order, amount in clear;\nname, email, address =\nAES-256-GCM under alice's DEK")
  .box("backup", 300, 320, 320, 80, "Backup, replicas, Kafka:\nthe same ciphertext")
  .box("keys", 720, 130, 320, 120, "keys database\nsubject_keys: one wrapped\nDEK per subject\nsubject_lookup: HMAC(email)", { bold: true })
  .box("kms", 720, 320, 320, 80, "kms database (a KMS stand-in)\nKEK wraps every DEK")
  .box("erase", 1120, 140, 200, 100, "erase alice:\nDELETE her\nkey row", { bold: true })
  .arrow("app", "events")
  .arrow("keys", "app", { label: "DEK", via: [[880, 100], [130, 100]] })
  .arrow("events", "backup", { label: "copies" })
  .arrow("keys", "kms", { label: "unwrap" })
  .arrow("erase", "keys")
  .box("after", 40, 470, 580, 80, "Afterwards alice reads <erased> everywhere, the restored\nbackup included; bob is unchanged; 49.50 over 3 events still adds up")
  .box("trap", 720, 470, 600, 80, "Trap: restoring an old key-store backup brings alice back.\nKeep its backups short-lived, or replay an erasure log.", { dashed: true })
  .text(40, 580, "Envelope encryption: rotating the KEK rewraps the DEKs only; not one event is re-encrypted.\nOut of scope: plaintext copies made earlier (logs, caches, exports) and identifying metadata left in clear.")
  .write(dirname(fileURLToPath(import.meta.url)));
