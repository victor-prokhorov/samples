# 38. Containers: one image, every machine

![Overview](diagrams/overview.svg)

**Pain: works on my machine.** The app runs on a laptop with whatever Node, `node_modules` and `.env` happen to be there, and a deploy is "copy, restart, hope". Packaged naively, the image carries 44.9 MB of build leftovers on top of the base (the host's `node_modules`, TypeScript, the source, a developer's `.env`), runs as root, and keeps the registry token passed as a build argument in its history for anyone who pulls it. Deployed naively (flip traffic as soon as the new container starts, kill the old one), 286 of 402 requests failed during one cutover: 7 in-flight requests cut off on the old version, 30 refused by a new one that was not listening yet, 249 answered 503 while it warmed up.

**Reach for it when** the same build must run on a laptop, in CI and in production; when a deploy must not drop requests; when a security review asks what is in the image, who it runs as, and whether a secret is in a layer.

**Do not reach for it when** the platform already does the packaging and the switch for you (a buildpack, a serverless function, a PaaS with health-checked rolling deploys): use its readiness and shutdown hooks and skip the hand-rolled proxy. Kubernetes gives you readiness probes, `preStop` and rolling updates; the app side (`/readyz`, SIGTERM drain, non-root, small image) stays the same, the proxy here does not.

A small member-portal API (`src/app.ts`, node:http and `pg`) is built twice: by a one-stage `Dockerfile.naive` and by a multi-stage `Dockerfile` (deps, build, prod-deps, runtime). The demo builds both, measures the build context and the image sizes, looks inside each image (user, files, dev dependencies, npm), reads `docker history` for the token, and scans both with trivy (CVEs) and gitleaks (secrets). Then it runs the good image as blue (1.0.0) behind a tiny proxy (`src/proxy.ts`) with Postgres, shows that a database outage makes the app not ready but still alive, and deploys green (1.1.0) twice under steady load: naively, then safely. Every request is timed and drawn on `out/switch.html`.

## Run

One shot with proof: `./run-38-containers.sh` from the repo root (log in [`../logs/38-containers.log`](../logs/38-containers.log)).

By hand:

```sh
cd 38-containers
docker compose up -d --wait          # Postgres on :55468, network 38-containers_default
npm i && npm run setup               # members table (Acme, Globex, Initech)
docker build -t 38-containers-app:1.0.0 --build-arg APP_VERSION=1.0.0 .
# behind a TLS-inspecting proxy add: --secret id=npm_ca,src=$NODE_EXTRA_CA_CERTS
docker run -d --name 38-containers-blue --network 38-containers_default -p 53148:8080 \
  -e COLOR=blue -e DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres 38-containers-app:1.0.0
curl localhost:53148/readyz
npm run proxy                        # :53048 in front of blue :53148 / green :53248
curl -X POST 'localhost:53048/__proxy/switch?to=green&mode=safe'
npm run demo                         # the whole story (builds, scans, both cutovers); stop the above first
```

Ports: proxy 53048, blue 53148, green 53248, Postgres 55468.

### Which base image the run used

The `Dockerfile` is written for `node:22-slim`, pinned by digest, and that is what a reader should use. The last run pulled it, so the log says `base: node:22-slim@sha256:43ac6c60...`. In an environment where only `postgres:16` pulls (a Docker Hub rate limit is enough), the run script falls back to `--build-arg BASE=38-containers-base:node22`: `base/Dockerfile` builds it from `postgres:16` (Debian, glibc) with the host's Node 22 binary and npm copied in, and the log then says `base: FALLBACK ...` and why. The fallback was exercised with `FORCE_FALLBACK=1` during development (not the committed log): every check passed, and the images were bigger (619 MB uncompressed, because that base carries PostgreSQL).

## Files

