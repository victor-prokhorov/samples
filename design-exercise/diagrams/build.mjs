// node diagrams/build.mjs  ->  writes every NN-name.excalidraw and NN-name.svg in this folder.
// Editing a .excalidraw by hand and rerunning this script overwrites it: keep one source of truth.
// Files are numbered in step order. Dashed lines: a frame (a group of boxes), or a legacy, temporary or failure path.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// 00. The whole case on one page
diagram("00-map", "The case on one page: 13 steps in 3 phases")
  .frame("understand", 40, 90, 340, 420, "Understand")
  .box("s0", 60, 140, 300, 70, "0  Frame the problem\nassumptions, open questions")
  .box("s1", 60, 230, 300, 70, "1  Gather information\nsources, stakeholders, legacy")
  .box("s2", 60, 320, 300, 70, "2  Map journeys\nas-is pain, to-be flow")
  .box("s3", 60, 410, 300, 70, "3  Write requirements\nacceptance criteria, MVP")
  .frame("design", 420, 90, 340, 600, "Design")
  .box("s4", 440, 140, 300, 70, "4  Architecture\ncontainers, choices, ADRs")
  .box("s5", 440, 230, 300, 70, "5  Multi-tenancy + data\norg isolation, data model")
  .box("s6", 440, 320, 300, 70, "6  Security\nidentity, roles, data, ops")
  .box("s7", 440, 410, 300, 70, "7  Accessibility\nWCAG / RGAA by design")
  .box("s8", 440, 500, 300, 70, "8  Documents\nPDF statement pipeline")
  .box("s9", 440, 590, 300, 70, "9  Integrations\nIdP, legacy, files, email")
  .frame("deliver", 800, 90, 340, 330, "Deliver")
  .box("s10", 820, 140, 300, 70, "10  Migration\nlegacy to new, slice by slice")
  .box("s11", 820, 230, 300, 70, "11  Operate + measure\nrunbooks, KPIs")
  .box("s12", 820, 320, 300, 70, "12  Plan + risks\nphases, top risks, next")
  .arrow("understand", "design")
  .arrow("design", "deliver")
  .text(800, 460, "Each step answers four questions:\nWhat do we do?\nWhy (which user need or rule)?\nWhat is the trade-off?\nHow do we know it worked?")
  .write(here);

// 01. Information gathering to journeys
diagram("01-discovery", "Step 1: from information gathering to journeys")
  .frame("src", 40, 130, 280, 510, "Sources")
  .box("w", 60, 180, 240, 60, "Workshops with\nbusiness units")
  .box("i", 60, 255, 240, 60, "Interviews: members,\nemployer admins, staff")
  .box("l", 60, 330, 240, 60, "Legacy app: screens,\ncode, database")
  .box("t", 60, 405, 240, 60, "Help desk tickets and\nuser requests")
  .box("a", 60, 480, 240, 60, "Logs and analytics")
  .box("r", 60, 555, 240, 60, "Rules, policies,\nregulations")
  .box("syn", 380, 330, 220, 110, "Synthesise\naffinity map,\nglossary, rule list", { bold: true })
  .frame("out", 660, 130, 280, 510, "Outputs")
  .box("p", 680, 180, 240, 70, "Personas\n(3 or 4, real data)")
  .box("asis", 680, 270, 240, 70, "As-is journeys\n+ pain points")
  .box("rules", 680, 360, 240, 70, "Business rules\nrecovered from legacy")
  .box("gl", 680, 450, 240, 70, "Glossary, data owners,\ndata quality profile")
  .box("q", 680, 540, 240, 70, "Open questions\n+ assumptions")
  .box("tobe", 1000, 180, 240, 70, "To-be journeys", { bold: true })
  .box("req", 1000, 330, 240, 70, "Requirements +\nacceptance criteria")
  .box("bl", 1000, 480, 240, 70, "Backlog\nstory map, MVP first")
  .arrow("src", "syn")
  .arrow("syn", "out")
  .arrow("out", "tobe")
  .arrow("tobe", "req")
  .arrow("req", "bl")
  .arrow("tobe", "src", { via: [[1120, 100], [180, 100]], dashed: true, label: "play back to the same people before writing specs" })
  .text(40, 670, "Every requirement points to a journey step; every journey step points to a need you heard.")
  .write(here);

