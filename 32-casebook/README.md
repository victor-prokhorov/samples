# 32-casebook

**Pain: a design document that reads well and does not hold together.** A requirement has no acceptance criteria, so nobody can say when it is done. A journey step needs something no requirement asks for. The ER diagram shows a table the DDL does not create, the state diagram has a state the database refuses, a sequence diagram does not even parse, and the data model happily lets one person approve a bank details change twice. Each document was reviewed on its own; nobody checked them against each other.

**Reach for it when** you plan a rebuild or a new service on paper first (a discovery, a design review, a time-boxed design case) and want the plan's parts to agree: requirements with testable criteria, journeys that map to them, diagrams that render, and a data model that answers the journeys' questions.

**Do not reach for it when** the requirements live in a tracker with its own links (use its traceability report), or the design is small enough for one page. Executable specifications (23) are the next step once code exists: the acceptance criteria here become scenarios there.

A worked design case, a self-set exercise time-boxed to three hours: rebuild a fictional legacy member portal used by about forty partner organisations. Eleven Markdown documents in `casebook/` (scenario and time plan, discovery and stakeholder map, personas and journeys, functional specification with acceptance criteria, architecture with C4 and sequence diagrams, ER data model with DDL and the journeys' queries, change request state machine, accessibility and security approach, strangler migration plan with a gantt, risk register, KPIs). The demo checks a flawed draft first, then the real documents: traceability, rendering every Mermaid diagram to SVG, and applying the data model to Postgres and running the journeys' queries.

```sh
docker compose up -d --wait
PUPPETEER_SKIP_DOWNLOAD=1 npm i   # no browser download: mermaid-cli uses a local Chromium, see below
export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome   # any Chromium or Chrome; the run script finds a Playwright one
npm run trace                     # requirement -> criteria -> journey steps, ER = DDL, states = CHECK
npm run render                    # every ```mermaid block -> diagrams/*.svg
npm run schema                    # DDL + seed + journey queries on an empty database
npm run demo                      # all of it, the flawed draft first
```

- `casebook/00-brief.md` ... `casebook/10-kpis.md` the design case.
- `diagrams/*.svg` the rendered diagrams, committed for viewers that do not render Mermaid.
- `fixtures/draft/` the same documents with the defects a review misses (a requirement without criteria, a criterion that is not testable, an unmapped step, a dangling reference, an uncovered requirement, ER and DDL out of step, a state the database refuses, a diagram that does not parse, a missing constraint).
- `src/extract.ts` fenced blocks with the `<!-- diagram: name -->` or `<!-- sql: ... -->` marker above them.
- `src/trace.ts` the traceability and consistency checks.
- `src/render.ts` mermaid-cli per diagram, `--no-font-embed`; `puppeteer.json` holds only the browser flags, and puppeteer takes the browser from `PUPPETEER_EXECUTABLE_PATH`.
- `src/schema.ts` applies the DDL and seed, runs each journey query, compares with its `expect`: a row count, or `error <constraint>` (another error is a mismatch). The user's steps run in a transaction as `portal_app`, under row-level security.
- `src/demo.ts` the seven steps and their checks.

Rendering needs a Chromium. Puppeteer reads its path from `PUPPETEER_EXECUTABLE_PATH`; `../run-32-casebook.sh` sets it, when it is not set already, to the newest Playwright Chromium it finds (`$PLAYWRIGHT_BROWSERS_PATH`, `~/.cache/ms-playwright`, `/opt/pw-browsers`). Without one, install with downloads enabled (`npm i`) and puppeteer uses its own.

One-shot run with proof: `../run-32-casebook.sh` (log in `../logs/32-casebook.log`). Concepts explained in `../README.md`.
