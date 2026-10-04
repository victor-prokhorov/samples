// The fast member page's script. The server already rendered everything a member sees first, so this module only
// adds the "full history" button, and it never holds the main thread for long.
import { type Row, history } from "./data.js";
import { reportVitals } from "./vitals.js";

reportVitals("fast");

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });

function row(r: Row) {
  const tr = document.createElement("tr");
  for (const [text, cls] of [
    [dateFmt.format(new Date(r.date)), ""],
    [r.label, ""],
    [r.employer, ""],
    [money.format(r.cents / 100), "num"],
  ]) {
    const td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    tr.append(td);
  }
  return tr;
}

// Give the browser a chance to paint and handle input between chunks of work.
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const button = document.getElementById("all") as HTMLButtonElement;
const tbody = document.getElementById("rows")!;
button.addEventListener("click", async () => {
  // Feedback first: the next paint (what INP measures) shows the button busy, before any heavy work.
  button.disabled = true;
  button.textContent = "Loading the full history…";
  await yieldToMain();
  const rows = history();
  const fresh = document.createElement("tbody");
  fresh.id = "rows";
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = document.createDocumentFragment();
    for (const r of rows.slice(i, i + 100)) chunk.append(row(r));
    fresh.append(chunk);
    await yieldToMain();
  }
  tbody.replaceWith(fresh); // one DOM swap, no layout read in between
  button.textContent = `Showing all ${rows.length} payments`;
});
