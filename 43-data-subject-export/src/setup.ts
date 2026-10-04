// Schema and a deterministic seed: 200 members of Acme, Globex and Initech over 20 years, and M0042, the member
// whose export is committed in out/. Every value is fictional; IPs are from the documentation ranges (RFC 5737).
import { DEMO_PASSWORD, hashPassword } from "./auth.js";
import { clock, db } from "./db.js";
import { policies } from "./policies.js";

const now = clock.now();

await db.query(`
  DROP TABLE IF EXISTS chat_messages, purge_runs, retention_policies, legal_holds, dsar_events, dsar_requests, login_events, sessions,
    credentials, support_tickets, consents, beneficiaries, bank_accounts, contributions, members, employers CASCADE;
  CREATE TABLE employers (id text PRIMARY KEY, name text NOT NULL);
  CREATE TABLE members (
    id int PRIMARY KEY,
    member_no text NOT NULL UNIQUE,
    given_name text, family_name text, email text, phone text, birth_date date, national_id text,
    address_line text, postcode text, city text,
    employer_id text NOT NULL REFERENCES employers,
    joined_on date NOT NULL,
    left_on date,
    anonymised_at timestamptz
  );
  CREATE TABLE contributions (id bigserial PRIMARY KEY, member_id int NOT NULL REFERENCES members, period date NOT NULL, employer_id text NOT NULL REFERENCES employers, amount numeric(10, 2) NOT NULL, recorded_at timestamptz NOT NULL);
  CREATE INDEX ON contributions (member_id);
  CREATE TABLE bank_accounts (member_id int PRIMARY KEY REFERENCES members, iban text NOT NULL, holder_name text NOT NULL, updated_at timestamptz NOT NULL);
  CREATE TABLE beneficiaries (id serial PRIMARY KEY, member_id int NOT NULL REFERENCES members, full_name text NOT NULL, relationship text NOT NULL, share_pct int NOT NULL, birth_date date);
  CREATE TABLE consents (member_id int NOT NULL REFERENCES members, purpose text NOT NULL, given_at timestamptz NOT NULL, withdrawn_at timestamptz, PRIMARY KEY (member_id, purpose));
  CREATE TABLE support_tickets (id serial PRIMARY KEY, member_id int REFERENCES members, opened_at timestamptz NOT NULL, closed_at timestamptz, subject text NOT NULL, body text, anonymised_at timestamptz);
  CREATE TABLE credentials (member_id int PRIMARY KEY REFERENCES members, password_hash text NOT NULL, updated_at timestamptz NOT NULL);
  CREATE TABLE sessions (id_hash text PRIMARY KEY, member_id int NOT NULL REFERENCES members, created_at timestamptz NOT NULL, auth_time timestamptz NOT NULL, user_agent text);
  CREATE TABLE login_events (id bigserial PRIMARY KEY, member_id int NOT NULL REFERENCES members, at timestamptz NOT NULL, ip inet, user_agent text, outcome text NOT NULL);
  CREATE INDEX ON login_events (member_id);
  CREATE TABLE dsar_requests (
    id serial PRIMARY KEY,
    member_id int NOT NULL REFERENCES members,
    kind text NOT NULL,
    received_at timestamptz NOT NULL,
    due_on date NOT NULL,
    verified_by text,
    status text NOT NULL CHECK (status IN ('received', 'verified', 'completed', 'refused')),
    completed_at timestamptz,
    export_sha256 text
  );
  CREATE TABLE dsar_events (id serial PRIMARY KEY, request_id int NOT NULL REFERENCES dsar_requests, at timestamptz NOT NULL, event text NOT NULL, detail text);
  CREATE TABLE legal_holds (id serial PRIMARY KEY, member_id int NOT NULL REFERENCES members, reason text NOT NULL, placed_at timestamptz NOT NULL, released_at timestamptz);
  CREATE TABLE retention_policies (
    seq int PRIMARY KEY,
    table_name text NOT NULL UNIQUE,
    keep interval NOT NULL,
    anchor_sql text NOT NULL,
    anchor_label text NOT NULL,
    subject_sql text NOT NULL,
    action text NOT NULL CHECK (action IN ('delete', 'anonymise')),
    anonymise_sql text,
    pending_sql text,
    why text NOT NULL
  );
  CREATE TABLE purge_runs (id serial PRIMARY KEY, at timestamptz NOT NULL, table_name text NOT NULL, action text NOT NULL, purged int NOT NULL, held int NOT NULL, batches int NOT NULL);
  INSERT INTO employers VALUES ('acme', 'Acme'), ('globex', 'Globex'), ('initech', 'Initech');
`);

