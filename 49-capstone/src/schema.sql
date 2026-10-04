-- The portal's schema. Row-level security as in 37-authorization, sign-in tables as in 26-sso, usage events as in 29-kpis.

DROP TABLE IF EXISTS events, sessions, login_transactions, users, role_mappings, change_requests, contributions, members, organisations CASCADE;
DROP FUNCTION IF EXISTS app_user, app_role, app_org, app_member, rel, can_read_member_data, apply_bank_change CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN CREATE ROLE app LOGIN PASSWORD 'app'; END IF;
END $$;

CREATE TABLE organisations (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE members (
  id text PRIMARY KEY,                       -- the member number, also the IdP's member_no claim
  org_id text NOT NULL REFERENCES organisations,
  name text NOT NULL,
  holder text NOT NULL,                      -- bank account holder
  iban text NOT NULL
);
CREATE TABLE contributions (
  member_id text NOT NULL REFERENCES members,
  month date NOT NULL,
  employee numeric(10, 2) NOT NULL,
  employer numeric(10, 2) NOT NULL,
  PRIMARY KEY (member_id, month)
);
CREATE TABLE change_requests (
  id serial PRIMARY KEY,
  member_id text NOT NULL REFERENCES members,
  requested_by text NOT NULL,                -- the IdP subject of whoever asked
  field text NOT NULL CHECK (field = 'bank_account'),
  value jsonb NOT NULL,                      -- {"holder": ..., "iban": ...}
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
-- At most one pending change per member and field (20-portal).
CREATE UNIQUE INDEX one_pending_change ON change_requests (member_id, field) WHERE status = 'pending';

-- Sign-in (26-sso): IdP groups map to portal roles; users are provisioned on first sign-in, keyed by the IdP subject.
CREATE TABLE role_mappings (idp_group text PRIMARY KEY, role text NOT NULL, org_id text REFERENCES organisations);
CREATE TABLE users (
  sub text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  org_id text REFERENCES organisations,
  member_id text REFERENCES members,
  first_login_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE login_transactions (id text PRIMARY KEY, state text NOT NULL, nonce text NOT NULL, code_verifier text NOT NULL, expires_at timestamptz NOT NULL);
-- Only the sha256 of the session cookie is stored.
CREATE TABLE sessions (id_hash text PRIMARY KEY, user_sub text NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL);

-- Usage events (29-kpis): what people did, in product terms. The KPI page is SQL over this table.
CREATE TABLE events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_sub text NOT NULL,
  member_id text REFERENCES members,
  session text NOT NULL,
  name text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ON events (name, at);

-- Who is asking: set per transaction by the portal (set_config(..., true)). Missing means no access.
CREATE FUNCTION app_user() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.role', true), '') $$;
CREATE FUNCTION app_org() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '') $$;
CREATE FUNCTION app_member() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.member_id', true), '') $$;

CREATE FUNCTION rel(target text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN target = app_member() THEN 'own record'
    WHEN (SELECT org_id FROM members WHERE id = target) = app_org() THEN 'same organisation'
    ELSE 'other organisation'
  END
$$;

-- member: own record; employer_admin: same organisation; staff: any.
CREATE FUNCTION can_read_member_data(target text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE app_role()
    WHEN 'member' THEN rel(target) = 'own record'
    WHEN 'employer_admin' THEN rel(target) = 'same organisation'
    WHEN 'staff' THEN true
    ELSE false
  END
$$;

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY member_read ON members FOR SELECT USING (can_read_member_data(id));
CREATE POLICY contribution_read ON contributions FOR SELECT USING (can_read_member_data(member_id));
CREATE POLICY change_request_read ON change_requests FOR SELECT USING (can_read_member_data(member_id));
-- A member asks for a change to their own record, as themselves.
CREATE POLICY change_request_create ON change_requests FOR INSERT WITH CHECK (
  app_role() = 'member' AND rel(member_id) = 'own record' AND requested_by = app_user() AND status = 'pending' AND approved_by IS NULL);
-- Four eyes: staff approve a pending request, as themselves, and never one they asked for.
CREATE POLICY change_request_approve ON change_requests FOR UPDATE
  USING (app_role() = 'staff' AND status = 'pending')
  WITH CHECK (app_role() = 'staff' AND status = 'approved' AND approved_by = app_user() AND requested_by <> app_user());
-- Everyone records their own events; only staff read them (the KPI page).
CREATE POLICY event_create ON events FOR INSERT WITH CHECK (user_sub = app_user());
CREATE POLICY event_read ON events FOR SELECT USING (app_role() = 'staff');

-- An approved bank change applies to the member record. SECURITY DEFINER: staff may not update members directly.
CREATE FUNCTION apply_bank_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE members SET holder = NEW.value->>'holder', iban = NEW.value->>'iban' WHERE id = NEW.member_id;
  RETURN NEW;
END $$;
CREATE TRIGGER apply_bank_change AFTER UPDATE OF status ON change_requests
  FOR EACH ROW WHEN (OLD.status = 'pending' AND NEW.status = 'approved') EXECUTE FUNCTION apply_bank_change();

-- Privileges first: RLS only filters inside what a GRANT allows.
GRANT SELECT ON organisations, members, contributions, change_requests, events, role_mappings, users TO app;
GRANT INSERT ON change_requests, events TO app;
GRANT UPDATE (status, approved_by, approved_at) ON change_requests TO app;
-- The sign-in tables have no RLS: the portal reads them before it knows who the user is.
GRANT INSERT, UPDATE ON users TO app;
GRANT SELECT, INSERT, DELETE ON login_transactions, sessions TO app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app;
