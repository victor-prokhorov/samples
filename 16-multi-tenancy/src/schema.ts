export const BRIDGE_TENANTS = ["hooli", "initrode", "vandelay"];

const tenantMatches = "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')";

export function tenantPolicy(table: string) {
  return `
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${table} USING (${tenantMatches}) WITH CHECK (${tenantMatches})`;
}

export const SILO_SCHEMA = `
  CREATE TABLE customers (id SERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, UNIQUE (tenant_id, id));
  CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id INT NOT NULL,
    number INT NOT NULL,
    amount_cents INT NOT NULL,
    UNIQUE (tenant_id, number),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)
  );
  CREATE INDEX ON invoices (tenant_id, id);
  ${tenantPolicy("customers")};
  ${tenantPolicy("invoices")};
  ALTER TABLE customers FORCE ROW LEVEL SECURITY;
  ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON customers, invoices TO app;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app`;
