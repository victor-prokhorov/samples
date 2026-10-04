// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "25. Bilingual pages: catalogues, Intl and negotiation")
  .box("req", 40, 150, 240, 110, "Request\nAccept-Language:\nfr-CA, fr;q=0.9, en;q=0.8\nor ?lang=fr (wins)")
  .box("neg", 340, 150, 240, 110, "negotiate.ts\nq-values, q=0 never,\nexact, then primary\nlanguage, fallback en")
  .box("cat", 640, 90, 300, 110, "messages/fr.json\nICU MessageFormat: plural,\nselect, number, date;\nwhole sentences")
  .box("intl", 640, 230, 300, 90, "Intl in fr-FR\n1 234,56 € with\nno-break spaces")
  .box("page", 1000, 150, 240, 110, "Page\n<html lang=\"fr\">\nContent-Language,\nVary: Accept-Language", { bold: true })
  .arrow("req", "neg")
  .arrow("neg", "cat")
  .arrow("neg", "intl")
  .arrow("cat", "page")
  .arrow("intl", "page")
  .box("check", 340, 380, 420, 80, "CI: catalogue check, same keys, same\nICU arguments and types, same select cases")
  .box("pseudo", 820, 380, 420, 80, "en-XA pseudo-locale: accented, +40%, in ⟦ ⟧:\nany text without brackets skipped the catalogue")
  .box("naive", 40, 500, 1200, 60, "Before (/naive): \"€\" + toFixed(2) gives €4111.06, toDateString() gives Sat Jan 31 2026,\n\"request(s)\" gives 0 pending request(s), and no lang for the screen reader", { dashed: true })
  .text(40, 590, "CLDR plurals differ: English puts 0 in \"other\" (0 pending requests), French in \"one\" (0 demande en attente).")
  .write(dirname(fileURLToPath(import.meta.url)));
