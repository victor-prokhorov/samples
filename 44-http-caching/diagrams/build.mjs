// node diagrams/build.mjs -> overview.excalidraw and overview.svg. Dashed: the bug (a personal page marked public).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "44. HTTP caching: who may store what, and for how long")
  .box("browser", 40, 110, 260, 90, "Browsers\nprivate cache: assets,\n304 for personal pages", { bold: true })
  .box("cache", 460, 110, 300, 90, "Shared cache :53154\nkey = URL + Vary\nHIT, STALE, MISS, PASS")
  .box("origin", 920, 110, 300, 90, "Origin :53054\nCache-Control per resource\nETag, Cache-Tag")
  .box("pg", 920, 330, 300, 90, "Postgres\nfund prices, members\ncache_invalidations outbox")
  .box("leak", 460, 330, 300, 90, "Bug: public on /members/me\nmember 2 gets member 1's page\nfix = private + purge", { dashed: true })
  .arrow("browser", "cache", { label: "GET, cookie, lang" })
  .arrow("cache", "origin", { label: "miss: If-None-Match" })
  .arrow("origin", "pg")
  .arrow("pg", "cache", { label: "NOTIFY: purge tag", via: [[840, 375], [840, 270], [700, 270]] })
  .arrow("cache", "leak", { dashed: true })
  .text(40, 520, "assets: public, max-age=31536000, immutable (hashed names)\npersonal: private, no-cache + ETag (browsers revalidate, shared caches never store)\nfunds: public, max-age=0, s-maxage=300, stale-while-revalidate=60 + ETag + Cache-Tag: funds\nhelp: public, max-age=60, s-maxage=600 + Vary: Accept-Language (normalised to en | fr)")
  .write(dirname(fileURLToPath(import.meta.url)));
