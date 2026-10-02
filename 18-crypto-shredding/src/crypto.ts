import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export function newKey() {
  return randomBytes(32);
}

export function seal(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function open(key: Buffer, sealed: string, aad: string) {
  const buf = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

export function hmac(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}
