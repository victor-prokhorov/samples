import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = join(ROOT, "dist");
export const OUT = join(ROOT, "out");
export const PORT = Number(process.env.PORT ?? 53049);
export const COLLECTOR_PORT = Number(process.env.COLLECTOR_PORT ?? 53149);
export const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
