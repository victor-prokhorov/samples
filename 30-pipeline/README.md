# 30. CI/CD pipeline with scheduled releases

**Pain: checks that only run when someone remembers, and releases that happen whenever someone pushes.** A lint error, a type error or an inaccessible page reaches the main branch because nobody ran the checks locally. A deploy goes out from a laptop on a Friday evening, nobody can say which commit is live, and a vulnerable dependency ships because the audit was "only a warning".

**Reach for it when** more than one person changes the code, or the same person ships more than once: every change goes through the same lint, type, test, accessibility and audit gates, and production only changes on an agreed schedule or a release tag.

**Do not reach for it when** the project is a throwaway script. You deploy many times a day behind feature flags: deploy every green main build (continuous deployment) instead of waiting for a schedule. The jobs need services (Postgres, a browser): use a runner with the Docker executor and `services:`, which `gitlab-ci-local` also runs.

A tiny TypeScript app (an annual statement page, `src/`) with a `.gitlab-ci.yml`: stages lint (eslint), typecheck (tsc), test (vitest with a JUnit report, and axe-core on the rendered page in jsdom), audit (npm audit), build, and a deploy that only exists in scheduled or tagged pipelines. `gitlab-ci-local` runs the file on this machine with the shell executor, each job in its own copy of the project, no container images. `github-actions/ci.yml` is the same pipeline for GitHub Actions, kept outside `.github/` so it does not run; a script parses both files and checks that each job runs the same commands in the same order on the same kind of runner, and that both deploy on exactly the same triggers.

## Run

One shot with proof: `./run-30-pipeline.sh` from the repo root (log in [`../logs/30-pipeline.log`](../logs/30-pipeline.log)).

By hand, from this folder (ports: HTTP 53040 app (npm start, hand run)):

```sh
npm i
npm run lint && npm run typecheck && npm test && npm run a11y && npm run audit && npm run build   # the checks, by hand
npx gitlab-ci-local --list                                                       # jobs of a push pipeline
npx gitlab-ci-local --list --variable CI_PIPELINE_SOURCE=schedule                # jobs of a scheduled pipeline (with deploy)
npx gitlab-ci-local --shell-isolation                                            # run the push pipeline (needs rsync)
npx gitlab-ci-local --shell-isolation --variable CI_PIPELINE_SOURCE=schedule --variable DEPLOY_DIR=$PWD/.deploy
npm run demo                                                                     # the seven steps below
```

Needs `rsync` (gitlab-ci-local copies the project per job with it).

## Files

- `.gitlab-ci.yml` stages, workflow rules, npm cache keyed on `package-lock.json`, artifacts (JUnit, a11y report, `dist/`), the audit that only blocks releases, and the deploy job (`rules`, `needs`, runner `tags`, `environment`, `resource_group`, smoke check of the new release, then the symlink switch).
- `github-actions/ci.yml` the same jobs for GitHub Actions: `needs`, `if`, `concurrency`, `continue-on-error`, `upload-artifact`; the deploy runs on a self-hosted runner on the production host (`runs-on: [self-hosted, production]`) and checks the tag against `^v[0-9]+\.[0-9]+\.[0-9]+$` first.
- `src/statement.ts`, `src/page.ts`, `src/server.ts` the app: a statement total, the HTML page, a node:http server (`npm run build && npm start`, port 53040, or `PORT`).
- `src/statement.test.ts` the vitest unit tests.
- `scripts/a11y.ts` axe-core on the rendered page in jsdom (WCAG 2.x A and AA rules that do not need layout), report in `reports/a11y.json`.
- `scripts/compare.ts` parses both pipeline files and compares, per job, the commands in order and the runner, and which triggers (schedule, push, release and non-release tags) deploy.
- `scripts/demo.ts` drives `gitlab-ci-local`: lists jobs per trigger, a pipeline failing on a lint error, the same pipeline green, a scheduled deploy, a tagged deploy, the comparison of both pipeline files (and of a drifted copy).
- `eslint.config.js`, `tsconfig.json`, `tsconfig.build.json` lint rules, the typecheck (no emit) and the build (emits `dist/`).
- `reports/junit.xml`, `reports/a11y.json` the test and accessibility reports of the last pipeline run, committed. `dist/`, `.npm/`, `.gitlab-ci-local/` and `.deploy/` are build output and caches, left out.

## Concepts

