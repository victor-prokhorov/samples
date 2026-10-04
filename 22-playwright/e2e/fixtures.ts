import { AddressInfo } from "node:net";
import { test as base } from "@playwright/test";
import pg from "pg";
import { createApp } from "../src/app.js";
import { cloneTemplate, dropDatabase, url } from "../src/db.js";

type Worker = { app: { baseURL: string; pool: pg.Pool; database: string } };

export const test = base.extend<{ resetData: void }, Worker>({
  // One database and one app server per worker: workers never see each other's rows.
  app: [
    async ({}, use, workerInfo) => {
      const database = `portal_w${workerInfo.workerIndex}`;
      await cloneTemplate(database);
      const pool = new pg.Pool({ connectionString: url(database) });
      // pool.end() resolves before its idle sockets have closed, so the DROP DATABASE ... WITH (FORCE) below can
      // still terminate one (57P01). Without a listener pg rethrows that as an uncaught error and Playwright fails
      // the run outside any test. Anything else is a real error.
      pool.on("error", (err: Error & { code?: string }) => {
        if (err.code !== "57P01") throw err;
      });
      const server = createApp({ pool, apiDelayMs: Number(process.env.API_DELAY_MS ?? 300), markup: process.env.MARKUP === "v2" ? "v2" : "v1" });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const baseURL = `http://localhost:${(server.address() as AddressInfo).port}`;
      console.log(`   [worker ${workerInfo.workerIndex}] database ${database}, app on ${baseURL}`);
      await use({ baseURL, pool, database });
      await server.drain();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
      await dropDatabase(database);
    },
    { scope: "worker" },
  ],
  baseURL: async ({ app }, use) => use(app.baseURL),
  // Reset before every test without a transaction: the browser's requests run on other connections, so a rollback could not cover them.
  resetData: [
    async ({ app }, use) => {
      if (process.env.NO_RESET !== "1") await app.pool.query("TRUNCATE change_requests RESTART IDENTITY");
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
