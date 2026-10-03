// Ports and connection settings shared by the processes. Postgres 55466, web 53046, API 53146 (see the root README port table).
export const PG_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55466/postgres";
export const WEB_PORT = Number(process.env.WEB_PORT ?? 53046);
export const API_PORT = Number(process.env.API_PORT ?? 53146);
export const API_URL = process.env.API_URL ?? `http://localhost:${API_PORT}`;
// The latency objective borrowed from 29-kpis: 95% of requests to a route answer within 300 ms.
export const SLO_MS = 300;
