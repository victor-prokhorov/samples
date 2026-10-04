// Ports and names for this sample (port rule: Postgres 55430+38, HTTP 53010+38, and two more for blue and green).
export const PROXY_PORT = 53048;
export const BLUE_PORT = 53148;
export const GREEN_PORT = 53248;
export const DB_URL_HOST = "postgres://postgres:postgres@localhost:55468/postgres";
// Inside the compose network the database is the "postgres" service.
export const DB_URL_CONTAINER = "postgres://postgres:postgres@postgres:5432/postgres";
export const NETWORK = "38-containers_default";
export const IMAGE = process.env.IMAGE ?? "38-containers-app";
export const NAIVE_IMAGE = process.env.NAIVE_IMAGE ?? "38-containers-naive:1.0.0";
export const upstreamPort = { blue: BLUE_PORT, green: GREEN_PORT } as const;
export type Color = keyof typeof upstreamPort;