- `src/app.ts` the API in the image: `/healthz`, `/readyz` (warm, not draining, `SELECT 1` within 2 s), `/api/members`, `/api/statement?ms=`; SIGTERM drain.
- `src/proxy.ts` the blue-green proxy: forwards to the active colour, `POST /__proxy/switch?to=&mode=safe|naive`, never retries.
- `src/load.ts` the load generator: 6 workers in a loop plus 3 long "exports" fired at a chosen moment; every request timed.
- `src/docker.ts` docker CLI wrappers: build, context probe, run, state, logs.
- `src/demo.ts` the eight steps and their checks.
- `src/timeline.ts` renders `out/switch.html` (inline SVG, no script).
- `src/setup.ts`, `src/config.ts` the members table; ports and names.
- `Dockerfile` multi-stage, non-root, `HEALTHCHECK`, secret mounts, pinned base. `Dockerfile.naive` (+ its empty `.dockerignore`) the one to measure against.
- `.dockerignore` keeps `node_modules`, `.env`, keys and outputs out of the build context.
- `base/Dockerfile` the fallback base, used only when `node:22-slim` cannot be pulled.
- `out/switch.html` the timeline from the last run.

## Concepts

- **Multi-stage build**: several `FROM` stages in one Dockerfile; only the last becomes the image. `deps` installs everything (TypeScript included) and `build` compiles; `prod-deps` installs with `--omit=dev`; `runtime` copies `dist/` and the production `node_modules` from them. The compiler, the dev dependencies and the source never reach the image: 1.1 MB on top of the base instead of 44.9 MB.
- **Layer caching**: `COPY package.json package-lock.json` comes before `COPY src`, so `npm ci` is reused until the lockfile changes; a code change rebuilds only the last layers.
- **Build context and `.dockerignore`**: `docker build .` first sends the folder to the builder. Without an ignore file that is 39.6 MB and 461 files (host `node_modules`, `.env`, the CA file, outputs); with it, 75.3 kB and 13 files. What is not in the context cannot be copied by accident.
- **Pinned base digest**: a tag like `node:22-slim` moves with every Node patch and Debian fix; `node:22-slim@sha256:...` names one exact image, so a rebuild gives the same bytes and a base change is a reviewed pull request (Renovate or Dependabot bump the digest; CI rebuilds and rescans).
- **Non-root user**: `USER 1000:1000` (the base image's `node` user, numeric so Kubernetes `runAsNonRoot` can verify it). The app files stay owned by root, so the process can read its code but not change it.
- **HEALTHCHECK and liveness**: Docker runs `node -e fetch('/healthz')` every 2 s and marks the container healthy or unhealthy. It asks only "does the process answer?". With Postgres stopped the container stayed `healthy` while `/readyz` said 503: restarting the app would not fix the database, it would only add a restart loop.
- **Readiness**: `/readyz` is what the proxy (or a load balancer, or a Kubernetes readiness probe) asks before sending traffic: warmed up, not draining, and the database answers. Green answered 503 "warming up" for about 2 s; the safe switch waited for its first 200 (18 polls, 1984 ms).
- **Graceful shutdown**: on SIGTERM the app turns `/readyz` to 503, `server.close()` stops accepting connections, idle keep-alive sockets close, in-flight requests finish (`Connection: close`), the pool ends, the process exits 0. A timer forces exit 1 after 10 s so a stuck request cannot block forever; `docker stop` waits `--stop-timeout 15` s before SIGKILL. Blue drained 9 in-flight requests in 5.7 s and exited 0.
- **Exec-form CMD**: `CMD ["node", "dist/app.js"]` makes node PID 1, so it gets the SIGTERM. The shell form (`CMD node dist/app.js`, or the naive `CMD npm start`) puts a shell or npm in front, which may not forward it; `docker stop` then waits out its timeout and kills.
- **Blue-green deployment**: two full copies, one live. The new one starts beside the old, the switch happens only when it is ready, the old one drains and stops. Rollback is switching back while blue still exists. The cost: two copies running during the deploy, and a schema both versions can use (see `02-expand-contract`).
- **Build-time secrets**: `ARG NPM_TOKEN` is stored in the image history (`RUN |1 NPM_TOKEN=npm_...`); deleting the `.npmrc` in the same `RUN` does not help. `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc` makes the file exist for that one command only. The run passes the registry CA the same way.
- **Image scanning**: trivy lists known CVEs per OS package (from the base) and per Node package (from every `package.json` it finds). Dropping dev dependencies and npm took the Node findings from 11 high to 0; the 4 critical and 53 high OS findings come with Debian and go away by bumping the digest when fixes ship, or with a smaller base (distroless, `-alpine`). gitleaks found the token in the naive image's history and its copied `.env`, and nothing in the final image. trivy has a secret scanner too, but its built-in rules have no npm token rule, so gitleaks does that part.

## Proof (`logs/38-containers.log`)

The build context and the image sizes, before and after:

```
   build context, naive (ignores nothing): 39.6 MB in 461 files: .dockerignore .env .gitignore .npm-ca.crt Dockerfile ...
   build context, with .dockerignore:      75.3 kB in 13 files: .dockerignore package-lock.json package.json src tsconfig.build.json tsconfig.json
   image                               added to base  uncompressed  compressed
   base (node:22-slim)                          0 MB        247 MB       80 MB
   before: 38-containers-naive:1.0.0           45 MB        292 MB       91 MB
   after:  38-containers-app:1.0.0              1 MB        248 MB       80 MB
```

The final image holds only what runs, as uid 1000; the naive one runs as root with TypeScript and the developer's `.env`:

```
   38-containers-naive:1.0.0: uid=0 packages=20 typescript=yes npm=yes
   38-containers-app:1.0.0: uid=1000 packages=16 typescript=no npm=no
      /app: dist node_modules package.json
```

The build-arg token is in the naive history; the secret mount leaves nothing, and both scanners agree:

```
   38-containers-naive:1.0.0 history: ARG NPM_TOKEN=npm_***(masked)***
   38-containers-app:1.0.0 history lines holding the token: 0
   trivy 38-containers-naive:1.0.0: OS packages critical=4 high=53; Node packages critical=0 high=11
   trivy 38-containers-app:1.0.0: OS packages critical=4 high=53; Node packages critical=0 high=0
   gitleaks 38-containers-naive:1.0.0: 3 finding(s)
   gitleaks 38-containers-app:1.0.0: 0 finding(s)
```

Liveness and readiness disagree on purpose when the database is down:

```
   database stopped: /readyz 503 {"ready":false,"reason":"database: getaddrinfo ENOTFOUND postgres"}, /healthz 200, docker health=healthy
```

The naive cutover fails requests; the safe one fails none, and blue drains what it was serving:

```
   402 requests through :53048; failed 286; served by blue=64, green=338
   failures: 502 blue upstream blue: ECONNRESET=7, 502 green upstream green: ECONNRESET=30, 503 green warming up=249
   ...
   [proxy] switched blue -> green (safe, green answered /readyz 200 after 1984 ms and 18 polls)
   354 requests through :53048; failed 0; served by blue=114, green=240
   blue log: ... SIGTERM: draining, 9 request(s) in flight, /readyz now 503, no new connections
   blue log: ... drained in 5699 ms, pool closed, exit 0
```

## Screenshots

Every request of both cutovers, one lane per load worker plus the three long exports; red crosses are failed requests:

![Blue-green cutover timeline](screenshots/switch-timeline.png)

## Do / Don't

- Do pin the base by digest and let a bot bump it; rescan on every bump.
- Do keep `/healthz` free of dependencies and put the database in `/readyz`.
- Do handle SIGTERM and set a drain timeout shorter than the orchestrator's kill timeout.
- Don't pass secrets as `ARG` or `ENV`, and don't `COPY . .` without a `.dockerignore`.
- Don't flip traffic to a container because it started: flip when it says it is ready.

## Origins and further reading

- Docker docs: [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [Build secrets](https://docs.docker.com/build/building/secrets/), [.dockerignore](https://docs.docker.com/build/concepts/context/#dockerignore-files), [HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck), [Image digests](https://docs.docker.com/reference/cli/docker/image/pull/#pull-an-image-by-digest-immutable-identifier).
- Node.js: [`server.close()`](https://nodejs.org/api/http.html#serverclosecallback) and [`closeIdleConnections()`](https://nodejs.org/api/http.html#servercloseidleconnections); the [Node.js Docker best practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md).
- Kubernetes: [Liveness, readiness and startup probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/), [Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination).
- Martin Fowler, [BlueGreenDeployment](https://martinfowler.com/bliki/BlueGreenDeployment.html); [The Twelve-Factor App: config](https://12factor.net/config).
- [Trivy](https://trivy.dev/) and [gitleaks](https://github.com/gitleaks/gitleaks).
