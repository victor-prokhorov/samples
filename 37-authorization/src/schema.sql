-- Tables, the `app` login role, and the row-level security policies: the policy of src/policy.ts again,
-- written so that Postgres enforces it on every query the application sends, whatever the code checked.

DROP TABLE IF EXISTS audit_log, change_requests, contributions, members, users CASCADE;
DROP FUNCTION IF EXISTS app_user, app_role, app_org, app_member, rel, can_read_member_data CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN CREATE ROLE app LOGIN PASSWORD 'app'; END IF;
END $$;

CREATE TABLE users (id text PRIMARY KEY, role text NOT NULL, org_id text, member_id text);
CREATE TABLE members (id text PRIMARY KEY, org_id text NOT NULL, user_id text NOT NULL, name text NOT NULL, address text NOT NULL);
CREATE TABLE contributions (id serial PRIMARY KEY, member_id text NOT NULL REFERENCES members, period date NOT NULL, amount numeric(10,2) NOT NULL);
CREATE TABLE change_requests (
  id serial PRIMARY KEY,
  member_id text NOT NULL REFERENCES members,
  requested_by text NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_by text
);
CREATE TABLE audit_log (id serial PRIMARY KEY, member_id text NOT NULL REFERENCES members, actor text NOT NULL, action text NOT NULL, at timestamptz NOT NULL DEFAULT now());

-- Who is asking: set per transaction by the application (set_config(..., true)). Missing means no access.
CREATE FUNCTION app_user() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.role', true), '') $$;
CREATE FUNCTION app_org() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '') $$;
CREATE FUNCTION app_member() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.member_id', true), '') $$;

-- The matrix's columns in SQL: how a member record relates to the current user. SECURITY DEFINER so it can
-- read the record's organisation even when the user may not read the record (the same way the code's loader does).
CREATE FUNCTION rel(target text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN target = app_member() THEN 'own record'
    WHEN (SELECT org_id FROM members WHERE id = target) = app_org() THEN 'same organisation'
    ELSE 'other organisation'
  END
$$;

-- Read rules shared by members, contributions and change requests (RULES in policy.ts:
-- member: own record; employer_admin: same organisation; staff and auditor: any).
CREATE FUNCTION can_read_member_data(target text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE app_role()
    WHEN 'member' THEN rel(target) = 'own record'
    WHEN 'employer_admin' THEN rel(target) = 'same organisation'
    WHEN 'staff' THEN true
    WHEN 'auditor' THEN true
    ELSE false
  END
$$;

-- Deny by default: with RLS on and no policy for a command, that command sees and changes nothing.
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY member_read ON members FOR SELECT USING (can_read_member_data(id));
CREATE POLICY member_update ON members FOR UPDATE
  USING (app_role() = 'member' AND rel(id) = 'own record')
  WITH CHECK (app_role() = 'member' AND rel(id) = 'own record');

CREATE POLICY contribution_read ON contributions FOR SELECT USING (can_read_member_data(member_id));
CREATE POLICY contribution_create ON contributions FOR INSERT
  WITH CHECK (app_role() = 'employer_admin' AND rel(member_id) = 'same organisation');

CREATE POLICY change_request_read ON change_requests FOR SELECT USING (can_read_member_data(member_id));
CREATE POLICY change_request_create ON change_requests FOR INSERT WITH CHECK (
  requested_by = app_user() AND status = 'pending' AND approved_by IS NULL
  AND CASE app_role()
    WHEN 'member' THEN rel(member_id) = 'own record'
    WHEN 'employer_admin' THEN rel(member_id) = 'same organisation'
    WHEN 'staff' THEN true
    ELSE false
  END);
-- Four eyes: staff approve a pending request, as themselves, and never one they asked for.
CREATE POLICY change_request_approve ON change_requests FOR UPDATE
  USING (app_role() = 'staff' AND status = 'pending')
  WITH CHECK (app_role() = 'staff' AND status = 'approved' AND approved_by = app_user() AND requested_by <> app_user());

CREATE POLICY audit_log_read ON audit_log FOR SELECT USING (app_role() = 'auditor');

-- Privileges come first: RLS only filters what a GRANT allows. Column grants keep an UPDATE to the columns it is for.
GRANT SELECT ON users, members, contributions, change_requests, audit_log TO app;
GRANT UPDATE (address) ON members TO app;
GRANT INSERT ON contributions, change_requests TO app;
GRANT UPDATE (status, approved_by) ON change_requests TO app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app;
