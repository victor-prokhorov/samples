# 3. Proof logs are committed and every run checks itself

Date: 2026-10-03

## Status

Accepted

## Context

A sample that claims "the retry replays the stored response" or "no member sees another member's data" is only as good as the evidence for it. Readers browsing the repository on GitHub will not run thirty samples, so a claim they cannot see is a claim they have to trust. A log pasted by hand drifts from the code, and a demo that prints its results but always exits 0 lets a regression pass unnoticed.

## Decision

Each sample has a run script at the repository root, `run-NN-name.sh`, that starts from a fresh state (`docker compose down -v && up --wait` wherever there is infrastructure), installs dependencies, runs the demo and then, where there is state to show, dumps it raw (tables, reports, files) under `== proof: ... ==` headings. Everything it prints is written to `logs/NN-name.log` with `tee`, and that log is committed from the last green run; logs are never edited by hand. From sample 20 on, and in every sample added after them, the demo states each claim of the README as `check(label, condition)`: a failed check marks the process as failed, so the run script exits non-zero. The earlier samples print each outcome next to what was expected and leave the comparison to the reader and the log diff; bringing them under `check()` is the next step for them. The proof excerpts in each folder README are copied from the committed log, and outputs a reader would want to see (HTML reports, PDFs, JSON, diagrams, screenshots) are committed next to it; only dependencies, caches and secrets are ignored.

## Consequences

A reader sees what each sample did without running it, and a rerun shows any drift as a diff of the log. Logs contain timestamps, process ids and random ports, so every rerun changes some lines and the README excerpts must be refreshed when the numbers they quote change. Run scripts take longer because they rebuild their infrastructure every time, and the repository grows with each committed output, which is why each output is kept small.
