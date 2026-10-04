// The story step by step, with checks. Runs against the 400,000 rows setup.ts loaded.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { PORT, db } from "./db.js";
import { ARTICLE_SQL, EMPLOYER_SQL, NAIVE_ARTICLE_SQL, NAIVE_EMPLOYER_SQL, WEIGHTS, plain, searchArticles, searchEmployers } from "./search.js";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean) {
  if (cond) passed++;
  else failed++;
  console.log(`   ${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
}
function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

type Plan = { "Node Type": string; "Index Name"?: string; "Relation Name"?: string; Plans?: Plan[] };
function nodes(p: Plan): string[] {
  const self = p["Node Type"].includes("Scan") && (p["Index Name"] || p["Relation Name"]) ? [`${p["Node Type"]}${p["Index Name"] ? ` on ${p["Index Name"]}` : p["Relation Name"] ? ` on ${p["Relation Name"]}` : ""}`] : [];
  return [...self, ...(p.Plans ?? []).flatMap(nodes)];
}
// EXPLAIN ANALYZE five times; the best execution time is the warm-cache cost, the scans say how the rows were found.
async function explain(sql: string, params: unknown[], settings = "") {
  let best = Infinity;
  let scans: string[] = [];
  let rows = 0;
  for (let i = 0; i < 5; i++) {
    const c = await db.connect();
    try {
      if (settings) await c.query(settings);
      const [out] = (await c.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params)).rows[0]["QUERY PLAN"];
      best = Math.min(best, out["Execution Time"]);
      scans = [...new Set(nodes(out.Plan))];
      rows = out.Plan["Actual Rows"];
    } finally {
      if (settings) await c.query("RESET ALL");
      c.release();
    }
  }
  return { ms: best, scans, rows };
}

async function main() {
  const counts = (await db.query("SELECT (SELECT count(*) FROM help_articles)::int AS articles, (SELECT count(*) FROM employers)::int AS employers")).rows[0];
  console.log(`   ${counts.articles} help articles (10 written in English and French, the rest a generated archive) and ${counts.employers} employers`);

  step("1. The first version: ILIKE '%x%'", "a substring match is accent-sensitive, typo-intolerant and unranked, and a leading % means no B-tree can help, so every row is read");
  const naive = async (sql: string, q: string) => (await db.query(sql, [q])).rows;
  for (const q of ["elodie", "retraite anticipee"]) {
    const r = await naive(NAIVE_ARTICLE_SQL, q);
    console.log(`   articles ILIKE '%${q}%': ${r.length} rows`);
    check(`ILIKE misses the articles a member means by "${q}"`, r.length === 0);
  }
  const withAccent = await naive(NAIVE_ARTICLE_SQL, "Élodie");
  console.log(`   articles ILIKE '%Élodie%': ${withAccent.length} rows, in table order: ${withAccent.map((r) => r.slug).join(", ")}`);
  check("only the exact accented spelling finds them, and the article about Élodie is not first", withAccent.length === 3 && withAccent[0].slug !== "adviser");
  for (const q of ["globx", "initek", "boulangerie elodie"]) {
    const r = await naive(NAIVE_EMPLOYER_SQL, q);
    console.log(`   employers ILIKE '%${q}%': ${r.length} rows`);
    check(`ILIKE finds no employer for the typo or missing accent "${q}"`, r.length === 0);
  }

  step("2. A text search configuration with unaccent", "en_unaccent and fr_unaccent copy english and french, and run unaccent before the stemmer, so the document and the query are normalised the same way");
  const lex = (await db.query(`SELECT to_tsvector('french', $1)::text AS french, to_tsvector('fr_unaccent', $1)::text AS fr_unaccent, to_tsvector('fr_unaccent', $2)::text AS typed`, ["Élodie, retraite anticipée", "elodie retraite anticipee"])).rows[0];
  console.log(`   to_tsvector('french',      'Élodie, retraite anticipée') = ${lex.french}`);
  console.log(`   to_tsvector('fr_unaccent', 'Élodie, retraite anticipée') = ${lex.fr_unaccent}`);
  console.log(`   to_tsvector('fr_unaccent', 'elodie retraite anticipee')  = ${lex.typed}`);
  check("with unaccent the accented text and the unaccented query give the same lexemes", lex.fr_unaccent === lex.typed && lex.french !== lex.typed);
  const elodie = await searchArticles("elodie", 10);
  console.log(`   search "elodie": ${elodie.length} hits, ${elodie.filter((h) => h.lang === "en").length} English and ${elodie.filter((h) => h.lang === "fr").length} French`);
  check('"elodie" finds the articles about Élodie in both languages', elodie.some((h) => h.lang === "en") && elodie.some((h) => h.lang === "fr") && elodie.length === 6);
  const anticipee = await searchArticles("retraite anticipee", 10);
  for (const h of anticipee) console.log(`   search "retraite anticipee": ${h.lang} ${plain(h.title)}`);
  check('"retraite anticipee" finds "Retraite anticipée"', anticipee[0]?.title.includes("anticipée") ?? false);

  step("3. websearch_to_tsquery", "takes what people type (quotes for a phrase, - to exclude, OR) and never raises a syntax error, unlike to_tsquery");
  for (const q of ['"early retirement" -tax', "pension OR épargne", "beneficiaries", "retraite & | ("]) {
    const r = (await db.query("SELECT websearch_to_tsquery('en_unaccent', $1)::text AS en, websearch_to_tsquery('fr_unaccent', $1)::text AS fr", [q])).rows[0];
    console.log(`   ${JSON.stringify(q).padEnd(26)} en: ${r.en.padEnd(34)} fr: ${r.fr}`);
  }
  const strict = await db.query("SELECT to_tsquery('fr_unaccent', 'retraite & | (')").then(() => "accepted", (e: Error) => e.message);
  console.log(`   to_tsquery('fr_unaccent', 'retraite & | (') -> ${strict}`);
  check("to_tsquery rejects raw user input that websearch_to_tsquery accepts", strict.startsWith("syntax error"));
  const loose = await searchArticles("early retirement", 10);
  const phrase = await searchArticles('"early retirement" -tax', 10);
  const plural = await searchArticles("beneficiaries", 10);
  console.log(`   early retirement: ${loose.map((h) => `${h.lang} ${plain(h.title)}`).join("; ")}`);
  console.log(`   "early retirement" -tax: ${phrase.map((h) => `${h.lang} ${plain(h.title)}`).join("; ")}`);
  console.log(`   beneficiaries: ${plural.map((h) => `${h.lang} ${plain(h.title)}`).join("; ")}`);
  check("without quotes both words anywhere match 2 articles; the phrase keeps only the one where they are adjacent; the plural finds the singular title", loose.length === 2 && phrase.length === 1 && plain(phrase[0].title).startsWith("[Early] [retirement]") && plural[0] && plain(plural[0].title).includes("[beneficiary]"));

  step("4. Ranking: ts_rank_cd with weights", `title words carry weight A and body words B; weights ${WEIGHTS} are {D, C, B, A}, so a title hit counts 2.5 times a body hit`);
  for (const h of elodie) console.log(`   ${h.rank.toFixed(3)}  ${h.lang}  ${plain(h.title)}`);
  check("the two articles with Élodie in the title rank above the four that only mention her in the body", elodie.slice(0, 2).every((h) => h.title.includes("\u0002")) && elodie.slice(2).every((h) => !h.title.includes("\u0002")) && elodie[1].rank > elodie[2].rank);

  step("5. Highlighting: ts_headline", "returns the best fragments with the matched words marked; it normalises words with the same configuration, so the accented original is the one marked");
  for (const h of elodie.slice(0, 2)) console.log(`   ${h.lang}: ${plain(h.snippet)}`);
  check("ts_headline marks the original accented word for the unaccented query", elodie.slice(0, 2).every((h) => plain(h.snippet).includes("[Élodie]")));

  step("6. Typos: pg_trgm on employer names", "trigram similarity on f_unaccent(lower(name)) with a GIN gin_trgm_ops index; word_similarity (<%) compares the query with the best-matching part of a long name");
  for (const q of ["globx", "initek", "boulangerie elodie", "lefevre garage"]) {
    const r = await searchEmployers(q, 0.6, 3);
    console.log(`   ${q.padEnd(20)} ${r.map((e) => `${e.name} (${e.score})`).join(", ")}`);
  }
  const top = async (q: string) => (await searchEmployers(q, 0.6, 1))[0]?.name;
  check("typos, missing accents and word order still find the right employer first", (await top("globx")) === "Globex Corporation" && (await top("initek")) === "Initech" && (await top("boulangerie elodie")) === "Boulangerie Élodie" && (await top("lefevre garage")) === "Garage Lefèvre & Fils");
  console.log("   the threshold trades recall for noise (pg_trgm.word_similarity_threshold, default 0.6):");
  const byThreshold: Record<string, number> = {};
  for (const t of [0.3, 0.45, 0.6, 0.8]) {
    const n = (await explain(EMPLOYER_SQL.replace("LIMIT $2", ""), ["boulanjerie elodi"], `SET pg_trgm.word_similarity_threshold = ${t}`)).rows;
    byThreshold[t] = n;
    console.log(`     threshold ${t.toFixed(2)}: "boulanjerie elodi" matches ${n} employers`);
  }
  const best = (await searchEmployers("boulanjerie elodi", 0.6, 1))[0];
  console.log(`     at 0.60 the one match is ${best?.name} (${best?.score})`);
  check("a loose threshold floods the list, the default keeps the one meant, too strict a one loses it", byThreshold["0.3"] > 1000 && byThreshold["0.6"] === 1 && best?.name === "Boulangerie Élodie" && byThreshold["0.8"] === 0);

  step("7. Bad versus good on 200,000 rows each (EXPLAIN ANALYZE, best of 5)", "the naive queries read every row (Seq Scan); the good ones go through the GIN indexes (Bitmap Index Scan)");
  const pairs: [string, string, unknown[], string, unknown[]][] = [
    ["articles 'Élodie'", NAIVE_ARTICLE_SQL, ["Élodie"], ARTICLE_SQL, ["elodie", 10, "HighlightAll=true", "MaxFragments=2"]],
    ["articles 'retraite anticipee'", NAIVE_ARTICLE_SQL, ["retraite anticipée"], ARTICLE_SQL, ["retraite anticipee", 10, "HighlightAll=true", "MaxFragments=2"]],
    ["employers 'initek'", NAIVE_EMPLOYER_SQL, ["Initech"], EMPLOYER_SQL, ["initek", 5]],
  ];
  for (const [what, badSql, badArgs, goodSql, goodArgs] of pairs) {
    const bad = await explain(badSql, badArgs);
    const good = await explain(goodSql, goodArgs);
    console.log(`   ${what}`);
    console.log(`     bad  (ILIKE, exact spelling ${JSON.stringify(badArgs[0])}): ${bad.ms.toFixed(1).padStart(7)} ms, ${bad.rows} rows, ${bad.scans.join(" + ")}`);
    console.log(`     good (${goodSql === EMPLOYER_SQL ? "trigram" : "tsvector"}, typed ${JSON.stringify(goodArgs[0])}): ${good.ms.toFixed(1).padStart(7)} ms, ${good.rows} rows, ${good.scans.join(" + ")}`);
    check(`${what}: the bad query is a Seq Scan, the good one an index scan, at least 10 times faster`, bad.scans.some((s) => s.startsWith("Seq Scan")) && good.scans.some((s) => s.startsWith("Bitmap Index Scan")) && !good.scans.some((s) => s.startsWith("Seq Scan")) && good.ms * 10 < bad.ms);
  }

  step("8. The search page", "the page escapes the article text, then turns ts_headline's markers into <mark>");
  const server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { stdio: ["ignore", "inherit", "inherit"] });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`);
      break;
    } catch {
      await sleep(100);
    }
  }
  mkdirSync("screenshots", { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 900 } });
  await page.goto(`http://localhost:${PORT}/search?q=elodie`);
  await page.screenshot({ path: "screenshots/search-elodie.png", fullPage: true });
  const marks = { en: await page.locator("li[lang=en] mark").count(), fr: await page.locator("li[lang=fr] mark").count() };
  const employer = await page.locator("h2:has-text('Employers') + ol li").first().textContent();
  console.log(`   /search?q=elodie: ${marks.en} highlights in English results, ${marks.fr} in French, first employer: ${employer?.trim()}`);
  check("the page shows highlighted results in both languages and the accented employer", marks.en > 0 && marks.fr > 0 && (employer ?? "").includes("Boulangerie Élodie"));
  const typed = '"><img src=x onerror=alert(1)> elodie';
  await page.goto(`http://localhost:${PORT}/search?q=${encodeURIComponent(typed)}`);
  const injected = await page.locator("img").count();
  const echoed = await page.inputValue("#q");
  console.log(`   /search?q=${typed}: ${injected} <img> elements in the page, search box shows ${JSON.stringify(echoed)}`);
  check("markup typed in the query is shown as text, never rendered", injected === 0 && echoed === typed);
  await browser.close();
  server.kill("SIGTERM");

  console.log(`\n== ${passed} checks passed, ${failed} failed ==`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.end();
}
