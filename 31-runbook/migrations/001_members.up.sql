CREATE TABLE members (id int PRIMARY KEY, name text NOT NULL, email text NOT NULL, employer text NOT NULL);
CREATE TABLE member_changes (id serial PRIMARY KEY, member_id int NOT NULL REFERENCES members, field text NOT NULL, old_value text, new_value text, ticket text NOT NULL, operator text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE contributions (member_id int NOT NULL REFERENCES members, period text NOT NULL, amount numeric(10, 2) NOT NULL, batch_id int NOT NULL, PRIMARY KEY (member_id, period));
CREATE TABLE import_batches (id serial PRIMARY KEY, period text NOT NULL, file text NOT NULL, sha256 text NOT NULL UNIQUE, rows int NOT NULL, total numeric(12, 2) NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE UNLOGGED TABLE staging_contributions (member_id int, period text, amount numeric(10, 2));
INSERT INTO members VALUES (1, 'alice', 'alice@old.example', 'Acme'), (2, 'bob', 'bob@example.org', 'Globex'), (3, 'carol', 'carol@example.org', 'Initech');
