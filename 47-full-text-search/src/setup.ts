// Schema, text search configurations and data: 10 curated bilingual help articles + 200,000 generated archive articles,
// 8 curated employers + 200,000 generated ones. Generation is seeded, so every run searches the same rows.
import { ARTICLES, EMPLOYERS } from "./articles.js";
import { db } from "./db.js";

export const GENERATED = 200_000;

const t0 = Date.now();
await db.query(`
  DROP TABLE IF EXISTS help_articles, employers;
  DROP FUNCTION IF EXISTS f_unaccent;
  DROP TEXT SEARCH CONFIGURATION IF EXISTS en_unaccent, fr_unaccent;
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  -- A text search configuration per language that strips accents before stemming: "Élodie" and "elodie" become the same lexeme,
  -- and so do "anticipée" and "anticipee". Only the word token types need it: asciiword has no accents by definition.
  CREATE TEXT SEARCH CONFIGURATION en_unaccent (COPY = english);
  ALTER TEXT SEARCH CONFIGURATION en_unaccent ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
  CREATE TEXT SEARCH CONFIGURATION fr_unaccent (COPY = french);
  ALTER TEXT SEARCH CONFIGURATION fr_unaccent ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;

  -- unaccent() is only STABLE (its dictionary could change), so it cannot appear in an index expression.
  -- The usual wrapper names the dictionary explicitly and declares the function IMMUTABLE.
  CREATE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN public.unaccent('public.unaccent'::regdictionary, $1);

  CREATE TABLE help_articles (
    id serial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title_en text NOT NULL,
    body_en text NOT NULL,
    title_fr text NOT NULL,
    body_fr text NOT NULL,
    -- One generated tsvector per language. Weight A for the title, B for the body, so ts_rank_cd can rank title hits higher.
    search_en tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('en_unaccent', title_en), 'A') || setweight(to_tsvector('en_unaccent', body_en), 'B')) STORED,
    search_fr tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('fr_unaccent', title_fr), 'A') || setweight(to_tsvector('fr_unaccent', body_fr), 'B')) STORED
  );

  CREATE TABLE employers (
    id serial PRIMARY KEY,
    name text NOT NULL
  );
`);

for (const a of ARTICLES) {
  await db.query("INSERT INTO help_articles (slug, title_en, body_en, title_fr, body_fr) VALUES ($1, $2, $3, $4, $5)", [a.slug, a.title_en, a.body_en, a.title_fr, a.body_fr]);
}
for (const name of EMPLOYERS) await db.query("INSERT INTO employers (name) VALUES ($1)", [name]);

// Generated rows: everyday portal vocabulary that never contains the words the demo searches for.
const en = "account portal password statement address payment form document deadline update request phone email salary contract letter office schedule holiday meeting travel insurance invoice receipt card bank team project message number record archive online service monthly yearly login screen error help support question answer page download upload signature".split(" ");
const fr = "compte portail motdepasse adresse paiement formulaire document délai demande téléphone courriel salaire contrat lettre bureau horaire congés réunion voyage assurance facture reçu carte banque équipe projet message numéro dossier archive service mensuel annuel connexion écran erreur aide assistance question réponse page téléchargement signature été hiver".split(" ");
const prefixes = "Atelier Boulangerie Garage Cabinet Studio Pharmacie Transports Hôtel Café Société Clinique Crèche Ferme Menuiserie Librairie Imprimerie Plomberie Électricité Fromagerie Brasserie Bakery Builders Consulting Logistics Dental Florist Joinery Plumbing Print Software".split(" ");
const surnames = "Martin Bernard Dubois Moreau Laurent Simon Michel Leroy Roux David Bertrand Morel Fournier Girard Bonnet Dupont Lambert Fontaine Rousseau Vincent Muller Faure André Mercier Blanc Guérin Boyer Garnier Chevalier François Legrand Gauthier Perrin Robin Clément Morin Nicolas Henry Roussel Mathieu Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans Walker White Roberts Green Hall Wood Jackson Clarke".split(" ");
const places = ["du Lac", "des Alpes", "de la Gare", "Bellevue", "Riverside", "Hillside", "Oakwood", "Harbour", "du Château", "de la Montagne", "de l'Étoile", "de la Fontaine", "du Ruisseau", "Central", "Northern", "Southern", "du Marché", "des Écoles", "Station Road", "Mill Lane"];
const legal = ["SARL", "SAS", "SA", "Ltd", "LLP", "& Fils", "& Associés", "Services", "Group", "Partners"];

// "g * 0" ties each subquery to its row, so Postgres draws new words for every row instead of once; "i * 0" keeps
// string_agg at the subquery's level (an aggregate over outer columns only would belong to the outer query).
await db.query("SELECT setseed(0.47)");
await db.query(
  `WITH v AS (SELECT $1::text[] AS en, $2::text[] AS fr)
   INSERT INTO help_articles (slug, title_en, body_en, title_fr, body_fr)
   SELECT 'archive-' || g,
     initcap((SELECT string_agg(en[1 + floor(random() * array_length(en, 1))::int + i * 0], ' ') FROM generate_series(1, 4 + g * 0) i)),
     (SELECT string_agg(en[1 + floor(random() * array_length(en, 1))::int + i * 0], ' ') FROM generate_series(1, 25 + g * 0) i) || '.',
     initcap((SELECT string_agg(fr[1 + floor(random() * array_length(fr, 1))::int + i * 0], ' ') FROM generate_series(1, 4 + g * 0) i)),
     (SELECT string_agg(fr[1 + floor(random() * array_length(fr, 1))::int + i * 0], ' ') FROM generate_series(1, 25 + g * 0) i) || '.'
   FROM v, generate_series(1, ${GENERATED}) g`,
  [en, fr],
);
await db.query(
  `WITH v AS (SELECT $1::text[] AS p, $2::text[] AS s, $3::text[] AS pl, $4::text[] AS l)
   INSERT INTO employers (name)
   SELECT p[1 + floor(random() * array_length(p, 1))::int] || ' ' || s[1 + floor(random() * array_length(s, 1))::int] || ' '
       || pl[1 + floor(random() * array_length(pl, 1))::int] || ' ' || l[1 + floor(random() * array_length(l, 1))::int]
   FROM v, generate_series(1, ${GENERATED}) g`,
  [prefixes, surnames, places, legal],
);
const loaded = Date.now() - t0;

// GIN indexes: one per language for full-text search, and a trigram index on the unaccented, lower-cased name for fuzzy matching.
const t1 = Date.now();
await db.query(`
  CREATE INDEX help_articles_search_en ON help_articles USING gin (search_en);
  CREATE INDEX help_articles_search_fr ON help_articles USING gin (search_fr);
  CREATE INDEX employers_name_trgm ON employers USING gin (f_unaccent(lower(name)) gin_trgm_ops);
  ANALYZE help_articles;
  ANALYZE employers;
`);
const counts = (await db.query("SELECT (SELECT count(*) FROM help_articles)::int AS articles, (SELECT count(*) FROM employers)::int AS employers")).rows[0];
console.log(`loaded ${counts.articles} help articles and ${counts.employers} employers in ${loaded} ms; built 3 GIN indexes in ${Date.now() - t1} ms`);
await db.end();
