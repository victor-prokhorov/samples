// The member page in two versions. Same content, same look; only how it is delivered differs.
import { history, total } from "./client/data.js";

export const COLLECTOR = `http://localhost:${process.env.COLLECTOR_PORT ?? 53149}/vitals`;

export const CSS = `
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#181c22;background:#f7f8fa}
header{background:#fff;border-bottom:1px solid #dde1e7}
header div,main{max-width:800px;margin:0 auto;padding:12px 16px}
header strong{font-size:18px}
nav a{margin-left:16px;color:#2456cc}
h1{font-size:28px;margin:16px 0 4px}
h2{font-size:20px;margin:24px 0 8px}
.lede{margin:0 0 16px;color:#525a66}
.hero{display:block;width:100%;height:auto;border-radius:8px;background:#dde1e7}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.summary div{background:#fff;border:1px solid #dde1e7;border-radius:8px;padding:12px}
.summary span{display:block;color:#525a66;font-size:14px}
.summary strong{font-size:20px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;background:#fff;font-size:14px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eef0f3}
.num{text-align:right;font-variant-numeric:tabular-nums}
button{font:inherit;padding:8px 16px;border-radius:6px;border:1px solid #6b7480;background:#fff;cursor:pointer}
.collapsed tr:nth-child(n+13){display:none}
.notice{background:#fff8eb;border-left:4px solid #b25e09;padding:16px;border-radius:6px;margin:16px 0}
`;

const header = `<header><div><strong>Acme pension plan</strong><nav><a href="#">Account</a><a href="#">Documents</a><a href="#">Help</a></nav></div></header>`;
const intro = `<h1>Hello, Alex</h1><p class="lede">Your Acme retirement plan, updated 30 September 2026.</p>`;
const heroAlt = "A couple walking on a beach at sunset";

// Slow: an external stylesheet, a synchronous third-party tag and a 500 KB synchronous bundle in <head> (all
// render-blocking), a 2400 px PNG with no width and height, and a page that the script builds after it has run.
export function slowPage() {
  return `<!doctype html>
<html lang="en" data-vitals="${COLLECTOR}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your account - Acme pension plan</title>
<link rel="stylesheet" href="/slow/styles.css">
<script src="/slow/tag.js"></script>
<script src="/slow/app.js"></script>
</head><body>${header}<main>${intro}
<img class="hero" src="/img/hero.png" alt="${heroAlt}">
<div id="app"><p>Loading your account…</p></div>
</main></body></html>`;
}

// Fast: critical CSS inline, the hero preloaded in a modern format at the size the screen needs, with its width and
// height so the space is reserved, the content rendered on the server (notice included), a small module script
// (deferred by default) and the third-party tag async.
export function fastPage() {
  const rows = history();
  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const lastYear = rows.filter((r) => r.date.startsWith("2025"));
  const years = new Set(rows.map((r) => r.date.slice(0, 4))).size;
  const srcset = (fmt: string) => [480, 800, 1200].map((w) => `/img/hero-${w}.${fmt} ${w}w`).join(", ");
  const sizes = "(min-width: 832px) 768px, calc(100vw - 32px)";
  return `<!doctype html>
<html lang="en" data-vitals="${COLLECTOR}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your account - Acme pension plan</title>
<style>${CSS.trim()}</style>
<link rel="preload" as="image" imagesrcset="${srcset("avif")}" imagesizes="${sizes}" type="image/avif" fetchpriority="high">
<script type="module" src="/fast/app.js"></script>
<script async src="/fast/tag.js"></script>
</head><body>${header}<main>
<div class="notice"><strong>Check your beneficiaries.</strong> You have not named anyone to receive your savings if you die before you retire. It takes two minutes. <a href="#">Name a beneficiary</a></div>
${intro}
<picture><source type="image/avif" srcset="${srcset("avif")}" sizes="${sizes}">
<img class="hero" src="/img/hero-800.webp" srcset="${srcset("webp")}" sizes="${sizes}" width="1200" height="500" alt="${heroAlt}" fetchpriority="high"></picture>
<div id="app">
<section class="summary" aria-label="Summary">
<div><span>Balance</span><strong>${money.format(total(rows) / 100)}</strong></div>
<div><span>Paid in 2025</span><strong>${money.format(total(lastYear) / 100)}</strong></div>
<div><span>Years of service</span><strong>${years}</strong></div>
</section>
<h2>Latest contributions</h2>
<table><thead><tr><th>Date</th><th>Payment</th><th>Employer</th><th class="num">Amount</th></tr></thead><tbody id="rows">
${rows
  .slice(0, 12)
  .map((r) => `<tr><td>${date.format(new Date(r.date))}</td><td>${r.label}</td><td>${r.employer}</td><td class="num">${money.format(r.cents / 100)}</td></tr>`)
  .join("\n")}
</tbody></table>
<p><button id="all" type="button">Show full history (${rows.length} payments)</button></p>
</div></main></body></html>`;
}
