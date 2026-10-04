import pg from "pg";

export const PORT = 53056;
export const DATABASE_URL = "postgres://postgres:postgres@localhost:55476/postgres";

// 4 connections. The statement endpoint holds one for about 40 ms, so by Little's law (L = X x W) the most it can
// serve is 4 / 0.040 s = 100 statements a second; past that, requests queue for a connection and latency bends up.
export const POOL = 4;
export const SERVICE_MS = 40;
export const db = new pg.Pool({ connectionString: DATABASE_URL, max: POOL });
