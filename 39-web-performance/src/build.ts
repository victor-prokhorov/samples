// Builds both versions into dist/ (a build cache, not committed):
//   dist/slow/app.js   esbuild, IIFE, minified, lodash and moment-with-locales bundled whole
//   dist/fast/app.js   esbuild, ES module, minified, no library besides web-vitals
//   dist/*/tag.js      the stand-in third-party tag
//   dist/img/hero.png  the "photo" as exported, 2400x1000 PNG (the slow page uses it as is)
//   dist/img/hero-{480,800,1200}.{avif,webp}  the image pipeline's output (the fast page uses these)
//   dist/meta-{slow,fast}.json  esbuild metafiles, read by the bundle budget
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import sharp from "sharp";
import { DIST, ROOT } from "./paths.js";

export async function buildAll() {
  mkdirSync(join(DIST, "img"), { recursive: true });
  for (const version of ["slow", "fast"] as const) {
    const result = await build({
      entryPoints: { app: `src/client/${version}.ts`, tag: "src/client/tag.ts" },
      outdir: join(DIST, version),
      bundle: true,
      minify: true,
      format: version === "slow" ? "iife" : "esm",
      target: "es2022",
      metafile: true,
      absWorkingDir: ROOT,
      logLevel: "silent",
    });
    writeFileSync(join(DIST, `meta-${version}.json`), JSON.stringify(result.metafile));
  }
  await images();
}

// A sunset over the sea, drawn pixel by pixel with a little grain, the way a real photo has noise. Deterministic.
async function images() {
  const [w, h] = [2400, 1000];
  const px = Buffer.alloc(w * h * 3);
  let seed = 7;
  const grain = () => ((seed = (seed * 48271) % 2147483647) / 2147483647 - 0.5) * 18;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = y / h;
      const sea = y > h * 0.62;
      const sun = Math.hypot(x - w * 0.62, y - h * 0.55) < h * 0.12;
      let rgb = sea
        ? [30 + 40 * (1 - t), 60 + 50 * (1 - t) + 12 * Math.sin(x / 23 + y / 3), 110 + 40 * (1 - t)]
        : [250 - 60 * t, 150 - 40 * t + 20 * Math.sin(x / 400), 90 + 80 * t];
      if (sun) rgb = [255, 220, 150];
      const i = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, rgb[c] + grain()));
    }
  const img = sharp(px, { raw: { width: w, height: h, channels: 3 } });
  await img.clone().png().toFile(join(DIST, "img", "hero.png"));
  for (const width of [480, 800, 1200]) {
    await img.clone().resize({ width }).webp({ quality: 70 }).toFile(join(DIST, "img", `hero-${width}.webp`));
    await img.clone().resize({ width }).avif({ quality: 50 }).toFile(join(DIST, "img", `hero-${width}.avif`));
  }
}

if (process.argv[1]?.endsWith("build.ts")) await buildAll();