// 02. Stakeholder map
diagram("02-stakeholders", "Step 1: stakeholder map (power and interest)")
  .box("ks", 140, 100, 380, 200, "Keep satisfied\n\nsecurity officer,\ndata protection officer,\nbudget owner")
  .box("mc", 540, 100, 380, 200, "Manage closely\n\nbusiness owner (benefits team),\ntechnical lead, admins of\nthe largest organisations", { bold: true })
  .box("mo", 140, 320, 380, 200, "Monitor\n\nexternal providers,\nother IT teams")
  .box("ki", 540, 320, 380, 200, "Keep informed\n\nmembers, help desk,\nsmaller organisations")
  .text(40, 190, "high\npower")
  .text(40, 410, "low\npower")
  .text(270, 535, "low interest")
  .text(670, 535, "high interest")
  .text(40, 590, "For each stakeholder write: what they need from the portal, what they fear,\nwhat decision they own, and how often you meet them.")
  .write(here);

// 03. One journey as swimlanes
diagram("03-journey", "Step 2: journey 'change my bank details' (to-be)")
  .frame("lm", 40, 90, 1240, 130, "Member")
  .frame("lp", 40, 230, 1240, 130, "Portal")
  .frame("ls", 40, 370, 1240, 130, "Staff (two different people above the threshold)")
  .frame("ll", 40, 510, 1240, 130, "Payroll / legacy system")
  .box("m1", 180, 130, 180, 70, "Signs in (SSO)")
  .box("m2", 400, 130, 180, 70, "Re-authenticates\nwith MFA")
  .box("m3", 620, 130, 180, 70, "Enters new account\n+ effective date")
  .box("m4", 1060, 130, 200, 70, "Sees the status;\nemail when applied")
  .box("p1", 620, 270, 180, 70, "Validates, creates\npending request")
  .box("p2", 840, 270, 200, 70, "Audit entry + notice\nto contacts on file")
  .box("s1", 840, 410, 200, 70, "Approves; above\n1,000.00 a month a\nsecond person too")
  .box("l1", 840, 550, 200, 70, "Applied from the\neffective date,\nafter a 48 h hold")
  .arrow("m1", "m2")
  .arrow("m2", "m3")
  .arrow("m3", "p1")
  .arrow("p1", "p2")
  .arrow("p2", "s1")
  .arrow("s1", "l1")
  .arrow("l1", "m4", { via: [[1160, 585]] })
  .text(40, 665, "As-is pain: paper form, three weeks, no status, calls to the help desk.\nMeasure (target): bank change applied within 5 working days p95 (hold included), 80% requested online,\nhelp desk calls about bank details down 40%.")
  .write(here);

