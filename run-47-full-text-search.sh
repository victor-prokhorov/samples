#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/47-full-text-search.log) 2>&1
cd 47-full-text-search
echo "# 47-full-text-search run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== setup: unaccent and pg_trgm, two text search configurations, 200,000 generated rows per table, GIN indexes =="
npm run --silent setup
echo "== demo: naive ILIKE, then tsvector + unaccent + websearch_to_tsquery + ts_rank_cd + ts_headline, pg_trgm for names, and the page =="
status=0
npm run --silent demo || status=$?
echo
echo "== proof: the text search configurations (word tokens go through unaccent, then the stemmer) =="
psql -c "SELECT cfgname, alias AS token, string_agg(dictname, ', ' ORDER BY mapseqno) AS dictionaries FROM pg_ts_config c, ts_token_type(c.cfgparser) t, pg_ts_config_map m JOIN pg_ts_dict d ON d.oid = m.mapdict WHERE m.mapcfg = c.oid AND m.maptokentype = t.tokid AND cfgname IN ('en_unaccent', 'fr_unaccent') AND alias IN ('asciiword', 'word', 'hword') GROUP BY cfgname, alias ORDER BY cfgname, alias"
echo "== proof: the generated columns and indexes =="
psql -c "SELECT column_name, generation_expression FROM information_schema.columns WHERE table_name = 'help_articles' AND is_generated = 'ALWAYS'"
psql -c "SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS size, indexdef FROM pg_indexes WHERE tablename IN ('help_articles', 'employers') AND indexdef ILIKE '%gin%'"
echo "== proof: what the index stores for one curated article (French, accents gone, stems kept) =="
psql -c "SELECT slug, search_fr FROM help_articles WHERE slug = 'early-retirement'"
echo "== proof: EXPLAIN ANALYZE, bad: ILIKE '%Élodie%' over every text column =="
psql -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT id, slug FROM help_articles WHERE title_en ILIKE '%Élodie%' OR body_en ILIKE '%Élodie%' OR title_fr ILIKE '%Élodie%' OR body_fr ILIKE '%Élodie%' LIMIT 10"
echo "== proof: EXPLAIN ANALYZE, good: the English and French tsvector columns for what was typed, 'elodie' =="
psql -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT id FROM help_articles WHERE search_en @@ websearch_to_tsquery('en_unaccent', 'elodie') OR search_fr @@ websearch_to_tsquery('fr_unaccent', 'elodie')"
echo "== proof: EXPLAIN ANALYZE, bad and good employer search =="
psql -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT name FROM employers WHERE name ILIKE '%Initech%' LIMIT 5"
psql -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT name FROM employers WHERE f_unaccent(lower('initek')) <% f_unaccent(lower(name))"
echo "== proof: screenshots/search-elodie.png =="
ls -l screenshots/search-elodie.png | awk '{print $5, $9}'
exit $status
