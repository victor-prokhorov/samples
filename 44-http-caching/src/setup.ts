// Members and their sessions (personal data), funds and ten years of daily unit prices (shared reference data),
// bilingual help pages, and the invalidation outbox the shared cache follows.
import { db } from "./db.js";

const first = ["Alice", "Bruno", "Chloé", "David", "Emma", "Farid", "Grace", "Hugo", "Inès", "Jack"];
const last = ["Martin", "Lefèvre", "Okafor", "Smith", "Dubois"];
const employers = ["Acme", "Globex", "Initech"];

await db.query(`
  DROP TABLE IF EXISTS sessions, members, fund_prices, funds, help_pages, data_versions, cache_invalidations CASCADE;
  DROP FUNCTION IF EXISTS funds_changed;

  CREATE TABLE members (id int PRIMARY KEY, name text NOT NULL, employer text NOT NULL, iban text NOT NULL, balance numeric(12, 2) NOT NULL);
  CREATE TABLE sessions (token text PRIMARY KEY, member_id int NOT NULL REFERENCES members);

  CREATE TABLE funds (id int PRIMARY KEY, name text NOT NULL);
  CREATE TABLE fund_prices (fund_id int REFERENCES funds, day date, price numeric(12, 4) NOT NULL, PRIMARY KEY (fund_id, day));
  CREATE TABLE help_pages (slug text, lang text, title text NOT NULL, body text NOT NULL, PRIMARY KEY (slug, lang));

  -- A version per data set, bumped on every change: the origin derives the ETag from it, so a conditional GET is answered
  -- without running the expensive query.
  CREATE TABLE data_versions (name text PRIMARY KEY, version bigint NOT NULL);
  INSERT INTO data_versions VALUES ('funds', 1);

  -- The invalidation outbox (see samples 09 and 17): one row per change, written in the same transaction as the change.
  -- NOTIFY wakes the cache at commit; the rows let a cache that missed a NOTIFY (disconnected) catch up from the last id it saw.
  CREATE TABLE cache_invalidations (id bigserial PRIMARY KEY, tag text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

  CREATE FUNCTION funds_changed() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE new_id bigint;
  BEGIN
    UPDATE data_versions SET version = version + 1 WHERE name = 'funds';
    INSERT INTO cache_invalidations (tag, reason, created_at) VALUES ('funds', TG_OP || ' on ' || TG_TABLE_NAME, clock_timestamp()) RETURNING id INTO new_id;
    PERFORM pg_notify('cache_invalidations', new_id::text);
    RETURN NULL;
  END $$;
  CREATE TRIGGER fund_prices_changed AFTER INSERT OR UPDATE OR DELETE ON fund_prices FOR EACH STATEMENT EXECUTE FUNCTION funds_changed();
  CREATE TRIGGER funds_changed AFTER INSERT OR UPDATE OR DELETE ON funds FOR EACH STATEMENT EXECUTE FUNCTION funds_changed();
`);

// 50 members: member 1 is Alice Martin, member 2 is Bruno Lefèvre. Session tokens are fixed so the demo can sign in as anyone.
for (let i = 1; i <= 50; i++) {
  const name = `${first[(i - 1) % first.length]} ${last[(i - 1 + Math.floor((i - 1) / first.length)) % last.length]}`;
  const iban = `FR76 3000 6000 01${String(10000 + i * 37).padStart(5, "0")} 0000 ${String(1000 + i).slice(-4)} ${String(i * 13).padStart(3, "0")}`;
  await db.query("INSERT INTO members VALUES ($1, $2, $3, $4, $5)", [i, name, employers[i % 3], iban, (12000 + i * 731.5).toFixed(2)]);
  await db.query("INSERT INTO sessions VALUES ($1, $2)", [`session-${i}`, i]);
}

// 40 funds, ten years of daily prices (a seeded random walk): about 146,000 rows behind the funds table.
await db.query("ALTER TABLE fund_prices DISABLE TRIGGER fund_prices_changed; ALTER TABLE funds DISABLE TRIGGER funds_changed");
await db.query("SELECT setseed(0.44)");
await db.query(`INSERT INTO funds SELECT g, (ARRAY['Global Equity', 'Euro Bonds', 'Ethical Growth', 'Cash Plus', 'Balanced', 'Property', 'Emerging Markets', 'Index Tracker'])[1 + (g - 1) % 8] || ' ' || chr(64 + ((g - 1) / 8) + 1) FROM generate_series(1, 40) g`);
await db.query(`
  INSERT INTO fund_prices
  SELECT f, d::date, round((100 * exp(sum(random() * 0.02 - 0.0099) OVER (PARTITION BY f ORDER BY d)))::numeric, 4)
  FROM generate_series(1, 40) f, generate_series(date '2016-10-01', date '2026-09-30', interval '1 day') d`);
await db.query("ALTER TABLE fund_prices ENABLE TRIGGER fund_prices_changed; ALTER TABLE funds ENABLE TRIGGER funds_changed");

await db.query(`INSERT INTO help_pages VALUES
  ('contributions', 'en', 'How contributions work', 'Each month your employer deducts your contribution from your salary and adds its own. Both are invested in the funds you chose.'),
  ('contributions', 'fr', 'Comment fonctionnent les cotisations', 'Chaque mois, votre employeur prélève votre cotisation sur votre salaire et y ajoute la sienne. Les deux sont investies dans les fonds que vous avez choisis.')`);
await db.query("ANALYZE");
const n = (await db.query("SELECT (SELECT count(*) FROM members)::int AS members, (SELECT count(*) FROM fund_prices)::int AS prices")).rows[0];
console.log(`setup: ${n.members} members with sessions, 40 funds with ${n.prices} daily prices, help pages in en and fr, invalidation outbox and triggers`);
await db.end();
