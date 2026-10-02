import { compareCatalogues, load } from "./catalogues.js";

const problems = compareCatalogues(load("messages/en.json"), load("messages/fr.json"), "fr");
for (const p of problems) console.log(`   ${p}`);
console.log(problems.length ? `   ${problems.length} problems` : "   fr matches en: same keys, same arguments");
process.exit(problems.length ? 1 : 0);
