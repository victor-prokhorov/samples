// The member's documents page. The script asks the app for a presigned PUT, sends the file straight to storage,
// tells the app it is done, then polls until the scanner has promoted or rejected it.
import { STORAGE_URL, UPLOAD_TTL_SECONDS } from "./s3.js";

export const page = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your documents - Acme member portal</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; color: #1b1b1b; max-width: 860px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .lede { margin: 0 0 20px; color: #444; }
  form { border: 1px solid #bbb; border-radius: 6px; padding: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  button { font: inherit; padding: 6px 16px; border: 2px solid #1b1b1b; background: #fff; border-radius: 4px; cursor: pointer; }
  table { border-collapse: collapse; width: 100%; margin-top: 20px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
  .status { font-weight: 600; }
  .clean::before { content: "\\2713  "; }
  .rejected::before { content: "\\2717  "; }
  .uploaded::before, .pending::before { content: "\\231B  "; }
  .how { margin-top: 24px; font-size: 14px; color: #333; background: #f5f5f5; border-radius: 6px; padding: 12px 16px; }
  .how code { font-size: 13px; }
  #steps { font: 13px/1.6 ui-monospace, monospace; white-space: pre-wrap; margin: 8px 0 0; }
</style>
</head>
<body>
<h1>Your documents</h1>
<p class="lede">Alice Martin, Acme. Upload a statement or a letter (PDF, PNG, JPEG or text, up to 100 MB). Each file is checked before anyone can download it.</p>
<form id="f">
  <label for="file">File</label>
  <input id="file" type="file" multiple required>
  <button>Upload</button>
</form>
<table>
  <thead><tr><th>File</th><th>Size</th><th>Status</th></tr></thead>
  <tbody id="list"></tbody>
</table>
<div class="how">
  <strong>How the bytes travel:</strong> this page asks the app for an upload URL valid ${UPLOAD_TTL_SECONDS} s for one type and one size,
  then sends the file straight to storage at <code>${STORAGE_URL}</code>. The app only signs, records and checks.
  <div id="steps"></div>
</div>
<script>
const list = document.getElementById("list");
const steps = document.getElementById("steps");
const fmt = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B";
const label = { pending: "Uploading", uploaded: "In quarantine, scanning", clean: "Clean", rejected: "Rejected" };
function log(line) { steps.textContent += line + "\\n"; }

async function refresh() {
  const rows = await (await fetch("/api/uploads")).json();
  list.replaceChildren(...rows.map((u) => {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    if (u.status === "clean") {
      const a = document.createElement("a");
      a.href = "/api/uploads/" + u.id + "/download";
      a.textContent = u.filename;
      name.append(a);
    } else name.textContent = u.filename;
    const size = document.createElement("td");
    size.textContent = fmt(Number(u.size));
    const st = document.createElement("td");
    st.className = "status " + u.status;
    st.textContent = label[u.status] + (u.verdict && u.status === "rejected" ? ": " + u.verdict : "");
    tr.append(name, size, st);
    return tr;
  }));
  return rows;
}

async function upload(file) {
  const type = file.type || "application/octet-stream";
  const r = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: type, size: file.size }) });
  const grant = await r.json();
  if (!r.ok) { log(file.name + ": refused by the app: " + grant.error); return; }
  const target = new URL(grant.url);
  log(file.name + ": PUT " + target.origin + target.pathname + " (signed for " + type + ", " + file.size + " bytes, " + grant.expiresIn + " s)");
  const put = await fetch(grant.url, { method: "PUT", headers: grant.headers, body: file });
  log(file.name + ": storage answered " + put.status + (put.ok ? ", ETag " + put.headers.get("etag") : ""));
  const done = await (await fetch("/api/uploads/" + grant.id + "/complete", { method: "POST" })).json();
  log(file.name + ": app confirmed the object, status " + done.status);
}

document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  steps.textContent = "";
  for (const file of document.getElementById("file").files) await upload(file);
  for (let i = 0; i < 100; i++) {
    const rows = await refresh();
    if (rows.every((u) => u.status === "clean" || u.status === "rejected")) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  document.body.dataset.settled = "yes";
});
refresh();
</script>
</body>
</html>
`;
