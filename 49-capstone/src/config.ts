// Ports and addresses shared by the identity provider, the portal, setup and the demo.
// Two hostnames for one machine (as in 26-sso), so the IdP's cookies and the portal's cookies live apart.
export const APP_PORT = 53059;
export const IDP_PORT = 53159;
export const APP = `http://localhost:${APP_PORT}`;
export const IDP = `http://127.0.0.1:${IDP_PORT}`;
export const CLIENT_ID = "member-portal";
export const CLIENT_SECRET = "member-portal-secret";

export const OWNER_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55479/postgres";
// The portal logs in as `app`: it owns no table and does not bypass row-level security (37-authorization).
export const APP_URL = process.env.APP_DATABASE_URL ?? "postgres://app:app@localhost:55479/postgres";