for (const p of policies)
  await db.query("INSERT INTO retention_policies VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [p.seq, p.table, p.keep, p.anchor, p.anchorLabel, p.subject, p.action, p.anonymise ?? null, p.pending ?? null, p.why]);

const given = "'{Alex,Sam,Jordan,Camille,Robin,Charlie,Dominique,Morgan,Lou,Noa,Sacha,Eden,Maxime,Ali,Claude,Jamie}'::text[]";
const family = "'{Martin,Bernard,Dubois,Thomas,Robert,Petit,Durand,Leroy,Moreau,Simon,Laurent,Lefebvre,Michel,Garcia,David,Bertrand,Roux}'::text[]";
await db.query(
  `INSERT INTO members (id, member_no, given_name, family_name, email, phone, birth_date, national_id, address_line, postcode, city, employer_id, joined_on)
   SELECT i, 'M' || lpad(i::text, 4, '0'), (${given})[1 + i % 16], (${family})[1 + (i * 7) % 17],
     lower((${given})[1 + i % 16] || '.' || (${family})[1 + (i * 7) % 17]) || '.' || i || '@example.org',
     '+33 6 ' || lpad(((i * 7919) % 100000000)::text, 8, '0'), date '1955-01-01' + (i * 331) % 15000,
     (1 + i % 2) || ' 00 00 99 ' || lpad(i::text, 3, '0') || ' 000 00', i || ' rue de l''Exemple', (75001 + i % 20)::text, 'Paris',
     (ARRAY['acme', 'globex', 'initech'])[1 + i % 3], date '1990-01-01' + (i * 523) % 11000
   FROM generate_series(1, 200) i`,
);
// a quarter of the members left, between 2008 and mid-2026
await db.query("UPDATE members SET left_on = least(date '2026-06-30', greatest(joined_on + 400, date '2008-01-01' + (id * 97) % 6700)) WHERE id % 4 = 0");

// M0042, the member whose export is committed
await db.query(
  `UPDATE members SET given_name = 'Alex', family_name = 'Martin', email = 'alex.martin@example.org', phone = '+33 6 00 00 04 20',
     birth_date = '1984-05-17', national_id = '1 84 05 99 042 000 00', address_line = '12 rue des Lilas', postcode = '75011', city = 'Paris',
     employer_id = 'acme', joined_on = '2015-01-05', left_on = NULL WHERE id = 42`,
);

await db.query(
  `INSERT INTO contributions (member_id, period, employer_id, amount, recorded_at)
   SELECT m.id, p::date, m.employer_id, 120 + (m.id % 40) * 6.5, p + interval '1 month 5 days'
   FROM members m, generate_series(date_trunc('month', greatest(m.joined_on, date '2004-01-01')), date_trunc('month', coalesce(m.left_on, date '2026-09-01')), interval '1 month') p`,
);
await db.query(
  `INSERT INTO bank_accounts SELECT id, 'FR76 0000 0000 0000 0000 0000 ' || lpad(id::text, 3, '0'), given_name || ' ' || family_name, joined_on + 10 FROM members`,
);
await db.query(
  `INSERT INTO beneficiaries (member_id, full_name, relationship, share_pct, birth_date)
   SELECT id, 'Beneficiary ' || id || '-' || k, (ARRAY['spouse', 'child', 'parent'])[k], CASE WHEN id % 6 = 1 THEN 50 ELSE 100 END, date '1950-01-01' + (id * 211 + k * 97) % 25000
   FROM members, generate_series(1, 2) k WHERE id % 2 = 1 AND (k = 1 OR id % 6 = 1) AND id <> 42`,
);
await db.query(
  `INSERT INTO beneficiaries (member_id, full_name, relationship, share_pct, birth_date) VALUES
     (42, 'Sam Martin', 'spouse', 60, '1985-09-02'), (42, 'Robin Martin', 'child', 40, '2016-04-11')`,
);
await db.query(
  `INSERT INTO consents SELECT id, 'newsletter', joined_on, CASE WHEN id % 5 = 0 THEN date '2017-01-01' + (id * 13) % 3000 END FROM members WHERE id <> 42;
   INSERT INTO consents VALUES (42, 'newsletter', '2015-01-05 10:12Z', NULL), (42, 'research_surveys', '2019-03-01 18:40Z', '2023-06-12 07:55Z');`,
);
await db.query(
  `INSERT INTO support_tickets (member_id, opened_at, closed_at, subject, body)
   SELECT m.id, o, CASE WHEN k = 3 AND m.id % 10 = 0 THEN NULL ELSE o + k * interval '2 days' END,
     (ARRAY['Change of address', 'Question about my annual statement', 'Cannot sign in', 'Transfer request', 'Update bank details'])[1 + (m.id + k) % 5],
     'Hello, ' || (ARRAY['I moved last month.', 'a figure looks wrong.', 'the page says my password is wrong.', 'I want to transfer my rights.', 'I changed banks.'])[1 + (m.id + k) % 5]
   FROM members m, generate_series(1, 3) k, LATERAL (SELECT timestamptz '2020-01-01' + ((m.id * 37 + k * 211) % 2400) * interval '1 day' AS o) x
   WHERE m.id % 2 = 0 AND m.id <> 42`,
);
await db.query(
  `INSERT INTO support_tickets (member_id, opened_at, closed_at, subject, body) VALUES
     (42, '2023-02-14 09:30Z', '2023-02-15 11:00Z', 'Change of bank details', 'Hello, I changed banks: my new IBAN is in my profile. Alex'),
     (42, '2025-04-03 17:05Z', '2025-04-07 08:20Z', 'Question about my 2024 annual statement', 'Hello, March 2024 seems to be missing from my statement. Alex'),
     (42, '2026-09-28 20:11Z', NULL, 'What data do you hold about me?', 'Hello, I would like a copy of my data. Alex')`,
);
await db.query("INSERT INTO credentials SELECT id, 'scrypt$00$00', joined_on FROM members WHERE id <> 42");
await db.query("INSERT INTO credentials VALUES (42, $1, '2024-11-20 19:02Z')", [hashPassword(DEMO_PASSWORD)]);
await db.query(
  `INSERT INTO sessions SELECT md5('s' || i), 1 + (i * 7) % 200, $1::timestamptz - i * interval '6 hours', $1::timestamptz - i * interval '6 hours', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/141.0'
   FROM generate_series(1, 400) i WHERE 1 + (i * 7) % 200 <> 42`,
  [now],
);
await db.query(
  `INSERT INTO login_events (member_id, at, ip, user_agent, outcome)
   SELECT m.id, $1::timestamptz - w * interval '7 days' - m.id * interval '17 minutes', ('198.51.100.' || (1 + (m.id + w) % 250))::inet,
     CASE WHEN w % 3 = 0 THEN 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5) Safari/604.1' ELSE 'Mozilla/5.0 (X11; Linux x86_64) Firefox/141.0' END,
     CASE WHEN (m.id + w) % 29 = 0 THEN 'failure' ELSE 'success' END
   FROM members m, generate_series(1, 104) w WHERE m.left_on IS NULL OR m.left_on > $1::date - 365`,
  [now],
);
// past requests: two answered more than 3 years ago (expired), one answered in 2025
await db.query(
  `INSERT INTO dsar_requests (member_id, kind, received_at, due_on, verified_by, status, completed_at, export_sha256) VALUES
     (17, 'access', '2021-03-02 10:00Z', '2021-04-02', 'password re-authentication', 'completed', '2021-03-20 15:00Z', NULL),
     (88, 'access', '2022-11-14 08:00Z', '2022-12-14', 'password re-authentication', 'completed', '2022-11-30 12:00Z', NULL),
     (42, 'access', '2025-01-08 21:14Z', '2025-02-10', 'password re-authentication', 'completed', '2025-01-09 07:30Z', NULL);
   INSERT INTO dsar_events (request_id, at, event, detail)
     SELECT id, received_at, 'received', kind FROM dsar_requests UNION ALL SELECT id, completed_at, 'completed', 'export delivered' FROM dsar_requests;`,
);
// a legal hold on one long-gone member whose data would otherwise be purged, and a hold released in 2024
await db.query(
  `INSERT INTO legal_holds (member_id, reason, placed_at)
     SELECT id, 'Dispute over a transfer value, file 2025-117', '2025-03-10 09:00Z' FROM members WHERE left_on < '2014-01-01' ORDER BY id LIMIT 1;
   INSERT INTO legal_holds (member_id, reason, placed_at, released_at) VALUES (3, 'Complaint to the ombudsman, closed', '2023-05-02 09:00Z', '2024-06-01 09:00Z');`,
);

const counts = await db.query(`
  SELECT 'members' AS t, count(*) FROM members UNION ALL SELECT 'contributions', count(*) FROM contributions UNION ALL SELECT 'login_events', count(*) FROM login_events
  UNION ALL SELECT 'support_tickets', count(*) FROM support_tickets UNION ALL SELECT 'sessions', count(*) FROM sessions`);
console.log(`setup: 15 tables, ${policies.length} retention policies; ${counts.rows.map((r) => `${r.t} ${r.count}`).join(", ")}`);
await db.end();
