// node diagrams/build.mjs -> overview.excalidraw and overview.svg. Dashed: the naive search it replaces.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "47. Full-text search: accents, word forms and typos")
  .box("q", 40, 250, 230, 90, "Member types\n\"elodie\"\n\"retraite anticipee\"\n\"initek\"", { bold: true })
  .box("bad", 380, 90, 300, 80, "ILIKE '%x%' on every column\nSeq Scan of 200k rows, misses", { dashed: true })
  .box("ws", 380, 250, 300, 90, "websearch_to_tsquery\nen_unaccent, fr_unaccent\n(unaccent, then stemmer)")
  .box("tsv", 780, 250, 300, 90, "search_en, search_fr\ngenerated tsvector, GIN\ntitle weight A, body B")
  .box("rank", 780, 430, 300, 80, "ts_rank_cd, ts_headline\nranked, matches marked")
  .box("trgm", 380, 430, 300, 80, "pg_trgm on f_unaccent(lower(name))\nGIN, word_similarity >= 0.6")
  .box("page", 1180, 430, 220, 80, "Search page :53057\nEnglish + French")
  .arrow("q", "bad", { dashed: true, label: "before" })
  .arrow("q", "ws", { label: "articles" })
  .arrow("ws", "tsv", { label: "@@" })
  .arrow("tsv", "rank")
  .arrow("rank", "page")
  .arrow("q", "trgm", { label: "employers", via: [[155, 470]] })
  .arrow("trgm", "page", { via: [[530, 570], [1290, 570]] })
  .text(40, 620, "Same normalisation on both sides: the document and the query go through unaccent and the stemmer,\nso 'elodie' meets 'Élodie' and 'anticipee' meets 'anticipée'; trigrams forgive typos in names.")
  .write(dirname(fileURLToPath(import.meta.url)));
