import { compareCatalogues, load } from "./catalogues.js";
import { PSEUDO } from "./i18n.js";
import { CLOSE, OPEN } from "./pseudo.js";
import { textNodes } from "./scan.js";

const BASE = "http://localhost:53035";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

async function get(path: string, acceptLanguage?: string) {
  const res = await fetch(BASE + path, { headers: acceptLanguage === undefined ? {} : { "accept-language": acceptLanguage } });
  const html = await res.text();
  return { html, contentLanguage: res.headers.get("content-language"), vary: res.headers.get("vary"), ...textNodes(html) };
}

const byId = (html: string, id: string) => html.match(new RegExp(`id="${id}">([^<]*)<`))?.[1] ?? "";
const visible = (s: string) => s.replace(/ /g, "⍽").replace(/ /g, "·");

// Text a reader sees in the page's language that did not go through the catalogue or Intl: in the pseudo-locale it has no brackets.
function pseudoFindings(page: Awaited<ReturnType<typeof get>>) {
  const hardCoded: string[] = [];
  const overflow: string[] = [];
  for (const n of page.nodes) {
    if (n.path.includes("style") || n.path.includes("script")) continue;
    if (n.attrs.some((a) => a.translate === "no" || (a.lang && a.lang !== page.lang))) continue;
    const outside = n.text.replace(new RegExp(`${OPEN}[^${CLOSE}]*${CLOSE}`, "g"), "");
    if (/\p{L}/u.test(outside)) hardCoded.push(n.text);
    const max = Number(n.attrs.at(-1)?.["data-maxch"]);
    if (max && [...n.text].length > max) overflow.push(`<${n.path.at(-1)}> "${n.text}" is ${[...n.text].length} characters in a ${max}ch box`);
  }
  return { hardCoded, overflow };
}

step("1. Locale negotiation", "Accept-Language ranges by q-value, exact tag then primary language, q=0 means never, fallback to English; ?lang= (an explicit choice) wins");
const cases: [string, string | undefined, string][] = [
  ["/", "fr-CA,fr;q=0.9,en;q=0.8", "fr"],
  ["/", "en-GB,en;q=0.9", "en"],
  ["/", "de-DE,de;q=0.9,fr;q=0.5,en;q=0.3", "fr"],
  ["/", "fr;q=0,en;q=0.5", "en"],
  ["/", "de-CH", "en"],
  ["/", "*", "en"],
  ["/", "en;q=0, *", "fr"],
  ["/", undefined, "en"],
  ["/?lang=fr", "en-GB,en;q=0.9", "fr"],
];
for (const [path, al, want] of cases) {
  const p = await get(path, al);
  console.log(`   GET ${path.padEnd(10)} Accept-Language: ${(al ?? "(none)").padEnd(34)} -> Content-Language: ${p.contentLanguage}, <html lang="${p.lang}">, Vary: ${p.vary}`);
  check(p.contentLanguage === want && p.lang === want && p.vary === "Accept-Language", `${al} gives ${want}`);
}

step("2. One page, two locales: numbers, money, dates", "Intl formats per locale: group and decimal separators, currency position, month names; concatenating '€' + toFixed(2) is English in every language");
const en = await get("/?lang=en");
const fr = await get("/?lang=fr");
const naiveFr = await get("/naive?lang=fr");
const firstRow = (html: string) => html.match(/<tr><td>([^<]*)<\/td><td translate="no">[^<]*<\/td><td>([^<]*)</)!.slice(1).join(" | ");
const lastLogin = (html: string) => html.match(/<main>\s*<h1>[^<]*<\/h1>\s*<p>([^<]*)</)?.[1] ?? "";
console.log("   (⍽ is U+202F narrow no-break space, · is U+00A0 no-break space)");
for (const [label, p] of [["en", en], ["fr", fr], ["fr, naive page", naiveFr]] as const) {
  const rate = byId(p.html, "rate") || "(none)";
  console.log(`   ${label.padEnd(15)} total: ${visible(byId(p.html, "total")).padEnd(22)} rate: ${visible(rate).padEnd(30)} row: ${visible(firstRow(p.html)).padEnd(26)} ${visible(lastLogin(p.html))}`);
}
check(byId(en.html, "total") === "Total: €4,111.06", "English total is €4,111.06");
check(byId(fr.html, "total") === "Total : 4 111,06 €", "French total is 4 111,06 € with the right spaces");
check(byId(naiveFr.html, "total") === "Total: €4111.06", "the naive page shows English formatting in French");

