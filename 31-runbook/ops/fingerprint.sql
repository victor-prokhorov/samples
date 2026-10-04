-- One line per business table: its name, row count and an md5 of all its rows in a fixed order.
-- Two databases with the same lines hold the same data. The run log (ops.*) is left out: it keeps changing during the drill.
SELECT t || ' ' || n || ' rows md5 ' || h FROM (
  SELECT 'contributions' AS t, count(*) AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM contributions x
  UNION ALL SELECT 'import_batches', count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM import_batches x
  UNION ALL SELECT 'member_changes', count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM member_changes x
  UNION ALL SELECT 'members', count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM members x
) f ORDER BY t;
