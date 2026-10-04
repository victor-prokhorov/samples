# 04. Parallel run, Scientist-style

**Pain: blind rewrite.** Tests cannot show that a rewrite matches legacy on every real input, so you find the differences after cutover, through users.

**Reach for it when** you replace logic whose exact behavior nobody fully knows (pricing, tax, permissions, a query against a new data store) and its outputs can be compared on real production inputs before the new code serves anyone.

**Do not reach for it when** the code has side effects that must not happen twice (charging, emailing) and the candidate cannot be stubbed: run it against a shadow copy, or route a slice of real traffic to it instead (05). Outputs are nondeterministic (timestamps, random ids) and you will not normalize them. The rewrite changes behavior on purpose: every mismatch is noise.

Proves a rewrite matches the legacy code on real traffic before it serves anyone, Scientist-style. `src/scientist.ts` runs legacy (control) and rewrite (candidate) on every input, returns the control result, and records mismatches and candidate exceptions. `src/shipping.ts` holds a legacy shipping calculator, a buggy rewrite (v1) and a fixed one (v2). 1000 seeded orders make the log reproducible. No infra.

## Run

One shot with proof: `./run-04-parallel-run.sh` from the repo root (log in [`../logs/04-parallel-run.log`](../logs/04-parallel-run.log)).

Each claim in the Proof section below is also a `check(label, condition)` in the code. A failed check marks the process failed, so the script exits non-zero; the log ends each process with `N checks passed` or `FAILED: ...`.

By hand, from this folder (no ports):

```sh
npm i
npm start
```

## Files

- `src/scientist.ts` the `Experiment`: runs control and candidate in random order, returns the control result, records mismatches and swallowed candidate exceptions.
- `src/shipping.ts` the legacy calculator, the buggy rewrite (v1) and the fixed one (v2).
- `src/index.ts` 1000 seeded orders, the three experiments (v1, v2, cutover) and the grouping of mismatches by cause.

## Concepts

- **Control and candidate**: every request runs the legacy function (control) and the rewrite (candidate). The caller always gets the control result, so users are never exposed to the rewrite while it is being checked.
- **Experiment** (`src/scientist.ts`): runs both, compares results with deep equality, and records every mismatch with its input. It swallows candidate exceptions (the rewrite crashing must not hurt users) and randomizes which side runs first, so neither side is systematically favoured by order (caches, warm-up, shared state).
- **Real inputs beat unit tests**: legacy code encodes years of undocumented behavior. Production traffic finds the edge cases nobody wrote a test for; here, the free-shipping boundary (`>=` vs `>`), per-item vs per-order weight rounding, and empty carts.
- **Iterate to zero**: fix the candidate and keep running until mismatches stay at zero over a meaningful volume. Here v2 is re-checked on the same orders that exposed v1's bugs; in production keep it running on new traffic, since zero on inputs you already fixed for proves little.
- **In real Scientist**: experiments run on a sampled percentage of requests (`enabled?`), record control vs candidate durations, and let you `ignore` known, accepted mismatches so new ones stand out.
- **Cutover**: swap roles. The rewrite becomes control (it serves) and legacy becomes the candidate (it is still checked). Once that is quiet, delete legacy.
- **Limits**: only safe for side-effect-free reads; running a write twice doubles it (for writes, compare against a shadow copy or use 05's routing instead). It costs double compute while it runs. For HTTP-level comparison, the same idea is called traffic shadowing or dark launching.

## Proof (`logs/04-parallel-run.log`)

The buggy rewrite disagrees on 567 of 1000 orders, yet every user got the legacy answer:

```
   experiment "shipping-v1": 1000 runs, 567 mismatches (188 candidate exceptions)
   users unaffected: served total 1980900 === legacy total 1980900: true
```

The mismatches group into three distinct bugs; each mismatch keeps its input, so any one reproduces (one shown, abbreviated):

```
   188 candidate exceptions, swallowed by the experiment: "order has no items" (legacy quotes empty carts at the 1 kg minimum)
   17 at exactly the free-shipping threshold: legacy uses >= 5000, rewrite uses > 5000
   362 from weight rounding: legacy rounds the order total up to kg, rewrite rounds each item
   example: {"zone":"eu","items":[{"sku":"sku-0","grams":1293,...},{"sku":"sku-1","grams":344,...}]} -> control 1800, candidate 2700
```

After the fix, the rewrite matches, takes over, and legacy becomes the check:

```
   experiment "shipping-v2": 1000 runs, 0 mismatches (0 candidate exceptions)
   experiment "shipping-cutover": 1000 runs, 0 mismatches (0 candidate exceptions)
   served total 1980900 === legacy total 1980900: true
```

The self-checks, one line per claim, then one summary per process; any failed check makes the run script exit non-zero:

```
   check ok: the buggy rewrite disagrees on some orders
   check ok: callers still got the legacy answer for every order
   check ok: the mismatches fall into three bugs, each seen at least once
   check ok: every candidate exception was swallowed and is the empty-cart one
   check ok: the fixed rewrite matches legacy on all 1000 orders
   check ok: after the cutover the rewrite serves, legacy as the check finds no mismatch, and revenue is unchanged
6 checks passed
```

## Origins and further reading

- Book: *Monolith to Microservices*, Sam Newman, 2019 (Parallel Run pattern). https://samnewman.io/books/monolith-to-microservices/
- Article: Scientist 1.0 launch post, Jesse Toth, GitHub blog, 2016. https://github.blog/developer-skills/application-development/scientist/
- Talk: "Easy Rewrites with Ruby and Science!", Jesse Toth, RubyConf 2014. https://www.youtube.com/watch?v=kgDqUHWVw4A
- Article: "Move Fast and Fix Things", Vicent Marti, GitHub blog, 2015 (Scientist used on git merge code). https://github.blog/engineering/engineering-principles/move-fast/
