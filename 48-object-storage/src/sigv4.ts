// AWS Signature Version 4 verification, the part s3rver skips ("Signature version 4 calculation is unimplemented").
// The gate in storage.ts calls verify() on every request before s3rver sees it, so a presigned URL is checked the way S3 checks it:
// expiry from X-Amz-Date + X-Amz-Expires, then the signature recomputed over method, path, query and every signed header.
// A changed Content-Type or Content-Length, a different key, or a tampered expiry all change the canonical request, so the signature no longer matches.
// Spec: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export type Verdict = { ok: true; accessKeyId: string; mode: "query" | "header" } | { ok: false; status: number; code: string; message: string };

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
// RFC 3986 unreserved characters stay, everything else is percent-encoded (encodeURIComponent leaves !'()* alone).
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function parseQuery(raw: string): [string, string][] {
  if (!raw) return [];
  return raw.split("&").map((pair) => {
    const i = pair.indexOf("=");
    const k = i < 0 ? pair : pair.slice(0, i);
    const v = i < 0 ? "" : pair.slice(i + 1);
    return [decodeURIComponent(k.replace(/\+/g, " ")), decodeURIComponent(v.replace(/\+/g, " "))];
  });
}

function amzDate(s: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

const deny = (code: string, message: string, status = 403): Verdict => ({ ok: false, status, code, message });

export function verify(method: string, url: string, headers: IncomingHttpHeaders, secrets: Map<string, string>, now = new Date()): Verdict {
  const q = url.indexOf("?");
  const path = q < 0 ? url : url.slice(0, q);
  const query = parseQuery(q < 0 ? "" : url.slice(q + 1));
  const get = (name: string) => query.find(([k]) => k === name)?.[1];

  let mode: "query" | "header";
  let credential: string, signedHeaders: string, signature: string, date: string, payloadHash: string;
  const auth = headers.authorization;
  if (get("X-Amz-Signature") !== undefined) {
    mode = "query";
    if (get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256") return deny("AuthorizationQueryParametersError", "X-Amz-Algorithm must be AWS4-HMAC-SHA256", 400);
    credential = get("X-Amz-Credential") ?? "";
    signedHeaders = get("X-Amz-SignedHeaders") ?? "";
    signature = get("X-Amz-Signature") ?? "";
    date = get("X-Amz-Date") ?? "";
    payloadHash = get("X-Amz-Content-Sha256") ?? "UNSIGNED-PAYLOAD";
    const expires = Number(get("X-Amz-Expires"));
    const issued = amzDate(date);
    if (!issued || !Number.isInteger(expires) || expires < 1 || expires > 604800) return deny("AuthorizationQueryParametersError", "X-Amz-Date and X-Amz-Expires (1..604800) are required", 400);
    if (now.getTime() > issued.getTime() + expires * 1000) return deny("AccessDenied", `Request has expired (issued ${issued.toISOString()}, valid ${expires}s)`);
  } else if (auth?.startsWith("AWS4-HMAC-SHA256 ")) {
    mode = "header";
    const parts = Object.fromEntries(auth.slice(17).split(/,\s*/).map((p) => p.split("=") as [string, string]));
    credential = parts.Credential ?? "";
    signedHeaders = parts.SignedHeaders ?? "";
    signature = parts.Signature ?? "";
    date = String(headers["x-amz-date"] ?? "");
    payloadHash = String(headers["x-amz-content-sha256"] ?? "UNSIGNED-PAYLOAD");
    const issued = amzDate(date);
    if (!issued || Math.abs(now.getTime() - issued.getTime()) > 15 * 60 * 1000) return deny("RequestTimeTooSkewed", "x-amz-date is missing or more than 15 minutes away");
  } else {
    return deny("AccessDenied", "Anonymous access is not allowed: sign the request or use a presigned URL");
  }

  const [accessKeyId, day, region, service, terminator] = credential.split("/");
  const secret = secrets.get(accessKeyId ?? "");
  if (!secret) return deny("InvalidAccessKeyId", "The access key id does not exist");
  if (!day || day !== date.slice(0, 8) || service !== "s3" || terminator !== "aws4_request") return deny("AuthorizationQueryParametersError", "Malformed credential scope", 400);

  const names = signedHeaders.split(";");
  if (!names.includes("host")) return deny("AccessDenied", "host must be a signed header");
  const canonicalHeaders = names
    .map((n) => {
      const v = headers[n];
      const value = Array.isArray(v) ? v.join(",") : (v ?? "");
      return `${n}:${String(value).trim().replace(/\s+/g, " ")}\n`;
    })
    .join("");
  const canonicalQuery = query
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => [encode(k), encode(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region!), service!), "aws4_request");
  const expected = hmac(key, stringToSign);
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return deny("SignatureDoesNotMatch", "The request signature we calculated does not match the signature you provided (a signed header, the key, the query or the method changed)");
  }
  return { ok: true, accessKeyId: accessKeyId!, mode };
}