// 04. Architecture
diagram("04-architecture", "Step 4: target architecture (containers)")
  .box("um", 200, 90, 180, 60, "Member\n(browser)")
  .box("ua", 420, 90, 180, 60, "Employer admin\n(browser, files)")
  .box("us", 640, 90, 180, 60, "Staff\n(browser)")
  .box("idp", 880, 90, 220, 60, "Identity provider\nOIDC, MFA")
  .frame("plat", 40, 180, 1060, 550, "Portal platform")
  .box("proxy", 80, 250, 980, 60, "Routing facade (strangler): new or legacy, per path", { bold: true })
  .box("web", 80, 350, 600, 80, "New portal (one deployable): Next.js, server-rendered pages,\ndomain modules called in-process; REST only for external callers")
  .box("legacy", 760, 350, 300, 80, "Legacy app\n(shrinking)", { dashed: true })
  .box("store", 80, 480, 260, 70, "Document storage\nPDF statements")
  .box("pg", 420, 480, 260, 230, "PostgreSQL\nRLS, outbox table,\njob queue")
  .box("ldb", 760, 480, 300, 70, "Legacy database", { dashed: true })
  .box("jobs", 80, 610, 260, 70, "Job workers\nimports, PDFs, email")
  .box("sync", 760, 610, 300, 70, "Sync old <-> new\nCDC, daily reconciliation", { dashed: true })
  .box("smtp", 40, 790, 170, 60, "Email service")
  .box("post", 230, 790, 170, 60, "Print and post")
  .box("fin", 420, 790, 260, 60, "Finance / payroll")
  .arrow("um", "proxy")
  .arrow("ua", "proxy")
  .arrow("us", "proxy")
  .arrow("proxy", "idp", { label: "OIDC sign-in" })
  .arrow("proxy", "web")
  .arrow("proxy", "legacy", { dashed: true })
  .arrow("web", "store", { label: "own PDF" })
  .arrow("web", "pg")
  .arrow("jobs", "store")
  .arrow("jobs", "pg", { both: true })
  .arrow("legacy", "ldb", { dashed: true })
  .arrow("ldb", "sync", { dashed: true, both: true })
  .arrow("pg", "sync", { dashed: true, both: true })
  .arrow("jobs", "smtp")
  .arrow("jobs", "post")
  .arrow("pg", "fin", { label: "outbox events" })
  .text(40, 880, "Boring on purpose: one language (TypeScript), one database engine, one deployable portal.\nEvery arrow is a decision worth one line in an ADR. Dashed: legacy and temporary, gone after the switch-off.")
  .write(here);

// 05. Multi-tenancy
diagram("05-multitenancy", "Step 5: multi-tenancy (tenant = partner organisation)")
  .frame("pool", 40, 90, 360, 360, "Pool: shared tables")
  .box("p1", 60, 140, 320, 60, "One database, shared tables,\nevery row has org_id")
  .box("p2", 60, 210, 320, 60, "RLS policy on every table:\norg_id = current org")
  .box("p3", 60, 280, 320, 60, "+ cheap, one migration,\nthousands of tenants")
  .box("p4", 60, 350, 320, 60, "- one table without RLS leaks,\nnoisy neighbours", { dashed: true })
  .frame("bridge", 440, 90, 360, 360, "Bridge: schema per org")
  .box("b1", 460, 140, 320, 60, "Same tables in each schema:\norg_acme, org_globex, ...")
  .box("b2", 460, 210, 320, 60, "One role per org, set per\ntransaction with search_path")
  .box("b3", 460, 280, 320, 60, "+ per-org export, restore,\nclear boundaries")
  .box("b4", 460, 350, 320, 60, "- N migrations, catalog bloat\npast a few hundred", { dashed: true })
  .frame("silo", 840, 90, 360, 360, "Silo: database per org")
  .box("s1", 860, 140, 320, 60, "One database per org,\nrouter picks the connection")
  .box("s2", 860, 210, 320, 60, "Own backup, region,\ncapacity, deletion")
  .box("s3", 860, 280, 320, 60, "+ strongest isolation,\neasy to delete a tenant")
  .box("s4", 860, 350, 320, 60, "- cost and operations\ngrow with each tenant", { dashed: true })
  .text(40, 465, "About forty organisations, one product, same features: pool with RLS by default; a silo only for one that demands it.")
  .frame("flow", 40, 510, 1160, 150, "Request flow in the pool")
  .box("f1", 60, 560, 190, 80, "Sign-in token\niss + sub")
  .box("f2", 280, 560, 200, 80, "Server session\norg + role from\nthe member row")
  .box("f3", 510, 560, 230, 80, "BEGIN;\nset_config('app.org',\n$1, true)")
  .box("f4", 770, 560, 170, 80, "Query, no\nWHERE org_id")
  .box("f5", 970, 560, 210, 80, "RLS filters rows:\nENABLE + FORCE,\napp NOBYPASSRLS")
  .arrow("f1", "f2")
  .arrow("f2", "f3")
  .arrow("f3", "f4")
  .arrow("f4", "f5")
  .text(40, 680, "Rule: the tenant comes from the session, never from the URL, a header or a form field.")
  .write(here);

