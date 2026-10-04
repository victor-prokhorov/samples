import pg from "pg";

export const PORT = 53055;
export const DATABASE_URL = "postgres://postgres:postgres@localhost:55475/postgres";

// The member API has 4 connections for real work: at about 20 ms per request that is about 200 requests a second
// for every tenant together. That shared pool is what one noisy tenant can take from the others.
export const appDb = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
// The limiter has its own small pool, so a flood of rejected requests never waits behind the real work.
export const limiterDb = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
