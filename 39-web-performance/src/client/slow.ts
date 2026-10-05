// The slow member page's script, written the way many portals grow: every pattern here is common, none is a bug on
// its own, and together they make the page slow to show and slow to answer.
import _ from "lodash"; // the whole library, for orderBy, sumBy and groupBy
import moment from "moment/min/moment-with-locales"; // moment and all of its 130+ locales, to format dates in English
import { type Row, history, total } from "./data.js";
import { reportVitals } from "./vitals.js";

reportVitals("slow");

const euro = (cents: number) => (cents < 0 ? "-€" : "€") + _.round(Math.abs(cents) / 100, 2).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const date = (iso: string) => moment(iso, "YYYY-MM-DD").locale("en-gb").format("D MMM YYYY");

// One row at a time straight into the live table, reading its height after each row "to keep the sticky header
// in place": every read forces a synchronous layout of the whole table (layout thrashing).
function renderRows(table: HTMLElement, rows: Row[]) {
  table.innerHTML = "";
  for (const r of rows) {
    table.insertAdjacentHTML("beforeend", `<tr><td>${date(r.date)}</td><td>${r.label}</td><td>${r.employer}</td><td class="num">${euro(r.cents)}</td></tr>`);
    table.style.minHeight = `${table.offsetHeight}px`;
  }
}

// An A/B-testing snippet run synchronously before anything renders "so the page never flickers": it blocks the main
// thread for about 200 ms while it decides (on any machine: it waits on the clock, not on the CPU).
function decideExperiments() {
  const until = performance.now() + 200;
  let n = 0;
  while (performance.now() < until) n++;
  return n;
}

function start() {
  decideExperiments();
  const rows = history();
  const byYear = _.groupBy(rows, (r) => moment(r.date).year());
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <section class="summary" aria-label="Summary">
      <div><span>Balance</span><strong>${euro(total(rows))}</strong></div>
      <div><span>Paid in ${moment().year() - 1}</span><strong>${euro(_.sumBy(byYear[String(moment().year() - 1)] ?? [], "cents"))}</strong></div>
      <div><span>Years of service</span><strong>${_.size(byYear)}</strong></div>
    </section>
    <h2>Latest contributions</h2>
    <table><thead><tr><th>Date</th><th>Payment</th><th>Employer</th><th class="num">Amount</th></tr></thead><tbody id="rows"></tbody></table>
    <p><button id="all" type="button">Show full history (${rows.length} payments)</button></p>`;
  const tbody = document.getElementById("rows")!;
  // Render everything, hide all but 12 rows with CSS: the start-up pays for rows nobody may ever look at.
  tbody.classList.add("collapsed");
  renderRows(tbody, rows);
  // "Re-render to be sure the order is right": one synchronous handler, nothing painted until every row is in (slow INP).
  document.getElementById("all")!.addEventListener("click", () => {
    renderRows(tbody, _.orderBy(rows, (r) => moment(r.date).valueOf(), "desc"));
    tbody.classList.remove("collapsed");
  });
  // A notice that arrives after the content, pushed in at the top: the whole page jumps down (layout shift).
  setTimeout(() => {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.innerHTML = "<strong>Check your beneficiaries.</strong> You have not named anyone to receive your savings if you die before you retire. It takes two minutes. <a href='#'>Name a beneficiary</a>";
    document.querySelector("main")!.prepend(notice);
  }, 800);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