// 06. Data model
diagram("06-data-model", "Step 5: data model (org_id leads every key)")
  .box("org", 420, 90, 280, 110, "organisation (the tenant)\n----\nid PK\nname, default language", { align: "left" })
  .box("stm", 40, 250, 260, 150, "statement\n----\norg_id, member_id,\nyear PK\nstorage key, sha256\nsent_at, downloaded_at", { align: "left" })
  .box("mem", 420, 250, 280, 150, "member\n----\norg_id, id PK\n(iss, sub) UNIQUE\nname, email, language\npostal address", { align: "left" })
  .box("con", 820, 250, 300, 130, "contribution\n----\norg_id, member_id,\nperiod PK\namount, batch_id FK", { align: "left" })
  .box("aud", 40, 460, 260, 150, "audit_log (append-only)\n----\norg_id, id PK\nwho, what, when\nbefore, after\nreason", { align: "left" })
  .box("chg", 420, 460, 280, 170, "change_request\n----\norg_id, id PK, member_id\nkind, payload\nstatus (state machine)\nrequested_by, approved_by\none pending per kind", { align: "left" })
  .box("bat", 820, 460, 300, 130, "import_batch\n----\norg_id, id PK\nfile sha256 UNIQUE\nstatus, control total", { align: "left" })
  .box("box", 420, 690, 280, 130, "outbox\n----\norg_id, id PK\nevent, payload\npublished_at", { align: "left" })
  .arrow("org", "mem", { label: "1..n" })
  .arrow("mem", "stm", { label: "1 per year" })
  .arrow("mem", "con", { label: "1..n" })
  .arrow("bat", "con", { label: "writes" })
  .arrow("mem", "chg", { label: "1..n" })
  .arrow("chg", "aud", { dashed: true, label: "same tx" })
  .arrow("chg", "box", { dashed: true, label: "same tx" })
  .text(40, 845, "Keys and indexes lead with org_id. Foreign keys include org_id, so a row cannot point into another organisation.\nOne membership per person (an assumption): (iss, sub) is unique. If a person can belong to two organisations,\nsplit member into person (iss, sub) and membership (org_id, person_id).")
  .write(here);

// 07. Security
const sec = diagram("07-security", "Step 6: security, defence in depth");
[
  ["Identity", "The operator's identity provider: OIDC code + PKCE, state, nonce;\nMFA for staff and admins; employer admins may federate; no passwords stored"],
  ["Authorisation", "Roles per organisation (member, employer admin, staff), checked on\nevery route and every query; another member's request answers 404"],
  ["Data isolation", "RLS on every table (ENABLE + FORCE), app role not the owner, NOBYPASSRLS;\norg set per transaction; parameterised SQL (RLS does not stop injection)"],
  ["Application", "OWASP ASVS level 2: server-side validation, CSRF, CSP, safe redirects\n(same-origin relative paths only), dependency audit in CI"],
  ["Sensitive changes", "Re-authentication with MFA; notice to the contact details on file at\nrequest time; 48 h hold; second staff approval above the threshold"],
  ["Personal data", "GDPR: minimise, keep what the law requires, erase the rest (backups by\ncrypto-shredding); DPIA, processor agreements, no production data in test"],
  ["Operations", "Secrets in a vault, patching, tested backups, append-only audit log,\nalerts on unusual access, incident runbook"],
].forEach(([name, controls], i) => {
  const y = 100 + i * 84;
  sec.box(`n${i}`, 40, y, 200, 64, name, { bold: true }).box(`c${i}`, 260, y, 680, 64, controls, { align: "left" });
});
sec.text(40, 700, "Ask for each layer: what is the worst thing one bug here could leak?\nThen make sure another layer stops it.").write(here);