step("3. Plural and select rules come from CLDR, not from the code", "French puts 0 in the 'one' category, English in 'other'; roles are a select with gender-free wording in French");
for (const member of ["alice", "bob", "carol"]) {
  const e = await get(`/?member=${member}&lang=en`);
  const f = await get(`/?member=${member}&lang=fr`);
  const header = (p: typeof e) => p.html.match(/<header>\s*<p>([^<]*)</)![1];
  console.log(`   ${member.padEnd(6)} en: ${byId(e.html, "pending").padEnd(20)} ${header(e).padEnd(36)} fr: ${byId(f.html, "pending").padEnd(22)} ${header(f)}`);
}
const zero = await get("/?member=alice&lang=fr");
check(byId(zero.html, "pending") === "0 demande en attente", "French 0 is singular");
check(byId((await get("/?member=alice&lang=en")).html, "pending") === "0 pending requests", "English 0 is plural");

step("4. Both catalogues must have the same keys and the same ICU arguments", "a translator renaming {count}, dropping a select case or a key, or breaking the syntax fails the build, not the page");
const broken = compareCatalogues(load("messages/en.json"), load("fixtures/fr.broken.json"), "fixtures/fr.broken.json");
for (const p of broken) console.log(`   ${p}`);
check(broken.length === 7, `7 problems in the broken catalogue (got ${broken.length})`);
const real = compareCatalogues(load("messages/en.json"), load("messages/fr.json"), "messages/fr.json");
console.log(`   messages/fr.json against messages/en.json: ${real.length} problems`);
check(real.length === 0, "the real catalogues match");

step("5. Pseudo-localisation finds hard-coded strings and fixed widths", `${PSEUDO}: every catalogue string accented, 40% longer, in ${OPEN}${CLOSE}; anything readable without brackets skipped the catalogue`);
const naivePseudo = pseudoFindings(await get(`/naive?lang=${PSEUDO}`));
const naiveFrench = pseudoFindings(naiveFr);
const fixedPseudo = pseudoFindings(await get(`/?lang=${PSEUDO}`));
console.log(`   /naive?lang=${PSEUDO}: ${naivePseudo.hardCoded.length} hard-coded strings, ${naivePseudo.overflow.length} overflow`);
for (const s of naivePseudo.hardCoded) console.log(`     hard-coded: "${s}"`);
for (const s of naivePseudo.overflow) console.log(`     overflow: ${s}`);
for (const s of naiveFrench.overflow) console.log(`     overflow in real French too: ${s}`);
console.log(`   /?lang=${PSEUDO}: ${fixedPseudo.hardCoded.length} hard-coded strings, ${fixedPseudo.overflow.length} overflow`);
const sample = (await get(`/?lang=${PSEUDO}`)).html.match(/<h1>([^<]*)<\/h1>[\s\S]*?id="pending">([^<]*)<[\s\S]*?id="total">([^<]*)</)!;
console.log(`     sample: ${sample.slice(1).join("  ")}`);
check(naivePseudo.hardCoded.length > 0 && naivePseudo.overflow.length > 0, "pseudo-localisation catches the naive page");
check(naiveFrench.overflow.length > 0, "the French label overflows the naive fixed-width button");
check(fixedPseudo.hardCoded.length === 0 && fixedPseudo.overflow.length === 0, "the fixed page passes");

step("6. The lang attribute", "<html lang> tells screen readers which voice and hyphenation to use (WCAG 3.1.1); a passage in another language carries its own lang (3.1.2)");
const switchLink = (html: string) => html.match(/<nav[^>]*>(.*?)<\/nav>/)?.[1] ?? "";
console.log(`   / (en): <html lang="${en.lang}">, switcher ${switchLink(en.html)}`);
console.log(`   / (fr): <html lang="${fr.lang}">, switcher ${switchLink(fr.html)}`);
console.log(`   /naive (fr): <html> without lang, so a screen reader reads the French page with the user's default voice`);
check(en.lang === "en" && fr.lang === "fr" && naiveFr.lang === null, "lang set on the fixed pages, missing on the naive one");
check(switchLink(fr.html).includes('lang="en"') && switchLink(en.html).includes('lang="fr"'), "the language switcher marks its own language");
