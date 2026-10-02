import pg from "pg";

export const IDP_PORT = 53036;
export const APP_PORT = 53037;
// Two hostnames for one machine, so the IdP's cookies and the app's cookies live apart, as on two real sites.
export const IDP = `http://127.0.0.1:${IDP_PORT}`;
export const APP = `http://localhost:${APP_PORT}`;
export const CLIENT_ID = "member-portal";
export const CLIENT_SECRET = "member-portal-secret";

export const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55456/postgres" });