// 08. Accessibility
diagram("08-accessibility", "Step 7: accessibility across the whole lifecycle")
  .box("d", 40, 100, 260, 120, "Design\ncontrast, focus, plain\nlanguage, annotated\ncomponents")
  .box("b", 360, 100, 260, 120, "Build\nsemantic HTML, labels,\nerrors tied to fields,\nkeyboard first")
  .box("t", 680, 100, 260, 120, "Test\naxe in CI, keyboard\njourney, screen reader,\nzoom, reflow at 320 px")
  .box("a", 680, 280, 260, 120, "Audit + declare\nexternal audit,\naccessibility statement")
  .box("l", 360, 280, 260, 120, "Listen\nfeedback channel,\nfix backlog, re-test")
  .arrow("d", "b")
  .arrow("b", "t")
  .arrow("t", "a")
  .arrow("a", "l")
  .arrow("l", "d", { via: [[170, 340]], dashed: true })
  .text(40, 420, "Continuous: every release, every sprint, not once before launch.")
  .frame("chk", 40, 470, 900, 230, "Checklist for every form")
  .box(
    "c1",
    60,
    520,
    860,
    160,
    "A visible label on every input, never a placeholder only\nErrors in text, tied to the field with aria-describedby; an error summary that takes focus\nEverything reachable and submittable with the keyboard\nlang on the page, and on parts in the other language\nReflow at 320 px wide without horizontal scrolling; text at 200%\nTargets at least 24 px, text contrast at least 4.5:1\nSign-in without a memory test: paste and password managers allowed",
    { align: "left" },
  )
  .write(here);

// 09. PDF pipeline
diagram("09-pdf-pipeline", "Step 8: yearly statements, a resumable PDF pipeline")
  .box("snap", 40, 120, 180, 80, "Freeze data\nsnapshot per year")
  .box("jobs", 260, 120, 180, 80, "Create jobs\n1 per member+year")
  .box("work", 480, 120, 180, 80, "Workers claim\nSKIP LOCKED,\nlease + fencing")
  .box("pdf", 700, 120, 180, 80, "Render PDF\ntemplate, language,\ntagged")
  .box("store", 920, 120, 180, 80, "Store PDF\nkey + sha256")
  .box("mail", 1140, 120, 180, 80, "Email a link\n(post if no\nvalid email)")
  .box("retry", 480, 290, 180, 80, "Retry with backoff\nSMTP 4xx, HTTP\n429 / 5xx, timeouts", { dashed: true })
  .box("dead", 700, 290, 180, 80, "Dead letters\npermanent errors or\nN attempts; requeue", { dashed: true })
  .box("report", 920, 290, 180, 80, "Campaign report\nsent, failed,\ndownloaded")
  .box("dl", 1140, 290, 180, 80, "Member downloads\nsigned in, own\nstatement only")
  .arrow("snap", "jobs")
  .arrow("jobs", "work")
  .arrow("work", "pdf")
  .arrow("pdf", "store")
  .arrow("store", "mail")
  .arrow("work", "retry", { dashed: true })
  .arrow("retry", "dead", { dashed: true })
  .arrow("mail", "dl")
  .arrow("mail", "report", { via: [[1170, 245], [1010, 245]] })
  .frame("before", 40, 420, 620, 170, "Before the run")
  .box("dry", 60, 470, 280, 90, "Dry run: sample PDFs\nchecked by the business")
  .box("thr", 360, 470, 280, 90, "Throttle and schedule\nmail limits, help desk ready")
  .frame("rules", 700, 420, 620, 170, "Rules")
  .box("r", 720, 460, 580, 110, "Idempotent: one job per member and year; a rerun skips sent jobs\nDeterministic: fixed creation date and document ID, same bytes\nAccessible PDF: tags, language, reading order\nNo personal data in the email body", { align: "left" })
  .write(here);

// 10. Integrations
diagram("10-integrations", "Step 9: integrations, the core in the middle, adapters at the edge")
  .box("idp", 520, 100, 260, 70, "Identity provider\nwho signs in, how")
  .box("core", 520, 300, 260, 290, "Portal core\ndomain modules\n+ job workers", { bold: true })
  .box("leg", 60, 300, 320, 90, "Legacy system\nbehind an anti-corruption\nlayer")
  .box("files", 60, 500, 320, 90, "Employer monthly files\nstaging, validate,\nupsert, report")
  .box("docs", 920, 300, 320, 90, "Document storage\nPDF statements")
  .box("fin", 920, 500, 320, 90, "Finance / payroll\nevents from the outbox")
  .box("mail", 440, 680, 200, 70, "Email service\ntemplates, bounces")
  .box("post", 660, 680, 200, 70, "Print and post\nno valid email")
  .arrow("core", "idp", { both: true, label: "OIDC" })
  .arrow("core", "leg", { both: true, label: "translate" })
  .arrow("files", "core", { label: "batch" })
  .arrow("core", "docs")
  .arrow("core", "fin", { label: "outbox" })
  .arrow("core", "mail")
  .arrow("core", "post")
  .text(40, 790, "For each integration write one line: owner, format, frequency, volume, what happens when it fails,\nwho retries, who is alerted. The core never speaks the legacy model: translate at the edge.")
  .write(here);

