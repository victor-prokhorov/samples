// The two searches the page uses, and the naive ones they replace.
import { db } from "./db.js";

export type Hit = { id: number; slug: string; lang: "en" | "fr"; rank: number; title: string; snippet: string };

// ts_headline marks matches with these two control characters; the page escapes the text, then turns them into <mark>.
// Asking ts_headline for "<mark>" directly would mix trusted markup into untrusted article text.
export const START = "\u0002";
export const STOP = "\u0003";

// Weights for ts_rank_cd, in the order {D, C, B, A}: a title hit (A) counts 2.5 times a body hit (B).
export const WEIGHTS = "{0.1, 0.2, 0.4, 1.0}";

// One query per language, each against its own generated column and GIN index, ranked, then highlighted (only the top rows).
export const ARTICLE_SQL = `
  WITH q AS (SELECT websearch_to_tsquery('en_unaccent', $1) AS en, websearch_to_tsquery('fr_unaccent', $1) AS fr),
  hits AS (
    (SELECT id, 'en' AS lang, ts_rank_cd('${WEIGHTS}', search_en, q.en) AS rank FROM help_articles, q WHERE search_en @@ q.en ORDER BY rank DESC, id LIMIT $2)
    UNION ALL
    (SELECT id, 'fr' AS lang, ts_rank_cd('${WEIGHTS}', search_fr, q.fr) AS rank FROM help_articles, q WHERE search_fr @@ q.fr ORDER BY rank DESC, id LIMIT $2)
  )
  SELECT a.id, a.slug, h.lang, round(h.rank::numeric, 3)::float AS rank,
    CASE h.lang WHEN 'en' THEN ts_headline('en_unaccent', a.title_en, q.en, $3) ELSE ts_headline('fr_unaccent', a.title_fr, q.fr, $3) END AS title,
    CASE h.lang WHEN 'en' THEN ts_headline('en_unaccent', a.body_en, q.en, $4) ELSE ts_headline('fr_unaccent', a.body_fr, q.fr, $4) END AS snippet
  FROM hits h JOIN help_articles a USING (id), q
  ORDER BY h.rank DESC, h.lang, a.id
  LIMIT $2`;

export async function searchArticles(text: string, limit = 10): Promise<Hit[]> {
  const sel = `StartSel=${START}, StopSel=${STOP}`;
  const r = await db.query(ARTICLE_SQL, [text, limit, `HighlightAll=true, ${sel}`, `${sel}, MaxWords=28, MinWords=10, MaxFragments=2, FragmentDelimiter=" ... "`]);
  return r.rows;
}

export type Employer = { name: string; score: number };

// Typo-tolerant: trigrams of the unaccented, lower-cased query against the trigram GIN index on the same expression.
// <% is "the query is similar to some part of the name" (word_similarity), above pg_trgm.word_similarity_threshold.
export const EMPLOYER_SQL = `
  SELECT name, round(word_similarity(f_unaccent(lower($1)), f_unaccent(lower(name)))::numeric, 2)::float AS score
  FROM employers
  WHERE f_unaccent(lower($1)) <% f_unaccent(lower(name))
  ORDER BY score DESC, name
  LIMIT $2`;

export async function searchEmployers(text: string, threshold = 0.6, limit = 5): Promise<Employer[]> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('pg_trgm.word_similarity_threshold', $1, true)", [String(threshold)]);
    const r = await c.query(EMPLOYER_SQL, [text, limit]);
    await c.query("COMMIT");
    return r.rows;
  } finally {
    c.release();
  }
}

// What the first version did: a substring match on every text column. No B-tree index can serve a leading % (a trigram index could, but would still miss accents and typos),
// and there is no rank: rows come back in whatever order the scan meets them.
export const NAIVE_ARTICLE_SQL = `
  SELECT id, slug FROM help_articles
  WHERE title_en ILIKE '%' || $1 || '%' OR body_en ILIKE '%' || $1 || '%' OR title_fr ILIKE '%' || $1 || '%' OR body_fr ILIKE '%' || $1 || '%'
  LIMIT 10`;
export const NAIVE_EMPLOYER_SQL = `SELECT name FROM employers WHERE name ILIKE '%' || $1 || '%' LIMIT 5`;

// Escape the text, then turn the two markers into <mark>.
export function highlight(s: string) {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return esc.replaceAll(START, "<mark>").replaceAll(STOP, "</mark>");
}
// For the log: [Élodie] instead of markers.
export const plain = (s: string) => s.replaceAll(START, "[").replaceAll(STOP, "]");