- **Pipeline as code**: the pipeline is a file in the repository, reviewed and versioned with the code it checks. `gitlab-ci-local` runs that same file locally, so a pipeline change can be tried before it is pushed.
- **Stages and fail fast**: jobs in a stage run in parallel (`unit` and `a11y`), stages run in order, and a failed job stops the later stages. The cheap checks go first: a lint error fails in under 10 s instead of after the build. The order also documents intent: tsc accepts `age: any` and `==`, eslint does not.
- **Rules decide which jobs exist**: `workflow: rules` decides whether a pipeline runs at all (no duplicate branch pipeline when a merge request is open); job `rules` decide which jobs it has. A push gets every check and the build; a pipeline started by a schedule, or by a tag matching `vX.Y.Z`, also gets `deploy`. `rc-1` is a tag but not a release, so it has no deploy.
- **Scheduled releases**: a pipeline schedule (a cron in GitLab, here Tuesdays 06:00) starts a pipeline with `CI_PIPELINE_SOURCE=schedule`. Production changes in a known window that partner organisations can be told about, from whatever is on the main branch then, with every gate re-run on that exact commit.
- **A gate that only blocks releases**: the audit is `allow_failure: true` on pushes, so an advisory published overnight does not block unrelated work, and `allow_failure: false` on schedules and tags, so a known high-severity vulnerability never ships.
- **Cache versus artifacts**: the cache (`.npm/`, keyed on the hash of `package-lock.json`) is a speed-up that may be missing: every job still runs `npm ci`, which only reads it. Artifacts are outputs a later job or a person needs and must be there: `reports/junit.xml` (GitLab shows test results in the merge request), `reports/a11y.json`, and `dist/`, which `deploy` downloads from `build` (`needs: [build]`) instead of rebuilding, so what was tested is what ships.
- **Job isolation**: with `--shell-isolation` each job runs in its own copy of the project, as on a real runner, so one job cannot pass by reusing another job's `node_modules` or leftover files.
- **Deploy job**: `environment: production` records each deployment in GitLab's environment history; `resource_group: production` lets only one deploy run at a time; `interruptible: false` keeps a newer pipeline from cancelling it halfway. The job runs on a runner on the production host (`tags: [production]`), since it writes there. The release goes into its own directory and is smoke-tested there (its page renders) before anything points at it; only then is a symlink renamed over `current`, an atomic switch: a reader sees the old release or the new one, never half of each. A failed smoke test stops the job with `current` still on the previous release. The previous release stays on disk, so rolling back is pointing `current` back (31 does it with a runbook).
- **GitHub Actions equivalent**: stages become `needs:` between jobs, `rules` become `if:` and `on:` triggers (`schedule: cron`, tags), `resource_group` becomes `concurrency`, `allow_failure` becomes `continue-on-error`, artifacts go through `upload-artifact`/`download-artifact`, and `setup-node` caches npm. Runner tags become `runs-on` labels: the checks run on `ubuntu-latest`, a fresh VM thrown away after each job, so the deploy runs on `[self-hosted, production]`, a runner installed on the production host. GitLab's tag rule `/^v\d+\.\d+\.\d+$/` becomes a push filter `v[0-9]+.[0-9]+.[0-9]+` (filter patterns are globs, not regexes) and a first deploy step that checks the exact regex, so `v1.4.0-rc1` never deploys. `scripts/compare.ts` reads both files and compares, per job, the commands in order (including `release.json`, the smoke test and its target), the runner, and whether each trigger (schedule, a push to main, tags `v1.4.0`, `v1.4.0-rc1`, `v1.4`, `rc-1`) deploys; run on a drifted copy, it names each difference.
- **Trade-offs**: every job reinstalls dependencies (correct and isolated, but it is most of the run time; a job image with dependencies baked in is faster). The accessibility check runs axe in jsdom, which has no layout, so contrast and focus are not covered: run axe in a browser (21) for those. A scheduled release batches a week of changes, so a failure has more suspects than with continuous deployment. `gitlab-ci-local` imitates GitLab closely but not exactly (protected variables, runner tags and environments' approvals only exist on the server).

## Proof (`logs/30-pipeline.log`)

The jobs a pipeline gets depend on what started it:

```
   lint       stage lint       allow_failure false
   typecheck  stage typecheck  allow_failure false
   unit       stage test       allow_failure false
   a11y       stage test       allow_failure false
   audit      stage audit      allow_failure true
   build      stage build      allow_failure false

   schedule    jobs: lint, typecheck, unit, a11y, audit, build, deploy; audit allow_failure false
   tag v1.4.0  jobs: lint, typecheck, unit, a11y, audit, build, deploy; audit allow_failure false
   tag rc-1    jobs: lint, typecheck, unit, a11y, audit, build; audit allow_failure false
```

A function that type-checks but breaks three lint rules, appended to `src/statement.ts` (gitlab-ci-local, like a runner, only sees tracked files), stops the pipeline at its first stage; no later job starts:

```
   lint      $ npm run lint
   lint      > .gitlab-ci-local/builds/lint/src/statement.ts
   lint      >   11:30  error  Unexpected any. Specify a different type     @typescript-eslint/no-explicit-any
   lint      >   12:9   error  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars
   lint      >   13:14  error  Expected '===' and instead saw '=='          eqeqeq
   lint      > ✖ 3 problems (3 errors, 0 warnings)
    FAIL  lint
   lint      finished in 6.65 s  FAIL 1
   pipeline finished in 7.32 s
```

Without the function, the same pipeline passes; from the second job on, each restores the npm cache the previous jobs saved:

```
   typecheck imported cache '0_package-lock-73768b204a56503c5f5edcb2702d1bbd0d90aa5e' in 463 ms
    PASS  lint
    PASS  typecheck
    PASS  unit
    PASS  a11y
    PASS  audit
    PASS  build
   pipeline finished in 31 s
```

A scheduled pipeline, then a release tag, each deploy into their own directory, smoke-tested there before `current` is switched to it; `current` points at the last one and the previous one is kept:

```
   deploy    $ mkdir -p "$DEPLOY_DIR/releases/$RELEASE"
   deploy    $ cp -r dist/. "$DEPLOY_DIR/releases/$RELEASE/"
   deploy    $ echo '{"type":"module"}' > "$DEPLOY_DIR/releases/$RELEASE/package.json"
   deploy    $ printf '{"release":"%s","commit":"%s","source":"%s"}\n' "$RELEASE" "$CI_COMMIT_SHA" "$CI_PIPELINE_SOURCE" > "$DEPLOY_DIR/releases/$RELEASE/release.json"
   deploy    $ node -e "import('$DEPLOY_DIR/releases/$RELEASE/page.js').then((m) => { if (!m.statementPage('smoke', 2026, []).includes('<html lang=\"en\">')) process.exit(1); console.log('smoke ok') })"
   deploy    > smoke ok
   deploy    $ ln -sfn "releases/$RELEASE" "$DEPLOY_DIR/current.tmp" && mv -T "$DEPLOY_DIR/current.tmp" "$DEPLOY_DIR/current"
   deploy    $ echo "deployed $RELEASE to $DEPLOY_DIR/current"
   deploy    > deployed scheduled-ae86480c-1002 to .deploy/current
   .deploy/current -> releases/scheduled-ae86480c-1002
   current -> releases/v1.4.0, release.json {"release":"v1.4.0","commit":"ae86480c3905853f94533f548518f4e25ab8e5f7","source":"push"}; previous releases/scheduled-ae86480c-1002 still on disk: true

.deploy/releases/scheduled-ae86480c-1002: {"release":"scheduled-ae86480c-1002","commit":"ae86480c3905853f94533f548518f4e25ab8e5f7","source":"schedule"}
.deploy/releases/v1.4.0: {"release":"v1.4.0","commit":"ae86480c3905853f94533f548518f4e25ab8e5f7","source":"push"}
```

Both pipeline files run the same commands in the same order, on the same kind of runner, and deploy on the same triggers; a drifted copy of the GitHub file is caught:

```
   job        gitlab stage  github needs  runner      commands
   lint       lint                        any         npm run lint
   typecheck  typecheck     lint          any         npm run typecheck
   unit       test          typecheck     any         npx vitest run
   a11y       test          typecheck     any         npm run a11y
   audit      audit         unit, a11y    any         npm run audit
   build      build         audit         any         npm run build
   deploy     deploy        build         production  mkdir, cp dist, package.json, release.json, smoke releases/$RELEASE, ln -sfn, mv -T
   deploys on: schedule yes; push main no; tag v1.4.0 yes; tag v1.4.0-rc1 no; tag v1.4 no; tag rc-1 no
   the comparison on a drifted copy (smoke test after the switch, release.json dropped, deploy on ubuntu-latest, a loose tag filter and tag check):
   job        gitlab stage  github needs  runner      commands
   deploy     deploy        build         production vs any DIFFERENT: mkdir, cp dist, package.json, release.json, smoke releases/$RELEASE, ln -sfn, mv -T vs mkdir, cp dist, package.json, ln -sfn, mv -T, smoke current
   deploys on: schedule yes; push main no; tag v1.4.0 yes; tag v1.4.0-rc1 DIFFERENT (gitlab no, github yes); tag v1.4 no; tag rc-1 no
```

## Origins and further reading

- Book: *Continuous Delivery*, Jez Humble and David Farley, 2010 (the deployment pipeline, build once and promote the same artifact).
- Article: "Continuous Integration", Martin Fowler, 2006, revised 2024. https://martinfowler.com/articles/continuousIntegration.html
- Book: *Accelerate*, Nicole Forsgren, Jez Humble, Gene Kim, 2018 (deployment frequency, lead time, change failure rate, time to restore).
- Docs: GitLab CI/CD YAML syntax reference (`rules`, `workflow`, `cache`, `artifacts`, `needs`, `environment`, `resource_group`). https://docs.gitlab.com/ci/yaml/
- Docs: GitLab scheduled pipelines. https://docs.gitlab.com/ci/pipelines/schedules/
- Docs: GitHub Actions workflow syntax. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- Tool: gitlab-ci-local, Mads Jon Nielsen. https://github.com/firecow/gitlab-ci-local
