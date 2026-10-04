// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

const rows = [
  ["no lang, low contrast,\nunlabelled radios", "axe-core scan\nof every page state", "lang, labels, fieldset\nand legend, contrast"],
  ["error shown only as a red\nborder: a screen reader\nhears nothing", "accessibility tree\nthrough Chrome DevTools:\nname, description, invalid", "error in text, aria-describedby,\naria-invalid, an error\nsummary that takes focus"],
  ["a div as the button:\nTab never reaches Save,\nEnter does nothing", "keyboard-only journey\nTab, Enter, Space,\narrows", "a real <button>; the form\ncompletes by keyboard"],
];
const d = diagram("overview", "21. Accessible forms: the same form, before and after")
  .frame("bad", 40, 90, 320, 420, "/bad")
  .frame("how", 420, 90, 320, 420, "Found by")
  .frame("good", 800, 90, 360, 420, "/good");
rows.forEach(([bad, how, good], i) => {
  const y = 140 + i * 120;
  d.box(`b${i}`, 60, y, 280, 100, bad, { dashed: true })
    .box(`h${i}`, 440, y, 280, 100, how, { bold: true })
    .box(`g${i}`, 820, y, 320, 100, good)
    .arrow(`b${i}`, `h${i}`)
    .arrow(`h${i}`, `g${i}`);
});
d.text(40, 530, "axe: 3 violations on /bad, 0 on /good in both states. axe alone misses the placeholder-only labels, the\ncolour-only error and the unreachable button: the accessibility tree and the keyboard journey find them.")
  .write(dirname(fileURLToPath(import.meta.url)));
