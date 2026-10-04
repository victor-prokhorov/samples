// node diagrams/build.mjs -> overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "35. Design tokens: one source, every check")
  .box("tokens", 40, 110, 240, 110, "tokens/*.tokens.json\n(DTCG, from the design tool)\nprimitives -> semantic\ntheme.light, theme.dark", { bold: true })
  .box("css", 340, 110, 240, 110, "out/tokens.css\nCSS custom properties\n:root, [data-theme=dark],\nprefers-color-scheme")
  .box("comp", 640, 110, 240, 110, "components.css + React\nButton, TextField,\nAlert, Card\nvar(--semantic) only")
  .box("sb", 940, 110, 240, 110, "Static Storybook\n14 stories x 2 themes\n(a11y addon)")
  .box("contrast", 40, 330, 240, 90, "Contrast gate\n74 fg/bg pairs, WCAG ratio\n4.5:1 text, 3:1 UI")
  .box("axe", 640, 330, 240, 90, "axe-core per story\nWCAG 2.0-2.2 A + AA")
  .box("visual", 940, 330, 240, 90, "Visual regression\ntoHaveScreenshot\nvs committed baselines")
  .box("v1", 40, 500, 240, 60, "proposal v1: muted gray-500", { dashed: true })
  .box("v2", 940, 500, 240, 60, "proposal v2: accent blue-700", { dashed: true })
  .arrow("tokens", "css", { label: "build" })
  .arrow("css", "comp")
  .arrow("comp", "sb")
  .arrow("tokens", "contrast")
  .arrow("sb", "axe", { via: [[1060, 270], [760, 270]] })
  .arrow("sb", "visual")
  .arrow("v1", "contrast", { dashed: true, label: "fails: 4.45:1" })
  .arrow("v2", "visual", { dashed: true, label: "2 diffs" })
  .text(340, 470, "A token change is checked before any screen ships:\nby ratio (the gate), in the browser (axe),\nand by pixels (screenshots), in light and dark.")
  .write(dirname(fileURLToPath(import.meta.url)));
