// PNG rendering for the samples, so every folder can show what it does at a glance.
//   node tools/render.mjs svg <file.svg>...                      -> <file>.png next to each SVG
//   node tools/render.mjs shot <url> <out.png> [width] [height]  -> screenshot of a running page (full page unless a height is given)
//   node tools/render.mjs html <file.html> <out.png> [width] [height] -> screenshot of a static HTML file
//   Pass a height to shot or html to capture only that viewport instead of the full page.
//   node tools/render.mjs pdf <file.pdf> <out.png>               -> first page of a PDF (needs pdftoppm)
// Chromium comes from PLAYWRIGHT_BROWSERS_PATH (or a regular `npx playwright install chromium`).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function withPage(fn, { width = 1280, height = 800, scale = 1 } = {}) {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function svgToPng(files, { scale = 1 } = {}) {
  await withPage(async (page) => {
    for (const file of files) {
      const data = readFileSync(file).toString("base64");
      await page.setContent(`<body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${data}"></body>`);
      await page.locator("img").screenshot({ path: file.replace(/\.svg$/, ".png") });
    }
  }, { scale });
}

export async function shot(url, out, { width = 1280, height = 800, fullPage = true } = {}) {
  await withPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.screenshot({ path: out, fullPage });
  }, { width, height });
}

export function pdfToPng(pdf, out, { dpi = 80 } = {}) {
  const base = out.replace(/\.png$/, "");
  execFileSync("pdftoppm", ["-png", "-r", String(dpi), "-f", "1", "-l", "1", "-singlefile", pdf, base]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "svg") await svgToPng(rest);
  else if (cmd === "shot") await shot(rest[0], rest[1], { width: Number(rest[2] ?? 1280), height: Number(rest[3] ?? 800), fullPage: rest[3] === undefined });
  else if (cmd === "html") await shot(pathToFileURL(resolve(rest[0])).href, rest[1], { width: Number(rest[2] ?? 1280), height: Number(rest[3] ?? 800), fullPage: rest[3] === undefined });
  else if (cmd === "pdf") pdfToPng(rest[0], rest[1]);
  else {
    console.error("usage: render.mjs svg|shot|html|pdf ...");
    process.exit(2);
  }
}