// 11. Migration
diagram("11-migration", "Step 10: from legacy to new, strangle, never big-bang")
  .box("p0", 40, 100, 420, 80, "0  Prepare (months 1-3)\nfacade, sign-in for both, account linking,\ncharacterise the legacy rules", { align: "left" })
  .box("p1", 40, 200, 420, 80, "1  Read-only (months 3-6)\nprofile and contributions from synced data", { align: "left" })
  .box("p2", 40, 300, 420, 80, "2  Change requests (months 6-10)\nnew portal and staff queue own them,\nwrite-back to legacy through the outbox", { align: "left" })
  .box("p3", 40, 400, 420, 80, "3  Statements (months 10-13)\nPDF pipeline; the campaign in month 13\nis a fixed date (fallback: legacy once more)", { align: "left" })
  .box("p4", 40, 500, 420, 80, "4  Employer imports (months 12-16)\npilot with three, then waves of six or seven;\nboth formats accepted for a while", { align: "left" })
  .box("p5", 40, 600, 420, 80, "5  Switch off (month 17)\nread-only archive, then delete;\nend of support in month 18", { align: "left" })
  .arrow("p0", "p1")
  .arrow("p1", "p2")
  .arrow("p2", "p3")
  .arrow("p3", "p4")
  .arrow("p4", "p5")
  .frame("every", 500, 90, 460, 590, "At every phase")
  .box("e1", 520, 140, 420, 80, "Parallel run for reads and calculations;\nshadow run for writes and emails")
  .box("e2", 520, 245, 420, 80, "Feature flag per organisation,\npilot with three first")
  .box("e3", 520, 350, 420, 80, "Rollback in one switch\nat the facade")
  .box("e4", 520, 455, 420, 80, "One owner per entity; sync by\noutbox or CDC, reconciled daily")
  .box("e5", 520, 560, 420, 80, "Exit criteria: KPIs met,\nno blocking defect")
  .text(40, 710, "Don't: freeze the old app and rewrite everything for two years.\nDo: ship one slice at a time to real users; the old app shrinks until it can be switched off.")
  .write(here);

// 12. Operate and measure
diagram("12-operate-measure", "Step 11: operate and measure")
  .frame("ops", 40, 90, 560, 380, "Recurring operations")
  .box("o1", 60, 140, 520, 70, "Scheduled release\nrunbook, smoke test, one-step rollback", { align: "left" })
  .box("o2", 60, 220, 520, 70, "Monthly data update\nemployer files: dry run, apply, reconcile", { align: "left" })
  .box("o3", 60, 300, 520, 70, "Yearly statement campaign\ndry run, throttle, report, dead letters", { align: "left" })
  .box("o4", 60, 380, 520, 70, "User requests\ntriage, service level, a runbook per type", { align: "left" })
  .box("rb", 660, 150, 240, 80, "Runbooks\nwritten, versioned,\nexecutable")
  .box("auto", 660, 330, 240, 80, "Automation\nCI/CD, jobs, alerts")
  .frame("kpi", 40, 520, 860, 170, "KPIs (each with a definition, a target and an owner)")
  .box("k1", 60, 570, 400, 100, "Adoption: active members / eligible\nChanges done online / all changes\nTime to apply a change, p95\nAvailability of member requests (SLI)", { align: "left" })
  .box("k2", 480, 570, 400, 100, "Help desk calls per 1,000 members\nImport files accepted first time\nStatements delivered and downloaded\nOpen blocking accessibility issues", { align: "left" })
  .arrow("ops", "rb")
  .arrow("rb", "auto")
  .arrow("auto", "kpi", { label: "measure" })
  .write(here);
