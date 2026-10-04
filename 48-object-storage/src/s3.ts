// The S3 client the app and the scanner share, and the two presigners the app hands to browsers.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const APP_PORT = 53058;
export const STORAGE_PORT = 53158;
export const APP_ORIGIN = `http://localhost:${APP_PORT}`;
export const STORAGE_URL = `http://localhost:${STORAGE_PORT}`;
export const BUCKET = "member-documents";
// s3rver's built-in account. In production these come from the app's IAM role, never from the browser.
export const ACCESS_KEY_ID = "S3RVER";
export const SECRET_ACCESS_KEY = "S3RVER";

export const UPLOAD_TTL_SECONDS = 60;
export const DOWNLOAD_TTL_SECONDS = 300;
export const MAX_BYTES = 100 * 1024 * 1024;
export const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"]);

export const s3 = new S3Client({
  region: "eu-west-3",
  endpoint: STORAGE_URL,
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  // Since 2025 the SDK adds a CRC32 of the body to every PutObject by default. A presigned URL is signed before the body
  // exists, so it would carry the checksum of an empty body and S3 would reject the real upload. Only add one when the API requires it.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// A presigned PUT that only accepts exactly this content type and this many bytes: both headers are signed,
// so the storage recomputes a different signature if the browser sends anything else.
export function presignPut(key: string, contentType: string, size: number, expiresIn = UPLOAD_TTL_SECONDS) {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, ContentLength: size });
  return getSignedUrl(s3, cmd, { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) });
}

// RFC 6266: an ASCII fallback and the UTF-8 name, so "Relevé été.pdf" survives.
export function contentDisposition(filename: string) {
  const ascii = filename.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function presignGet(key: string, filename: string, contentType: string, expiresIn = DOWNLOAD_TTL_SECONDS) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: contentDisposition(filename), ResponseContentType: contentType });
  return getSignedUrl(s3, cmd, { expiresIn });
}
