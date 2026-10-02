# 18-crypto-shredding

**Pain: erasure versus immutable data.** GDPR's right to erasure says a customer's personal data must go, but it sits in places you must not or cannot rewrite: an append-only event log (03), an append-only audit store (17), Kafka topics, and every backup taken since.

**Reach for it when** personal data lands in stores that are append-only, replicated or backed up for years, and erasing a person must reach every copy without rewriting any of them.

**Do not reach for it when** the data lives in one mutable table you can `DELETE` from and your backups expire within the erasure deadline: a plain delete is simpler. You need to search, sort or aggregate on the personal fields in the database: ciphertext supports none of that beyond exact-match blind indexes. The identifying part is the metadata (amounts, timestamps, locations): encryption of the named fields does not make the rest anonymous. Your counsel does not accept key deletion as erasure (EU guidance treats encrypted personal data as still personal data): keep the PII in a deletable side store the events point to (forgettable payloads) instead.

Each customer (data subject) gets a random data key (DEK). Personal fields in the append-only `events` table are AES-256-GCM ciphertext under that DEK; the rest stays in clear. DEKs live in a separate `keys` database, wrapped by a key-encryption key (KEK) from a `kms` database standing in for a KMS (envelope encryption). Erasing a customer deletes one key row: every copy of their events, including backups, becomes unreadable.

```sh
docker compose up -d --wait
npm i
npm run setup                        # databases events, keys, kms
npm run demo                         # two customers, encrypted events, blind index, IV and AAD checks
npm run rotate                       # new KEK, DEKs rewrapped, events untouched
npm run erase -- alice@example.com   # delete alice's DEK
npm run read -- --email alice@example.com   # read everything back (add --events / --keys to read restored copies)
```

- `src/crypto.ts` AES-256-GCM `seal`/`open` (random 12-byte IV, AAD) and HMAC.
- `src/keys.ts` the key store: per-subject DEKs wrapped by the current KEK, the email blind index, erase, KEK rotation.
- `src/events.ts` append with PII sealed per field under `subjectId:field`; read decrypts or shows `<erased>`.
- The key store's backups undo the erasure; the run restores one to show it.

One-shot run with proof: `../run-18-crypto-shredding.sh` (log in `../logs/18-crypto-shredding.log`). Concepts explained in `../README.md`.
