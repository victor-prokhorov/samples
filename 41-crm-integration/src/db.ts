import pg from "pg";

export const APP_PORT = 53051;
export const CRM_PORT = 53151;
export const CRM_BASE = `http://localhost:${CRM_PORT}/api/data/v9.2`;
// One secret shared with the CRM's webhook configuration. In production: a secret store, and two during a rotation.
export const WEBHOOK_SECRETS = [process.env.WEBHOOK_SECRET ?? "whsec_demo_only_not_a_real_secret"];

export const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55471/postgres", max: 10 });
